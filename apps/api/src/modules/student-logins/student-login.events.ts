import { DomainEvent } from '@vargly/types';

export type StudentLoginAction = 'CREATED' | 'RESET' | 'DISABLED';

/** What happened to a student's login: who made it, reset it or switched it off. Never the password. */
export interface StudentLoginChangedPayload {
  readonly coachingId: string;
  readonly studentId: string;
  readonly action: StudentLoginAction;
  readonly loginId?: string;
  /** For the message to the parent; absent in the audit trail's concern */
  readonly studentName?: string;
}

export const STUDENT_LOGIN_EVENTS = {
  CHANGED: 'StudentLoginChanged',
} as const;

export function createStudentLoginChangedEvent(
  payload: StudentLoginChangedPayload,
  userId?: string,
  correlationId: string = crypto.randomUUID(),
): DomainEvent<StudentLoginChangedPayload> {
  return {
    eventId: crypto.randomUUID(),
    eventName: STUDENT_LOGIN_EVENTS.CHANGED,
    coachingId: payload.coachingId,
    occurredAt: new Date(),
    payload,
    metadata: { correlationId, userId },
  };
}
