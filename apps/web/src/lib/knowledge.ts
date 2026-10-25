'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './auth/session';
import { useQueryScope } from './queries';

// apps/api knowledge module: what the owner tells the WhatsApp assistant

export const KNOWLEDGE_TYPES = ['FAQ', 'POLICY', 'SCHEDULE', 'SYLLABUS'] as const;
export type KnowledgeType = (typeof KNOWLEDGE_TYPES)[number];

export const MAX_ENTRY_LENGTH = 8000;

export interface KnowledgeEntry {
  id: string;
  title: string;
  type: KnowledgeType;
  content: string;
  updatedAt: string;
}

export interface KnowledgeList {
  items: KnowledgeEntry[];
  /** False when the server has no embedding model yet: entries are saved but the bot cannot search them */
  canEmbed: boolean;
}

export interface KnowledgeInput {
  title: string;
  type: KnowledgeType;
  content: string;
}

/** Topics most parents ask about, offered as one-tap starting points */
export const STARTER_TOPICS = ['fees', 'timings', 'admission', 'holidays', 'facilities'] as const;

export function useKnowledge() {
  const scope = useQueryScope();
  return useQuery({
    queryKey: [scope, 'knowledge'],
    queryFn: ({ signal }) => api.get<KnowledgeList>('/knowledge', { signal }),
  });
}

function useInvalidateKnowledge() {
  const queryClient = useQueryClient();
  const scope = useQueryScope();
  return () => queryClient.invalidateQueries({ queryKey: [scope, 'knowledge'] });
}

export function useSaveKnowledge(id?: string) {
  const invalidate = useInvalidateKnowledge();
  return useMutation({
    mutationFn: (input: KnowledgeInput) =>
      id ? api.put<KnowledgeEntry>(`/knowledge/${id}`, input) : api.post<KnowledgeEntry>('/knowledge', input),
    onSuccess: invalidate,
  });
}

export function useDeleteKnowledge() {
  const invalidate = useInvalidateKnowledge();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/knowledge/${id}`),
    onSuccess: invalidate,
  });
}
