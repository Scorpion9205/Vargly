import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../common/security/token.service.js', () => ({
  tokenService: {
    verifyAccessToken: (token: string) => {
      if (!token.startsWith('good-')) throw new Error('bad token');
      return { sub: token.slice(5) };
    },
  },
}));

import { globalRateLimit } from '../../common/middleware/global-rate-limit.middleware.js';

/** Minimal in-memory stand-in for the ioredis MULTI(INCR, EXPIRE NX, TTL) pipeline. */
function createFakeRedis() {
  const counters = new Map<string, number>();
  return {
    status: 'ready',
    counters,
    multi() {
      const ops: Array<() => [null, number]> = [];
      const chain = {
        incr(key: string) {
          ops.push(() => {
            counters.set(key, (counters.get(key) ?? 0) + 1);
            return [null, counters.get(key)!];
          });
          return chain;
        },
        expire() {
          ops.push(() => [null, 1]);
          return chain;
        },
        ttl() {
          ops.push(() => [null, 30]);
          return chain;
        },
        async exec() {
          return ops.map((op) => op());
        },
      };
      return chain;
    },
  };
}

function appWith(perIpPerMinute: number, perUserPerMinute: number) {
  const redis = createFakeRedis();
  const app = express();
  app.use('/api/v1', globalRateLimit({ perIpPerMinute, perUserPerMinute, redis: () => redis as any }));
  app.get('/api/v1/students', (_req, res) => res.json({ ok: true }));
  app.post('/api/v1/notifications/webhook', (_req, res) => res.json({ ok: true }));
  return { app, redis };
}

describe('globalRateLimit', () => {
  it('lets normal use through and stops a flood from one address', async () => {
    const { app } = appWith(3, 100);
    for (let i = 0; i < 3; i += 1) expect((await request(app).get('/api/v1/students')).status).toBe(200);
    const blocked = await request(app).get('/api/v1/students');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(blocked.headers['retry-after']).toBe('30');
  });

  it('limits a signed-in person on their own, whatever the address', async () => {
    const { app, redis } = appWith(1000, 2);
    const asAnna = () => request(app).get('/api/v1/students').set('Authorization', 'Bearer good-anna');
    expect((await asAnna()).status).toBe(200);
    expect((await asAnna()).status).toBe(200);
    expect((await asAnna()).status).toBe(429);
    // Someone else is not affected by Anna's count
    expect((await request(app).get('/api/v1/students').set('Authorization', 'Bearer good-ben')).status).toBe(200);
    expect([...redis.counters.keys()].some((key) => key.includes('api-user') && key.includes('user:anna'))).toBe(true);
  });

  it('does not count a bad token as a person: only the address limit applies', async () => {
    const { app, redis } = appWith(1000, 1);
    for (let i = 0; i < 3; i += 1) {
      expect((await request(app).get('/api/v1/students').set('Authorization', 'Bearer forged')).status).toBe(200);
    }
    expect([...redis.counters.keys()].some((key) => key.includes('api-user'))).toBe(false);
  });

  it('never limits the WhatsApp webhook, which is checked by its signature', async () => {
    const { app } = appWith(1, 1);
    for (let i = 0; i < 5; i += 1) expect((await request(app).post('/api/v1/notifications/webhook')).status).toBe(200);
  });
});
