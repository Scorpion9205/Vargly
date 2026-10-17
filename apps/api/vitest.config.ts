import { defineConfig } from 'vitest/config';
import { PROVIDER_ENV_KEYS } from './src/test/provider-env';

// Prisma loads apps/api/.env into process.env, and dotenv never overrides a variable that is
// already set. Setting every provider credential to empty first keeps real keys out of tests,
// exactly as in CI (which copies .env.example, where they are empty). A test that needs one
// sets it itself.
export default defineConfig({
  test: {
    env: Object.fromEntries(PROVIDER_ENV_KEYS.map((key) => [key, ''])),
  },
});
