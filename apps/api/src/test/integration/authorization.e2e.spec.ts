import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import type { Express } from 'express';

/**
 * Phase 2 exit criteria through the real HTTP stack:
 * - teachers are confined to the batches they teach, whichever record a route identifies
 * - deactivating a teacher removes access on their next request (no wait for token expiry)
 * - a coaching whose trial has lapsed gets 402 on business routes but can still sign in and pay
 *
 * Needs a migrated, RBAC-seeded database and Redis (see tenant-isolation.e2e.spec.ts).
 */
const OWNER_URL = process.env.TEST_DATABASE_OWNER_URL;
const enabled = !!OWNER_URL && !!process.env.TEST_DATABASE_URL;

// Institute codes are made from the name at sign-up: "Gamma Tutorials" -> "gamma-tutorials"
const CODE = 'gamma-tutorials';
const OWNER = { email: 'owner@gamma.in', password: 'Own3r!Passw0rd' };
const TEACHER = { email: 'teacher@gamma.in', password: 'Teach3r!Pass' };

describe.skipIf(!enabled)('Authorization end-to-end (HTTP + PostgreSQL)', () => {
  let app: Express;
  let ownerDb: PrismaClient;
  let coachingId: string;
  let ownerToken: string;
  let teacherToken: string;
  let teacherId: string;
  const ids: Record<string, string> = {};

  const as = (token: string) => ({
    get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string, body: object) => request(app).post(url).set('Authorization', `Bearer ${token}`).send(body),
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

  beforeAll(async () => {
    ownerDb = new PrismaClient({ datasources: { db: { url: OWNER_URL } } });
    await ownerDb.$transaction([
      ownerDb.$executeRaw`SELECT set_config('app.rls_bypass', 'on', true)`,
      ownerDb.$executeRawUnsafe(`DELETE FROM coachings WHERE code = '${CODE}'`),
    ]).catch(async () => {
      await ownerDb.$transaction([
        ownerDb.$executeRaw`SELECT set_config('app.rls_bypass', 'on', true)`,
        ownerDb.$executeRawUnsafe('TRUNCATE coachings, refresh_tokens CASCADE'),
      ]);
    });

    const { createApp } = await import('../../main.js');
    app = createApp();

    const reg = await request(app).post('/api/v1/coachings/register').send({
      coachingName: 'Gamma Tutorials',
      phone: '9876500000',
      email: 'office@gamma.in',
      ownerName: 'Gamma Owner',
      ownerEmail: OWNER.email,
      ownerPhone: '9876500001',
      ownerPassword: OWNER.password,
    });
    expect(reg.status, JSON.stringify(reg.body)).toBe(201);
    expect(reg.body.data.code).toBe(CODE);
    coachingId = reg.body.data.id;
    ownerToken = await login(OWNER.email, OWNER.password);
    const owner = as(ownerToken);

    const teacher = await owner.post('/api/v1/teachers', {
      name: 'Tara Teacher',
      phone: '9876500002',
      email: TEACHER.email,
      password: TEACHER.password,
    });
    teacherId = await created(teacher);

    ids.taughtBatch = await created(
      await owner.post('/api/v1/batches', { name: 'Taught Maths', academicYear: '2026', teacherIds: [teacherId] }),
    );
    ids.otherBatch = await created(await owner.post('/api/v1/batches', { name: 'Other Science', academicYear: '2026' }));

    ids.taughtStudent = await created(await owner.post('/api/v1/students', { firstName: 'Tanu', lastName: 'In' }));
    ids.otherStudent = await created(await owner.post('/api/v1/students', { firstName: 'Omar', lastName: 'Out' }));
    for (const [batch, student] of [
      [ids.taughtBatch, ids.taughtStudent],
      [ids.otherBatch, ids.otherStudent],
    ]) {
      const res = await owner.post(`/api/v1/batches/${batch}/students`, { studentId: student });
      expect(res.status, JSON.stringify(res.body)).toBeLessThan(300);
    }

    const homework = (batchId: string) => ({ batchId, title: 'HW', description: 'Do it', dueDate: '2026-12-01' });
    ids.taughtHomework = await created(await owner.post('/api/v1/homework', homework(ids.taughtBatch)));
    ids.otherHomework = await created(await owner.post('/api/v1/homework', homework(ids.otherBatch)));
    ids.taughtTest = await created(
      await owner.post('/api/v1/tests', {
        batchId: ids.taughtBatch,
        title: 'Taught test',
        subject: 'Maths',
        testDate: '2026-11-02',
        totalMarks: 100,
      }),
    );
    ids.otherTest = await created(
      await owner.post('/api/v1/tests', {
        batchId: ids.otherBatch,
        title: 'Unit test',
        subject: 'Science',
        testDate: '2026-11-01',
        totalMarks: 100,
      }),
    );

    teacherToken = await login(TEACHER.email, TEACHER.password);
  }, 120_000);

  afterAll(async () => {
    await ownerDb?.$disconnect();
    const { queueRegistry } = await import('../../queues/queue.registry.js');
    const { getPrismaClient } = await import('../../database/prisma/tenant-prisma.extension.js');
    await queueRegistry.closeAll().catch(() => undefined);
    await (getPrismaClient() as any).$disconnect();
  });

  describe('teachers are confined to their own batches', () => {
    it('shows a teacher the batches they are assigned to on their dashboard', async () => {
      const res = await as(teacherToken).get('/api/v1/dashboard/teacher');
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.data.assignedBatches.map((b: any) => b.batchId)).toEqual([ids.taughtBatch]);
    });

    it("never shows a teacher another teacher's dashboard", async () => {
      const res = await as(teacherToken).get(
        `/api/v1/dashboard/teacher?teacherId=00000000-0000-4000-8000-000000000000`,
      );
      expect(res.status).toBe(200);
      expect(res.body.data.assignedBatches.map((b: any) => b.batchId)).toEqual([ids.taughtBatch]);
    });

    it('can read and edit homework of a batch they teach', async () => {
      const teacher = as(teacherToken);
      expect((await teacher.get(`/api/v1/homework/${ids.taughtHomework}`)).status).toBe(200);
      expect((await teacher.put(`/api/v1/homework/${ids.taughtHomework}`, { title: 'Updated' })).status).toBe(200);
    });

    it("gets 403 on another batch's homework by id (read, update, delete)", async () => {
      const teacher = as(teacherToken);
      expect((await teacher.get(`/api/v1/homework/${ids.otherHomework}`)).status).toBe(403);
      expect((await teacher.put(`/api/v1/homework/${ids.otherHomework}`, { title: 'Hijack' })).status).toBe(403);
      expect((await teacher.delete(`/api/v1/homework/${ids.otherHomework}`)).status).toBe(403);
    });

    it("gets 403 when uploading marks for another batch's test", async () => {
      const res = await as(teacherToken).post(`/api/v1/tests/${ids.otherTest}/marks`, {
        results: [{ studentId: ids.otherStudent, marksObtained: 90 }],
      });
      expect(res.status).toBe(403);
    });

    it('lists only the batches they teach, and asking for another teacher widens nothing', async () => {
      const teacher = as(teacherToken);
      const mine = await teacher.get('/api/v1/batches');
      expect(mine.status, JSON.stringify(mine.body)).toBe(200);
      expect(mine.body.data.map((b: any) => b.id)).toEqual([ids.taughtBatch]);

      // A teacherId filter can only narrow the teacher's own batches, never reach another's
      const other = await teacher.get('/api/v1/batches?teacherId=00000000-0000-4000-8000-000000000000');
      expect(other.status).toBe(200);
      expect(other.body.data).toEqual([]);
      const self = await teacher.get(`/api/v1/batches?teacherId=${teacherId}`);
      expect(self.body.data.map((b: any) => b.id)).toEqual([ids.taughtBatch]);

      // Owners still see every batch
      const all = await as(ownerToken).get('/api/v1/batches');
      expect(all.body.data.map((b: any) => b.id)).toEqual(expect.arrayContaining([ids.taughtBatch, ids.otherBatch]));
    });

    it("refuses marks for a student who is not in the test's batch, even in a batch they teach", async () => {
      const teacher = as(teacherToken);
      const refused = await teacher.post(`/api/v1/tests/${ids.taughtTest}/marks`, {
        results: [
          { studentId: ids.taughtStudent, marksObtained: 70 },
          { studentId: ids.otherStudent, marksObtained: 90 },
        ],
      });
      expect(refused.status, JSON.stringify(refused.body)).toBe(400);
      expect(refused.body.error.code).toBe('STUDENT_NOT_IN_BATCH');

      // Nothing was stored for the batch, and the enrolled student alone is accepted
      const accepted = await teacher.post(`/api/v1/tests/${ids.taughtTest}/marks`, {
        results: [{ studentId: ids.taughtStudent, marksObtained: 70 }],
      });
      expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
      expect(accepted.body.data.results).toHaveLength(1);
    });

    it('gets 403 creating homework in a batch they do not teach', async () => {
      const res = await as(teacherToken).post('/api/v1/homework', {
        batchId: ids.otherBatch,
        title: 'X',
        description: 'Y',
        dueDate: '2026-12-01',
      });
      expect(res.status).toBe(403);
    });

    it('sees only students enrolled in their batches', async () => {
      const teacher = as(teacherToken);
      expect((await teacher.get(`/api/v1/students/${ids.taughtStudent}`)).status).toBe(200);
      expect((await teacher.get(`/api/v1/students/${ids.otherStudent}`)).status).toBe(403);
      expect((await teacher.get(`/api/v1/tests/student/${ids.otherStudent}`)).status).toBe(403);
    });

    it('owners are not restricted', async () => {
      expect((await as(ownerToken).get(`/api/v1/homework/${ids.otherHomework}`)).status).toBe(200);
      // Regression: this query filtered on a non-existent column and always returned 500
      expect((await as(ownerToken).get(`/api/v1/tests/student/${ids.otherStudent}`)).status).toBe(200);
    });

    it("rejects enrolling another coaching's student id (same-tenant references)", async () => {
      const foreignStudent = '99999999-9999-4999-8999-999999999999';
      const res = await as(ownerToken).post(`/api/v1/batches/${ids.taughtBatch}/students`, { studentId: foreignStudent });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });

  describe('a password change ends earlier sessions', () => {
    it('rejects the old access token at once, and the new password signs in', async () => {
      const owner = as(ownerToken);
      const account = { email: 'pw.change@gamma.in', password: 'First!Passw0rd1', next: 'Second!Passw0rd2' };
      await created(
        await owner.post('/api/v1/teachers', {
          name: 'Pia Password',
          phone: '9876500099',
          email: account.email,
          password: account.password,
        }),
      );
      const oldToken = await login(account.email, account.password);
      expect((await as(oldToken).get('/api/v1/auth/me')).status).toBe(200);

      const changed = await as(oldToken).post('/api/v1/auth/change-password', {
        currentPassword: account.password,
        newPassword: account.next,
      });
      expect(changed.status, JSON.stringify(changed.body)).toBe(200);

      // Not "valid for up to 15 minutes more": refused on the very next request
      const stale = await as(oldToken).get('/api/v1/auth/me');
      expect(stale.status).toBe(401);

      const freshToken = await login(account.email, account.next);
      expect((await as(freshToken).get('/api/v1/auth/me')).status).toBe(200);
    });
  });

  describe('revocation takes effect immediately', () => {
    it("removes a deactivated teacher's access on their next request, with the same token", async () => {
      expect((await as(teacherToken).get(`/api/v1/homework/${ids.taughtHomework}`)).status).toBe(200);

      const deactivate = await as(ownerToken).put(`/api/v1/teachers/${teacherId}`, { isActive: false });
      expect(deactivate.status, JSON.stringify(deactivate.body)).toBe(200);

      // Same, unexpired access token: the teaching role is gone, so its permissions are too
      expect((await as(teacherToken).get(`/api/v1/homework/${ids.taughtHomework}`)).status).toBe(403);
    });
  });

  describe('subscription gate', () => {
    it('returns 402 on business routes after the trial ends, but keeps sign-in and billing open', async () => {
      await ownerDb.$transaction([
        ownerDb.$executeRaw`SELECT set_config('app.rls_bypass', 'on', true)`,
        ownerDb.$executeRawUnsafe(
          `UPDATE subscriptions SET trial_ends_at = now() - interval '1 day', current_period_end = now() - interval '1 day' WHERE coaching_id = '${coachingId}'`,
        ),
      ]);
      const { invalidateSubscriptionFeatureCache } = await import('../../common/decorators/require-feature.decorator.js');
      await invalidateSubscriptionFeatureCache(coachingId);

      const owner = as(ownerToken);
      const blocked = await owner.get('/api/v1/students');
      expect(blocked.status).toBe(402);
      expect(blocked.body.error.code).toBe('TRIAL_EXPIRED');

      expect((await owner.get('/api/v1/auth/me')).status).toBe(200);
      expect((await request(app).get('/api/v1/billing/plans')).status).toBe(200);
    });
  });
});
