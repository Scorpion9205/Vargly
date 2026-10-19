import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import type { Express } from 'express';

/**
 * The paper studio through the real HTTP stack and PostgreSQL: a teacher generates a paper (the
 * mock provider answers, as there is no key in tests), keeps some questions, shares it with a
 * batch, and parents open the link with no login.
 *
 * Needs a migrated, RBAC-seeded database and Redis (see tenant-isolation.e2e.spec.ts).
 */
const OWNER_URL = process.env.TEST_DATABASE_OWNER_URL;
const enabled = !!OWNER_URL && !!process.env.TEST_DATABASE_URL;

const CODE = 'zeta-classes';
const OWNER = { email: 'owner@zeta.in', password: 'Own3r!Passw0rd' };
const TEACHER = { email: 'teacher@zeta.in', password: 'Teach3r!Pass' };
const OTHER_TEACHER = { email: 'other.teacher@zeta.in', password: 'Teach3r!Pass2' };

describe.skipIf(!enabled)('Paper studio (HTTP + PostgreSQL)', () => {
  let app: Express;
  let db: PrismaClient;
  let ownerToken: string;
  let teacherToken: string;
  let otherTeacherToken: string;
  const ids: Record<string, string> = {};

  const as = (token: string) => ({
    get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string, body: object = {}) => request(app).post(url).set('Authorization', `Bearer ${token}`).send(body),
    put: (url: string, body: object) => request(app).put(url).set('Authorization', `Bearer ${token}`).send(body),
    delete: (url: string) => request(app).delete(url).set('Authorization', `Bearer ${token}`),
  });

  const created = async (res: request.Response) => {
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.data.id as string;
  };

  const login = async (email: string, password: string) => {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password, coachingCode: CODE });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body.data.tokens.accessToken as string;
  };

  const spec = {
    subject: 'Science',
    topic: 'Chapter 4: Light and reflection',
    classLevel: 'Class 8',
    language: 'en',
    difficulty: 'mixed',
    sections: [
      { type: 'MCQ', count: 3, marks: 1 },
      { type: 'TRUE_FALSE', count: 2, marks: 1 },
      { type: 'SHORT', count: 2, marks: 3 },
    ],
  };

  const generate = async (token = teacherToken) => {
    const res = await as(token).post('/api/v1/papers/generate', spec);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.data;
  };

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: OWNER_URL } } });
    await db
      .$transaction([
        db.$executeRaw`SELECT set_config('app.rls_bypass', 'on', true)`,
        db.$executeRawUnsafe(`DELETE FROM coachings WHERE code = '${CODE}'`),
      ])
      .catch(async () => {
        await db.$transaction([
          db.$executeRaw`SELECT set_config('app.rls_bypass', 'on', true)`,
          db.$executeRawUnsafe('TRUNCATE coachings, refresh_tokens CASCADE'),
        ]);
      });

    const { createApp } = await import('../../main.js');
    app = createApp();

    const reg = await request(app).post('/api/v1/coachings/register').send({
      coachingName: 'Zeta Classes',
      phone: '9876500020',
      email: 'office@zeta.in',
      ownerName: 'Zeta Owner',
      ownerEmail: OWNER.email,
      ownerPhone: '9876500021',
      ownerPassword: OWNER.password,
    });
    expect(reg.status, JSON.stringify(reg.body)).toBe(201);
    ownerToken = await login(OWNER.email, OWNER.password);
    const owner = as(ownerToken);

    ids.teacher = await created(await owner.post('/api/v1/teachers', { name: 'Tara Teacher', phone: '9876500022', email: TEACHER.email, password: TEACHER.password }));
    ids.otherTeacher = await created(await owner.post('/api/v1/teachers', { name: 'Omi Other', phone: '9876500023', email: OTHER_TEACHER.email, password: OTHER_TEACHER.password }));
    ids.batch = await created(await owner.post('/api/v1/batches', { name: 'Class 8 A', academicYear: '2026', teacherIds: [ids.teacher] }));
    ids.otherBatch = await created(await owner.post('/api/v1/batches', { name: 'Class 9 B', academicYear: '2026', teacherIds: [ids.otherTeacher] }));

    // Two children; one parent has both, the second child also has a father; the child's own phone is the mother's
    ids.s1 = await created(await owner.post('/api/v1/students', { firstName: 'Aarav', lastName: 'Zeta', phone: '9876500031' }));
    ids.s2 = await created(await owner.post('/api/v1/students', { firstName: 'Diya', lastName: 'Zeta' }));
    for (const s of [ids.s1, ids.s2]) {
      expect((await owner.post(`/api/v1/batches/${ids.batch}/students`, { studentId: s })).status).toBeLessThan(300);
    }
    ids.mother = await created(await owner.post('/api/v1/parents', { name: 'Meera Zeta', phone: '9876500041', relation: 'MOTHER', studentId: ids.s1 }));
    ids.father = await created(await owner.post('/api/v1/parents', { name: 'Raj Zeta', phone: '9876500042', relation: 'FATHER', studentId: ids.s2 }));
    expect((await owner.post('/api/v1/parents/link', { studentId: ids.s2, parentId: ids.mother })).status).toBeLessThan(300);

    teacherToken = await login(TEACHER.email, TEACHER.password);
    otherTeacherToken = await login(OTHER_TEACHER.email, OTHER_TEACHER.password);
  }, 120_000);

  afterAll(async () => {
    await db?.$disconnect();
    const { queueRegistry } = await import('../../queues/queue.registry.js');
    const { getPrismaClient } = await import('../../database/prisma/tenant-prisma.extension.js');
    await queueRegistry.closeAll().catch(() => undefined);
    await (getPrismaClient() as any).$disconnect();
  });

  describe('generating and editing', () => {
    it('makes a draft from the teacher\'s brief, with questions, answers and marks', async () => {
      const paper = await generate();

      expect(paper).toMatchObject({ source: 'AI', status: 'DRAFT', subject: 'Science', questionCount: 7, totalMarks: 11 });
      expect(paper.questions.map((q: any) => q.type)).toEqual(['MCQ', 'MCQ', 'MCQ', 'TRUE_FALSE', 'TRUE_FALSE', 'SHORT', 'SHORT']);
      expect(paper.questions[0]).toMatchObject({ options: expect.any(Array), answer: expect.stringMatching(/^[A-D]$/) });
      ids.draft = paper.id;
    });

    it('charges credits for it', async () => {
      const before = (await db.aiCreditWallet.findFirst({ where: { coachingId: (await db.coaching.findFirstOrThrow({ where: { code: CODE } })).id } }))!.balance;
      await generate();
      const after = (await db.aiCreditWallet.findFirst({ where: { coachingId: (await db.coaching.findFirstOrThrow({ where: { code: CODE } })).id } }))!.balance;
      expect(before - after).toBe(5);
    });

    it('lets the teacher keep only the questions they want', async () => {
      const paper = (await as(teacherToken).get(`/api/v1/papers/${ids.draft}`)).body.data;
      const kept = [paper.questions[0], paper.questions[3], paper.questions[5]];

      const res = await as(teacherToken).put(`/api/v1/papers/${ids.draft}`, { title: 'Light: unit test', questions: kept });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.data).toMatchObject({ title: 'Light: unit test', questionCount: 3, totalMarks: 5 });
    });

    it('swaps one question for a new one and adds more', async () => {
      const paper = (await as(teacherToken).get(`/api/v1/papers/${ids.draft}`)).body.data;
      const target = paper.questions[0];

      const swapped = await as(teacherToken).post(`/api/v1/papers/${ids.draft}/questions/${target.id}/regenerate`, {});
      expect(swapped.status, JSON.stringify(swapped.body)).toBe(200);
      expect(swapped.body.data.questions).toHaveLength(3);
      expect(swapped.body.data.questions[0].id).not.toBe(target.id);

      const more = await as(teacherToken).post(`/api/v1/papers/${ids.draft}/questions`, { section: { type: 'SHORT', count: 2, marks: 3 } });
      expect(more.status, JSON.stringify(more.body)).toBe(200);
      expect(more.body.data.questionCount).toBe(5);
    });

    it('rejects a request the teacher could not have meant', async () => {
      const bad = await as(teacherToken).post('/api/v1/papers/generate', { ...spec, sections: [{ type: 'MCQ', count: 50, marks: 1 }] });
      expect(bad.status).toBe(400);
      const dup = await as(teacherToken).post('/api/v1/papers/generate', { ...spec, sections: [{ type: 'MCQ', count: 2, marks: 1 }, { type: 'MCQ', count: 2, marks: 1 }] });
      expect(dup.status).toBe(400);
    });
  });

  describe('who can see what', () => {
    it('keeps a teacher\'s papers from other teachers, and shows all to the owner', async () => {
      expect((await as(otherTeacherToken).get(`/api/v1/papers/${ids.draft}`)).status).toBe(404);
      expect((await as(otherTeacherToken).put(`/api/v1/papers/${ids.draft}`, { title: 'Hijack' })).status).toBe(404);
      expect((await as(otherTeacherToken).get('/api/v1/papers')).body.data).toEqual([]);

      expect((await as(ownerToken).get(`/api/v1/papers/${ids.draft}`)).status).toBe(200);
      expect((await as(ownerToken).get('/api/v1/papers')).body.data.length).toBeGreaterThanOrEqual(2);
      expect((await as(teacherToken).get('/api/v1/papers')).body.data[0]).toMatchObject({ questions: [], questionCount: expect.any(Number) });
    });

    it('needs a login for everything except the parents\' link', async () => {
      expect((await request(app).get('/api/v1/papers')).status).toBe(401);
      expect((await request(app).post('/api/v1/papers/generate').send(spec)).status).toBe(401);
    });

    it('lets a teacher share only with a batch they teach', async () => {
      const res = await as(teacherToken).post(`/api/v1/papers/${ids.draft}/publish`, { batchId: ids.otherBatch, kind: 'PRACTICE' });
      expect(res.status).toBe(403);
    });
  });

  describe('the answer key and the preview', () => {
    it('gives the teacher a preview and an answer key as PDFs', async () => {
      const preview = await as(teacherToken).get(`/api/v1/papers/${ids.draft}/pdf`).buffer(true).parse(binary);
      expect(preview.status).toBe(200);
      expect(preview.headers['content-type']).toContain('application/pdf');
      expect(preview.body.subarray(0, 5).toString('latin1')).toBe('%PDF-');

      const key = await as(teacherToken).get(`/api/v1/papers/${ids.draft}/pdf?answers=true`).buffer(true).parse(binary);
      expect(key.status).toBe(200);
      expect(key.body.length).toBeGreaterThan(1000);
      expect(key.headers['content-disposition']).toContain('answer_key');
      expect((await as(otherTeacherToken).get(`/api/v1/papers/${ids.draft}/pdf?answers=true`)).status).toBe(404);
    });
  });

  describe('sharing with a batch', () => {
    it('shares a practice paper: a link parents can open, and one message per parent and per student phone', async () => {
      const res = await as(teacherToken).post(`/api/v1/papers/${ids.draft}/publish`, { batchId: ids.batch, kind: 'PRACTICE', title: 'Light: unit test' });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.data).toMatchObject({ kind: 'PRACTICE', batchName: 'Class 8 A', activeStudents: 2, homeworkId: null });
      ids.link = res.body.data.link;
      expect(ids.link).toMatch(/\/api\/v1\/papers\/dl\/[A-Za-z0-9_-]{32}$/);

      // The event handler queues one WhatsApp message per distinct phone: mother, father, and Aarav's own
      const rows = await db.$queryRaw<Array<{ recipient: string; template_name: string; content: string; status: string }>>`
        SELECT recipient, template_name, content, status::text AS status FROM notification_history
        WHERE template_name = 'paper_shared' AND content LIKE ${'%' + ids.link + '%'} ORDER BY recipient`;
      expect(rows.map((r) => r.recipient)).toEqual(['9876500031', '9876500041', '9876500042'].map((p) => expect.stringContaining(p)));
      expect(rows[0].content).toContain(ids.link);
      expect(rows[0].content).toMatch(/^New practice paper from Zeta Classes for /);
      expect(rows.every((r) => r.status === 'QUEUED')).toBe(true);
    });

    it('lets parents open the link with no login, and the file downloads', async () => {
      const path = new URL(ids.link).pathname;
      const res = await request(app).get(path).buffer(true).parse(binary);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toMatch(/^attachment; filename="/);
      expect(res.headers['x-robots-tag']).toContain('noindex');
      expect(res.body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    });

    it('counts the opens for the teacher', async () => {
      await request(app).get(new URL(ids.link).pathname);
      await new Promise((resolve) => setTimeout(resolve, 200)); // the counter is written after the reply
      const shares = await as(teacherToken).get(`/api/v1/papers/${ids.draft}/shares`);
      expect(shares.status).toBe(200);
      expect(shares.body.data).toHaveLength(1);
      expect(shares.body.data[0]).toMatchObject({ link: ids.link, kind: 'PRACTICE', openCount: expect.any(Number) });
      expect(shares.body.data[0].openCount).toBeGreaterThanOrEqual(2);
    });

    it('refuses a made-up or malformed link the same way', async () => {
      expect((await request(app).get('/api/v1/papers/dl/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).status).toBe(404);
      expect((await request(app).get('/api/v1/papers/dl/short')).status).toBe(404);
      expect((await request(app).get('/api/v1/papers/dl/..%2F..%2Fetc')).status).toBe(404);
    });

    it('does not change a shared paper, and refuses a double click', async () => {
      expect((await as(teacherToken).put(`/api/v1/papers/${ids.draft}`, { title: 'Edit after sharing' })).status).toBe(409);
      const again = await as(teacherToken).post(`/api/v1/papers/${ids.draft}/publish`, { batchId: ids.batch, kind: 'PRACTICE' });
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe('ALREADY_SHARED');

      const copy = await as(teacherToken).post(`/api/v1/papers/${ids.draft}/duplicate`);
      expect(copy.status).toBe(201);
      expect(copy.body.data.status).toBe('DRAFT');
    });

    it('shares as homework: a homework with the link attached, and a single message that carries it', async () => {
      const paper = await generate();
      const res = await as(teacherToken).post(`/api/v1/papers/${paper.id}/publish`, { batchId: ids.batch, kind: 'HOMEWORK', dueDate: '2026-12-01', title: 'Light worksheet' });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.data.homeworkId).toEqual(expect.any(String));

      const homework = await as(ownerToken).get(`/api/v1/homework/${res.body.data.homeworkId}`);
      expect(homework.body.data).toMatchObject({ title: 'Light worksheet', attachmentUrl: res.body.data.link });

      const rows = await db.$queryRaw<Array<{ template_name: string; content: string }>>`
        SELECT template_name, content FROM notification_history WHERE content LIKE ${'%' + res.body.data.link + '%'}`;
      expect(rows).toHaveLength(3);
      expect(rows.every((r) => r.template_name === 'homework_with_file')).toBe(true);
    });

    it('needs a due date for homework', async () => {
      const paper = await generate();
      const res = await as(teacherToken).post(`/api/v1/papers/${paper.id}/publish`, { batchId: ids.batch, kind: 'HOMEWORK' });
      expect(res.status).toBe(400);
    });
  });

  describe('a teacher\'s own PDF', () => {
    it('is uploaded, shared and opened like a generated one', async () => {
      const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');
      const upload = await as(teacherToken).post('/api/v1/papers/upload', {
        title: 'Chapter 4 notes', subject: 'Science', fileName: 'chapter4.pdf', mimeType: 'application/pdf', contentBase64: pdf.toString('base64'),
      });
      expect(upload.status, JSON.stringify(upload.body)).toBe(201);
      expect(upload.body.data).toMatchObject({ source: 'UPLOAD', fileName: 'chapter4.pdf' });

      const shared = await as(teacherToken).post(`/api/v1/papers/${upload.body.data.id}/publish`, { batchId: ids.batch, kind: 'PRACTICE' });
      expect(shared.status, JSON.stringify(shared.body)).toBe(201);
    });

    it('refuses a file that only claims to be a PDF', async () => {
      const res = await as(teacherToken).post('/api/v1/papers/upload', {
        title: 'Sneaky', subject: 'Science', fileName: 'x.pdf', mimeType: 'application/pdf', contentBase64: Buffer.from('<html><script>alert(1)</script></html>').toString('base64'),
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });
});

/** supertest parser that keeps the body as bytes */
function binary(res: request.Response, callback: (err: Error | null, body: Buffer) => void): void {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}
