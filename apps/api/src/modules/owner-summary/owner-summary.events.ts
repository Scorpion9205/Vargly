import { DomainEvent } from '@vargly/types';

export interface OwnerSummaryPayload {
  readonly coachingId: string;
  /** The India day the summary is for (YYYY-MM-DD) */
  readonly date: string;
  readonly absentYesterday: number;
  readonly overdueCount: number;
  readonly overdueAmount: number;
  readonly callsDue: number;
}

export const OWNER_SUMMARY_EVENTS = {
  OWNER_SUMMARY_READY: 'OwnerSummaryReady',
} as const;

export function createOwnerSummaryEvent(
  payload: OwnerSummaryPayload,
  correlationId: string = crypto.randomUUID(),
): DomainEvent<OwnerSummaryPayload> {
  return {
    eventId: crypto.randomUUID(),
    eventName: OWNER_SUMMARY_EVENTS.OWNER_SUMMARY_READY,
    coachingId: payload.coachingId,
    occurredAt: new Date(),
    payload,
    metadata: { correlationId },
  };
}
