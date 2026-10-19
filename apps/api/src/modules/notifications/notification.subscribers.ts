import { IEventBus } from '../../events/event-bus.interface.js';
import { NotificationService } from './notification.service.js';
import { ATTENDANCE_EVENTS, AttendanceMarkedPayload } from '../attendance/attendance.events.js';
import { TEST_EVENTS, TestResultReadyPayload } from '../tests/test.events.js';
import { HOMEWORK_EVENTS, HomeworkCreatedPayload } from '../homework/homework.events.js';
import { PAPER_EVENTS, PaperSharedPayload } from '../papers/paper.events.js';
import { FEE_EVENTS, FeePaidPayload, FeeReminderTriggeredPayload } from '../fees/fee.events.js';
import { NOTICE_EVENTS, NoticeCreatedPayload } from '../notice-board/notice.events.js';
import { RISK_EVENTS, RiskDetectedPayload } from '../risk-engine/risk-engine.events.js';
import { BILLING_EVENTS, SubscriptionExpiringPayload } from '../billing/billing.events.js';
import { NotificationChannel, DomainEvent, AttendanceStatus } from '@vargly/types';
import { logger } from '../../common/logger/logger.service.js';
import {
  CoachingPreferences,
  readCoachingPreferences,
} from '../settings/settings.preferences.js';

export class NotificationSubscribers {
  public static register(
    eventBus: IEventBus,
    notificationService: NotificationService,
    preferences: (coachingId: string) => Promise<CoachingPreferences> = readCoachingPreferences,
  ): void {
    // Every message below is automatic, so each honours the institute's WhatsApp switch
    const service = {
      enqueueNotification: async (
        ...args: Parameters<NotificationService['enqueueNotification']>
      ): Promise<void> => {
        const [dto, coachingId] = args;
        if (dto.channel === NotificationChannel.WHATSAPP) {
          const { whatsappEnabled } = await preferences(coachingId);
          if (!whatsappEnabled) {
            logger.info(`[NotificationSubscribers] WhatsApp is off for ${coachingId}; skipped ${dto.idempotencyKey}`);
            return;
          }
        }
        await notificationService.enqueueNotification(...args);
      },
    };

    // 1. Attendance Marked -> Queue WhatsApp for Absent students
    eventBus.subscribe(
      ATTENDANCE_EVENTS.ATTENDANCE_MARKED,
      async (event: DomainEvent<AttendanceMarkedPayload>) => {
        const { coachingId, sessionId, sessionDate, records } = event.payload;
        const date = indiaDate(sessionDate);

        for (const record of records) {
          if (record.status === AttendanceStatus.ABSENT) {
            const idempotencyKey = `attendance.absent.${sessionId}.${record.studentId}`;
            try {
              await service.enqueueNotification(
                {
                  channel: NotificationChannel.WHATSAPP,
                  recipient: `student:${record.studentId}:parent`,
                  recipientType: 'PARENT',
                  content: `Your child was marked absent on ${date}.`,
                  templateName: 'student_absent_alert',
                  templateLanguage: 'en',
                  templateVariables: { date },
                  idempotencyKey,
                },
                coachingId,
                event.metadata?.correlationId,
              );
            } catch (err) {
              logger.error(`[NotificationSubscribers] Failed enqueuing absent alert:`, err);
            }
          }
        }
      },
    );

    // 2. Test Result Ready -> Queue WhatsApp score card to parent
    eventBus.subscribe(
      TEST_EVENTS.TEST_RESULT_READY,
      async (event: DomainEvent<TestResultReadyPayload>) => {
        const {
          coachingId,
          testId,
          testTitle,
          studentId,
          marksObtained,
          totalMarks,
          percentage,
          isAbsent,
        } = event.payload;
        const idempotencyKey = `test.result.${testId}.${studentId}`;

        const result = isAbsent
          ? 'absent for this test'
          : `scored ${marksObtained}/${totalMarks} (${percentage}%)`;

        try {
          await service.enqueueNotification(
            {
              channel: NotificationChannel.WHATSAPP,
              recipient: `student:${studentId}:parent`,
              recipientType: 'PARENT',
              content: `Test result: ${result}.`,
              templateName: 'test_score_update',
              templateLanguage: 'en',
              templateVariables: { test: testTitle ?? 'the recent test', result },
              idempotencyKey,
            },
            coachingId,
            event.metadata?.correlationId,
          );
        } catch (err) {
          logger.error(`[NotificationSubscribers] Failed enqueuing test result alert:`, err);
        }
      },
    );

    // 3. Homework Created -> Queue WhatsApp homework alert
    eventBus.subscribe(
      HOMEWORK_EVENTS.HOMEWORK_CREATED,
      async (event: DomainEvent<HomeworkCreatedPayload>) => {
        const { coachingId, homeworkId, batchId, title, dueDate, attachmentUrl } = event.payload;
        const idempotencyKey = `homework.created.${homeworkId}`;
        // A paper attached to the homework goes out as a download link in the same message
        const link = attachmentUrl || undefined;
        const dueDateStr = indiaDate(dueDate);

        try {
          await service.enqueueNotification(
            {
              channel: NotificationChannel.WHATSAPP,
              recipient: `batch:${batchId}:contacts`,
              recipientType: 'PARENT',
              content: link
                ? `New homework assigned: "${title}". Due date: ${dueDateStr}. Download: ${link}`
                : `New homework assigned: "${title}". Due date: ${dueDateStr}.`,
              templateName: link ? 'homework_with_file' : 'homework_assigned',
              templateLanguage: 'en',
              templateVariables: link ? { title, dueDate: dueDateStr, link } : { title, dueDate: dueDateStr },
              idempotencyKey,
            },
            coachingId,
            event.metadata?.correlationId,
          );
        } catch (err) {
          logger.error(`[NotificationSubscribers] Failed enqueuing homework alert:`, err);
        }
      },
    );

    // 4. Fee Payment Recorded -> Queue WhatsApp Payment Confirmation
    eventBus.subscribe(FEE_EVENTS.FEE_PAID, async (event: DomainEvent<FeePaidPayload>) => {
      const { coachingId, studentId, amount, receiptNumber, remainingBalance } = event.payload;
      const idempotencyKey = `fee.paid.${receiptNumber}`;
      const content = `Payment received: ${rupees(amount)}, receipt #${receiptNumber}. Balance due: ${rupees(remainingBalance)}.`;

      try {
        await service.enqueueNotification(
          {
            channel: NotificationChannel.WHATSAPP,
            recipient: `student:${studentId}:parent`,
            recipientType: 'PARENT',
            content,
            templateName: 'fee_payment_confirmation',
            templateLanguage: 'en',
            templateVariables: {
              amount: rupees(amount),
              receipt: receiptNumber,
              balance: rupees(remainingBalance),
            },
            idempotencyKey,
          },
          coachingId,
          event.metadata?.correlationId,
        );
      } catch (err) {
        logger.error(`[NotificationSubscribers] Failed enqueuing fee payment confirmation:`, err);
      }
    });

    // 5. Fee Reminder Triggered -> Queue Reminder Alert
    eventBus.subscribe(
      FEE_EVENTS.FEE_REMINDER_TRIGGERED,
      async (event: DomainEvent<FeeReminderTriggeredPayload>) => {
        const { coachingId, studentId, installmentId, amount, dueDate, daysUntilDue } =
          event.payload;
        // Keyed by stage, not by date: each stage (D-7, D-3, D0, D+3, ...) reaches a parent once
        const idempotencyKey = `fee.reminder.${installmentId}.${event.payload.stage}`;
        const overdue = Math.abs(daysUntilDue);
        const dueDateStr =
          daysUntilDue < 0
            ? `${indiaDate(dueDate)} (overdue by ${overdue} ${overdue === 1 ? 'day' : 'days'})`
            : indiaDate(dueDate);
        const content = `Fee reminder: ${rupees(amount)} is due on ${dueDateStr}.`;

        try {
          await service.enqueueNotification(
            {
              channel: NotificationChannel.WHATSAPP,
              recipient: `student:${studentId}:parent`,
              recipientType: 'PARENT',
              content,
              templateName: 'fee_payment_reminder',
              templateLanguage: 'en',
              templateVariables: { amount: rupees(amount), dueDate: dueDateStr },
              idempotencyKey,
            },
            coachingId,
            event.metadata?.correlationId,
          );
        } catch (err) {
          logger.error(`[NotificationSubscribers] Failed enqueuing fee reminder:`, err);
        }
      },
    );

    // 6. Notice Created -> WhatsApp the notice to its audience (in its batch, or institute-wide)
    eventBus.subscribe(
      NOTICE_EVENTS.NOTICE_CREATED,
      async (event: DomainEvent<NoticeCreatedPayload>) => {
        const { coachingId, noticeId, title, content, batchId, targetAudience } = event.payload;
        const text = `📢 *${title}*${
          content
            ? `

${content}`
            : ''
        }`;
        for (const group of noticeRecipients(targetAudience, batchId)) {
          try {
            await service.enqueueNotification(
              {
                channel: NotificationChannel.WHATSAPP,
                recipient: group.token,
                recipientType: group.type,
                content: text,
                templateName: 'institute_notice',
                templateLanguage: 'en',
                templateVariables: { title, details: content || title },
                idempotencyKey: `notice.created.${noticeId}.${group.type.toLowerCase()}`,
              },
              coachingId,
              event.metadata?.correlationId,
            );
          } catch (err) {
            logger.error(`[NotificationSubscribers] Failed enqueuing notice broadcast:`, err);
          }
        }
      },
    );

    // 6b. Trial or plan ending -> tell the owner, so the institute is not cut off by surprise
    eventBus.subscribe(
      BILLING_EVENTS.SUBSCRIPTION_EXPIRING,
      async (event: DomainEvent<SubscriptionExpiringPayload>) => {
        const { coachingId, daysRemaining, trialEndsAt } = event.payload;
        const endDay = new Date(trialEndsAt).toISOString().slice(0, 10);
        try {
          await service.enqueueNotification(
            {
              channel: NotificationChannel.WHATSAPP,
              recipient: `coaching:${coachingId}:owner`,
              recipientType: 'TEACHER',
              content: subscriptionReminderText(daysRemaining),
              templateName: 'plan_expiry_reminder',
              templateLanguage: 'en',
              templateVariables: { status: planStatusText(daysRemaining) },
              idempotencyKey: `subscription.expiring.${coachingId}.${endDay}.${daysRemaining}`,
            },
            coachingId,
            event.metadata?.correlationId,
          );
        } catch (err) {
          logger.error(`[NotificationSubscribers] Failed enqueuing subscription reminder:`, err);
        }
      },
    );

    // 7. Student Risk Detected -> Alert Coaching Owner
    eventBus.subscribe(
      RISK_EVENTS.RISK_DETECTED,
      async (event: DomainEvent<RiskDetectedPayload>) => {
        const { coachingId, studentId, score, level, narrative } = event.payload;
        const idempotencyKey = `risk.alert.${studentId}.${new Date().toISOString().slice(0, 10)}`;

        try {
          await service.enqueueNotification(
            {
              channel: NotificationChannel.WHATSAPP,
              recipient: `coaching:${coachingId}:owner`,
              recipientType: 'TEACHER',
              content: `Risk alert: flagged at ${level} risk (score ${score}). ${narrative}`,
              templateName: 'student_risk_alert',
              templateLanguage: 'en',
              templateVariables: { level: String(level).toLowerCase(), reason: narrative },
              studentId,
              idempotencyKey,
            },
            coachingId,
            event.metadata?.correlationId,
          );
        } catch (err) {
          logger.error(`[NotificationSubscribers] Failed enqueuing risk alert:`, err);
        }
      },
    );

    // 8. Paper shared with a batch -> Queue the download link to its parents. Last on purpose:
    //    retries find handlers by their registration order, so new ones go at the end.
    eventBus.subscribe(PAPER_EVENTS.PAPER_SHARED, async (event: DomainEvent<PaperSharedPayload>) => {
      const { coachingId, shareId, batchId, title, link } = event.payload;
      try {
        await service.enqueueNotification(
          {
            channel: NotificationChannel.WHATSAPP,
            recipient: `batch:${batchId}:contacts`,
            recipientType: 'PARENT',
            content: `New practice paper: "${title}". Download: ${link}`,
            templateName: 'paper_shared',
            templateLanguage: 'en',
            templateVariables: { title, link },
            idempotencyKey: `paper.shared.${shareId}`,
          },
          coachingId,
          event.metadata?.correlationId,
        );
      } catch (err) {
        logger.error(`[NotificationSubscribers] Failed enqueuing paper link:`, err);
      }
    });
  }
}

/** Who a notice goes to: its audience, within its batch or across the whole institute */
export function noticeRecipients(
  audience: string,
  batchId?: string | null,
): Array<{ token: string; type: 'STUDENT' | 'PARENT' | 'TEACHER' }> {
  const scope = batchId ?? 'all';
  const students = { token: `batch:${scope}:students`, type: 'STUDENT' as const };
  const parents = { token: `batch:${scope}:parents`, type: 'PARENT' as const };
  const teachers = { token: `teachers:${scope}`, type: 'TEACHER' as const };
  switch (audience) {
    case 'STUDENTS':
      return [students];
    case 'PARENTS':
      return [parents];
    case 'TEACHERS':
      return [teachers];
    default:
      return [students, parents, teachers];
  }
}

/** "5 Oct 2026", in India time */
export function indiaDate(value: Date | string): string {
  return new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

/** "₹12,500" or "₹99.50" */
export function rupees(amount: number): string {
  return `₹${Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/** Completes "your plan ..." in the plan_expiry_reminder template */
export function planStatusText(daysRemaining: number): string {
  if (daysRemaining <= 0) return 'has ended. Your data is safe';
  return daysRemaining === 1 ? 'ends tomorrow' : `ends in ${daysRemaining} days`;
}

/** What the owner is told as the trial or paid period runs out */
export function subscriptionReminderText(daysRemaining: number): string {
  if (daysRemaining <= 0) {
    return '⚠️ Your Vargly plan has ended, so your institute can no longer use Vargly. Your data is safe: choose a plan in Vargly → Billing to continue.';
  }
  const when = daysRemaining === 1 ? 'tomorrow' : `in ${daysRemaining} days`;
  return `⏰ Your Vargly plan ends ${when}. Choose a plan in Vargly → Billing to keep attendance, fees and parent updates running without a break.`;
}

