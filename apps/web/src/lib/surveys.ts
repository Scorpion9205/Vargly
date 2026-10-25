'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './auth/session';
import { useQueryScope } from './queries';

// apps/api surveys module: a rating survey sent to parents as a WhatsApp link

export interface SurveySummary {
  id: string;
  title: string;
  question: string;
  batchName: string | null;
  sent: number;
  answered: number;
  /** One decimal; null until someone answers */
  averageRating: number | null;
  closed: boolean;
  createdAt: string;
}

export interface SurveyResponse {
  parentName: string;
  rating: number;
  comment: string | null;
  respondedAt: string;
}

export interface SurveyDetail extends SurveySummary {
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
  responses: SurveyResponse[];
}

export interface SurveyInput {
  title: string;
  question?: string;
  batchId?: string;
}

export function useSurveys() {
  const scope = useQueryScope();
  return useQuery({
    queryKey: [scope, 'surveys', 'list'],
    queryFn: ({ signal }) => api.get<SurveySummary[]>('/surveys', { signal }),
  });
}

export function useSurveyDetail(id: string | null) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: [scope, 'surveys', 'detail', id],
    queryFn: ({ signal }) => api.get<SurveyDetail>(`/surveys/${id}`, { signal }),
    enabled: id !== null,
  });
}

function useInvalidateSurveys() {
  const queryClient = useQueryClient();
  const scope = useQueryScope();
  return () => queryClient.invalidateQueries({ queryKey: [scope, 'surveys'] });
}

export function useCreateSurvey() {
  const invalidate = useInvalidateSurveys();
  return useMutation({
    mutationFn: (input: SurveyInput) => api.post<SurveySummary>('/surveys', input),
    onSuccess: invalidate,
  });
}

export function useCloseSurvey() {
  const invalidate = useInvalidateSurveys();
  return useMutation({
    mutationFn: (id: string) => api.post(`/surveys/${id}/close`, {}),
    onSuccess: invalidate,
  });
}

/** Share of the parents who got the survey that answered it, 0 to 100 */
export function responseRate(survey: Pick<SurveySummary, 'sent' | 'answered'>): number {
  return survey.sent === 0 ? 0 : Math.round((survey.answered / survey.sent) * 100);
}
