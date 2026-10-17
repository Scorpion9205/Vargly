import { StatusCodes } from 'http-status-codes';
import { IBatchRepository } from './batch.repository.js';
import { IEventBus } from '../../events/event-bus.interface.js';
import { AppError } from '../../common/middleware/error-handler.middleware.js';
import {
  AssignTeacherToBatchDto,
  BatchResponseDto,
  CreateBatchDto,
  EnrollStudentInBatchDto,
  TransferStudentBatchDto,
  UpdateBatchDto,
} from './dto/batch.dto.js';
import { BatchMapper } from './batch.mapper.js';
import {
  createBatchCreatedEvent,
  createStudentEnrolledInBatchEvent,
  createStudentTransferredBatchEvent,
} from './batch.events.js';

export class BatchService {
  public constructor(
    private readonly batchRepository: IBatchRepository,
    private readonly eventBus: IEventBus,
  ) {}

  public async createBatch(
    dto: CreateBatchDto,
    coachingId: string,
    userId?: string,
    correlationId: string = crypto.randomUUID(),
  ): Promise<BatchResponseDto> {
    const batchData: any = {
      coachingId,
      name: dto.name,
      subject: dto.subject,
      academicYear: dto.academicYear,
      startTime: dto.startTime,
      endTime: dto.endTime,
      daysOfWeek: dto.daysOfWeek || [],
    };

    const created = await this.batchRepository.create(batchData, dto.teacherIds);
    const responseDto = BatchMapper.toResponseDto(created);

    await this.eventBus.publish(
      createBatchCreatedEvent(
        {
          batchId: responseDto.id,
          coachingId,
          name: responseDto.name,
          academicYear: responseDto.academicYear,
        },
        correlationId,
        userId,
      ),
    );

    return responseDto;
  }

  public async updateBatch(id: string, dto: UpdateBatchDto): Promise<BatchResponseDto> {
    const existing = await this.batchRepository.findById(id);
    if (!existing) {
      throw new AppError('BATCH_NOT_FOUND', 'Batch record not found', StatusCodes.NOT_FOUND);
    }

    // Check the schedule the batch will have after the change, not just the fields sent
    const startTime = dto.startTime !== undefined ? dto.startTime : existing.startTime;
    const endTime = dto.endTime !== undefined ? dto.endTime : existing.endTime;
    if (startTime && endTime && endTime <= startTime) {
      throw new AppError(
        'INVALID_SCHEDULE',
        'Batch end time must be after its start time',
        StatusCodes.BAD_REQUEST,
      );
    }

    const updated = await this.batchRepository.update(id, { ...dto });
    return BatchMapper.toResponseDto(updated);
  }

  /**
   * Deletes an empty batch. A batch with students must have them withdrawn or moved first (or be
   * marked inactive instead), so no student is left enrolled in a batch nobody can see.
   */
  public async deleteBatch(id: string): Promise<void> {
    const existing = await this.batchRepository.findById(id);
    if (!existing) {
      throw new AppError('BATCH_NOT_FOUND', 'Batch record not found', StatusCodes.NOT_FOUND);
    }
    const activeStudents = (existing.batchStudents ?? []).filter((bs: any) => !bs.leftAt).length;
    if (activeStudents > 0) {
      throw new AppError(
        'BATCH_HAS_STUDENTS',
        `Batch still has ${activeStudents} student(s); withdraw or transfer them first`,
        StatusCodes.CONFLICT,
        { activeStudents },
      );
    }
    await this.batchRepository.softDelete(id);
  }

  public async enrollStudent(
    batchId: string,
    dto: EnrollStudentInBatchDto,
    coachingId: string,
    userId?: string,
    correlationId: string = crypto.randomUUID(),
  ): Promise<void> {
    const batch = await this.batchRepository.findById(batchId);
    if (!batch) {
      throw new AppError('BATCH_NOT_FOUND', 'Batch record not found', StatusCodes.NOT_FOUND);
    }

    const enrollment = await this.batchRepository.enrollStudent({
      batchId,
      studentId: dto.studentId,
      coachingId,
    });

    await this.eventBus.publish(
      createStudentEnrolledInBatchEvent(
        {
          coachingId,
          batchId,
          studentId: dto.studentId,
          joinedAt: enrollment.joinedAt || new Date(),
        },
        correlationId,
        userId,
      ),
    );
  }

  public async withdrawStudent(batchId: string, studentId: string): Promise<void> {
    await this.batchRepository.withdrawStudent(batchId, studentId);
  }

  public async assignTeacher(
    batchId: string,
    dto: AssignTeacherToBatchDto,
    coachingId: string,
  ): Promise<void> {
    const batch = await this.batchRepository.findById(batchId);
    if (!batch) {
      throw new AppError('BATCH_NOT_FOUND', 'Batch record not found', StatusCodes.NOT_FOUND);
    }

    await this.batchRepository.assignTeacher({
      batchId,
      teacherId: dto.teacherId,
      coachingId,
      isPrimary: dto.isPrimary ?? true,
    });
  }

  public async removeTeacher(batchId: string, teacherId: string): Promise<void> {
    const removed = await this.batchRepository.removeTeacher(batchId, teacherId);
    if (removed === 0) {
      throw new AppError(
        'TEACHER_NOT_ASSIGNED',
        'This teacher is not assigned to the batch',
        StatusCodes.NOT_FOUND,
      );
    }
  }

  public async getBatchById(id: string): Promise<BatchResponseDto> {
    const batch = await this.batchRepository.findById(id);
    if (!batch) {
      throw new AppError('BATCH_NOT_FOUND', 'Batch record not found', StatusCodes.NOT_FOUND);
    }
    return BatchMapper.toResponseDto(batch);
  }

  public async listBatches(filters?: {
    isActive?: boolean;
    academicYear?: string;
    teacherId?: string;
    batchIds?: string[];
  }): Promise<BatchResponseDto[]> {
    const batches = await this.batchRepository.findMany(filters);
    return batches.map(BatchMapper.toResponseDto);
  }

  public async getActiveStudentsInBatch(batchId: string): Promise<any[]> {
    return this.batchRepository.findActiveStudents(batchId);
  }

  public async transferStudent(
    fromBatchId: string,
    dto: TransferStudentBatchDto,
    coachingId: string,
    userId?: string,
    correlationId: string = crypto.randomUUID(),
  ): Promise<void> {
    if (fromBatchId === dto.targetBatchId) {
      throw new AppError(
        'BAD_REQUEST',
        'Source and target batches cannot be the same',
        StatusCodes.BAD_REQUEST,
      );
    }

    const fromBatch = await this.batchRepository.findById(fromBatchId);
    if (!fromBatch) {
      throw new AppError('BATCH_NOT_FOUND', 'Source batch not found', StatusCodes.NOT_FOUND);
    }

    const toBatch = await this.batchRepository.findById(dto.targetBatchId);
    if (!toBatch) {
      throw new AppError('BATCH_NOT_FOUND', 'Target batch not found', StatusCodes.NOT_FOUND);
    }

    await this.batchRepository.transferStudent({
      coachingId,
      studentId: dto.studentId,
      fromBatchId,
      toBatchId: dto.targetBatchId,
    });

    await this.eventBus.publish(
      createStudentTransferredBatchEvent(
        {
          coachingId,
          studentId: dto.studentId,
          fromBatchId,
          toBatchId: dto.targetBatchId,
          reason: dto.reason,
          transferredAt: new Date(),
        },
        correlationId,
        userId,
      ),
    );
  }
}
