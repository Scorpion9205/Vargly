import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { BatchService } from './batch.service.js';
import { taughtBatchScope } from '../../common/decorators/require-batch-access.decorator.js';
import {
  createBatchSchema,
  updateBatchSchema,
  enrollStudentInBatchSchema,
  assignTeacherToBatchSchema,
  transferStudentBatchSchema,
} from './validators/batch.validator.js';
import {
  AssignTeacherToBatchDto,
  CreateBatchDto,
  EnrollStudentInBatchDto,
  TransferStudentBatchDto,
  UpdateBatchDto,
} from './dto/batch.dto.js';
import { RequestContextService } from '../../common/services/request-context.service.js';

export class BatchController {
  public constructor(private readonly batchService: BatchService) {}

  public create = async (req: Request, res: Response): Promise<void> => {
    const validated = createBatchSchema.parse(req.body) as CreateBatchDto;
    const coachingId = RequestContextService.getRequiredCoachingId();
    const userId = RequestContextService.getUserId();
    const traceId = RequestContextService.getTraceId();

    const batch = await this.batchService.createBatch(validated, coachingId, userId, traceId);
    res.status(StatusCodes.CREATED).json({ data: batch });
  };

  public update = async (req: Request, res: Response): Promise<void> => {
    const validated = updateBatchSchema.parse(req.body) as UpdateBatchDto;
    const batch = await this.batchService.updateBatch(req.params.id, validated);
    res.status(StatusCodes.OK).json({ data: batch });
  };

  public delete = async (req: Request, res: Response): Promise<void> => {
    await this.batchService.deleteBatch(req.params.id);
    res.status(StatusCodes.OK).json({ data: { message: 'Batch deleted' } });
  };

  public getById = async (req: Request, res: Response): Promise<void> => {
    const batch = await this.batchService.getBatchById(req.params.id);
    res.status(StatusCodes.OK).json({ data: batch });
  };

  public list = async (req: Request, res: Response): Promise<void> => {
    const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;
    const academicYear = req.query.academicYear as string | undefined;
    const teacherId = req.query.teacherId as string | undefined;

    // Teachers list only the batches they teach, whatever teacherId they ask for
    const batchIds = await taughtBatchScope();

    const batches = await this.batchService.listBatches({
      isActive,
      academicYear,
      teacherId,
      ...(batchIds ? { batchIds } : {}),
    });
    res.status(StatusCodes.OK).json({ data: batches });
  };

  public enrollStudent = async (req: Request, res: Response): Promise<void> => {
    const validated = enrollStudentInBatchSchema.parse(req.body) as EnrollStudentInBatchDto;
    const coachingId = RequestContextService.getRequiredCoachingId();
    const userId = RequestContextService.getUserId();
    const traceId = RequestContextService.getTraceId();

    await this.batchService.enrollStudent(req.params.id, validated, coachingId, userId, traceId);
    res
      .status(StatusCodes.OK)
      .json({ data: { message: 'Student successfully enrolled in batch' } });
  };

  public withdrawStudent = async (req: Request, res: Response): Promise<void> => {
    await this.batchService.withdrawStudent(req.params.id, req.params.studentId);
    res.status(StatusCodes.OK).json({ data: { message: 'Student withdrawn from batch' } });
  };

  public assignTeacher = async (req: Request, res: Response): Promise<void> => {
    const validated = assignTeacherToBatchSchema.parse(req.body) as AssignTeacherToBatchDto;
    const coachingId = RequestContextService.getRequiredCoachingId();

    await this.batchService.assignTeacher(req.params.id, validated, coachingId);
    res
      .status(StatusCodes.OK)
      .json({ data: { message: 'Teacher assigned to batch successfully' } });
  };

  public removeTeacher = async (req: Request, res: Response): Promise<void> => {
    await this.batchService.removeTeacher(req.params.id, req.params.teacherId);
    res.status(StatusCodes.OK).json({ data: { message: 'Teacher removed from batch' } });
  };

  public getStudents = async (req: Request, res: Response): Promise<void> => {
    const students = await this.batchService.getActiveStudentsInBatch(req.params.id);
    res.status(StatusCodes.OK).json({ data: students });
  };

  public transferStudent = async (req: Request, res: Response): Promise<void> => {
    const fromBatchId = req.params.id;
    const validated = transferStudentBatchSchema.parse(req.body) as TransferStudentBatchDto;
    const coachingId = RequestContextService.getRequiredCoachingId();
    const userId = RequestContextService.getUserId();
    const traceId = RequestContextService.getTraceId();

    await this.batchService.transferStudent(fromBatchId, validated, coachingId, userId, traceId);
    res
      .status(StatusCodes.OK)
      .json({ data: { message: 'Student transferred to target batch successfully' } });
  };
}
