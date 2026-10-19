import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { API_URL } from '@/lib/api';
import { __resetSessionForTests } from '@/lib/auth/session';
import { type Enquiry, isDue } from '@/lib/enquiries';
import { renderWithIntl } from '@/test/render';
import { OWNER, signInAs } from '@/test/session';
import { EnquiriesPage } from './enquiries-page';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => __resetSessionForTests());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const enquiry = (overrides: Partial<Enquiry> = {}): Enquiry => ({
  id: 'e1',
  name: 'Mrs Verma',
  phone: '9876543210',
  studentName: 'Riya',
  interestedIn: 'Class 10 maths',
  source: 'WALK_IN',
  status: 'NEW',
  notes: 'Asked about the fees',
  followUpOn: '2020-01-01',
  lastContactedAt: null,
  createdAt: '2026-10-18T05:00:00.000Z',
  ...overrides,
});

const summary = {
  total: 1,
  byStatus: { NEW: 1, CONTACTED: 0, ADMITTED: 0, NOT_INTERESTED: 0 },
  dueToday: 1,
};

function enquiriesApi(items: Enquiry[]) {
  const requests: URLSearchParams[] = [];
  const updates: unknown[] = [];
  server.use(
    http.get(`${API_URL}/enquiries/summary`, () => HttpResponse.json({ data: summary })),
    http.get(`${API_URL}/enquiries`, ({ request }) => {
      requests.push(new URL(request.url).searchParams);
      return HttpResponse.json({ data: items });
    }),
    http.put(`${API_URL}/enquiries/:id`, async ({ request }) => {
      updates.push(await request.json());
      return HttpResponse.json({ data: { ...items[0], status: 'CONTACTED' } });
    }),
  );
  return { requests, updates };
}

describe('isDue', () => {
  it('is for open enquiries whose follow-up day has come', () => {
    expect(isDue({ status: 'NEW', followUpOn: '2026-10-19' }, '2026-10-19')).toBe(true);
    expect(isDue({ status: 'CONTACTED', followUpOn: '2026-10-20' }, '2026-10-19')).toBe(false);
    expect(isDue({ status: 'ADMITTED', followUpOn: '2020-01-01' }, '2026-10-19')).toBe(false);
    expect(isDue({ status: 'NEW', followUpOn: null }, '2026-10-19')).toBe(false);
  });
});

describe('EnquiriesPage', () => {
  it('lists enquiries with a call link, a WhatsApp link and the due badge', async () => {
    enquiriesApi([enquiry()]);
    signInAs(OWNER);
    renderWithIntl(<EnquiriesPage />);

    const card = (await screen.findByRole('heading', { name: 'Mrs Verma' })).closest('article') as HTMLElement;
    expect(within(card).getByText('Call due')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: /9876543210/ })).toHaveAttribute('href', 'tel:9876543210');
    expect(within(card).getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', 'https://wa.me/919876543210');
    expect(await screen.findByRole('button', { name: /Call today/ })).toHaveTextContent('1');
  });

  it('marks an enquiry as called', async () => {
    const { updates } = enquiriesApi([enquiry()]);
    signInAs(OWNER);
    renderWithIntl(<EnquiriesPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Mark called' }));
    await waitFor(() => expect(updates).toEqual([{ status: 'CONTACTED' }]));
  });

  it('asks for only the calls that are due on the "Call today" tab', async () => {
    const { requests } = enquiriesApi([enquiry()]);
    signInAs(OWNER);
    renderWithIntl(<EnquiriesPage />);

    await userEvent.click(await screen.findByRole('button', { name: /Call today/ }));
    await waitFor(() => expect(requests.at(-1)?.get('due')).toBe('true'));
  });

  it('explains an empty list', async () => {
    enquiriesApi([]);
    signInAs(OWNER);
    renderWithIntl(<EnquiriesPage />);
    expect(await screen.findByText('No enquiries yet')).toBeInTheDocument();
  });
});
