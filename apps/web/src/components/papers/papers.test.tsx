import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_URL } from '@/lib/api';
import { __resetSessionForTests } from '@/lib/auth/session';
import { openPdf, type Paper, type PaperShare, type Question } from '@/lib/papers';
import { renderWithIntl } from '@/test/render';
import { signInAs, TEACHER } from '@/test/session';
import { GenerateForm } from './generate-form';
import { PaperEditor } from './paper-editor';
import { PapersPage } from './papers-page';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => '/app/papers',
  useRouter: () => ({ push, replace: vi.fn() }),
}));

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  __resetSessionForTests();
  signInAs({ ...TEACHER, permissions: [...TEACHER.permissions, 'papers:manage'] });
  push.mockClear();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const question = (n: number, extra: Partial<Question> = {}): Question => ({
  id: `q${n}`,
  type: 'SHORT',
  text: `Explain concept number ${n}.`,
  answer: `Model answer ${n}`,
  marks: 2,
  ...extra,
});

const mcq: Question = {
  id: 'q1',
  type: 'MCQ',
  text: 'Which gas do plants take in?',
  options: ['Oxygen', 'Carbon dioxide', 'Helium', 'Neon'],
  answer: 'B',
  marks: 1,
  explanation: 'Plants use CO2 for photosynthesis.',
};

const draft: Paper = {
  id: 'p1',
  source: 'AI',
  status: 'DRAFT',
  title: 'Light: unit test',
  subject: 'Science',
  topic: 'Chapter 4',
  language: 'en',
  questions: [mcq, question(2), question(3)],
  questionCount: 3,
  totalMarks: 5,
  fileName: null,
  createdAt: '2026-10-17T05:00:00.000Z',
  updatedAt: '2026-10-17T05:00:00.000Z',
};

const batches = [
  { id: 'b1', name: 'Class 8 A', academicYear: '2026', daysOfWeek: [], isActive: true, activeStudentCount: 24, createdAt: '2026-01-01T00:00:00.000Z' },
];

const subscription = { aiCreditBalance: 120 };

function usePaperApi(paper: Paper) {
  server.use(
    http.get(`${API_URL}/papers/${paper.id}`, () => HttpResponse.json({ data: paper })),
    http.get(`${API_URL}/batches`, () => HttpResponse.json({ data: batches })),
  );
}

describe('PapersPage', () => {
  it('lists papers with their state, and says so when there are none', async () => {
    server.use(
      http.get(`${API_URL}/papers`, () =>
        HttpResponse.json({
          data: [
            { ...draft, questions: [] },
            { ...draft, id: 'p2', title: 'Notes', source: 'UPLOAD', status: 'PUBLISHED', questions: [], questionCount: 0, totalMarks: 0, fileName: 'notes.pdf' },
          ],
        }),
      ),
    );
    renderWithIntl(<PapersPage />);

    expect(await screen.findByRole('link', { name: 'Light: unit test' })).toHaveAttribute('href', '/app/papers/p1');
    expect(screen.getByText(/3 questions · 5 marks/)).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Shared')).toBeInTheDocument();
    expect(screen.getByText(/notes\.pdf/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Generate with AI/ })).toHaveAttribute('href', '/app/papers/new');
  });

  it('shows the empty state', async () => {
    server.use(http.get(`${API_URL}/papers`, () => HttpResponse.json({ data: [] })));
    renderWithIntl(<PapersPage />);
    expect(await screen.findByText('No papers yet')).toBeInTheDocument();
  });

  it('deletes a paper only after asking', async () => {
    const user = userEvent.setup();
    let deleted = false;
    server.use(
      http.get(`${API_URL}/papers`, () => HttpResponse.json({ data: [{ ...draft, questions: [] }] })),
      http.delete(`${API_URL}/papers/p1`, () => {
        deleted = true;
        return HttpResponse.json({ data: { message: 'Paper deleted' } });
      }),
    );
    renderWithIntl(<PapersPage />);

    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(deleted).toBe(false);
    await user.click(await screen.findByRole('button', { name: 'Delete paper' }));
    await waitFor(() => expect(deleted).toBe(true));
  });
});

describe('GenerateForm', () => {
  const fill = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(screen.getByLabelText('Subject'), 'Science');
    await user.type(screen.getByLabelText('Chapter and topic'), 'Chapter 4: Light');
  };

  beforeEach(() => {
    server.use(http.get(`${API_URL}/billing/subscription`, () => HttpResponse.json({ data: subscription })));
  });

  it('asks for the chosen sections and opens the new paper', async () => {
    const user = userEvent.setup();
    let body: unknown;
    server.use(
      http.post(`${API_URL}/papers/generate`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: { ...draft, id: 'new-1' }, meta: { shortBy: 0 } }, { status: 201 });
      }),
    );
    renderWithIntl(<GenerateForm />);
    await fill(user);
    await user.selectOptions(screen.getByLabelText('Language'), 'hi');

    expect(await screen.findByText(/Uses 5 AI credits\. Your balance: 120/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Generate paper' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/app/papers/new-1'));
    expect(body).toEqual({
      subject: 'Science',
      topic: 'Chapter 4: Light',
      language: 'hi',
      difficulty: 'mixed',
      sections: [
        { type: 'MCQ', count: 5, marks: 1 },
        { type: 'SHORT', count: 3, marks: 2 },
      ],
    });
  });

  it('will not submit without a subject, a topic or a question type', async () => {
    const user = userEvent.setup();
    renderWithIntl(<GenerateForm />);
    const submit = screen.getByRole('button', { name: 'Generate paper' });
    expect(submit).toBeDisabled();

    await fill(user);
    expect(submit).toBeEnabled();

    await user.click(screen.getByRole('checkbox', { name: 'Multiple choice' }));
    await user.click(screen.getByRole('checkbox', { name: 'Short answer' }));
    expect(submit).toBeDisabled();
    expect(screen.getByText('Choose at least one question type')).toBeInTheDocument();
  });

  it('stops at 40 questions, the most one request may ask for', async () => {
    const user = userEvent.setup();
    renderWithIntl(<GenerateForm />);
    await fill(user);
    await user.click(screen.getByRole('checkbox', { name: 'True / False' }));
    await user.click(screen.getByRole('checkbox', { name: 'Fill in the blank' }));
    await user.click(screen.getByRole('checkbox', { name: 'Long answer' }));
    for (const label of ['Multiple choice', 'Short answer', 'True / False', 'Fill in the blank', 'Long answer']) {
      const count = screen.getByLabelText(`${label}: Questions`);
      await user.clear(count);
      await user.type(count, '10');
    }
    expect(screen.getByRole('button', { name: 'Generate paper' })).toBeDisabled();
    expect(screen.getByText('Ask for at most 40 questions at a time')).toBeInTheDocument();
  });

  it('sends the teacher to billing when the AI credits have run out', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${API_URL}/papers/generate`, () =>
        HttpResponse.json({ error: { code: 'INSUFFICIENT_AI_CREDITS', message: 'Not enough' } }, { status: 402 }),
      ),
    );
    renderWithIntl(<GenerateForm />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Generate paper' }));

    expect(await screen.findByText(/do not have enough AI credits/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Buy credits' })).toHaveAttribute('href', '/app/billing');
    expect(push).not.toHaveBeenCalled();
  });
});

describe('PaperEditor: a draft', () => {
  it('counts what is selected, and marks follow the selection', async () => {
    const user = userEvent.setup();
    usePaperApi(draft);
    renderWithIntl(<PaperEditor id="p1" />);

    expect(await screen.findByText(/3 of 3 selected · 5 marks/)).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Keep this question 2' }));
    expect(screen.getByText(/2 of 3 selected · 3 marks/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Select none' }));
    expect(screen.getByText(/0 of 3 selected · 0 marks/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Share with a batch/ })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Select all' }));
    expect(screen.getByText(/3 of 3 selected/)).toBeInTheDocument();
  });

  it('shows answers only when asked', async () => {
    const user = userEvent.setup();
    usePaperApi(draft);
    renderWithIntl(<PaperEditor id="p1" />);

    await screen.findByText('Which gas do plants take in?');
    expect(screen.queryByText(/Answer: B\) Carbon dioxide/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Show answers' }));
    expect(screen.getByText('Answer: B) Carbon dioxide')).toBeInTheDocument();
    expect(screen.getByText('Plants use CO2 for photosynthesis.')).toBeInTheDocument();
  });

  it('edits a question and saves the draft', async () => {
    const user = userEvent.setup();
    usePaperApi(draft);
    let saved: { questions: Question[] } | undefined;
    server.use(
      http.put(`${API_URL}/papers/p1`, async ({ request }) => {
        saved = (await request.json()) as { questions: Question[] };
        return HttpResponse.json({ data: draft });
      }),
    );
    renderWithIntl(<PaperEditor id="p1" />);

    await screen.findByText('Explain concept number 2.');
    const save = screen.getByRole('button', { name: 'Save draft' });
    expect(save).toBeDisabled();

    await user.click(screen.getAllByRole('button', { name: 'Edit' })[1]);
    const text = screen.getByLabelText('Question');
    await user.clear(text);
    await user.type(text, 'Why does a spoon look bent in water?');

    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    await user.click(save);

    await waitFor(() => expect(saved).toBeDefined());
    expect(saved!.questions).toHaveLength(3);
    expect(saved!.questions[1].text).toBe('Why does a spoon look bent in water?');
  });

  it('replaces one question with a new one and keeps the rest', async () => {
    const user = userEvent.setup();
    usePaperApi(draft);
    server.use(
      http.post(`${API_URL}/papers/p1/questions/q2/regenerate`, () =>
        HttpResponse.json({ data: { ...draft, questions: [mcq, question(9, { id: 'fresh', text: 'A brand new question.' }), question(3)] } }),
      ),
    );
    renderWithIntl(<PaperEditor id="p1" />);

    await screen.findByText('Explain concept number 2.');
    await user.click(screen.getAllByRole('button', { name: 'Replace with a new question' })[1]);

    expect(await screen.findByText('A brand new question.')).toBeInTheDocument();
    expect(screen.queryByText('Explain concept number 2.')).toBeNull();
    expect(screen.getByText('Which gas do plants take in?')).toBeInTheDocument();
    expect(screen.getByText(/3 of 3 selected/)).toBeInTheDocument();
  });

  it('shares only the questions the teacher kept, as homework with a due date', async () => {
    const user = userEvent.setup();
    usePaperApi(draft);
    const calls: string[] = [];
    let kept: { questions: Question[] } | undefined;
    let published: unknown;
    server.use(
      http.put(`${API_URL}/papers/p1`, async ({ request }) => {
        calls.push('save');
        kept = (await request.json()) as { questions: Question[] };
        return HttpResponse.json({ data: draft });
      }),
      http.post(`${API_URL}/papers/p1/publish`, async ({ request }) => {
        calls.push('publish');
        published = await request.json();
        return HttpResponse.json(
          { data: { id: 's1', batchId: 'b1', kind: 'HOMEWORK', link: 'https://api.vargly.in/api/v1/papers/dl/abcdefghijklmnopqrstuvwxyz123456', homeworkId: 'hw1', openCount: 0, lastOpenedAt: null, createdAt: '2026-10-17T05:00:00.000Z', activeStudents: 24, batchName: 'Class 8 A' } },
          { status: 201 },
        );
      }),
    );
    renderWithIntl(<PaperEditor id="p1" />);

    await screen.findByText('Explain concept number 3.');
    await user.click(screen.getByRole('checkbox', { name: 'Keep this question 3' })); // drop the last
    await user.click(screen.getByRole('button', { name: /Share with a batch/ }));

    const dialog = await screen.findByRole('dialog');
    const submit = within(dialog).getByRole('button', { name: 'Share on WhatsApp' });
    expect(submit).toBeDisabled();
    await user.selectOptions(within(dialog).getByLabelText('Batch'), 'b1');
    expect(within(dialog).getByText(/24 students in this batch/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Answers are never shared/)).toBeInTheDocument();
    await user.click(submit);

    expect(await within(dialog).findByText('Shared with Class 8 A')).toBeInTheDocument();
    expect(within(dialog).getByText(/\/api\/v1\/papers\/dl\/abcdefghijklmnopqrstuvwxyz123456/)).toBeInTheDocument();
    // Saved before sharing, with only the kept questions; then shared as homework
    expect(calls).toEqual(['save', 'publish']);
    expect(kept!.questions.map((q) => q.id)).toEqual(['q1', 'q2']);
    expect(published).toMatchObject({ batchId: 'b1', kind: 'HOMEWORK', title: 'Light: unit test', dueDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
  });

  it('explains a double share instead of failing', async () => {
    const user = userEvent.setup();
    usePaperApi(draft);
    server.use(
      http.put(`${API_URL}/papers/p1`, () => HttpResponse.json({ data: draft })),
      http.post(`${API_URL}/papers/p1/publish`, () =>
        HttpResponse.json({ error: { code: 'ALREADY_SHARED', message: 'just shared' } }, { status: 409 }),
      ),
    );
    renderWithIntl(<PaperEditor id="p1" />);

    await screen.findByText('Explain concept number 3.');
    await user.click(screen.getByRole('button', { name: /Share with a batch/ }));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Batch'), 'b1');
    await user.click(within(dialog).getByRole('button', { name: 'Share on WhatsApp' }));

    expect(await within(dialog).findByText(/just shared with this batch/)).toBeInTheDocument();
  });

  it('shows an uploaded PDF as a file, with nothing to edit', async () => {
    usePaperApi({ ...draft, source: 'UPLOAD', questions: [], questionCount: 0, totalMarks: 0, fileName: 'chapter4.pdf' });
    renderWithIntl(<PaperEditor id="p1" />);

    expect(await screen.findByText('Your PDF: chapter4.pdf')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Preview PDF' })).toBeNull();
    expect(screen.getByRole('button', { name: /Share with a batch/ })).toBeEnabled();
  });
});

describe('PaperEditor: a shared paper', () => {
  const shared: Paper = { ...draft, status: 'PUBLISHED' };
  const share: PaperShare = {
    id: 's1', batchId: 'b1', kind: 'HOMEWORK', link: 'https://api.vargly.in/api/v1/papers/dl/abc', homeworkId: 'hw1',
    openCount: 17, lastOpenedAt: '2026-10-17T06:30:00.000Z', createdAt: '2026-10-17T05:30:00.000Z',
  };

  it('is read-only, says how often it was opened, and offers a copy to edit', async () => {
    const user = userEvent.setup();
    usePaperApi(shared);
    server.use(
      http.get(`${API_URL}/papers/p1/shares`, () => HttpResponse.json({ data: [share] })),
      http.post(`${API_URL}/papers/p1/duplicate`, () => HttpResponse.json({ data: { ...draft, id: 'copy-1' } }, { status: 201 })),
    );
    renderWithIntl(<PaperEditor id="p1" />);

    expect(await screen.findByText('This paper has been shared')).toBeInTheDocument();
    expect(await screen.findByText(/Opened 17 times/)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Make a copy' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/app/papers/copy-1'));
  });
});

describe('PDF preview', () => {
  it('fetches the PDF with the teacher\'s token and opens it in a new tab', async () => {
    let auth: string | null = null;
    server.use(
      http.get(`${API_URL}/papers/p1/pdf`, ({ request }) => {
        auth = request.headers.get('Authorization');
        return new HttpResponse(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
          headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="Light.pdf"' },
        });
      }),
    );
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const create = vi.fn(() => 'blob:preview');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() }));

    await openPdf('/papers/p1/pdf', 'paper.pdf');

    expect(auth).toBe('Bearer token-teacher-1');
    expect(open).toHaveBeenCalledWith('blob:preview', '_blank', 'noopener');
  });
});
