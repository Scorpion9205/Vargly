import { DomainEvent } from '@vargly/types';

export interface PaperSharedPayload {
  readonly shareId: string;
  readonly paperId: string;
  readonly coachingId: string;
  readonly batchId: string;
  readonly title: string;
  /** The public download link parents receive */
  readonly link: string;
}

export const PAPER_EVENTS = {
  PAPER_SHARED: 'PaperShared',
} as const;

export function createPaperSharedEvent(
  payload: PaperSharedPayload,
  correlationId: string,
  userId?: string,
): DomainEvent<PaperSharedPayload> {
  return {
    eventId: crypto.randomUUID(),
    eventName: PAPER_EVENTS.PAPER_SHARED,
    coachingId: payload.coachingId,
    occurredAt: new Date(),
    payload,
    metadata: { correlationId, userId },
  };
}
