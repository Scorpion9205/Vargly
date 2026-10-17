import { StatusCodes } from 'http-status-codes';
import { AppError } from '../../common/middleware/error-handler.middleware.js';
import { logger } from '../../common/logger/logger.service.js';
import { IOpsRepository, OpsCounts, OpsEventRow, OpsEventStatus } from './ops.repository.js';

const LIST_LIMIT = 100;

export interface ReviewPaymentDto {
  readonly id: string;
  readonly orderId: string;
  readonly gatewayPaymentId: string | null;
  readonly type: string;
  readonly planCode: string | null;
  readonly credits: number | null;
  /** Rupees the order was priced at */
  readonly expectedAmount: number;
  readonly note: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly coaching: { id: string; name: string; code: string | null; email: string | null; phone: string | null };
}

export class OpsService {
  public constructor(private readonly repository: IOpsRepository) {}

  public summary(): Promise<OpsCounts> {
    return this.repository.counts();
  }

  public listEvents(status: OpsEventStatus): Promise<OpsEventRow[]> {
    return this.repository.listEvents(status, LIST_LIMIT);
  }

  public async retryEvent(id: string, userId?: string): Promise<void> {
    if (!(await this.repository.retryDeadEvent(id))) {
      throw new AppError('EVENT_NOT_RETRYABLE', 'Only a dead event can be retried', StatusCodes.NOT_FOUND);
    }
    logger.warn('[Ops] Dead event re-queued by an administrator', { eventId: id, userId });
  }

  public async listPaymentsNeedingReview(): Promise<ReviewPaymentDto[]> {
    const rows = await this.repository.listPaymentsNeedingReview(LIST_LIMIT);
    return rows.map((p) => ({
      id: p.id,
      orderId: p.gatewayOrderId,
      gatewayPaymentId: p.gatewayPaymentId ?? null,
      type: p.type,
      planCode: p.planCode ?? null,
      credits: p.credits ?? null,
      expectedAmount: p.amountPaise / 100,
      note: p.reviewNote ?? null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      coaching: p.coaching,
    }));
  }

  public async resolvePayment(id: string, note: string, userId?: string): Promise<void> {
    if (!(await this.repository.resolvePayment(id, userId, note))) {
      throw new AppError('PAYMENT_NOT_FOUND', 'No unresolved payment with that id', StatusCodes.NOT_FOUND);
    }
    logger.warn('[Ops] Payment review resolved by an administrator', { paymentId: id, userId });
  }
}
