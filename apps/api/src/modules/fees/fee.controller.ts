import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { FeeService } from './fee.service.js';
import {
  createFeePlanSchema,
  recordFeePaymentSchema,
  waiveInstallmentSchema,
} from './validators/fee.validator.js';
import { CreateFeePlanDto, RecordFeePaymentDto, WaiveInstallmentDto } from './dto/fee.dto.js';
import { RequestContextService } from '../../common/services/request-context.service.js';

export class FeeController {
  public constructor(private readonly feeService: FeeService) {}

  public createPlan = async (req: Request, res: Response): Promise<void> => {
    const validated = createFeePlanSchema.parse(req.body) as CreateFeePlanDto;
    const coachingId = RequestContextService.getRequiredCoachingId();
    const userId = RequestContextService.getUserId();
    const traceId = RequestContextService.getTraceId();

    const result = await this.feeService.createFeePlan(validated, coachingId, userId, traceId);
    res.status(StatusCodes.CREATED).json({ data: result });
  };

  public pay = async (req: Request, res: Response): Promise<void> => {
    const validated = recordFeePaymentSchema.parse(req.body) as RecordFeePaymentDto;
    const coachingId = RequestContextService.getRequiredCoachingId();
    const userId = RequestContextService.getUserId();
    const traceId = RequestContextService.getTraceId();

    const result = await this.feeService.recordPayment(validated, coachingId, userId, traceId);
    res.status(StatusCodes.OK).json({ data: result });
  };

  public waive = async (req: Request, res: Response): Promise<void> => {
    const validated = waiveInstallmentSchema.parse(req.body) as WaiveInstallmentDto;
    const coachingId = RequestContextService.getRequiredCoachingId();
    const userId = RequestContextService.getUserId();
    const traceId = RequestContextService.getTraceId();

    const result = await this.feeService.waiveInstallment(
      req.params.id,
      validated,
      coachingId,
      userId,
      traceId,
    );
    res.status(StatusCodes.OK).json({ data: result });
  };

  public getByStudent = async (req: Request, res: Response): Promise<void> => {
    const result = await this.feeService.getStudentFeePlans(req.params.studentId);
    res.status(StatusCodes.OK).json({ data: result });
  };

  public getPlan = async (req: Request, res: Response): Promise<void> => {
    const result = await this.feeService.getPlanById(req.params.id);
    res.status(StatusCodes.OK).json({ data: result });
  };

  public getDefaulters = async (_req: Request, res: Response): Promise<void> => {
    const coachingId = RequestContextService.getRequiredCoachingId();
    const result = await this.feeService.getDefaulters(coachingId);
    res.status(StatusCodes.OK).json({ data: result });
  };
}
