import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { API_URL } from '@/lib/api';
import { __resetSessionForTests } from '@/lib/auth/session';
import type { KnowledgeEntry, KnowledgeList } from '@/lib/knowledge';
import { renderWithIntl } from '@/test/render';
import { OWNER, signInAs } from '@/test/session';
import { KnowledgePage } from './knowledge-page';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => __resetSessionForTests());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const entry = (overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry => ({
  id: 'k1',
  title: 'Fees',
  type: 'FAQ',
  content: 'Class 10 fee is Rs 1500 a month.',
  updatedAt: '2026-10-18T05:00:00.000Z',
  ...overrides,
});

function knowledgeApi(list: KnowledgeList) {
  const saved: unknown[] = [];
  server.use(
    http.get(`${API_URL}/knowledge`, () => HttpResponse.json({ data: list })),
    http.post(`${API_URL}/knowledge`, async ({ request }) => {
      saved.push(await request.json());
      return HttpResponse.json({ data: entry() }, { status: 201 });
    }),
  );
  return saved;
}

describe('KnowledgePage', () => {
  it('lists what the owner wrote', async () => {
    knowledgeApi({ items: [entry()], canEmbed: true });
    signInAs(OWNER);
    renderWithIntl(<KnowledgePage />);
    expect(await screen.findByRole('heading', { name: 'Fees' })).toBeInTheDocument();
    expect(screen.getByText(/Class 10 fee is Rs 1500/)).toBeInTheDocument();
  });

  it('warns that answers are saved but not searchable when the server has no embedding model', async () => {
    knowledgeApi({ items: [], canEmbed: false });
    signInAs(OWNER);
    renderWithIntl(<KnowledgePage />);
    expect(await screen.findByText(/cannot search these answers yet/)).toBeInTheDocument();
  });

  it('starts a new answer from a suggested topic and saves it', async () => {
    const saved = knowledgeApi({ items: [], canEmbed: true });
    signInAs(OWNER);
    renderWithIntl(<KnowledgePage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Class timings' }));
    expect(await screen.findByLabelText('Topic')).toHaveValue('Class timings');
    await userEvent.click(screen.getByRole('button', { name: 'Save answer' }));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]).toMatchObject({ title: 'Class timings', type: 'SCHEDULE' });
  });
});
