import {
  getPrismaClient,
  ExtendedPrismaClient,
} from '../../database/prisma/tenant-prisma.extension.js';

export interface IBatchRepository {
  create(data: any, teacherIds?: string[]): Promise<any>;
  findById(id: string): Promise<any | null>;
  update(id: string, data: any): Promise<any>;
  /** Soft delete; history (attendance, tests) keeps pointing at the batch */
  softDelete(id: string): Promise<void>;
  findMany(filters?: {
    isActive?: boolean;
    academicYear?: string;
    teacherId?: string;
    /** Only these batches (a teacher's own); an empty list matches nothing */
    batchIds?: string[];
  }): Promise<any[]>;
  enrollStudent(data: { batchId: string; studentId: string; coachingId: string }): Promise<any>;
  withdrawStudent(batchId: string, studentId: string): Promise<any>;
  assignTeacher(data: {
    batchId: string;
    teacherId: string;
    coachingId: string;
    isPrimary?: boolean;
  }): Promise<any>;
  /** Returns how many assignments were removed (0 when the teacher did not teach the batch) */
  removeTeacher(batchId: string, teacherId: string): Promise<number>;
  findActiveStudents(batchId: string): Promise<any[]>;
  transferStudent(data: {
    coachingId: string;
    studentId: string;
    fromBatchId: string;
    toBatchId: string;
  }): Promise<{ previous: any; current: any }>;
}

export class PrismaBatchRepository implements IBatchRepository {
  public constructor(private readonly prisma: ExtendedPrismaClient = getPrismaClient()) {}

  public async create(data: any, teacherIds?: string[]): Promise<any> {
    const rawPrisma = this.prisma as any;

    return rawPrisma.$transaction(async (tx: any) => {
      const batch = await tx.batch.create({
        data,
      });

      if (teacherIds && teacherIds.length > 0) {
        for (const teacherId of teacherIds) {
          await tx.teacherBatch.create({
            data: {
              batchId: batch.id,
              teacherId,
              coachingId: data.coachingId,
              isPrimary: true,
            },
          });
        }
      }

      return tx.batch.findUnique({
        where: { id: batch.id },
        include: {
          teacherBatches: { include: { teacher: true } },
          batchStudents: true,
        },
      });
    });
  }

  public async findById(id: string): Promise<any | null> {
    return (this.prisma as any).batch.findFirst({
      where: { id, deletedAt: null },
      include: {
        teacherBatches: { include: { teacher: true } },
        batchStudents: {
          where: { leftAt: null },
          include: { student: true },
        },
      },
    });
  }

  public async update(id: string, data: any): Promise<any> {
    return (this.prisma as any).batch.update({
      where: { id },
      data,
      include: {
        teacherBatches: { include: { teacher: true } },
        batchStudents: { where: { leftAt: null } },
      },
    });
  }

  public async softDelete(id: string): Promise<void> {
    // The tenant extension rewrites delete into setting deletedAt for soft-delete models
    await (this.prisma as any).batch.delete({ where: { id } });
  }

  public async findMany(filters?: {
    isActive?: boolean;
    academicYear?: string;
    teacherId?: string;
    batchIds?: string[];
  }): Promise<any[]> {
    const where: any = { deletedAt: null };
    if (filters?.batchIds) {
      where.id = { in: filters.batchIds };
    }
    if (filters?.isActive !== undefined) {
      where.isActive = filters.isActive;
    }
    if (filters?.academicYear) {
      where.academicYear = filters.academicYear;
    }
    if (filters?.teacherId) {
      where.teacherBatches = {
        some: { teacherId: filters.teacherId },
      };
    }

    return (this.prisma as any).batch.findMany({
      where,
      include: {
        teacherBatches: { include: { teacher: true } },
        batchStudents: { where: { leftAt: null } },
      },
      orderBy: { name: 'asc' },
    });
  }

  public async enrollStudent(data: {
    batchId: string;
    studentId: string;
    coachingId: string;
  }): Promise<any> {
    const rawPrisma = this.prisma as any;

    // Check if previous record exists
    const existing = await rawPrisma.batchStudent.findFirst({
      where: {
        batchId: data.batchId,
        studentId: data.studentId,
      },
    });

    if (existing) {
      return rawPrisma.batchStudent.update({
        where: { id: existing.id },
        data: {
          leftAt: null,
          joinedAt: new Date(),
        },
      });
    }

    return rawPrisma.batchStudent.create({
      data: {
        batchId: data.batchId,
        studentId: data.studentId,
        coachingId: data.coachingId,
        joinedAt: new Date(),
      },
    });
  }

  public async withdrawStudent(batchId: string, studentId: string): Promise<any> {
    return (this.prisma as any).batchStudent.updateMany({
      where: {
        batchId,
        studentId,
        leftAt: null,
      },
      data: {
        leftAt: new Date(),
      },
    });
  }

  public async assignTeacher(data: {
    batchId: string;
    teacherId: string;
    coachingId: string;
    isPrimary?: boolean;
  }): Promise<any> {
    return (this.prisma as any).teacherBatch.upsert({
      where: {
        teacherId_batchId: {
          teacherId: data.teacherId,
          batchId: data.batchId,
        },
      },
      create: {
        batchId: data.batchId,
        teacherId: data.teacherId,
        coachingId: data.coachingId,
        isPrimary: data.isPrimary ?? true,
      },
      update: {
        isPrimary: data.isPrimary ?? true,
      },
    });
  }

  public async removeTeacher(batchId: string, teacherId: string): Promise<number> {
    const result = await (this.prisma as any).teacherBatch.deleteMany({
      where: { batchId, teacherId },
    });
    return result.count;
  }

  public async findActiveStudents(batchId: string): Promise<any[]> {
    const records = await (this.prisma as any).batchStudent.findMany({
      where: {
        batchId,
        leftAt: null,
      },
      include: {
        student: true,
      },
    });

    return records.map((r: any) => r.student);
  }

  public async transferStudent(data: {
    coachingId: string;
    studentId: string;
    fromBatchId: string;
    toBatchId: string;
  }): Promise<{ previous: any; current: any }> {
    const rawPrisma = this.prisma as any;

    return rawPrisma.$transaction(async (tx: any) => {
      // 1. Mark existing enrollment as left
      const existing = await tx.batchStudent.findFirst({
        where: {
          batchId: data.fromBatchId,
          studentId: data.studentId,
          leftAt: null,
        },
      });

      let previous = null;
      if (existing) {
        previous = await tx.batchStudent.update({
          where: { id: existing.id },
          data: { leftAt: new Date() },
        });
      }

      // 2. Find or create enrollment in destination batch
      const destExisting = await tx.batchStudent.findFirst({
        where: {
          batchId: data.toBatchId,
          studentId: data.studentId,
        },
      });

      let current;
      if (destExisting) {
        current = await tx.batchStudent.update({
          where: { id: destExisting.id },
          data: {
            leftAt: null,
            joinedAt: new Date(),
          },
        });
      } else {
        current = await tx.batchStudent.create({
          data: {
            batchId: data.toBatchId,
            studentId: data.studentId,
            coachingId: data.coachingId,
            joinedAt: new Date(),
          },
        });
      }

      return { previous, current };
    });
  }
}
