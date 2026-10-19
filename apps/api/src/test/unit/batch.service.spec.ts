import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BatchService } from '../../modules/batches/batch.service.js';
import { IBatchRepository } from '../../modules/batches/batch.repository.js';
import { IEventBus } from '../../events/event-bus.interface.js';
import { AppError } from '../../common/middleware/error-handler.middleware.js';
import { BATCH_EVENTS } from '../../modules/batches/batch.events.js';

class InMemoryBatchRepository implements IBatchRepository {
  public batches: Map<string, any> = new Map();
  public enrollments: Array<{
    batchId: string;
    studentId: string;
    coachingId: string;
    joinedAt: Date;
    leftAt?: Date;
  }> = [];
  public teacherAssignments: Array<{
    batchId: string;
    teacherId: string;
    coachingId: string;
    isPrimary: boolean;
  }> = [];

  public async create(data: any, teacherIds?: string[]): Promise<any> {
    const batch = {
      id: `batch-${Date.now()}-${Math.random()}`,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      batchStudents: [],
      teacherBatches: [],
      ...data,
    };
    if (teacherIds && teacherIds.length > 0) {
      for (const tid of teacherIds) {
        this.teacherAssignments.push({
          batchId: batch.id,
          teacherId: tid,
          coachingId: data.coachingId,
          isPrimary: true,
        });
      }
    }
    this.batches.set(batch.id, batch);
    return batch;
  }

  public async findById(id: string): Promise<any | null> {
    const b = this.batches.get(id);
    if (!b || b.deletedAt) return null;
    return b;
  }

  public async findMany(filters?: {
    isActive?: boolean;
    academicYear?: string;
    teacherId?: string;
    batchIds?: string[];
  }): Promise<any[]> {
    return Array.from(this.batches.values()).filter(
      (b) => !b.deletedAt && (!filters?.batchIds || filters.batchIds.includes(b.id)),
    );
  }

  public async update(id: string, data: any): Promise<any> {
    const b = this.batches.get(id);
    if (!b) throw new Error('Not found');
    const updated = { ...b, ...data, updatedAt: new Date() };
    this.batches.set(id, updated);
    return updated;
  }

  public async softDelete(id: string): Promise<void> {
    const b = this.batches.get(id);
    if (b) b.deletedAt = new Date();
  }

  public async enrollStudent(data: {
    batchId: string;
    studentId: string;
    coachingId: string;
  }): Promise<any> {
    const entry = {
      batchId: data.batchId,
      studentId: data.studentId,
      coachingId: data.coachingId,
      joinedAt: new Date(),
    };
    this.enrollments.push(entry);
    return entry;
  }

  public async withdrawStudent(batchId: string, studentId: string): Promise<void> {
    const entry = this.enrollments.find(
      (e) => e.batchId === batchId && e.studentId === studentId && !e.leftAt,
    );
    if (entry) {
      entry.leftAt = new Date();
    }
  }

  public async assignTeacher(data: {
    batchId: string;
    teacherId: string;
    coachingId: string;
    isPrimary: boolean;
  }): Promise<void> {
    this.teacherAssignments.push(data);
  }

  public async removeTeacher(batchId: string, teacherId: string): Promise<number> {
    const before = this.teacherAssignments.length;
    this.teacherAssignments = this.teacherAssignments.filter(
      (a) => !(a.batchId === batchId && a.teacherId === teacherId),
    );
    return before - this.teacherAssignments.length;
  }

  public async findActiveStudents(batchId: string): Promise<any[]> {
    return this.enrollments
      .filter((e) => e.batchId === batchId && !e.leftAt)
      .map((e) => ({
        id: `bs-${e.studentId}`,
        studentId: e.studentId,
        joinedAt: e.joinedAt,
        student: { firstName: 'Test', lastName: 'Student' },
      }));
  }

  public async transferStudent(data: {
    coachingId: string;
    studentId: string;
    fromBatchId: string;
    toBatchId: string;
  }): Promise<{ previous: any; current: any }> {
    const prev = this.enrollments.find(
      (e) => e.batchId === data.fromBatchId && e.studentId === data.studentId && !e.leftAt,
    );
    if (prev) {
      prev.leftAt = new Date();
    }
    const current = {
      batchId: data.toBatchId,
      studentId: data.studentId,
      coachingId: data.coachingId,
      joinedAt: new Date(),
    };
    this.enrollments.push(current);
    return { previous: prev, current };
  }
}

describe('BatchService (Phase 2 Domain Unit Tests)', () => {
  let batchService: BatchService;
  let batchRepo: InMemoryBatchRepository;
  let mockEventBus: IEventBus;

  beforeEach(() => {
    batchRepo = new InMemoryBatchRepository();
    mockEventBus = {
      publish: vi.fn().mockResolvedValue(undefined),
      publishBatch: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    };
    batchService = new BatchService(batchRepo, mockEventBus);
  });

  it('should successfully create a batch and emit BatchCreated event', async () => {
    const result = await batchService.createBatch(
      {
        name: 'Grade 10 Science',
        subject: 'Physics',
        academicYear: '2026-2027',
        daysOfWeek: ['MON', 'WED', 'FRI'],
      },
      'coaching-1',
      'user-1',
    );

    expect(result).toBeDefined();
    expect(result.name).toBe('Grade 10 Science');
    expect(result.academicYear).toBe('2026-2027');

    expect(mockEventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: BATCH_EVENTS.BATCH_CREATED,
        coachingId: 'coaching-1',
        payload: expect.objectContaining({
          batchId: result.id,
          name: 'Grade 10 Science',
        }),
      }),
    );
  });

  it('should enroll a student in a batch and emit StudentEnrolledInBatch event', async () => {
    const batch = await batchService.createBatch(
      {
        name: 'Grade 11 Math',
        academicYear: '2026-2027',
      },
      'coaching-1',
    );

    await batchService.enrollStudent(
      batch.id,
      { studentId: 'student-999' },
      'coaching-1',
      'user-1',
    );

    expect(mockEventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: BATCH_EVENTS.STUDENT_ENROLLED_IN_BATCH,
        coachingId: 'coaching-1',
        payload: expect.objectContaining({
          batchId: batch.id,
          studentId: 'student-999',
        }),
      }),
    );
  });

  it('should throw NOT_FOUND when enrolling student in non-existent batch', async () => {
    await expect(
      batchService.enrollStudent('invalid-batch-id', { studentId: 'stu-1' }, 'coaching-1'),
    ).rejects.toThrow(AppError);
  });

  it('should successfully transfer a student between batches and emit StudentTransferredBatch event', async () => {
    const batch1 = await batchService.createBatch(
      { name: 'Batch Morning', academicYear: '2026-2027' },
      'coaching-1',
    );
    const batch2 = await batchService.createBatch(
      { name: 'Batch Evening', academicYear: '2026-2027' },
      'coaching-1',
    );

    await batchService.enrollStudent(
      batch1.id,
      { studentId: 'student-42' },
      'coaching-1',
      'user-1',
    );

    await batchService.transferStudent(
      batch1.id,
      { studentId: 'student-42', targetBatchId: batch2.id, reason: 'Time preference' },
      'coaching-1',
      'user-1',
    );

    expect(mockEventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: BATCH_EVENTS.STUDENT_TRANSFERRED_BATCH,
        coachingId: 'coaching-1',
        payload: expect.objectContaining({
          studentId: 'student-42',
          fromBatchId: batch1.id,
          toBatchId: batch2.id,
          reason: 'Time preference',
        }),
      }),
    );

    const activeInBatch1 = await batchService.getActiveStudentsInBatch(batch1.id);
    expect(activeInBatch1.find((s) => s.studentId === 'student-42')).toBeUndefined();

    const activeInBatch2 = await batchService.getActiveStudentsInBatch(batch2.id);
    expect(activeInBatch2.find((s) => s.studentId === 'student-42')).toBeDefined();
  });

  it('should throw BAD_REQUEST when transferring to the exact same batch', async () => {
    const batch = await batchService.createBatch(
      { name: 'Batch A', academicYear: '2026-2027' },
      'coaching-1',
    );

    await expect(
      batchService.transferStudent(
        batch.id,
        { studentId: 'stu-1', targetBatchId: batch.id },
        'coaching-1',
      ),
    ).rejects.toThrow(AppError);
  });

  it('should throw NOT_FOUND when target batch does not exist during transfer', async () => {
    const batch = await batchService.createBatch(
      { name: 'Batch A', academicYear: '2026-2027' },
      'coaching-1',
    );

    await expect(
      batchService.transferStudent(
        batch.id,
        { studentId: 'stu-1', targetBatchId: 'non-existent-batch' },
        'coaching-1',
      ),
    ).rejects.toThrow(AppError);
  });

  describe('editing and deleting', () => {
    const create = () =>
      batchService.createBatch(
        { name: 'Class 10', academicYear: '2026-27', startTime: '07:00', endTime: '08:30' },
        'coaching-1',
      );

    it('updates details and can clear the subject', async () => {
      const batch = await create();
      const updated = await batchService.updateBatch(batch.id, {
        name: 'Class 10 Morning',
        subject: null,
        isActive: false,
      });
      expect(updated).toMatchObject({ name: 'Class 10 Morning', subject: null, isActive: false });
    });

    it('rejects a schedule that ends before it starts, checking against saved times', async () => {
      const batch = await create();
      // Only the end time is sent; it is compared with the saved 07:00 start
      await expect(batchService.updateBatch(batch.id, { endTime: '06:30' })).rejects.toMatchObject({
        code: 'INVALID_SCHEDULE',
      });
    });

    it('deletes an empty batch', async () => {
      const batch = await create();
      await batchService.deleteBatch(batch.id);
      await expect(batchService.getBatchById(batch.id)).rejects.toMatchObject({
        code: 'BATCH_NOT_FOUND',
      });
    });

    it('refuses to delete a batch that still has students', async () => {
      const batch = await create();
      batchRepo.batches.get(batch.id).batchStudents = [{ studentId: 's1', leftAt: null }];

      await expect(batchService.deleteBatch(batch.id)).rejects.toMatchObject({
        code: 'BATCH_HAS_STUDENTS',
        statusCode: 409,
      });
    });

    it('reports a missing batch', async () => {
      await expect(batchService.deleteBatch('nope')).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('removing a teacher', () => {
    it('removes only that teacher from that batch', async () => {
      batchRepo.teacherAssignments.push(
        { batchId: 'b1', teacherId: 't1', coachingId: 'c1', isPrimary: true },
        { batchId: 'b1', teacherId: 't2', coachingId: 'c1', isPrimary: true },
        { batchId: 'b2', teacherId: 't1', coachingId: 'c1', isPrimary: true },
      );
      await batchService.removeTeacher('b1', 't1');
      expect(batchRepo.teacherAssignments.map((a) => `${a.batchId}:${a.teacherId}`)).toEqual([
        'b1:t2',
        'b2:t1',
      ]);
    });

    it('says so when the teacher was not assigned', async () => {
      await expect(batchService.removeTeacher('b1', 't9')).rejects.toMatchObject({
        code: 'TEACHER_NOT_ASSIGNED',
        statusCode: 404,
      });
    });
  });
});
