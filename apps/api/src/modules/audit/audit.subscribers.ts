import { IEventBus } from '../../events/event-bus.interface.js';
import { AuditService } from './audit.service.js';
import { STUDENT_EVENTS, StudentCreatedPayload, StudentUpdatedPayload } from '../students/student.events.js';
import { TEACHER_EVENTS, TeacherCreatedPayload } from '../teachers/teacher.events.js';
import { BATCH_EVENTS, BatchCreatedPayload } from '../batches/batch.events.js';
import { ATTENDANCE_EVENTS, AttendanceMarkedPayload } from '../attendance/attendance.events.js';
import { TEST_EVENTS, TestCreatedPayload, MarksUploadedPayload } from '../tests/test.events.js';
import { HOMEWORK_EVENTS, HomeworkCreatedPayload } from '../homework/homework.events.js';
import { STUDENT_LOGIN_EVENTS, StudentLoginChangedPayload } from '../student-logins/student-login.events.js';
import { DomainEvent } from '@vargly/types';
import { logger } from '../../common/logger/logger.service.js';

export class AuditSubscribers {
  public static register(eventBus: IEventBus, auditService: AuditService): void {
    // 1. Student Created
    eventBus.subscribe(
      STUDENT_EVENTS.STUDENT_CREATED,
      async (event: DomainEvent<StudentCreatedPayload>) => {
        try {
          await auditService.recordLog(
            {
              userId: event.metadata?.userId,
              action: 'STUDENT_CREATED',
              entityName: 'Student',
              entityId: event.payload.studentId,
              afterState: event.payload as unknown as Record<string, unknown>,
            },
            event.payload.coachingId,
            event.metadata?.correlationId,
          );
        } catch (err) {
          logger.error('[AuditSubscribers] Error recording STUDENT_CREATED audit log:', err);
        }
      },
    );

    // 2. Student Updated
    eventBus.subscribe(
      STUDENT_EVENTS.STUDENT_UPDATED,
      async (event: DomainEvent<StudentUpdatedPayload>) => {
        try {
          await auditService.recordLog(
            {
              userId: event.metadata?.userId,
              action: 'STUDENT_UPDATED',
              entityName: 'Student',
              entityId: event.payload.studentId,
              afterState: event.payload.changes,
            },
            event.payload.coachingId,
            event.metadata?.correlationId,
          );
        } catch (err) {
          logger.error('[AuditSubscribers] Error recording STUDENT_UPDATED audit log:', err);
        }
      },
    );

    // 3. Teacher Created
    eventBus.subscribe(
      TEACHER_EVENTS.TEACHER_CREATED,
      async (event: DomainEvent<TeacherCreatedPayload>) => {
        try {
          await auditService.recordLog(
            {
              userId: event.metadata?.userId,
              action: 'TEACHER_CREATED',
              entityName: 'Teacher',
              entityId: event.payload.teacherId,
              afterState: event.payload as unknown as Record<string, unknown>,
            },
            event.payload.coachingId,
            event.metadata?.correlationId,
          );
        } catch (err) {
          logger.error('[AuditSubscribers] Error recording TEACHER_CREATED audit log:', err);
        }
      },
    );

    // 4. Batch Created
    eventBus.subscribe(
      BATCH_EVENTS.BATCH_CREATED,
      async (event: DomainEvent<BatchCreatedPayload>) => {
        try {
          await auditService.recordLog(
            {
              userId: event.metadata?.userId,
              action: 'BATCH_CREATED',
              entityName: 'Batch',
              entityId: event.payload.batchId,
              afterState: event.payload as unknown as Record<string, unknown>,
            },
            event.payload.coachingId,
            event.metadata?.correlationId,
          );
        } catch (err) {
          logger.error('[AuditSubscribers] Error recording BATCH_CREATED audit log:', err);
        }
      },
    );

    // 5. Attendance Marked
    eventBus.subscribe(
      ATTENDANCE_EVENTS.ATTENDANCE_MARKED,
      async (event: DomainEvent<AttendanceMarkedPayload>) => {
        try {
          await auditService.recordLog(
            {
              userId: event.metadata?.userId,
              action: 'ATTENDANCE_MARKED',
              entityName: 'AttendanceSession',
              entityId: event.payload.sessionId,
              afterState: {
                batchId: event.payload.batchId,
                sessionDate: event.payload.sessionDate,
                recordCount: event.payload.records.length,
              },
            },
            event.payload.coachingId,
            event.metadata?.correlationId,
          );
        } catch (err) {
          logger.error('[AuditSubscribers] Error recording ATTENDANCE_MARKED audit log:', err);
        }
      },
    );

    // 6. Test Created
    eventBus.subscribe(
      TEST_EVENTS.TEST_CREATED,
      async (event: DomainEvent<TestCreatedPayload>) => {
        try {
          await auditService.recordLog(
            {
              userId: event.metadata?.userId,
              action: 'TEST_CREATED',
              entityName: 'Test',
              entityId: event.payload.testId,
              afterState: event.payload as unknown as Record<string, unknown>,
            },
            event.payload.coachingId,
            event.metadata?.correlationId,
          );
        } catch (err) {
          logger.error('[AuditSubscribers] Error recording TEST_CREATED audit log:', err);
        }
      },
    );

    // 7. Marks Uploaded
    eventBus.subscribe(
      TEST_EVENTS.MARKS_UPLOADED,
      async (event: DomainEvent<MarksUploadedPayload>) => {
        try {
          await auditService.recordLog(
            {
              userId: event.metadata?.userId,
              action: 'MARKS_UPLOADED',
              entityName: 'Test',
              entityId: event.payload.testId,
              afterState: {
                batchId: event.payload.batchId,
                resultsCount: event.payload.resultsCount,
              },
            },
            event.payload.coachingId,
            event.metadata?.correlationId,
          );
        } catch (err) {
          logger.error('[AuditSubscribers] Error recording MARKS_UPLOADED audit log:', err);
        }
      },
    );

    // 8. Homework Created
    eventBus.subscribe(
      HOMEWORK_EVENTS.HOMEWORK_CREATED,
      async (event: DomainEvent<HomeworkCreatedPayload>) => {
        try {
          await auditService.recordLog(
            {
              userId: event.metadata?.userId,
              action: 'HOMEWORK_CREATED',
              entityName: 'Homework',
              entityId: event.payload.homeworkId,
              afterState: event.payload as unknown as Record<string, unknown>,
            },
            event.payload.coachingId,
            event.metadata?.correlationId,
          );
        } catch (err) {
          logger.error('[AuditSubscribers] Error recording HOMEWORK_CREATED audit log:', err);
        }
      },
    );

    // 9. Fee Plan Created
    eventBus.subscribe('FeePlanCreated', async (event: any) => {
      try {
        await auditService.recordLog(
          {
            userId: event.metadata?.userId,
            action: 'FEE_PLAN_CREATED',
            entityName: 'FeePlan',
            entityId: event.payload.feePlanId,
            afterState: event.payload,
          },
          event.payload.coachingId,
          event.metadata?.correlationId,
        );
      } catch (err) {
        logger.error('[AuditSubscribers] Error recording FEE_PLAN_CREATED audit log:', err);
      }
    });

    // 10. Fee Paid
    eventBus.subscribe('FeePaid', async (event: any) => {
      try {
        await auditService.recordLog(
          {
            userId: event.metadata?.userId,
            action: 'FEE_PAID',
            entityName: 'FeeTransaction',
            entityId: event.payload.installmentId,
            afterState: event.payload,
          },
          event.payload.coachingId,
          event.metadata?.correlationId,
        );
      } catch (err) {
        logger.error('[AuditSubscribers] Error recording FEE_PAID audit log:', err);
      }
    });

    // 11. Salary Paid
    eventBus.subscribe('SalaryPaid', async (event: any) => {
      try {
        await auditService.recordLog(
          {
            userId: event.metadata?.userId,
            action: 'SALARY_PAID',
            entityName: 'Salary',
            entityId: event.payload.salaryId,
            afterState: event.payload,
          },
          event.payload.coachingId,
          event.metadata?.correlationId,
        );
      } catch (err) {
        logger.error('[AuditSubscribers] Error recording SALARY_PAID audit log:', err);
      }
    });

    // 12. Expense Recorded
    eventBus.subscribe('ExpenseRecorded', async (event: any) => {
      try {
        await auditService.recordLog(
          {
            userId: event.metadata?.userId,
            action: 'EXPENSE_RECORDED',
            entityName: 'Expense',
            entityId: event.payload.expenseId,
            afterState: event.payload,
          },
          event.payload.coachingId,
          event.metadata?.correlationId,
        );
      } catch (err) {
        logger.error('[AuditSubscribers] Error recording EXPENSE_RECORDED audit log:', err);
      }
    });

    // 13. A student's login was made, reset or switched off (last, so retries find the handlers in order)
    eventBus.subscribe(STUDENT_LOGIN_EVENTS.CHANGED, async (event: DomainEvent<StudentLoginChangedPayload>) => {
      try {
        await auditService.recordLog(
          {
            userId: event.metadata?.userId,
            action: `STUDENT_LOGIN_${event.payload.action}`,
            entityName: 'Student',
            entityId: event.payload.studentId,
            afterState: event.payload.loginId ? { loginId: event.payload.loginId } : {},
          },
          event.payload.coachingId,
          event.metadata?.correlationId,
        );
      } catch (err) {
        logger.error('[AuditSubscribers] Error recording STUDENT_LOGIN audit log:', err);
      }
    });
  }
}
