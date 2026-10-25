import { SITE_URL } from './site';

/** The institute's public enquiry page: what the QR code and the shared link open */
export function enquiryLink(code: string): string {
  return `${SITE_URL}/enquire/${encodeURIComponent(code)}`;
}
