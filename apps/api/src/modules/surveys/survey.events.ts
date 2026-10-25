import { DomainEvent } from '@vargly/types';

export interface SurveyOpenedPayload {
  readonly coachingId: string;
  readonly surveyId: string;
  readonly title: string;
  /** One private link for each parent, with the number to send it to */
  readonly invites: ReadonlyArray<{ readonly token: string; readonly link: string; readonly phone: string }>;
}

export const SURVEY_EVENTS = {
  SURVEY_OPENED: 'SurveyOpened',
} as const;

export function createSurveyOpenedEvent(
  payload: SurveyOpenedPayload,
  correlationId: string = crypto.randomUUID(),
): DomainEvent<SurveyOpenedPayload> {
  return {
    eventId: crypto.randomUUID(),
    eventName: SURVEY_EVENTS.SURVEY_OPENED,
    coachingId: payload.coachingId,
    occurredAt: new Date(),
    payload,
    metadata: { correlationId },
  };
}
