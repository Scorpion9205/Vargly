import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_URL } from '@/lib/api';
import { __resetSessionForTests } from '@/lib/auth/session';
import type { OpsEvent, OpsSummary, ReviewPayment } from '@/lib/ops';
import { renderWithIntl } from '@/test/render';
import { OWNER, signInAs, SUPER_ADMIN } from '@/test/session';
import { AppShell } from '@/components/app-shell/app-shell';
import { AdminPage } from './admin-page';

let pathname = '/app/admin';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  __resetSessionForTests();
  pathname = '/app/admin';
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const summary: OpsSummary = {
  events: { pending: 0, failed: 2, dead: 1 },
  paymentsNeedingReview: 1,
  failedNotifications24h: 4,
};

const payment: ReviewPayment = {
  id: '9d1f6a34-0000-4000-8000-000000000001',
  orderId: 'order_abc',
  gatewayPaymentId: 'pay_xyz',
  type: 'AI_CREDITS',
  planCode: null,
  credits: 500,
  expectedAmount: 500,
  note: 'Order expected 500.00 INR but 1.00 INR was paid (gateway payment pay_xyz).',
  createdAt: '2026-10-16T05:00:00.000Z',
  updatedAt: '2026-10-16T05:05:00.000Z',
  coaching: { id: 'c1', name: 'Star Classes', code: 'STAR', email: 'owner@star.in', phone: '9876543210' },
};

const deadEvent: OpsEvent = {
  id: 'evt-1',
  eventName: 'FeePaid',
  coachingId: 'c1',
  status: 'DEAD',
  attempts: 10,
  lastError: 'SmtpEmailAdapter: connection refused',
  occurredAt: '2026-10-16T04:00:00.000Z',
  updatedAt: '2026-10-16T05:00:00.000Z',
};

function api(data: { summary?: OpsSummary; payments?: ReviewPayment[]; events?: OpsEvent[] } = {}) {
  server.use(
    http.get(`${API_URL}/admin/ops/summary`, () => HttpResponse.json({ data: data.summary ?? summary })),
    http.get(`${API_URL}/admin/ops/payments`, () => HttpResponse.json({ data: data.payments ?? [payment] })),
    http.get(`${API_URL}/admin/ops/events`, () => HttpResponse.json({ data: data.events ?? [deadEvent] })),
  );
}

describe('AdminPage', () => {
  it('shows the counters, the payment to review and the dead event', async () => {
    signInAs(SUPER_ADMIN);
    api();
    renderWithIntl(<AdminPage />);

    const counters = await screen.findByRole('region', { name: 'Summary' });
    await waitFor(() => expect(within(counters).getByText('Dead events').nextSibling).toHaveTextContent('1'));
    expect(within(counters).getByText('Failed messages (24 h)').nextSibling).toHaveTextContent('4');

    expect(await screen.findByText('Star Classes')).toBeInTheDocument();
    expect(screen.getByText(/Order expected 500.00 INR but 1.00 INR was paid/)).toBeInTheDocument();
    expect(screen.getByText('order_abc')).toBeInTheDocument();
    expect(await screen.findByText('FeePaid')).toBeInTheDocument();
    expect(screen.getByText('SmtpEmailAdapter: connection refused')).toBeInTheDocument();
  });

  it('says so when nothing needs attention', async () => {
    signInAs(SUPER_ADMIN);
    api({ summary: { events: { pending: 0, failed: 0, dead: 0 }, paymentsNeedingReview: 0, failedNotifications24h: 0 }, payments: [], events: [] });
    renderWithIntl(<AdminPage />);

    expect(await screen.findByText('No payments need review')).toBeInTheDocument();
    expect(await screen.findByText('No dead events')).toBeInTheDocument();
  });

  it('resolves a payment only with a note, and sends that note', async () => {
    const user = userEvent.setup();
    signInAs(SUPER_ADMIN);
    api();
    let body: unknown;
    server.use(
      http.post(`${API_URL}/admin/ops/payments/${payment.id}/resolve`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: { status: 'RESOLVED' } });
      }),
    );
    renderWithIntl(<AdminPage />);

    await user.click(await screen.findByRole('button', { name: 'Mark resolved' }));
    const save = screen.getByRole('button', { name: 'Save as resolved' });
    expect(save).toBeDisabled();

    await user.type(screen.getByLabelText('What was done'), 'Refunded in Razorpay');
    await user.click(save);

    await waitFor(() => expect(body).toEqual({ note: 'Refunded in Razorpay' }));
  });

  it('re-queues a dead event', async () => {
    const user = userEvent.setup();
    signInAs(SUPER_ADMIN);
    api();
    let retried = false;
    server.use(
      http.post(`${API_URL}/admin/ops/events/evt-1/retry`, () => {
        retried = true;
        return HttpResponse.json({ data: { status: 'REQUEUED' } });
      }),
    );
    renderWithIntl(<AdminPage />);

    await user.click(await screen.findByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(retried).toBe(true));
  });
});

describe('platform console access', () => {
  it('shows an institute owner no access instead of the console', async () => {
    signInAs(OWNER);
    server.use(
      http.get(`${API_URL}/coachings/me`, () => HttpResponse.json({ data: { name: 'Sharma Classes', subscription: { status: 'ACTIVE', features: [] } } })),
    );
    renderWithIntl(<AppShell>console</AppShell>);

    expect(await screen.findByText("You don't have access")).toBeInTheDocument();
    expect(screen.queryByText('console')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Operations' })).toBeNull();
  });
});
