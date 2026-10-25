import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_URL } from '@/lib/api';
import { __resetSessionForTests } from '@/lib/auth/session';
import { exportPath, exportReady, type ExportValues } from '@/lib/exports';
import { renderWithIntl } from '@/test/render';
import { OWNER, signInAs } from '@/test/session';
import { ExportsPage } from './exports-page';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => __resetSessionForTests());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const values: ExportValues = {
  status: 'all',
  month: '2026-10',
  batchId: '',
  startDate: '',
  endDate: '',
  threshold: '',
  enquiryStatus: 'all',
};

describe('exportPath', () => {
  it('sends only the filters an export uses', () => {
    expect(exportPath('students', values)).toBe('/exports/students');
    expect(exportPath('students', { ...values, status: 'active' })).toBe('/exports/students?status=active');
    expect(exportPath('attendance-register', { ...values, batchId: 'b1' })).toBe('/exports/attendance-register?month=2026-10&batchId=b1');
    expect(exportPath('fees', { ...values, startDate: '2026-10-01', endDate: '2026-10-31', batchId: 'ignored' })).toBe(
      '/exports/fees?startDate=2026-10-01&endDate=2026-10-31',
    );
    expect(exportPath('attendance-summary', { ...values, threshold: '75' })).toBe('/exports/attendance-summary?threshold=75');
    expect(exportPath('enquiries', { ...values, enquiryStatus: 'NEW' })).toBe('/exports/enquiries?status=NEW');
  });
});

describe('exportReady', () => {
  it('needs a batch for marks, a month for a register, and a sensible range', () => {
    expect(exportReady('tests', values)).toBe(false);
    expect(exportReady('tests', { ...values, batchId: 'b1' })).toBe(true);
    expect(exportReady('staff-attendance', { ...values, month: '' })).toBe(false);
    expect(exportReady('fees', { ...values, startDate: '2026-10-10', endDate: '2026-10-01' })).toBe(false);
    expect(exportReady('fees', values)).toBe(true);
    expect(exportReady('attendance-summary', { ...values, threshold: '150' })).toBe(false);
  });
});

describe('ExportsPage', () => {
  it('downloads the students file', async () => {
    const asked: string[] = [];
    server.use(
      http.get(`${API_URL}/batches`, () => HttpResponse.json({ data: [] })),
      http.get(`${API_URL}/exports/students`, ({ request }) => {
        asked.push(new URL(request.url).search);
        return new HttpResponse('xlsx', { headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="students-all.xlsx"' } });
      }),
    );
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    signInAs(OWNER);
    renderWithIntl(<ExportsPage />);

    const card = (await screen.findByRole('heading', { name: 'Student details' })).closest('article') as HTMLElement;
    await userEvent.click(within(card).getByRole('button', { name: 'Download Excel' }));
    await waitFor(() => expect(asked).toHaveLength(1));
    expect(asked[0]).toBe('');
  });

  it('keeps the marks export disabled until a batch is chosen', async () => {
    server.use(
      http.get(`${API_URL}/batches`, () =>
        HttpResponse.json({ data: [{ id: 'b1', name: 'Class 10 Maths', academicYear: '2026-27', daysOfWeek: [], isActive: true, createdAt: '2026-04-01T00:00:00.000Z' }] }),
      ),
    );
    signInAs(OWNER);
    renderWithIntl(<ExportsPage />);

    const card = (await screen.findByRole('heading', { name: 'Test marks' })).closest('article') as HTMLElement;
    const button = within(card).getByRole('button', { name: 'Download Excel' });
    expect(button).toBeDisabled();
    await within(card).findByRole('option', { name: 'Class 10 Maths' });
    await userEvent.selectOptions(within(card).getByLabelText('Batch'), 'b1');
    expect(button).toBeEnabled();
  });
});
