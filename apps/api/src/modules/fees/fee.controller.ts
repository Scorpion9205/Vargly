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
import { AppError } from '../../common/middleware/error-handler.middleware.js';
import { isUuid } from '../../common/validation/is-uuid.js';
import { FeeReceiptService } from './fee-receipt.service.js';
import { OverdueReminderService } from './fee-overdue-reminder.service.js';

export class FeeController {
  public constructor(
    private readonly feeService: FeeService,
    private readonly receipts?: FeeReceiptService,
    private readonly overdueReminders?: OverdueReminderService,
  ) {}

  /** Sends every parent with overdue fees one WhatsApp reminder for what they owe */
  public remindOverdue = async (_req: Request, res: Response): Promise<void> => {
    if (!this.overdueReminders) throw new AppError('NOT_AVAILABLE', 'Reminders are not set up', StatusCodes.NOT_IMPLEMENTED);
    const students = await this.overdueReminders.remindAll(
      RequestContextService.getRequiredCoachingId(),
      RequestContextService.getUserId(),
    );
    res.status(StatusCodes.OK).json({ data: { students } });
  };

  /** The receipt a parent opens from WhatsApp: a PDF that downloads */
  public downloadReceipt = async (req: Request, res: Response): Promise<void> => {
    const notFound = () => new AppError('LINK_NOT_FOUND', 'This link is not valid any more', StatusCodes.NOT_FOUND);
    if (!this.receipts || !isUuid(req.params.id) || !/^[A-Za-z0-9_-]{20,64}$/.test(req.params.sig)) throw notFound();
    const receipt = await this.receipts.renderForLink(req.params.id, req.params.sig);
    if (!receipt) throw notFound();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${receipt.fileName}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(StatusCodes.OK).send(receipt.pdf);
  };

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
