import {
  ExtendedPrismaClient,
  getPrismaClient,
} from '../../../database/prisma/tenant-prisma.extension.js';
import { logger } from '../../../common/logger/logger.service.js';

export interface ResolvedRecipient {
  readonly recipientId: string;
  readonly phone?: string;
  readonly email?: string;
  readonly name: string;
  readonly recipientType: 'PARENT' | 'STUDENT' | 'TEACHER';
  /** The child a parent or student message is about (siblings joined), for template text */
  readonly studentName?: string;
}

function fullName(student: { firstName?: string; lastName?: string | null }): string {
  return [student.firstName, student.lastName].filter(Boolean).join(' ');
}

export class RecipientResolverService {
  private static instance: RecipientResolverService;

  public constructor(private readonly prisma: ExtendedPrismaClient = getPrismaClient()) {}

  public static getInstance(): RecipientResolverService {
    if (!RecipientResolverService.instance) {
      RecipientResolverService.instance = new RecipientResolverService();
    }
    return RecipientResolverService.instance;
  }

  /**
   * Resolves an abstract recipient token (e.g. "student:<id>:parent", "batch:<id>:students")
   * into concrete resolved recipient records with real phone and email values.
   */
  public async resolveRecipients(
    recipientToken: string,
    coachingId: string,
  ): Promise<ResolvedRecipient[]> {
    // If it's already a raw phone number (digits) or email (contains @), return as-is
    if (/^\+?\d{8,15}$/.test(recipientToken.trim())) {
      return [
        {
          recipientId: recipientToken,
          phone: recipientToken.trim(),
          name: 'Direct Contact',
          recipientType: 'PARENT',
        },
      ];
    }
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientToken.trim())) {
      return [
        {
          recipientId: recipientToken,
          email: recipientToken.trim(),
          name: 'Direct Contact',
          recipientType: 'PARENT',
        },
      ];
    }

    const parts = recipientToken.split(':');

    // 1. student:<studentId>:parent
    if (parts[0] === 'student' && parts[2] === 'parent') {
      const studentId = parts[1];
      const student = await (this.prisma as any).student.findFirst({
        where: { id: studentId, coachingId, deletedAt: null },
        include: {
          studentParents: {
            include: {
              parent: true,
            },
          },
        },
      });

      if (!student) {
        logger.warn(`[RecipientResolver] Student not found for token: ${recipientToken}`);
        return [];
      }

      // Find primary parent or first linked parent
      const sp =
        student.studentParents?.find((p: any) => p.isPrimary) || student.studentParents?.[0];
      if (sp?.parent) {
        return [
          {
            recipientId: sp.parent.id,
            phone: sp.parent.phone,
            email: sp.parent.email || undefined,
            name:
              sp.parent.name ||
              [sp.parent.firstName, sp.parent.lastName].filter(Boolean).join(' ') ||
              'Parent',
            recipientType: 'PARENT',
            studentName: fullName(student),
          },
        ];
      }

      // Fallback to student phone/email if no parent is linked
      if (student.phone || student.email) {
        return [
          {
            recipientId: student.id,
            phone: student.phone || undefined,
            email: student.email || undefined,
            name: `${student.firstName} ${student.lastName}`,
            recipientType: 'PARENT',
            studentName: fullName(student),
          },
        ];
      }

      logger.warn(`[RecipientResolver] No parent contact found for student ${studentId}`);
      return [];
    }

    // 2. student:<studentId>:student
    if (parts[0] === 'student' && (!parts[2] || parts[2] === 'student')) {
      const studentId = parts[1];
      const student = await (this.prisma as any).student.findFirst({
        where: { id: studentId, coachingId, deletedAt: null },
      });

      if (!student) {
        logger.warn(`[RecipientResolver] Student not found for token: ${recipientToken}`);
        return [];
      }

      return [
        {
          recipientId: student.id,
          phone: student.phone || undefined,
          email: student.email || undefined,
          name: `${student.firstName} ${student.lastName}`,
          recipientType: 'STUDENT',
          studentName: fullName(student),
        },
      ];
    }

    // 3. batch:<batchId|all>:students and batch:<batchId|all>:parents ("all" = the whole coaching)
    if (parts[0] === 'batch' && parts[1]) {
      const students = await this.findStudents(parts[1] === 'all' ? null : parts[1], coachingId);
      if (parts[2] === 'parents') return this.parentsOf(students);
      if (parts[2] === 'contacts') return this.contactsOf(students);
      if (!parts[2] || parts[2] === 'students') {
        return students.map((student: any) => ({
          recipientId: student.id,
          phone: student.phone || undefined,
          email: student.email || undefined,
          name: `${student.firstName} ${student.lastName}`,
          recipientType: 'STUDENT' as const,
          studentName: fullName(student),
        }));
      }
    }

    // 4. teachers:<batchId|all> (active teachers; for a batch, those assigned to it)
    if (parts[0] === 'teachers' && parts[1]) {
      const teachers = await (this.prisma as any).teacher.findMany({
        where: {
          coachingId,
          deletedAt: null,
          isActive: true,
          ...(parts[1] === 'all' ? {} : { teacherBatches: { some: { batchId: parts[1] } } }),
        },
      });
      return teachers.map((teacher: any) => ({
        recipientId: teacher.id,
        phone: teacher.phone || undefined,
        email: teacher.email || undefined,
        name: teacher.name,
        recipientType: 'TEACHER' as const,
      }));
    }

    // 5. coaching:<coachingId>:owner
    if (parts[0] === 'coaching' && parts[2] === 'owner') {
      const owners = await (this.prisma as any).user.findMany({
        where: {
          coachingId,
          deletedAt: null,
          isActive: true,
          userRoles: { some: { role: { code: 'OWNER' } } },
        },
      });
      return owners.map((owner: any) => ({
        recipientId: owner.id,
        phone: owner.phone || undefined,
        email: owner.email || undefined,
        name: owner.name,
        recipientType: 'TEACHER' as const,
      }));
    }

    // Unknown formats resolve to nobody; sending to the token itself as a "phone number" would
    // only fail at the provider (or worse, reach a real number)
    logger.warn(`[RecipientResolver] Unrecognised recipient token: ${recipientToken}`);
    return [];
  }

  /** The institute's name as parents know it, for template text */
  public async instituteName(coachingId: string): Promise<string> {
    const coaching = await (this.prisma as any).coaching.findFirst({
      where: { id: coachingId },
      select: { name: true },
    });
    return coaching?.name ?? 'your institute';
  }

  public async studentName(studentId: string, coachingId: string): Promise<string | undefined> {
    const student = await (this.prisma as any).student.findFirst({
      where: { id: studentId, coachingId },
      select: { firstName: true, lastName: true },
    });
    return student ? fullName(student) : undefined;
  }

  /** Active students currently in the batch, or in the whole coaching when batchId is null */
  private async findStudents(batchId: string | null, coachingId: string): Promise<any[]> {
    const where: any = { coachingId, deletedAt: null, isActive: true };
    if (batchId) where.batchStudents = { some: { batchId, leftAt: null } };
    return (this.prisma as any).student.findMany({
      where,
      include: { studentParents: { include: { parent: true } } },
    });
  }

  /**
   * Everyone reachable for these students: every linked parent and the student's own number,
   * each phone once even when a parent is linked to several students or shares the student's number.
   */
  private contactsOf(students: any[]): ResolvedRecipient[] {
    const keyOf = (phone: string) => phone.replace(/\D/g, '').slice(-10);
    const byPhone = new Map<string, ResolvedRecipient>();

    const add = (phone: string | null | undefined, recipient: Omit<ResolvedRecipient, 'phone'>) => {
      const key = phone ? keyOf(phone) : '';
      if (!phone || key.length < 10) return;
      const existing = byPhone.get(key);
      if (!existing) {
        byPhone.set(key, { ...recipient, phone });
      } else if (existing.recipientId === recipient.recipientId && recipient.studentName) {
        // The same parent, linked to a second child: one message naming both
        byPhone.set(key, { ...existing, studentName: `${existing.studentName} and ${recipient.studentName}` });
      }
    };

    for (const student of students) {
      for (const link of student.studentParents ?? []) {
        const parent = link.parent;
        if (!parent || parent.deletedAt) continue;
        add(parent.phone, {
          recipientId: parent.id,
          email: parent.email || undefined,
          name: parent.name || 'Parent',
          recipientType: 'PARENT' as const,
          studentName: fullName(student),
        });
      }
      add(student.phone, {
        recipientId: student.id,
        email: student.email || undefined,
        name: `${student.firstName} ${student.lastName}`,
        recipientType: 'STUDENT' as const,
        studentName: fullName(student),
      });
    }
    return [...byPhone.values()];
  }

  /** Each student's primary parent (or first linked), once per parent even with siblings */
  private parentsOf(students: any[]): ResolvedRecipient[] {
    const byParent = new Map<string, { parent: any; children: string[] }>();
    for (const student of students) {
      const link =
        student.studentParents?.find((p: any) => p.isPrimary) ?? student.studentParents?.[0];
      const parent = link?.parent;
      if (!parent || parent.deletedAt) continue;
      const entry = byParent.get(parent.id) ?? { parent, children: [] };
      entry.children.push(fullName(student));
      byParent.set(parent.id, entry);
    }
    return [...byParent.values()].map(({ parent, children }) => ({
      recipientId: parent.id,
      phone: parent.phone,
      email: parent.email || undefined,
      name: parent.name || 'Parent',
      recipientType: 'PARENT' as const,
      studentName: children.join(' and '),
    }));
  }
}

export const recipientResolverService = RecipientResolverService.getInstance();
