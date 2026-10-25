import { Worker, Job } from 'bullmq';
import { QueueRegistry, QUEUE_NAMES } from '../queues/queue.registry.js';
import { FeeReminderScheduler } from '../modules/fees/fee.cron.js';
import { PrismaFeeRepository } from '../modules/fees/fee.repository.js';
import { SubscriptionExpirationScheduler } from '../modules/billing/billing.cron.js';
import { PrismaBillingRepository } from '../modules/billing/billing.repository.js';
import { eventBus } from '../events/event-bus.js';
import { OwnerSummaryService } from '../modules/owner-summary/owner-summary.service.js';
import { logger } from '../common/logger/logger.service.js';
import { runJobAsSystem } from './job-context.js';

export const SUBSCRIPTION_SCAN_JOB = 'daily_subscription_scan';
export const OWNER_SUMMARY_JOB = 'daily_owner_summary';

export class ReminderWorker {
  private worker: Worker | null = null;
  private readonly scheduler: FeeReminderScheduler;
  private readonly subscriptions: SubscriptionExpirationScheduler;
  private readonly ownerSummary = new OwnerSummaryService();

  public constructor(
    scheduler?: FeeReminderScheduler,
    subscriptions?: SubscriptionExpirationScheduler,
  ) {
    this.scheduler = scheduler || new FeeReminderScheduler(new PrismaFeeRepository(), eventBus);
    this.subscriptions =
      subscriptions || new SubscriptionExpirationScheduler(new PrismaBillingRepository(), eventBus);
  }

  /** Routes a job to its scan; both scan every coaching, then act per tenant */
  public async process(job: Job): Promise<{ triggeredCount: number }> {
    logger.info(`[ReminderWorker] Processing reminder job: ${job.name} (id: ${job.id})`);
    const count =
      job.name === SUBSCRIPTION_SCAN_JOB
        ? await runJobAsSystem(job, () => this.subscriptions.runDailyExpirationCheck())
        : job.name === OWNER_SUMMARY_JOB
          ? await runJobAsSystem(job, () => this.ownerSummary.runDaily())
          : await runJobAsSystem(job, () => this.scheduler.runDailyReminderCheck());
    return { triggeredCount: count };
  }

  public async start(): Promise<Worker> {
    const queueRegistry = QueueRegistry.getInstance();
    const redis = queueRegistry.getRedisClient();

    // Register daily scan job if not already scheduled
    const reminderQueue = queueRegistry.getQueue(QUEUE_NAMES.REMINDER);
    // Hourly: each coaching is reminded when it is 10:00 in its own time zone
    await reminderQueue
      .removeRepeatable('daily_fee_reminder_scan', { pattern: '0 8 * * *' }, 'daily_fee_reminder_scan')
      .catch(() => undefined);
    await reminderQueue.add(
      'hourly_fee_reminder_scan',
      {},
      {
        jobId: 'hourly_fee_reminder_scan',
        repeat: {
          pattern: '0 * * * *',
        },
      },
    );

    // Daily at 9:00 India time: ends lapsed trials and plans, and warns owners 7, 3 and 1 days
    // ahead. Once a day, because each warning is keyed to a number of days remaining.
    await reminderQueue.add(
      SUBSCRIPTION_SCAN_JOB,
      {},
      {
        jobId: SUBSCRIPTION_SCAN_JOB,
        repeat: { pattern: '0 9 * * *', tz: 'Asia/Kolkata' },
      },
    );

    // Daily at 8:00 India time: the owner's morning summary on WhatsApp
    await reminderQueue.add(
      OWNER_SUMMARY_JOB,
      {},
      {
        jobId: OWNER_SUMMARY_JOB,
        repeat: { pattern: '0 8 * * *', tz: 'Asia/Kolkata' },
      },
    );

    this.worker = new Worker(
      QUEUE_NAMES.REMINDER,
      (job: Job) => this.process(job),
      {
        connection: redis,
        concurrency: 2,
      },
    );

    this.worker.on('completed', (job: Job) => {
      logger.debug(`[ReminderWorker] Job ${job.id} completed successfully`);
    });

    this.worker.on('failed', (job: Job | undefined, err: Error) => {
      logger.error(`[ReminderWorker] Job ${job?.id} failed:`, err);
    });

    logger.info('[ReminderWorker] Worker started listening to reminder-queue');
    return this.worker;
  }

  public async close(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
  }
}
