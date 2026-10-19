 import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventBus } from '../../events/event-bus.js';
import { NotificationSubscribers } from '../../modules/notifications/notification.subscribers.js';
import { TimelineSubscribers } from '../../modules/timeline/timeline.subscribers.js';
import { AuditSubscribers } from '../../modules/audit/audit.subscribers.js';
import { NotificationService } from '../../modules/notifications/notification.service.js';
import { TimelineService } from '../../modules/timeline/timeline.service.js';
import { AuditService } from '../../modules/audit/audit.service.js';
import { createAttendanceMarkedEvent } from '../../modules/attendance/attendance.events.js';
import { createTestResultReadyEvent } from '../../modules/tests/test.events.js';
import { createHomeworkCreatedEvent } from '../../modules/homework/homework.events.js';
import { createStudentCreatedEvent } from '../../modules/students/student.events.js';
import { AttendanceStatus } from '@vargly/types';

describe('Phase 3 Cross-Cutting Subscribers Integration', () => {
  let eventBus: EventBus;
  let mockNotificationService: any;
  let mockTimelineService: any;
  let mockAuditService: any;

  beforeEach(() => {
    eventBus = new EventBus();

    mockNotificationService = {
      enqueueNotification: vi.fn().mockResolvedValue({ id: 'notif-1' }),
    };

    mockTimelineService = {
      recordEntry: vi.fn().mockResolvedValue({ id: 'tl-1' }),
    };

    mockAuditService = {
      recordLog: vi.fn().mockResolvedValue({ id: 'audit-1' }),
    };

    // Register all cross-cutting subscribers
    NotificationSubscribers.register(
      eventBus,
      mockNotificationService as unknown as NotificationService,
      async () => ({ receiptPrefix: 'RCT', whatsappEnabled: true }),
    );
    TimelineSubscribers.register(eventBus, mockTimelineService as unknown as TimelineService);
    AuditSubscribers.register(eventBus, mockAuditService as unknown as AuditService);
  });

  it('should automatically fan-out AttendanceMarked to Notification, Timeline, and Audit', async () => {
    const event = createAttendanceMarkedEvent(
      {
        sessionId: 'session-101',
        coachingId: 'coaching-1',
        batchId: 'batch-1',
        sessionDate: new Date('2026-09-11'),
        records: [
          { studentId: 'student-A', status: AttendanceStatus.PRESENT },
          { studentId: 'student-B', status: AttendanceStatus.ABSENT, remarks: 'Sick' },
        ],
      },
      'corr-123',
      'teacher-user-1',
    );

    await eventBus.publish(event);

    // 1. Notification: Enqueued WhatsApp alert for absent student B
    expect(mockNotificationService.enqueueNotification).toHaveBeenCalledTimes(1);
    expect(mockNotificationService.enqueueNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: 'student:student-B:parent',
        templateName: 'student_absent_alert',
      }),
      'coaching-1',
      'corr-123',
    );

    // 2. Timeline: Recorded entries for both students
    expect(mockTimelineService.recordEntry).toHaveBeenCalledTimes(2);
    expect(mockTimelineService.recordEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: 'student-A',
        eventType: 'ATTENDANCE_MARKED',
        summary: expect.stringContaining('PRESENT'),
      }),
      'coaching-1',
      'teacher-user-1',
      'corr-123',
    );

    // 3. Audit: Recorded session marking in audit log
    expect(mockAuditService.recordLog).toHaveBeenCalledTimes(1);
    expect(mockAuditService.recordLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ATTENDANCE_MARKED',
        entityName: 'AttendanceSession',
        entityId: 'session-101',
      }),
      'coaching-1',
      'corr-123',
    );
  });

  it('should fan-out TestResultReady to WhatsApp and Timeline', async () => {
    const event = createTestResultReadyEvent(
      {
        testId: 'test-55',
        studentId: 'student-A',
        coachingId: 'coaching-1',
        marksObtained: 95,
        totalMarks: 100,
        percentage: 95,
        isAbsent: false,
      },
      'corr-456',
      'teacher-user-1',
    );

    await eventBus.publish(event);

    expect(mockNotificationService.enqueueNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: 'student:student-A:parent',
        content: expect.stringContaining('95/100 (95%)'),
      }),
      'coaching-1',
      'corr-456',
    );

    expect(mockTimelineService.recordEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: 'student-A',
        eventType: 'TEST_RESULT_RECORDED',
        summary: expect.stringContaining('95/100 (95%)'),
      }),
      'coaching-1',
      'teacher-user-1',
      'corr-456',
    );
  });

  it('should fan-out StudentCreated to Timeline and Audit', async () => {
    const event = createStudentCreatedEvent(
      {
        studentId: 'student-100',
        coachingId: 'coaching-1',
        firstName: 'Ananya',
        lastName: 'Iyer',
        phone: '+919988776655',
      },
      'corr-789',
      'admin-1',
    );

    await eventBus.publish(event);

    expect(mockTimelineService.recordEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: 'student-100',
        eventType: 'STUDENT_ENROLLED',
      }),
      'coaching-1',
      'admin-1',
      'corr-789',
    );

    expect(mockAuditService.recordLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'STUDENT_CREATED',
        entityName: 'Student',
        entityId: 'student-100',
      }),
      'coaching-1',
      'corr-789',
    );
  });

  it('should fan-out HomeworkCreated to Notification and Audit', async () => {
    const event = createHomeworkCreatedEvent(
      {
        homeworkId: 'hw-1',
        coachingId: 'coaching-1',
        batchId: 'batch-9',
        title: 'Trigonometry Worksheet',
        dueDate: new Date('2026-09-18'),
      },
      'corr-hw',
      'teacher-1',
    );

    await eventBus.publish(event);

    expect(mockNotificationService.enqueueNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: 'batch:batch-9:contacts',
        content: expect.stringContaining('Trigonometry Worksheet'),
      }),
      'coaching-1',
      'corr-hw',
    );

    expect(mockAuditService.recordLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'HOMEWORK_CREATED',
        entityName: 'Homework',
        entityId: 'hw-1',
      }),
      'coaching-1',
      'corr-hw',
    );
  });
});
