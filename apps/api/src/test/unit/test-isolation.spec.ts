import { describe, it, expect } from 'vitest';
import { PROVIDER_ENV_KEYS } from '../provider-env.js';

/**
 * Prisma loads apps/api/.env into process.env on its own, so real provider keys kept there once
 * reached tests, which then called Razorpay and Gemini. vitest.config.ts blanks them first.
 */
describe('test isolation', () => {
  it('never sees provider credentials from apps/api/.env', async () => {
    const { PrismaClient } = await import('@prisma/client');
    // Constructing the client is what triggers Prisma's .env loading; it does not connect
    new PrismaClient({ datasources: { db: { url: 'postgresql://nobody:nothing@localhost:1/none' } } });

    const leaked = PROVIDER_ENV_KEYS.filter((key) => (process.env[key] ?? '') !== '');
    expect(leaked).toEqual([]);
  });
});
