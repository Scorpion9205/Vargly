import { DomainEvent } from '@vargly/types';

export interface EnquiryReceivedPayload {
  readonly coachingId: string;
  readonly enquiryId: string;
  readonly name: string;
  readonly phone: string;
  readonly interestedIn: string | null;
}

export const ENQUIRY_EVENTS = {
  /** Someone filled in the institute's public enquiry page */
  ENQUIRY_RECEIVED: 'EnquiryReceived',
} as const;

export function createEnquiryReceivedEvent(
  payload: EnquiryReceivedPayload,
  correlationId: string = crypto.randomUUID(),
): DomainEvent<EnquiryReceivedPayload> {
  return {
    eventId: crypto.randomUUID(),
    eventName: ENQUIRY_EVENTS.ENQUIRY_RECEIVED,
    coachingId: payload.coachingId,
    occurredAt: new Date(),
    payload,
    metadata: { correlationId },
  };
}
