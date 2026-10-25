import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { AppError } from '../../common/middleware/error-handler.middleware.js';
import type { IPasswordService } from '../../common/security/password.service.js';
import {
  emailForStudentId,
  generateStudentId,
  generateTemporaryPassword,
  studentIdFromEmail,
} from '../../common/security/student-login.js';
import { getPrismaClient, ExtendedPrismaClient } from '../../database/prisma/tenant-prisma.extension.js';
import { RoleType } from '@vargly/types';
import { IEventBus } from '../../events/event-bus.interface.js';
import { eventBus as defaultEventBus } from '../../events/event-bus.js';
import { createStudentLoginChangedEvent, StudentLoginAction } from './student-login.events.js';

export const createLoginSchema = z.object({ studentId: z.string().uuid() });
export const bulkLoginSchema = z.object({ batchId: z.string().uuid().optional() });
export const listLoginsSchema = z.object({ batchId: z.string().uuid().optional() });

/** Most students one bulk request makes logins for: each password is hashed, which is deliberately slow */
export const BULK_LIMIT = 100;

export interface StudentLoginRow {
  readonly studentId: string;
  readonly name: string;
  readonly rollNumber: string | null;
  /** The Student ID, or null when the student has no login yet */
  readonly loginId: string | null;
  readonly active: boolean;
  readonly lastLoginAt: Date | null;
}

/** Shown to the owner once: the password is never stored in a form that can be read again */
export interface IssuedLogin {
  readonly studentId: string;
  readonly name: string;
  readonly loginId: string;
  readonly temporaryPassword: string;
}

export interface StudentForLogin {
  readonly id: string;
  readonly coachingId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly phone: string | null;
  readonly isActive: boolean;
  readonly userId: string | null;
}

export interface IStudentLoginRepository {
  findStudent(id: string): Promise<StudentForLogin | null>;
  /** Active students that have no login yet, optionally of one batch */
  studentsWithoutLogin(batchId: string | undefined, limit: number): Promise<StudentForLogin[]>;
  list(batchId: string | undefined): Promise<StudentLoginRow[]>;
  /** One student's row, or null when there is no such student */
  rowOf(studentId: string): Promise<StudentLoginRow | null>;
  emailTaken(email: string): Promise<boolean>;
  loginIdOf(userId: string): Promise<string>;
  /** Makes the account, gives it the student role and ties it to the student, all or nothing */
  createLogin(student: StudentForLogin, email: string, passwordHash: string): Promise<{ userId: string }>;
  /** Sets a new temporary password, ends every session and switches the login back on */
  resetLogin(userId: string, passwordHash: string): Promise<void>;
  disableLogin(userId: string): Promise<void>;
  /** Drops the cached access of the login, so a change applies on its next request */
  invalidateAccess(userId: string): Promise<void>;
}

const STUDENT_FIELDS = { id: true, coachingId: true, firstName: true, lastName: true, phone: true, isActive: true, userId: true } as const;
const fullName = (s: { firstName: string; lastName: string }) => [s.firstName, s.lastName].filter(Boolean).join(' ');

export class PrismaStudentLoginRepository implements IStudentLoginRepository {
  public constructor(
    private readonly invalidate: (userId: string) => Promise<void>,
    private readonly prisma: ExtendedPrismaClient = getPrismaClient(),
  ) {}

  private get db(): any {
    return this.prisma as any;
  }

  public async findStudent(id: string): Promise<StudentForLogin | null> {
    return this.db.student.findFirst({ where: { id, deletedAt: null }, select: STUDENT_FIELDS });
  }

  public async studentsWithoutLogin(batchId: string | undefined, limit: number): Promise<StudentForLogin[]> {
    return this.db.student.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        userId: null,
        ...(batchId ? { batchStudents: { some: { batchId, leftAt: null } } } : {}),
      },
      select: STUDENT_FIELDS,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: limit,
    });
  }

  public async list(batchId: string | undefined): Promise<StudentLoginRow[]> {
    const rows = await this.db.student.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        ...(batchId ? { batchStudents: { some: { batchId, leftAt: null } } } : {}),
      },
      include: { user: { select: { email: true, isActive: true, lastLoginAt: true } } },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: 2000,
    });
    return rows.map((s: any) => ({
      studentId: s.id,
      name: fullName(s),
      rollNumber: s.rollNumber,
      loginId: s.user ? studentIdFromEmail(s.user.email) : null,
      active: s.user ? s.user.isActive : false,
      lastLoginAt: s.user?.lastLoginAt ?? null,
    }));
  }

  public async rowOf(studentId: string): Promise<StudentLoginRow | null> {
    const s = await this.db.student.findFirst({
      where: { id: studentId, deletedAt: null },
      include: { user: { select: { email: true, isActive: true, lastLoginAt: true } } },
    });
    if (!s) return null;
    return {
      studentId: s.id,
      name: fullName(s),
      rollNumber: s.rollNumber,
      loginId: s.user ? studentIdFromEmail(s.user.email) : null,
      active: s.user ? s.user.isActive : false,
      lastLoginAt: s.user?.lastLoginAt ?? null,
    };
  }

  public async emailTaken(email: string): Promise<boolean> {
    // The unique index covers deleted accounts too, so they count as taken
    return Boolean(await this.db.user.findFirst({ where: { email }, select: { id: true } }));
  }

  public async loginIdOf(userId: string): Promise<string> {
    const user = await this.db.user.findFirst({ where: { id: userId }, select: { email: true } });
    return user ? studentIdFromEmail(user.email) : '';
  }

  public async createLogin(student: StudentForLogin, email: string, passwordHash: string): Promise<{ userId: string }> {
    const userId = await this.db.$transaction(async (tx: any) => {
      const role = await tx.role.findFirst({ where: { code: RoleType.STUDENT } });
      if (!role) {
        throw new AppError('ROLE_MISSING', 'The student role is not set up (run db:seed:rbac)', StatusCodes.INTERNAL_SERVER_ERROR);
      }
      const user = await tx.user.create({
        data: {
          coachingId: student.coachingId,
          name: fullName(student),
          email,
          phone: student.phone ?? '',
          passwordHash,
          mustChangePassword: true,
        },
      });
      await tx.userRole.create({ data: { userId: user.id, roleId: role.id, coachingId: student.coachingId } });
      // Only an unclaimed student can be tied to a login: a second request loses the race cleanly
      const claimed = await tx.student.updateMany({ where: { id: student.id, userId: null }, data: { userId: user.id } });
      if (claimed.count !== 1) throw new AppError('LOGIN_EXISTS', 'This student already has a login', StatusCodes.CONFLICT);
      return user.id as string;
    });
    return { userId };
  }

  public async resetLogin(userId: string, passwordHash: string): Promise<void> {
    await this.db.$transaction(async (tx: any) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          isActive: true,
          mustChangePassword: true,
          failedLogins: 0,
          lockedUntil: null,
          tokensValidAfter: new Date(),
        },
      });
      await tx.refreshToken.updateMany({ where: { userId, isRevoked: false }, data: { isRevoked: true } });
    });
  }

  public async disableLogin(userId: string): Promise<void> {
    await this.db.$transaction(async (tx: any) => {
      await tx.user.update({ where: { id: userId }, data: { isActive: false, tokensValidAfter: new Date() } });
      await tx.refreshToken.updateMany({ where: { userId, isRevoked: false }, data: { isRevoked: true } });
    });
  }

  public async invalidateAccess(userId: string): Promise<void> {
    await this.invalidate(userId);
  }
}

/** The owner's side of student logins: make one, reset it, switch it off */
export class StudentLoginService {
  public constructor(
    private readonly repository: IStudentLoginRepository,
    private readonly passwords: Pick<IPasswordService, 'hash'>,
    private readonly events: IEventBus = defaultEventBus,
  ) {}

  /** The audit trail: who did what to whose login. The password is never in it. */
  private async record(student: StudentForLogin, action: StudentLoginAction, userId?: string, loginId?: string): Promise<void> {
    await this.events.publish(createStudentLoginChangedEvent({ coachingId: student.coachingId, studentId: student.id, action, loginId, studentName: fullName(student) }, userId));
  }

  public list(batchId?: string): Promise<StudentLoginRow[]> {
    return this.repository.list(batchId);
  }

  public async status(studentId: string): Promise<StudentLoginRow> {
    const row = await this.repository.rowOf(studentId);
    if (!row) throw new AppError('STUDENT_NOT_FOUND', 'Student not found', StatusCodes.NOT_FOUND);
    return row;
  }

  private async requireStudent(studentId: string): Promise<StudentForLogin> {
    const student = await this.repository.findStudent(studentId);
    if (!student) throw new AppError('STUDENT_NOT_FOUND', 'Student not found', StatusCodes.NOT_FOUND);
    return student;
  }

  /** A Student ID nobody in the institute has: a few tries is plenty, as there are 9,000 for each name */
  private async freshStudentId(firstName: string): Promise<string> {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const id = generateStudentId(firstName);
      if (!(await this.repository.emailTaken(emailForStudentId(id)))) return id;
    }
    throw new AppError('ID_UNAVAILABLE', 'Could not make a Student ID. Please try again.', StatusCodes.CONFLICT);
  }

  public async create(studentId: string, userId?: string): Promise<IssuedLogin> {
    return this.issue(await this.requireStudent(studentId), userId);
  }

  private async issue(student: StudentForLogin, userId?: string): Promise<IssuedLogin> {
    if (!student.isActive) {
      throw new AppError('STUDENT_INACTIVE', 'This student has left; reactivate them first', StatusCodes.CONFLICT);
    }
    if (student.userId) throw new AppError('LOGIN_EXISTS', 'This student already has a login', StatusCodes.CONFLICT);

    const loginId = await this.freshStudentId(student.firstName);
    const temporaryPassword = generateTemporaryPassword();
    const { userId: createdUserId } = await this.repository.createLogin(student, emailForStudentId(loginId), await this.passwords.hash(temporaryPassword));
    await this.repository.invalidateAccess(createdUserId);
    await this.record(student, 'CREATED', userId, loginId);
    return { studentId: student.id, name: fullName(student), loginId, temporaryPassword };
  }

  /** Logins for the students of a batch (or everyone) who have none, up to BULK_LIMIT at a time */
  public async createMany(batchId?: string, userId?: string): Promise<{ issued: IssuedLogin[]; hasMore: boolean }> {
    const students = await this.repository.studentsWithoutLogin(batchId, BULK_LIMIT + 1);
    const issued: IssuedLogin[] = [];
    for (const student of students.slice(0, BULK_LIMIT)) issued.push(await this.issue(student, userId));
    // One extra student was asked for, only to know whether another round is needed
    return { issued, hasMore: students.length > BULK_LIMIT };
  }

  public async reset(studentId: string, userId?: string): Promise<IssuedLogin> {
    const student = await this.requireStudent(studentId);
    if (!student.userId) throw new AppError('NO_LOGIN', 'This student has no login yet', StatusCodes.NOT_FOUND);
    const temporaryPassword = generateTemporaryPassword();
    await this.repository.resetLogin(student.userId, await this.passwords.hash(temporaryPassword));
    await this.repository.invalidateAccess(student.userId);
    const loginId = await this.repository.loginIdOf(student.userId);
    await this.record(student, 'RESET', userId, loginId);
    return { studentId: student.id, name: fullName(student), loginId, temporaryPassword };
  }

  public async disable(studentId: string, userId?: string): Promise<void> {
    const student = await this.requireStudent(studentId);
    if (!student.userId) throw new AppError('NO_LOGIN', 'This student has no login yet', StatusCodes.NOT_FOUND);
    await this.repository.disableLogin(student.userId);
    await this.repository.invalidateAccess(student.userId);
    await this.record(student, 'DISABLED', userId);
  }
}
