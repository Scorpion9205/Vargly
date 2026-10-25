import type { AbstractIntlMessages } from 'next-intl';

/**
 * Message namespaces used by client components ('use client' + useTranslations). Only these are
 * sent to the browser; server components read the rest on the server. Add a namespace here when
 * a client component starts using it (a missing one shows its key and logs an error in dev).
 */
export const CLIENT_NAMESPACES = [
  'Nav',
  'Pricing',
  'Auth',
  'App',
  'Shell',
  'Dashboard',
  'Common',
  'Students',
  'Batches',
  'Attendance',
  'Tests',
  'Homework',
  'Fees',
  'Expenses',
  'Salary',
  'Teachers',
  'Notices',
  'Reports',
  'Settings',
  'Billing',
  'Admin',
  'Papers',
  'Enquiries',
  'Assistant',
  'PublicEnquiry',
  'StaffAttendance',
  'Surveys',
  'Certificates',
  'Exports',
  'Student',
  'StudentLogins',
  'PublicSurvey',
  'Landing',
  'Footer',
  'Errors',
] as const;

export function pickClientMessages(messages: AbstractIntlMessages): AbstractIntlMessages {
  return Object.fromEntries(
    CLIENT_NAMESPACES.filter((ns) => ns in messages).map((ns) => [ns, messages[ns]]),
  );
}
