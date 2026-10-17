import { getPrismaClient, ExtendedPrismaClient } from '../../database/prisma/tenant-prisma.extension.js';
import { StudentMarkEntryDto } from './dto/test.dto.js';

export interface CreateTestInput {
  coachingId: string;
  batchId: string;
  title: string;
  subject: string;
  testDate: Date;
  totalMarks: number;
  passingMarks?: number;
  createdBy?: string;
}

export interface ITestRepository {
  create(input: CreateTestInput): Promise<any>;
  findById(id: string): Promise<any | null>;
  findByBatch(batchId: string): Promise<any[]>;
  findByStudent(studentId: string): Promise<any[]>;
  upsertMarks(testId: string, coachingId: string, entries: StudentMarkEntryDto[]): Promise<any>;
  /** Of the given students, the ones who are (or were) enrolled in the batch */
  findEnrolledStudentIds(batchId: string, studentIds: string[]): Promise<string[]>;
  update(id: string, data: any): Promise<any>;
  /** Soft delete; the tenant extension sets deletedAt */
  softDelete(id: string): Promise<void>;
}

export class PrismaTestRepository implements ITestRepository {
  public constructor(private readonly prisma: ExtendedPrismaClient = getPrismaClient()) {}

  public async create(input: CreateTestInput): Promise<any> {
    const rawPrisma = this.prisma as any;
    return rawPrisma.test.create({
      data: {
        coachingId: input.coachingId,
        batchId: input.batchId,
        title: input.title,
        subject: input.subject,
        testDate: input.testDate,
        totalMarks: input.totalMarks,
        passingMarks: input.passingMarks,
        createdBy: input.createdBy,
      },
    });
  }

  public async findById(id: string): Promise<any | null> {
    const rawPrisma = this.prisma as any;
    return rawPrisma.test.findFirst({
      where: { id, deletedAt: null },
      include: {
        results: {
          include: {
            student: true,
          },
        },
      },
    });
  }

  public async findByBatch(batchId: string): Promise<any[]> {
    const rawPrisma = this.prisma as any;
    return rawPrisma.test.findMany({
      where: { batchId, deletedAt: null },
      include: {
        results: {
          include: {
            student: true,
          },
        },
      },
      orderBy: { testDate: 'desc' },
    });
  }

  public async update(id: string, data: any): Promise<any> {
    return (this.prisma as any).test.update({
      where: { id },
      data,
      include: { results: { include: { student: true } } },
    });
  }

  public async softDelete(id: string): Promise<void> {
    await (this.prisma as any).test.delete({ where: { id } });
  }

  public async findByStudent(studentId: string): Promise<any[]> {
    const rawPrisma = this.prisma as any;
    return rawPrisma.testResult.findMany({
      // test_results has no deletedAt; hide results of deleted tests instead
      where: { studentId, test: { deletedAt: null } },
      include: {
        test: true,
      },
      orderBy: { test: { testDate: 'desc' } },
    });
  }

  public async findEnrolledStudentIds(batchId: string, studentIds: string[]): Promise<string[]> {
    const rows: Array<{ studentId: string }> = await (this.prisma as any).batchStudent.findMany({
      where: { batchId, studentId: { in: studentIds } },
      select: { studentId: true },
    });
    return [...new Set(rows.map((row) => row.studentId))];
  }

  public async upsertMarks(testId: string, coachingId: string, entries: StudentMarkEntryDto[]): Promise<any> {
    const rawPrisma = this.prisma as any;

    return rawPrisma.$transaction(async (tx: any) => {
      for (const entry of entries) {
        await tx.testResult.upsert({
          where: {
            testId_studentId: {
              testId,
              studentId: entry.studentId,
            },
          },
          create: {
            coachingId,
            testId,
            studentId: entry.studentId,
            marksObtained: entry.marksObtained,
            isAbsent: entry.isAbsent ?? false,
            remarks: entry.remarks,
          },
          update: {
            marksObtained: entry.marksObtained,
            isAbsent: entry.isAbsent ?? false,
            remarks: entry.remarks,
          },
        });
      }

      return tx.test.findFirst({
        where: { id: testId },
        include: {
          results: {
            include: {
              student: true,
            },
          },
        },
      });
    });
  }
}
