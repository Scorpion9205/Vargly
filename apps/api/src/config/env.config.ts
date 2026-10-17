import dotenv from 'dotenv';
import { z } from 'zod';

const isTest = process.env.NODE_ENV === 'test' || !!process.env.VITEST;

// Tests never read the developer's .env: real API keys there made test runs call Gemini, WhatsApp
// and payment providers. Tests get their settings from defaults and explicitly exported variables,
// exactly as in CI.
if (!isTest) {
  dotenv.config();
}

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: isTest
    ? z.string().default('postgresql://vargly_user:vargly_password@localhost:5432/vargly_test?schema=public')
    : z.string().min(1, 'DATABASE_URL is required'),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  JWT_ACCESS_SECRET: isTest
    ? z.string().default('test_jwt_access_secret_key_at_least_32_chars_long')
    : z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 characters'),
  JWT_REFRESH_SECRET: isTest
    ? z.string().default('test_jwt_refresh_secret_key_at_least_32_chars_long')
    : z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  // Express "trust proxy": number of proxy hops in front of the API (e.g. 1 behind an ingress),
  // "false" when clients connect directly, or a subnet list. Controls whether X-Forwarded-For
  // is believed when resolving the client IP used for rate limiting and lockout.
  TRUST_PROXY: z
    .string()
    .default('false')
    .transform((v): boolean | number | string => {
      if (v === 'false') return false;
      if (v === 'true') return true;
      return /^\d+$/.test(v) ? Number(v) : v;
    }),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  // Who is emailed when a payment needs review or an event has given up (see /app/admin)
  OPS_ALERT_EMAIL: z.string().optional(),
  // Bearer token required to read /metrics (disabled in production when unset)
  METRICS_TOKEN: z.string().optional(),
  // Run the queue workers inside the API process too. Default: only in development, so a
  // single `pnpm dev` works; staging/production run the separate worker process.
  RUN_WORKERS_IN_API: z.enum(['true', 'false']).optional(),
  // WhatsApp Cloud API
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_API_TOKEN: z.string().optional(),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().default('vargly_webhook_secret_token'),
  WHATSAPP_API_VERSION: z.string().default('v19.0'),
  // Most automatic WhatsApp messages one institute may send per day (Meta limits the whole
  // number to 250 people a day until the business is verified)
  WHATSAPP_DAILY_LIMIT_PER_COACHING: z.coerce.number().int().positive().default(200),
  // SMTP Email
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  // Direct TLS (port 465). z.coerce.boolean would read the text "false" as true, so the
  // words are parsed explicitly: 587 with STARTTLS (Brevo, SES) needs this false.
  SMTP_SECURE: z
    .enum(['true', 'false', '1', '0', ''])
    .optional()
    .transform((value) => value === 'true' || value === '1'),
  EMAIL_FROM: z.string().default('Vargly Alerts <notifications@vargly.in>'),
  // AI Model Providers
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  // Model names are configuration, not code: providers retire models on their own schedule.
  AI_MODEL_CLAUDE: z.string().default('claude-sonnet-5'),
  AI_MODEL_OPENAI: z.string().default('gpt-4o-mini'),
  AI_MODEL_GEMINI: z.string().default('gemini-2.5-flash'),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  GEMINI_EMBEDDING_MODEL: z.string().default('gemini-embedding-001'),
  // Object Storage (Cloudinary / Local Mock)
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  CLOUDINARY_URL: z.string().optional(),
  // Payment Gateway (Razorpay / UPI)
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  // Price of one AI credit in paise when bought as a top-up (100 = Rs 1 per credit)
  AI_CREDIT_PRICE_PAISE: z.coerce.number().int().positive().default(100),
  // Cryptography & Security
  JWT_PRIVATE_KEY: z.string().optional(),
  JWT_PUBLIC_KEY: z.string().optional(),
  DATABASE_ENCRYPTION_KEY: z.string().default('0123456789abcdef0123456789abcdef'),
  // URLs
  API_BASE_URL: z.string().default('http://localhost:4000'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),
});

// Values that ship in code or .env.example. They are public, so they must never secure production.
const KNOWN_INSECURE_VALUES = new Set([
  '0123456789abcdef0123456789abcdef',
  'vargly_webhook_secret_token',
  'vargly_dev_access_super_secret_key_change_in_production_32char',
  'vargly_dev_refresh_super_secret_key_change_in_production_32char',
  'test_jwt_access_secret_key_at_least_32_chars_long',
  'test_jwt_refresh_secret_key_at_least_32_chars_long',
]);

const PRODUCTION_SECRETS = [
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'DATABASE_ENCRYPTION_KEY',
  'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
] as const;

const productionEnvSchema = envSchema.superRefine((cfg, ctx) => {
  if (cfg.NODE_ENV !== 'production') return;

  for (const key of PRODUCTION_SECRETS) {
    const value = cfg[key];
    if (KNOWN_INSECURE_VALUES.has(value) || value.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} must be a unique secret of at least 32 characters in production (not a default)`,
      });
    }
  }

  for (const key of ['JWT_PRIVATE_KEY', 'JWT_PUBLIC_KEY'] as const) {
    if (!cfg[key]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} is required in production so all replicas share one signing keypair`,
      });
    }
  }
});

export type EnvConfig = z.infer<typeof envSchema>;

export function parseEnvConfig(source: NodeJS.ProcessEnv) {
  return productionEnvSchema.safeParse(source);
}

class ConfigService {
  private static instance: ConfigService;
  private readonly config: EnvConfig;

  private constructor() {
    const parsed = parseEnvConfig(process.env);
    if (!parsed.success) {
      console.error('❌ Invalid environment variables:', JSON.stringify(parsed.error.format(), null, 2));
      throw new Error('Invalid environment configuration');
    }
    this.config = {
      ...parsed.data,
      RUN_WORKERS_IN_API: (parsed.data.RUN_WORKERS_IN_API ??
        (parsed.data.NODE_ENV === 'development' ? 'true' : 'false')) as 'true' | 'false',
    };
  }

  public static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  public get<K extends keyof EnvConfig>(key: K): EnvConfig[K] {
    return this.config[key];
  }

  public getAll(): EnvConfig {
    return { ...this.config };
  }
}

export const envConfig = ConfigService.getInstance();
