import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import type { Express } from 'express';

/**
 * The operations console through the real HTTP stack and PostgreSQL:
 * - a platform administrator (no institute) can sign in and use it, an institute owner cannot
 * - a payment of the wrong amount is kept for review, not just logged, and can be resolved once
 * - a dead event can be re-queued
 * - the alert mails once per distinct set of problems
 *
 * Needs a migrated, RBAC-seeded database and Redis (see tenant-isolation.e2e.spec.ts).
 */
const OWNER_URL = process.env.TEST_DATABASE_OWNER_URL;
const enabled = !!OWNER_URL && !!process.env.TEST_DATABASE_URL;

const CODE = 'delta-classes';
const OWNER = { email: 'owner@delta.in', password: 'Own3r!Passw0rd' };
const ADMIN = { email: 'ops@vargly-platform.test', password: 'Platf0rm!Operator1' };

describe.skipIf(!enabled)('Operations console (HTTP + PostgreSQL)', () => {
  let app: Express;
  let db: PrismaClient;
  let coachingId: string;
  let ownerToken: string;
  let adminToken: string;

  const bearer = (token: string) => ({
    get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string, body: object = {}) =>
      request(app).post(url).set('Authorization', `Bearer ${token}`).send(body),
  });

  // Fixtures are written as the schema owner with row-level security bypassed
  const asOwner = async (...statements: Array<(tx: PrismaClient) => Promise<unknown>>) => {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.rls_bypass', 'on', true)`;
      for (const statement of statements) await statement(tx as unknown as PrismaClient);
    });
  };

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: OWNER_URL } } });
    await asOwner(
      (tx) => tx.$executeRawUnsafe(`DELETE FROM users WHERE coaching_id IS NULL`),
      (tx) => tx.$executeRawUnsafe(`DELETE FROM coachings WHERE code = '${CODE}'`),
      // Other specs share this database; the console's counts must start from nothing
      (tx) => tx.$executeRawUnsafe('TRUNCATE domain_events'),
    ).catch(async () => {
      await asOwner((tx) => tx.$executeRawUnsafe('TRUNCATE coachings, refresh_tokens, domain_events CASCADE'));
    });

    const { createApp } = await import('../../main.js');
    app = createApp();

    const reg = await request(app).post('/api/v1/coachings/register').send({
      coachingName: 'Delta Classes',
      phone: '9876500010',
      email: 'office@delta.in',
      ownerName: 'Delta Owner',
      ownerEmail: OWNER.email,
      ownerPhone: '9876500011',
      ownerPassword: OWNER.password,
    });
    expect(reg.status, JSON.stringify(reg.body)).toBe(201);
    coachingId = reg.body.data.id;

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: OWNER.email, password: OWNER.password, coachingCode: CODE });
    expect(login.status, JSON.stringify(login.body)).toBe(200);
    ownerToken = login.body.data.tokens.accessToken;

    // What scripts/create-super-admin.ts stores: a user with no coaching and a role link with none
    const { PasswordService } = await import('../../common/security/password.service.js');
    const passwordHash = await PasswordService.getInstance().hash(ADMIN.password);
    await asOwner(async (tx) => {
      const wildcard = await tx.permission.findUniqueOrThrow({ where: { code: '*' } });
      const role = await tx.role.create({
        data: { name: 'Platform Administrator', code: 'SUPER_ADMIN', isSystem: true },
      });
      await tx.rolePermission.create({ data: { roleId: role.id, permissionId: wildcard.id } });
      const user = await tx.user.create({
        data: { coachingId: null, name: 'Vargly Operator', email: ADMIN.email, phone: '9000000000', passwordHash },
      });
      await tx.userRole.create({ data: { userId: user.id, roleId: role.id, coachingId: null } });
    });

    const adminLogin = await request(app).post('/api/v1/auth/login').send(ADMIN);
    expect(adminLogin.status, JSON.stringify(adminLogin.body)).toBe(200);
    adminToken = adminLogin.body.data.tokens.accessToken;
  }, 120_000);

  afterAll(async () => {
    await db?.$disconnect();
    const { queueRegistry } = await import('../../queues/queue.registry.js');
    const { getPrismaClient } = await import('../../database/prisma/tenant-prisma.extension.js');
    await queueRegistry.closeAll().catch(() => undefined);
    await (getPrismaClient() as any).$disconnect();
  });

  describe('access', () => {
    it('refuses unauthenticated callers and institute owners, who hold every permission', async () => {
      expect((await request(app).get('/api/v1/admin/ops/summary')).status).toBe(401);

      const refused = await bearer(ownerToken).get('/api/v1/admin/ops/summary');
      expect(refused.status).toBe(403);
      expect((await bearer(ownerToken).get('/api/v1/admin/ops/payments')).status).toBe(403);
      expect((await bearer(ownerToken).post('/api/v1/admin/ops/events/x/retry')).status).toBe(403);
    });

    it('lets a platform administrator in, who belongs to no institute', async () => {
      const res = await bearer(adminToken).get('/api/v1/admin/ops/summary');
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.data).toMatchObject({
        events: { dead: expect.any(Number), failed: expect.any(Number), pending: expect.any(Number) },
        paymentsNeedingReview: expect.any(Number),
        failedNotifications24h: expect.any(Number),
      });
    });
  });

  describe('payments needing review', () => {
    it('keeps a wrong-amount payment for review, shows it with the institute, and resolves it once', async () => {
      // A new institute starts with its trial credits; the wrong payment must not add to them
      const creditsBefore = (await db.aiCreditWallet.findUnique({ where: { coachingId } }))?.balance ?? 0;
      const order = await bearer(ownerToken).post('/api/v1/billing/orders', { type: 'AI_CREDITS', credits: 400 });
      expect(order.status, JSON.stringify(order.body)).toBeLessThan(300);

      const webhook = await request(app)
        .post('/api/v1/billing/webhook')
        .set('x-razorpay-signature', 'test')
        .send({
          event: 'payment.captured',
          payload: {
            payment: {
              entity: { id: 'pay_ops_e2e', order_id: order.body.data.orderId, amount: 100, notes: { coachingId } },
            },
          },
        });
      expect(webhook.status, JSON.stringify(webhook.body)).toBe(200);
      expect(webhook.body.status).toBe('REJECTED');

      const list = await bearer(adminToken).get('/api/v1/admin/ops/payments');
      expect(list.body.data).toHaveLength(1);
      const [item] = list.body.data;
      expect(item).toMatchObject({
        orderId: order.body.data.orderId,
        gatewayPaymentId: 'pay_ops_e2e',
        credits: 400,
        coaching: { id: coachingId, name: 'Delta Classes', code: CODE },
      });
      expect(item.note).toContain('1.00 INR');
      expect((await bearer(adminToken).get('/api/v1/admin/ops/summary')).body.data.paymentsNeedingReview).toBe(1);

      // The institute was granted nothing
      const wallet = await db.aiCreditWallet.findUnique({ where: { coachingId } });
      expect(wallet?.balance ?? 0).toBe(creditsBefore);

      // A note is required, then the payment leaves the queue and cannot be resolved twice
      const url = `/api/v1/admin/ops/payments/${item.id}/resolve`;
      expect((await bearer(adminToken).post(url, { note: '' })).status).toBe(400);
      expect((await bearer(adminToken).post(url, { note: 'Refunded in Razorpay' })).status).toBe(200);
      expect((await bearer(adminToken).post(url, { note: 'again' })).status).toBe(404);
      expect((await bearer(adminToken).get('/api/v1/admin/ops/payments')).body.data).toHaveLength(0);

      const stored = await db.billingPayment.findUniqueOrThrow({ where: { id: item.id } });
      expect(stored.reviewedAt).not.toBeNull();
      expect(stored.reviewedBy).not.toBeNull();
      expect(stored.reviewNote).toContain('Resolved: Refunded in Razorpay');
    });
  });

  describe('dead events', () => {
    it('lists dead events without their payload and re-queues one', async () => {
      await asOwner((tx) =>
        tx.$executeRaw`INSERT INTO domain_events (id, event_name, coaching_id, payload, metadata, occurred_at, status, attempts, last_error, updated_at)
          VALUES ('ops-e2e-dead', 'FeePaid', ${coachingId}, '{"parentPhone":"+919999999999"}'::jsonb, '{}'::jsonb, now(), 'DEAD', 10, 'SmtpEmailAdapter: refused', now())`,
      );

      const list = await bearer(adminToken).get('/api/v1/admin/ops/events?status=DEAD');
      expect(list.status, JSON.stringify(list.body)).toBe(200);
      expect(list.body.data).toEqual([
        expect.objectContaining({ id: 'ops-e2e-dead', eventName: 'FeePaid', attempts: 10, lastError: 'SmtpEmailAdapter: refused' }),
      ]);
      expect(JSON.stringify(list.body)).not.toContain('+919999999999');

      expect((await bearer(adminToken).post('/api/v1/admin/ops/events/ops-e2e-dead/retry')).status).toBe(200);
      const [row] = await db.$queryRaw<Array<{ status: string; attempts: number }>>`
        SELECT status::text AS status, attempts FROM domain_events WHERE id = 'ops-e2e-dead'`;
      expect(row).toEqual({ status: 'FAILED', attempts: 0 });

      // Only a dead event can be retried
      expect((await bearer(adminToken).post('/api/v1/admin/ops/events/ops-e2e-dead/retry')).status).toBe(404);
      expect((await bearer(adminToken).post('/api/v1/admin/ops/events/does-not-exist/retry')).status).toBe(404);
    });
  });

  describe('alert', () => {
    it('emails once for the open problems and stays quiet until they change', async () => {
      await asOwner((tx) =>
        tx.$executeRaw`INSERT INTO domain_events (id, event_name, coaching_id, payload, metadata, occurred_at, status, attempts, updated_at)
          VALUES ('ops-e2e-dead-2', 'FeePaid', ${coachingId}, '{}'::jsonb, '{}'::jsonb, now(), 'DEAD', 10, now())`,
      );
      const { OpsAlertService } = await import('../../modules/ops/ops-alert.service.js');
      const { PrismaOpsRepository } = await import('../../modules/ops/ops.repository.js');
      const sent: Array<{ to: string; subject: string }> = [];
      const memory = new Map<string, string>();
      const alert = new OpsAlertService(
        new PrismaOpsRepository(),
        { sendEmail: async (input) => (sent.push(input), { status: 'SENT', providerMessageId: 'x' }) },
        () => ({
          get: async (key) => memory.get(key) ?? null,
          set: async (key, value) => void memory.set(key, value),
          del: async (key) => void memory.delete(key),
        }),
        () => 'ops@vargly.test',
        () => 'http://localhost:3000/app/admin',
      );

      expect(await alert.check()).toMatchObject({ dead: 1, emailed: true });
      expect(await alert.check()).toMatchObject({ dead: 1, emailed: false });
      expect(sent).toHaveLength(1);
      expect(sent[0].subject).toContain('1 event(s) need attention');
    });
  });
});
