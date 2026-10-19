import { envConfig } from '../../config/env.config.js';
import { logger } from '../logger/logger.service.js';

export interface IntegrationStatus {
  readonly name: string;
  readonly configured: boolean;
  /** What happens while it is not configured. */
  readonly whenMissing: string;
}

export function getIntegrationStatus(): IntegrationStatus[] {
  const has = (key: Parameters<typeof envConfig.get>[0]) => Boolean(envConfig.get(key));
  const aiKeys =
    has('OPENAI_API_KEY') || has('ANTHROPIC_API_KEY') || has('GEMINI_API_KEY') || has('GROQ_API_KEY');

  return [
    {
      name: 'WhatsApp (Meta Cloud API)',
      configured: has('WHATSAPP_PHONE_NUMBER_ID') && has('WHATSAPP_API_TOKEN'),
      whenMissing: 'WhatsApp notifications fail (simulated outside production)',
    },
    {
      name: 'WhatsApp webhook signature',
      configured: has('WHATSAPP_APP_SECRET'),
      whenMissing: 'inbound WhatsApp webhooks are rejected in production',
    },
    {
      name: 'Email (SMTP)',
      configured: has('SMTP_HOST'),
      whenMissing: 'emails, including password reset and verification links, fail (simulated outside production)',
    },
    {
      name: 'Payments (Razorpay)',
      configured: has('RAZORPAY_KEY_ID') && has('RAZORPAY_KEY_SECRET') && has('RAZORPAY_WEBHOOK_SECRET'),
      whenMissing: 'subscription orders use the mock gateway, whose webhooks are rejected in production',
    },
    {
      name: 'Operations alerts (OPS_ALERT_EMAIL)',
      configured: has('OPS_ALERT_EMAIL'),
      whenMissing: 'dead events and payments needing review are only visible in the admin console and logs',
    },
    {
      name: 'AI completions',
      configured: aiKeys,
      whenMissing: 'AI features fail in production (mock answers outside production)',
    },
    {
      name: 'Knowledge-base embeddings',
      configured: has('OPENAI_API_KEY') || has('GEMINI_API_KEY'),
      whenMissing: 'the WhatsApp assistant searches hash-based mock embeddings, not semantic ones',
    },
  ];
}

/** Logs which integrations are live, so a misconfigured deploy is visible at startup. */
export function reportIntegrationStatus(processName: string): void {
  const statuses = getIntegrationStatus();
  const missing = statuses.filter((s) => !s.configured);
  const production = envConfig.get('NODE_ENV') === 'production';

  logger.info(`[${processName}] Integrations: ${statuses.map((s) => `${s.name}=${s.configured ? 'on' : 'OFF'}`).join(', ')}`);
  for (const s of missing) {
    const message = `[${processName}] ${s.name} is not configured: ${s.whenMissing}`;
    if (production) logger.warn(message);
    else logger.debug(message);
  }
}
