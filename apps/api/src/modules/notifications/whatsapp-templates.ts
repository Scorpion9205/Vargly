/**
 * The WhatsApp message templates Vargly sends. Outside a 24-hour conversation window Meta
 * delivers only approved templates, so every automatic message goes out as one of these.
 *
 * Each body must be submitted in WhatsApp Manager exactly as written here (category Utility,
 * language English), with the footer below. `params` lists the variable behind {{1}}, {{2}}, ...
 * in order. `institute` and `student` are filled in by NotificationService for each recipient.
 */
export const WHATSAPP_TEMPLATE_FOOTER = 'Reply STOP to stop these messages';

export const WHATSAPP_TEMPLATES = {
  student_absent_alert: {
    params: ['institute', 'student', 'date'],
    body: 'Attendance update from {{1}}: {{2}} was marked absent on {{3}}. If this is not correct, please contact the institute.',
  },
  test_score_update: {
    params: ['institute', 'student', 'test', 'result'],
    body: 'Test result from {{1}}: {{2}} in {{3}}: {{4}}. Please contact the institute for details.',
  },
  homework_assigned: {
    params: ['institute', 'student', 'title', 'dueDate'],
    body: 'New homework from {{1}} for {{2}}: {{3}}. Please complete it by {{4}}.',
  },
  homework_with_file: {
    params: ['institute', 'student', 'title', 'dueDate', 'link'],
    body: 'New homework from {{1}} for {{2}}: {{3}}. Please complete it by {{4}}. Download the paper here: {{5}} Thank you.',
  },
  paper_shared: {
    params: ['institute', 'student', 'title', 'link'],
    body: 'New practice paper from {{1}} for {{2}}: {{3}}. Download it here: {{4}} Thank you.',
  },
  fee_payment_confirmation: {
    params: ['institute', 'amount', 'student', 'receipt', 'balance'],
    body: 'Payment received by {{1}}: {{2}} for {{3}}. Receipt number {{4}}. Balance due: {{5}}. Thank you.',
  },
  fee_payment_reminder: {
    params: ['institute', 'amount', 'student', 'dueDate'],
    body: 'Fee reminder from {{1}}: {{2}} for {{3}} is due on {{4}}. Please pay at the earliest, or ignore this if already paid.',
  },
  institute_notice: {
    params: ['institute', 'title', 'details'],
    body: 'Notice from {{1}}: {{2}}. Details: {{3}} Thank you.',
  },
  plan_expiry_reminder: {
    params: ['institute', 'status'],
    body: 'Vargly plan update for {{1}}: your plan {{2}}. Choose a plan in Vargly under Billing to keep attendance, fees and parent updates running.',
  },
  student_risk_alert: {
    params: ['institute', 'student', 'level', 'reason'],
    body: 'Student alert for {{1}}: {{2}} is at {{3}} risk. Reason: {{4}}. Open Vargly to see details.',
  },
} as const satisfies Record<string, { params: readonly string[]; body: string }>;

export type WhatsAppTemplateName = keyof typeof WHATSAPP_TEMPLATES;

const MAX_PARAM_LENGTH = 600;

/**
 * Meta rejects a parameter holding a newline, a tab or more than four spaces in a row, and an
 * empty one. Long text is cut short so the whole message stays under the 1024-character limit.
 */
export function cleanTemplateParam(value: string | undefined): string {
  const text = (value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim();
  if (!text) return '-';
  return text.length > MAX_PARAM_LENGTH ? `${text.slice(0, MAX_PARAM_LENGTH - 1)}…` : text;
}

export function isKnownTemplate(name: string | undefined): name is WhatsAppTemplateName {
  return !!name && Object.prototype.hasOwnProperty.call(WHATSAPP_TEMPLATES, name);
}

/**
 * The body parameters in the order the template expects. Unknown templates keep the order the
 * variables were given in.
 */
export function templateParameters(name: string, variables: Record<string, string> = {}): string[] {
  if (!isKnownTemplate(name)) return Object.values(variables).map(cleanTemplateParam);
  return WHATSAPP_TEMPLATES[name].params.map((key) => cleanTemplateParam(variables[key]));
}

/** The message text as the recipient reads it, for notification history */
export function renderTemplate(name: string, variables: Record<string, string> = {}): string | null {
  if (!isKnownTemplate(name)) return null;
  const values = templateParameters(name, variables);
  return WHATSAPP_TEMPLATES[name].body.replace(/\{\{(\d+)\}\}/g, (_m, n) => values[Number(n) - 1] ?? '');
}
