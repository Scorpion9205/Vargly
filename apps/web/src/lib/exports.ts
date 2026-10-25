import { downloadPdf } from './papers';

// apps/api exports module: Excel (.xlsx) files built on the server

export const EXPORT_KINDS = [
  'students',
  'attendance-register',
  'attendance-summary',
  'fees',
  'profit-loss',
  'tests',
  'enquiries',
  'staff-attendance',
] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

/** What each export asks the owner for */
export type ExportField = 'status' | 'month' | 'batch' | 'batchRequired' | 'range' | 'threshold' | 'enquiryStatus';

export const EXPORT_FIELDS: Record<ExportKind, readonly ExportField[]> = {
  students: ['status'],
  'attendance-register': ['month', 'batch'],
  'attendance-summary': ['range', 'batch', 'threshold'],
  fees: ['range'],
  'profit-loss': ['range'],
  tests: ['batchRequired'],
  enquiries: ['enquiryStatus'],
  'staff-attendance': ['month'],
};

export interface ExportValues {
  status: string;
  month: string;
  batchId: string;
  startDate: string;
  endDate: string;
  threshold: string;
  enquiryStatus: string;
}

/** Whether the export has what it needs: a month, a batch where one is required, a sensible range */
export function exportReady(kind: ExportKind, values: ExportValues): boolean {
  const fields = EXPORT_FIELDS[kind];
  if (fields.includes('month') && !/^\d{4}-\d{2}$/.test(values.month)) return false;
  if (fields.includes('batchRequired') && !values.batchId) return false;
  if (fields.includes('range') && values.startDate && values.endDate && values.startDate > values.endDate) return false;
  if (fields.includes('threshold') && values.threshold !== '' && !(Number(values.threshold) >= 0 && Number(values.threshold) <= 100)) return false;
  return true;
}

/** The API path for an export, with only the filters that export uses and the owner filled in */
export function exportPath(kind: ExportKind, values: ExportValues): string {
  const params = new URLSearchParams();
  const fields = EXPORT_FIELDS[kind];
  if (fields.includes('status') && values.status !== 'all') params.set('status', values.status);
  if (fields.includes('enquiryStatus') && values.enquiryStatus !== 'all') params.set('status', values.enquiryStatus);
  if (fields.includes('month')) params.set('month', values.month);
  if ((fields.includes('batch') || fields.includes('batchRequired')) && values.batchId) params.set('batchId', values.batchId);
  if (fields.includes('range')) {
    if (values.startDate) params.set('startDate', values.startDate);
    if (values.endDate) params.set('endDate', values.endDate);
  }
  if (fields.includes('threshold') && values.threshold !== '') params.set('threshold', values.threshold);
  const query = params.toString();
  return `/exports/${kind}${query ? `?${query}` : ''}`;
}

/** Saves the file the API builds (the same authenticated download the PDFs use) */
export function downloadExport(kind: ExportKind, values: ExportValues): Promise<void> {
  return downloadPdf(exportPath(kind, values), `${kind}.xlsx`);
}
