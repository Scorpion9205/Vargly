import { createHmac, timingSafeEqual } from 'node:crypto';
import { envConfig } from '../../config/env.config.js';

/**
 * A parent's receipt link carries a signature instead of a stored token: only this server can
 * make one for a given payment, and nothing needs to be saved. The payment id alone opens nothing.
 */
function sign(transactionId: string): string {
  return createHmac('sha256', `${envConfig.get('JWT_ACCESS_SECRET')}:fee-receipt-link`)
    .update(transactionId)
    .digest('base64url')
    .slice(0, 32);
}

export function receiptLink(transactionId: string): string {
  return `${envConfig.get('API_BASE_URL').replace(/\/+$/, '')}/api/v1/fees/receipt/${transactionId}/${sign(transactionId)}`;
}

export function isValidReceiptSignature(transactionId: string, signature: string): boolean {
  const expected = Buffer.from(sign(transactionId));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
