import { DomainEvent } from '@vargly/types';

export interface TestCreatedPayload {
  readonly testId: string;
  readonly coachingId: string;
  readonly batchId: string;
  readonly title: string;
  readonly subject: string;
  readonly testDate: Date;
  readonly totalMarks: number;
  readonly passingMarks?: number | null;
}

export interface MarksUploadedPayload {
  readonly testId: string;
  readonly coachingId: string;
  readonly batchId: string;
  readonly resultsCount: number;
}

export interface TestResultReadyPayload {
  readonly testId: string;
  readonly testTitle?: string;
  readonly studentId: string;
  readonly coachingId: string;
  readonly marksObtained: number;
  readonly totalMarks: number;
  readonly percentage: number;
  readonly isAbsent: boolean;
  /** Where the student stands among those who sat the test; left out for a small class or an absentee */
  readonly rank?: number;
  readonly outOf?: number;
  readonly classAveragePercentage?: number;
}

export const TEST_EVENTS = {
  TEST_CREATED: 'TestCreated',
  MARKS_UPLOADED: 'MarksUploaded',
  TEST_RESULT_READY: 'TestResultReady',
} as const;

export function createTestCreatedEvent(
  payload: TestCreatedPayload,
  correlationId: string,
  userId?: string,
): DomainEvent<TestCreatedPayload> {
  return {
    eventId: crypto.randomUUID(),
    eventName: TEST_EVENTS.TEST_CREATED,
    coachingId: payload.coachingId,
    occurredAt: new Date(),
    payload,
    metadata: { correlationId, userId },
  };
}

export function createMarksUploadedEvent(
  payload: MarksUploadedPayload,
  correlationId: string,
  userId?: string,
): DomainEvent<MarksUploadedPayload> {
  return {
    eventId: crypto.randomUUID(),
    eventName: TEST_EVENTS.MARKS_UPLOADED,
    coachingId: payload.coachingId,
    occurredAt: new Date(),
    payload,
    metadata: { correlationId, userId },
  };
}

export function createTestResultReadyEvent(
  payload: TestResultReadyPayload,
  correlationId: string,
  userId?: string,
): DomainEvent<TestResultReadyPayload> {
  return {
    eventId: crypto.randomUUID(),
    eventName: TEST_EVENTS.TEST_RESULT_READY,
    coachingId: payload.coachingId,
    occurredAt: new Date(),
    payload,
    metadata: { correlationId, userId },
  };
}
