import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { OpsService } from './ops.service.js';
import { RequestContextService } from '../../common/services/request-context.service.js';
import { isUuid } from '../../common/validation/is-uuid.js';
import { AppError } from '../../common/middleware/error-handler.middleware.js';

const eventStatusSchema = z.enum(['FAILED', 'DEAD']).default('DEAD');
const eventIdSchema = z.string().min(1).max(64); // domain_events.id is varchar(64)
const resolveSchema = z.object({ note: z.string().trim().min(3).max(500) });

export class OpsController {
  public constructor(private readonly service: OpsService) {}

  public summary = async (_req: Request, res: Response): Promise<void> => {
    res.status(StatusCodes.OK).json({ data: await this.service.summary() });
  };

  public listEvents = async (req: Request, res: Response): Promise<void> => {
    const status = eventStatusSchema.parse(req.query.status);
    res.status(StatusCodes.OK).json({ data: await this.service.listEvents(status) });
  };

  public retryEvent = async (req: Request, res: Response): Promise<void> => {
    await this.service.retryEvent(eventIdSchema.parse(req.params.id), RequestContextService.getUserId());
    res.status(StatusCodes.OK).json({ data: { status: 'REQUEUED' } });
  };

  public listPayments = async (_req: Request, res: Response): Promise<void> => {
    res.status(StatusCodes.OK).json({ data: await this.service.listPaymentsNeedingReview() });
  };

  public resolvePayment = async (req: Request, res: Response): Promise<void> => {
    const { note } = resolveSchema.parse(req.body);
    if (!isUuid(req.params.id)) {
      throw new AppError('VALIDATION_ERROR', 'Invalid payment id', StatusCodes.BAD_REQUEST);
    }
    await this.service.resolvePayment(req.params.id, note, RequestContextService.getUserId());
    res.status(StatusCodes.OK).json({ data: { status: 'RESOLVED' } });
  };
}
