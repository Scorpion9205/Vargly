import { createHash } from 'node:crypto';
import { logger } from '../../common/logger/logger.service.js';
import { IEmailAdapter } from '../notifications/adapters/email.adapter.interface.js';
import { IOpsRepository } from './ops.repository.js';

const SIGNATURE_KEY = 'ops:alert:signature';
// An unresolved problem is re-announced once a day, so it cannot be forgotten after one email
const REMIND_AFTER_SECONDS = 24 * 60 * 60;
const ID_LIMIT = 200;

/** The few Redis calls the alert needs (ioredis satisfies this) */
export interface AlertState {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

export interface OpsAlertResult {
  readonly dead: number;
  readonly review: number;
  readonly emailed: boolean;
}

/**
 * Looks for problems that need a person (dead events, payments needing review) and emails the
 * operator once per distinct set of problems, not on every check.
 */
export class OpsAlertService {
  public constructor(
    private readonly repository: IOpsRepository,
    private readonly email: IEmailAdapter,
    private readonly state: () => AlertState,
    private readonly recipient: () => string | undefined,
    private readonly consoleUrl: () => string,
  ) {}

  public async check(): Promise<OpsAlertResult> {
    const { deadEventIds, reviewPaymentIds } = await this.repository.openIssueIds(ID_LIMIT);
    const dead = deadEventIds.length;
    const review = reviewPaymentIds.length;
    const state = this.state();

    if (dead === 0 && review === 0) {
      await state.del(SIGNATURE_KEY);
      return { dead, review, emailed: false };
    }

    const signature = createHash('sha256')
      .update([...deadEventIds, ...reviewPaymentIds].join(','))
      .digest('hex');
    if ((await state.get(SIGNATURE_KEY)) === signature) return { dead, review, emailed: false };

    const to = this.recipient();
    if (!to) {
      logger.error('[OpsAlert] Problems need attention but OPS_ALERT_EMAIL is not set', undefined, {
        dead,
        review,
      });
    } else {
      const url = this.consoleUrl();
      const result = await this.email.sendEmail({
        to,
        subject: `[Vargly] ${review} payment(s) and ${dead} event(s) need attention`,
        coachingId: 'platform',
        textBody: `Payments needing review: ${review}\nDead events: ${dead}\n\nOpen the console: ${url}\n`,
        htmlBody:
          `<p><b>Payments needing review:</b> ${review}<br><b>Dead events:</b> ${dead}</p>` +
          `<p><a href="${url}">Open the console</a></p>`,
      });
      if (result.status === 'FAILED') {
        // Not remembered, so the next check tries again
        logger.error('[OpsAlert] Alert email could not be sent', undefined, { error: result.errorMessage });
        return { dead, review, emailed: false };
      }
    }

    await state.set(SIGNATURE_KEY, signature, 'EX', REMIND_AFTER_SECONDS);
    return { dead, review, emailed: Boolean(to) };
  }
}
