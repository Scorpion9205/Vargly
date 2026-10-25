import { getPrismaClient, ExtendedPrismaClient } from '../../database/prisma/tenant-prisma.extension.js';

export interface CreateHomeworkInput {
  coachingId: string;
  batchId: string;
  title: string;
  description: string;
  dueDate: Date;
  attachmentUrl?: string;
  createdBy?: string;
}

export interface UpdateHomeworkInput {
  title?: string;
  description?: string;
  dueDate?: Date;
  attachmentUrl?: string;
  updatedBy?: string;
}

export interface IHomeworkRepository {
  create(input: CreateHomeworkInput): Promise<any>;
  findById(id: string): Promise<any | null>;
  findByBatch(batchId: string): Promise<any[]>;
  update(id: string, input: UpdateHomeworkInput): Promise<any>;
  softDelete(id: string, deletedBy?: string): Promise<void>;
}

export class PrismaHomeworkRepository implements IHomeworkRepository {
  public constructor(private readonly prisma: ExtendedPrismaClient = getPrismaClient()) {}

  public async create(input: CreateHomeworkInput): Promise<any> {
    const rawPrisma = this.prisma as any;
    return rawPrisma.homework.create({
      data: {
        coachingId: input.coachingId,
        batchId: input.batchId,
        title: input.title,
        description: input.description,
        dueDate: input.dueDate,
        attachmentUrl: input.attachmentUrl,
        createdBy: input.createdBy,
      },
    });
  }

  public async findById(id: string): Promise<any | null> {
    const rawPrisma = this.prisma as any;
    return rawPrisma.homework.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { completions: true } } },
    });
  }

  public async findByBatch(batchId: string): Promise<any[]> {
    const rawPrisma = this.prisma as any;
    return rawPrisma.homework.findMany({
      where: { batchId, deletedAt: null },
      orderBy: { dueDate: 'desc' },
      include: { _count: { select: { completions: true } } },
    });
  }

  public async update(id: string, input: UpdateHomeworkInput): Promise<any> {
    const rawPrisma = this.prisma as any;
    return rawPrisma.homework.update({
      where: { id },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.dueDate !== undefined && { dueDate: input.dueDate }),
        ...(input.attachmentUrl !== undefined && { attachmentUrl: input.attachmentUrl }),
        ...(input.updatedBy !== undefined && { updatedBy: input.updatedBy }),
      },
    });
  }

  public async softDelete(id: string, deletedBy?: string): Promise<void> {
    const rawPrisma = this.prisma as any;
    await rawPrisma.homework.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        updatedBy: deletedBy,
      },
    });
  }
}
