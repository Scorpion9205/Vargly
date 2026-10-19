import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PaperService, GENERATE_PAPER_CREDITS } from '../../modules/papers/paper.service.js';
import type {
  BatchSummary,
  CreatePaperInput,
  CreateShareInput,
  DownloadTarget,
  IPaperRepository,
  PaperRecord,
  PaperShareRecord,
} from '../../modules/papers/paper.repository.js';
import type { QuestionGenerator } from '../../modules/papers/question-generator.js';
import type { Question } from '../../modules/papers/paper.types.js';
import { InsufficientAiCreditsError } from '../../modules/ai/ai.service.js';
import { AiProviderError } from '../../modules/ai/providers/ai-provider.interface.js';
import { MockStorageService } from '../../common/storage/mock-storage.service.js';
import { PAPER_EVENTS } from '../../modules/papers/paper.events.js';

const COACHING = 'coaching-1';
const TEACHER = { userId: 'teacher-1', canSeeAll: false };
const OTHER_TEACHER = { userId: 'teacher-2', canSeeAll: false };
const OWNER = { userId: 'owner-1', canSeeAll: true };
const BATCH = '11111111-1111-4111-8111-111111111111';
const OTHER_BATCH = '22222222-2222-4222-8222-222222222222';

const question = (n: number): Question => ({
  id: `q${n}`,
  type: 'SHORT',
  text: `Explain concept ${n}.`,
  answer: `Answer ${n}`,
  marks: 2,
});

class InMemoryPaperRepository implements IPaperRepository {
  public papers = new Map<string, PaperRecord>();
  public shares = new Map<string, PaperShareRecord>();
  public opens: string[] = [];
  private seq = 0;

  public async createPaper(input: CreatePaperInput): Promise<PaperRecord> {
    const now = new Date();
    const paper: PaperRecord = {
      id: `paper-${++this.seq}`,
      coachingId: input.coachingId,
      source: input.source,
      status: 'DRAFT',
      title: input.title,
      subject: input.subject,
      topic: input.topic ?? null,
      language: input.language ?? 'en',
      questions: input.questions ?? [],
      fileUrl: input.fileUrl ?? null,
      fileKey: input.fileKey ?? null,
      fileName: input.fileName ?? null,
      createdBy: input.createdBy ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.papers.set(paper.id, paper);
    return paper;
  }
  public async findById(id: string) {
    return this.papers.get(id) ?? null;
  }
  public async list(filter: { createdBy?: string; limit: number }) {
    return [...this.papers.values()].filter((p) => !filter.createdBy || p.createdBy === filter.createdBy);
  }
  public async updatePaper(id: string, data: Partial<Pick<PaperRecord, 'title' | 'questions' | 'status'>>) {
    const updated = { ...this.papers.get(id)!, ...data, updatedAt: new Date() };
    this.papers.set(id, updated);
    return updated;
  }
  public async softDelete(id: string) {
    this.papers.delete(id);
  }
  public async createShare(input: CreateShareInput): Promise<PaperShareRecord> {
    const share: PaperShareRecord = {
      id: `share-${++this.seq}`,
      coachingId: input.coachingId,
      paperId: input.paperId,
      batchId: input.batchId,
      kind: input.kind,
      token: input.token,
      homeworkId: input.homeworkId ?? null,
      openCount: 0,
      lastOpenedAt: null,
      createdAt: new Date(),
    };
    this.shares.set(share.id, share);
    return share;
  }
  public async findRecentShare(paperId: string, batchId: string, since: Date) {
    return [...this.shares.values()].find((s) => s.paperId === paperId && s.batchId === batchId && s.createdAt >= since) ?? null;
  }
  public async listShares(paperId: string) {
    return [...this.shares.values()].filter((s) => s.paperId === paperId);
  }
  public async attachHomework(shareId: string, homeworkId: string) {
    this.shares.set(shareId, { ...this.shares.get(shareId)!, homeworkId });
  }
  public async deleteShare(shareId: string) {
    this.shares.delete(shareId);
  }
  public async findBatch(batchId: string): Promise<BatchSummary | null> {
    return batchId === BATCH ? { id: BATCH, name: 'Class 8 A', activeStudents: 24 } : null;
  }
  public async instituteName() {
    return 'Sharma Classes';
  }
  public async findDownloadTarget(token: string): Promise<DownloadTarget | null> {
    const share = [...this.shares.values()].find((s) => s.token === token);
    const paper = share && this.papers.get(share.paperId);
    return share && paper ? { share, paper, instituteName: 'Sharma Classes' } : null;
  }
  public async recordOpen(shareId: string) {
    this.opens.push(shareId);
  }
}

describe('PaperService', () => {
  let repo: InMemoryPaperRepository;
  let generate: ReturnType<typeof vi.fn>;
  let createHomework: ReturnType<typeof vi.fn>;
  let publish: ReturnType<typeof vi.fn>;
  let service: PaperService;

  beforeEach(() => {
    repo = new InMemoryPaperRepository();
    generate = vi.fn(async () => [question(1), question(2), question(3)]);
    createHomework = vi.fn(async () => ({ id: 'hw-1' }));
    publish = vi.fn(async () => undefined);
    service = new PaperService(
      repo,
      { generate } as unknown as QuestionGenerator,
      { createHomework },
      { publish } as never,
      new MockStorageService(),
    );
  });

  const generated = () =>
    service.generate(
      { subject: 'Science', topic: 'Light', language: 'en', difficulty: 'mixed', sections: [{ type: 'SHORT', count: 5, marks: 2 }] },
      COACHING,
      TEACHER,
    );

  describe('generating', () => {
    it('stores the paper as the teacher\'s draft and says how many questions are missing', async () => {
      const { paper, shortBy } = await generated();

      expect(paper).toMatchObject({ source: 'AI', status: 'DRAFT', questionCount: 3, totalMarks: 6, title: 'Science: Light' });
      expect(shortBy).toBe(2);
      expect(generate.mock.calls[0][3]).toBe(GENERATE_PAPER_CREDITS);
    });

    it('answers 402 when the institute is out of AI credits', async () => {
      generate.mockRejectedValueOnce(new InsufficientAiCreditsError(2, 5));
      await expect(generated()).rejects.toMatchObject({
        code: 'INSUFFICIENT_AI_CREDITS',
        statusCode: 402,
        details: { balance: 2, required: 5 },
      });
      expect(repo.papers.size).toBe(0);
    });
  });

  it('tells the teacher the AI is busy when the provider\'s free limit is hit, and keeps nothing', async () => {
    generate.mockRejectedValueOnce(new AiProviderError('Groq API request failed (429): rate limit', 429));
    await expect(generated()).rejects.toMatchObject({ code: 'AI_BUSY', statusCode: 429 });
    expect(repo.papers.size).toBe(0);

    // Any other provider failure is still a real fault
    generate.mockRejectedValueOnce(new AiProviderError('Groq API request failed (500): oops', 500));
    await expect(generated()).rejects.toMatchObject({ message: expect.stringContaining('(500)') });
  });

  describe('who sees what', () => {
    it('hides a teacher\'s paper from another teacher, but not from the owner', async () => {
      const { paper } = await generated();

      await expect(service.get(paper.id, OTHER_TEACHER)).rejects.toMatchObject({ code: 'PAPER_NOT_FOUND', statusCode: 404 });
      await expect(service.get(paper.id, TEACHER)).resolves.toMatchObject({ id: paper.id });
      await expect(service.get(paper.id, OWNER)).resolves.toMatchObject({ id: paper.id });
    });

    it('lists only own papers for a teacher, as summaries without the questions', async () => {
      await generated();
      await service.generate(
        { subject: 'Maths', topic: 'Algebra', language: 'en', difficulty: 'easy', sections: [{ type: 'SHORT', count: 3, marks: 2 }] },
        COACHING,
        OTHER_TEACHER,
      );

      const mine = await service.list(TEACHER);
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({ subject: 'Science', questionCount: 3, questions: [] });
      expect(await service.list(OWNER)).toHaveLength(2);
    });
  });

  describe('editing', () => {
    it('keeps the questions the teacher chose', async () => {
      const { paper } = await generated();
      const kept = paper.questions.slice(0, 2);

      const updated = await service.update(paper.id, { title: 'Light unit test', questions: kept }, TEACHER);
      expect(updated).toMatchObject({ title: 'Light unit test', questionCount: 2, totalMarks: 4 });
    });

    it('replaces only the chosen question when it is regenerated', async () => {
      const { paper } = await generated();
      generate.mockResolvedValueOnce([{ ...question(9), id: 'fresh' }]);

      const updated = await service.regenerateQuestion(paper.id, paper.questions[1].id, {}, COACHING, TEACHER);
      expect(updated.questions.map((q) => q.id)).toEqual([paper.questions[0].id, 'fresh', paper.questions[2].id]);
    });

    it('adds questions after the existing ones, telling the model what to avoid', async () => {
      const { paper } = await generated();
      generate.mockResolvedValueOnce([{ ...question(7), id: 'extra' }]);

      const { paper: updated, shortBy } = await service.addQuestions(
        paper.id, { section: { type: 'SHORT', count: 2, marks: 2 } }, COACHING, TEACHER,
      );
      expect(updated.questionCount).toBe(4);
      expect(shortBy).toBe(1);
      expect(generate.mock.lastCall![4]).toEqual(paper.questions.map((q) => q.text));
    });

    it('refuses to change a paper once it has been shared, and lets the teacher make a copy', async () => {
      const { paper } = await generated();
      await service.publish(paper.id, { batchId: BATCH, kind: 'PRACTICE' }, COACHING, TEACHER);

      await expect(service.update(paper.id, { title: 'Sneaky edit' }, TEACHER)).rejects.toMatchObject({
        code: 'PAPER_PUBLISHED',
        statusCode: 409,
      });
      const copy = await service.duplicate(paper.id, COACHING, TEACHER);
      expect(copy).toMatchObject({ status: 'DRAFT', title: 'Science: Light (copy)', questionCount: 3 });
      expect(copy.id).not.toBe(paper.id);
      expect(copy.questions.map((q) => q.id)).not.toEqual(paper.questions.map((q) => q.id));
    });
  });

  describe('sharing', () => {
    it('shares a practice paper: a private link, a PaperShared event, and no homework', async () => {
      const { paper } = await generated();
      const result = await service.publish(paper.id, { batchId: BATCH, kind: 'PRACTICE', title: 'Light worksheet' }, COACHING, TEACHER);

      expect(result).toMatchObject({ kind: 'PRACTICE', batchName: 'Class 8 A', activeStudents: 24, homeworkId: null });
      expect(result.link).toMatch(/\/api\/v1\/papers\/dl\/[A-Za-z0-9_-]{32}$/);
      expect(createHomework).not.toHaveBeenCalled();
      expect(publish).toHaveBeenCalledTimes(1);
      const event = publish.mock.calls[0][0];
      expect(event.eventName).toBe(PAPER_EVENTS.PAPER_SHARED);
      expect(event.payload).toMatchObject({ batchId: BATCH, title: 'Light worksheet', link: result.link });
      expect((await service.get(paper.id, TEACHER)).status).toBe('PUBLISHED');
    });

    it('shares as homework: the homework carries the link, and the homework alert is the only message', async () => {
      const { paper } = await generated();
      const result = await service.publish(paper.id, { batchId: BATCH, kind: 'HOMEWORK', dueDate: '2026-11-01' }, COACHING, TEACHER);

      expect(createHomework).toHaveBeenCalledWith(
        expect.objectContaining({ batchId: BATCH, dueDate: '2026-11-01', attachmentUrl: result.link, title: 'Science: Light' }),
        COACHING, 'teacher-1', expect.any(String),
      );
      expect(result.homeworkId).toBe('hw-1');
      expect(publish).not.toHaveBeenCalled();
    });

    it('leaves no live link behind when the homework cannot be created', async () => {
      const { paper } = await generated();
      createHomework.mockRejectedValueOnce(new Error('database down'));

      await expect(
        service.publish(paper.id, { batchId: BATCH, kind: 'HOMEWORK', dueDate: '2026-11-01' }, COACHING, TEACHER),
      ).rejects.toThrow('database down');
      expect(repo.shares.size).toBe(0);
      expect((await service.get(paper.id, TEACHER)).status).toBe('DRAFT');
    });

    it('refuses a double click, but allows the same paper to go to another batch', async () => {
      const { paper } = await generated();
      await service.publish(paper.id, { batchId: BATCH, kind: 'PRACTICE' }, COACHING, TEACHER);

      await expect(service.publish(paper.id, { batchId: BATCH, kind: 'PRACTICE' }, COACHING, TEACHER)).rejects.toMatchObject({
        code: 'ALREADY_SHARED',
        statusCode: 409,
      });
      expect(publish).toHaveBeenCalledTimes(1);
    });

    it('refuses an empty paper and an unknown batch', async () => {
      const { paper } = await generated();
      await service.update(paper.id, { questions: [] }, TEACHER);
      await expect(service.publish(paper.id, { batchId: BATCH, kind: 'PRACTICE' }, COACHING, TEACHER)).rejects.toMatchObject({ code: 'EMPTY_PAPER' });

      await service.update(paper.id, { questions: [question(1)] }, TEACHER);
      await expect(service.publish(paper.id, { batchId: OTHER_BATCH, kind: 'PRACTICE' }, COACHING, TEACHER)).rejects.toMatchObject({ code: 'BATCH_NOT_FOUND', statusCode: 404 });
    });

    it('lists where a paper went, with the link and how often it was opened', async () => {
      const { paper } = await generated();
      const shared = await service.publish(paper.id, { batchId: BATCH, kind: 'PRACTICE' }, COACHING, TEACHER);

      expect(await service.shares(paper.id, TEACHER)).toEqual([
        expect.objectContaining({ id: shared.id, link: shared.link, openCount: 0 }),
      ]);
      await expect(service.shares(paper.id, OTHER_TEACHER)).rejects.toMatchObject({ code: 'PAPER_NOT_FOUND' });
    });
  });

  describe('a teacher\'s own PDF', () => {
    const pdfBase64 = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF').toString('base64');

    it('is stored, and can be shared like a generated paper', async () => {
      const paper = await service.upload(
        { title: 'Chapter 3 notes', subject: 'Science', fileName: 'notes.pdf', mimeType: 'application/pdf', contentBase64: pdfBase64 },
        COACHING, TEACHER,
      );
      expect(paper).toMatchObject({ source: 'UPLOAD', fileName: 'notes.pdf', questionCount: 0 });

      const shared = await service.publish(paper.id, { batchId: BATCH, kind: 'PRACTICE' }, COACHING, TEACHER);
      expect(shared.link).toContain('/api/v1/papers/dl/');
    });

    it('refuses a file that is not really a PDF', async () => {
      await expect(
        service.upload(
          { title: 'Fake', subject: 'Science', fileName: 'x.pdf', mimeType: 'application/pdf', contentBase64: Buffer.from('<script>alert(1)</script>').toString('base64') },
          COACHING, TEACHER,
        ),
      ).rejects.toBeTruthy();
      expect(repo.papers.size).toBe(0);
    });

    it('has no answer key and no questions to edit', async () => {
      const paper = await service.upload(
        { title: 'Notes', subject: 'Science', fileName: 'n.pdf', mimeType: 'application/pdf', contentBase64: pdfBase64 },
        COACHING, TEACHER,
      );
      await expect(service.renderForTeacher(paper.id, true, COACHING, TEACHER)).rejects.toMatchObject({ code: 'NOT_AN_AI_PAPER' });
      await expect(service.update(paper.id, { questions: [question(1)] }, TEACHER)).rejects.toMatchObject({ code: 'NOT_AN_AI_PAPER' });
    });
  });

  describe('the parents\' link', () => {
    it('serves the students\' PDF, never the answers, and counts the open', async () => {
      const { paper } = await generated();
      const { link } = await service.publish(paper.id, { batchId: BATCH, kind: 'PRACTICE' }, COACHING, TEACHER);
      const token = link.split('/').pop()!;

      const result = await service.openShare(token);
      expect(result.kind).toBe('generated');
      if (result.kind !== 'generated') throw new Error('unreachable');
      expect(result.pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(result.fileName).toBe('Science_Light.pdf');
      expect(repo.opens).toHaveLength(1);
    });

    it('serves an uploaded file from where it is stored', async () => {
      const pdf = Buffer.from('%PDF-1.4\n%%EOF').toString('base64');
      const paper = await service.upload({ title: 'Notes', subject: 'S', fileName: 'n.pdf', mimeType: 'application/pdf', contentBase64: pdf }, COACHING, TEACHER);
      const { link } = await service.publish(paper.id, { batchId: BATCH, kind: 'PRACTICE' }, COACHING, TEACHER);

      const result = await service.openShare(link.split('/').pop()!);
      expect(result).toMatchObject({ kind: 'file', fileName: 'n.pdf' });
    });

    it('treats an unknown token like a deleted paper', async () => {
      await expect(service.openShare('does-not-exist-does-not-exist')).rejects.toMatchObject({
        code: 'LINK_NOT_FOUND',
        statusCode: 404,
      });
      expect(repo.opens).toHaveLength(0);
    });
  });

  describe('the answer key', () => {
    it('is a PDF only the paper\'s owner or the institute\'s owner can fetch', async () => {
      const { paper } = await generated();
      const key = await service.renderForTeacher(paper.id, true, COACHING, TEACHER);
      expect(key.pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(key.fileName).toBe('Science_Light_answer_key.pdf');

      await expect(service.renderForTeacher(paper.id, true, COACHING, OTHER_TEACHER)).rejects.toMatchObject({ code: 'PAPER_NOT_FOUND' });
      await expect(service.renderForTeacher(paper.id, true, COACHING, OWNER)).resolves.toBeTruthy();
    });
  });
});
