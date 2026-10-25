import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_URL } from '@/lib/api';
import { __resetSessionForTests } from '@/lib/auth/session';
import { loginState, type StudentLoginRow } from '@/lib/student-logins';
import { renderWithIntl } from '@/test/render';
import { OWNER, signInAs } from '@/test/session';
import { StudentLoginsPage } from './student-logins-page';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => __resetSessionForTests());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const row = (overrides: Partial<StudentLoginRow> = {}): StudentLoginRow => ({
  studentId: 's1',
  name: 'Riya Verma',
  rollNumber: '12',
  loginId: null,
  active: false,
  lastLoginAt: null,
  ...overrides,
});

function api(rows: StudentLoginRow[], portal: object = {}) {
  const calls: Array<{ method: string; path: string; body?: unknown }> = [];
  server.use(
    http.get(`${API_URL}/student-logins`, () => HttpResponse.json({ data: rows })),
    http.get(`${API_URL}/batches`, () => HttpResponse.json({ data: [] })),
    http.get(`${API_URL}/settings`, () => HttpResponse.json({ data: { config: { studentPortal: portal }, updatedAt: '2026-10-24T05:00:00.000Z' } })),
    http.put(`${API_URL}/settings`, async ({ request }) => {
      calls.push({ method: 'PUT', path: '/settings', body: await request.json() });
      return HttpResponse.json({ data: { config: {}, updatedAt: '2026-10-24T06:00:00.000Z' } });
    }),
    http.post(`${API_URL}/student-logins`, async ({ request }) => {
      calls.push({ method: 'POST', path: '/student-logins', body: await request.json() });
      return HttpResponse.json({ data: { studentId: 's1', name: 'Riya Verma', loginId: 'RIYA-4821', temporaryPassword: 'Kx7mP2qR9a' } }, { status: 201 });
    }),
    http.post(`${API_URL}/student-logins/bulk`, async ({ request }) => {
      calls.push({ method: 'POST', path: '/student-logins/bulk', body: await request.json() });
      return HttpResponse.json({ data: { issued: [{ studentId: 's1', name: 'Riya Verma', loginId: 'RIYA-4821', temporaryPassword: 'Kx7mP2qR9a' }, { studentId: 's2', name: 'Aarav Rao', loginId: 'AARAV-1002', temporaryPassword: 'Zq3nM8vT5b' }], hasMore: true } }, { status: 201 });
    }),
    http.post(`${API_URL}/student-logins/:id/reset`, async ({ params }) => {
      calls.push({ method: 'POST', path: `/student-logins/${params.id}/reset` });
      return HttpResponse.json({ data: { studentId: 's2', name: 'Aarav Rao', loginId: 'AARAV-1002', temporaryPassword: 'New9pass2x' } });
    }),
    http.post(`${API_URL}/student-logins/:id/disable`, async ({ params }) => {
      calls.push({ method: 'POST', path: `/student-logins/${params.id}/disable` });
      return HttpResponse.json({ data: { message: 'Login switched off' } });
    }),
  );
  return calls;
}

describe('loginState', () => {
  it('tells no login, an active one and one that is switched off', () => {
    expect(loginState({ loginId: null, active: false })).toBe('none');
    expect(loginState({ loginId: 'RIYA-4821', active: true })).toBe('active');
    expect(loginState({ loginId: 'RIYA-4821', active: false })).toBe('off');
  });
});

describe('StudentLoginsPage', () => {
  it('lists each student with their login state and Student ID', async () => {
    signInAs(OWNER);
    api([row(), row({ studentId: 's2', name: 'Aarav Rao', loginId: 'AARAV-1002', active: true, lastLoginAt: '2026-10-23T05:00:00.000Z' }), row({ studentId: 's3', name: 'Kabir Khan', loginId: 'KABIR-7661', active: false })]);
    renderWithIntl(<StudentLoginsPage />);

    expect(await screen.findByText('Riya Verma')).toBeInTheDocument();
    expect(screen.getByText('No login')).toBeInTheDocument();
    expect(screen.getByText('AARAV-1002')).toBeInTheDocument();
    expect(screen.getByText('Switched off')).toBeInTheDocument();
    expect(screen.getByText('Last signed in 23 Oct 2026')).toBeInTheDocument();
  });

  it('makes one login and shows the password once', async () => {
    signInAs(OWNER);
    const calls = api([row()]);
    renderWithIntl(<StudentLoginsPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Make login' }));
    const dialog = await screen.findByRole('dialog', { name: 'Logins ready' });
    expect(within(dialog).getByText('RIYA-4821')).toBeInTheDocument();
    expect(within(dialog).getByText('Kx7mP2qR9a')).toBeInTheDocument();
    expect(within(dialog).getByText(/shown only now/)).toBeInTheDocument();
    expect(calls.find((c) => c.path === '/student-logins')?.body).toEqual({ studentId: 's1' });
  });

  it('makes logins for everyone who has none, after asking, and says when there are more', async () => {
    signInAs(OWNER);
    const calls = api([row(), row({ studentId: 's2', name: 'Aarav Rao' })]);
    renderWithIntl(<StudentLoginsPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Make logins for 2 students' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Make logins' }));

    const dialog = await screen.findByRole('dialog', { name: 'Logins ready' });
    expect(within(dialog).getByText('AARAV-1002')).toBeInTheDocument();
    expect(within(dialog).getByText(/more students without a login/)).toBeInTheDocument();
    expect(calls.find((c) => c.path === '/student-logins/bulk')?.body).toEqual({});
  });

  it('gives a new password only after asking, and switches a login off only after asking', async () => {
    signInAs(OWNER);
    const calls = api([row({ studentId: 's2', name: 'Aarav Rao', loginId: 'AARAV-1002', active: true })]);
    renderWithIntl(<StudentLoginsPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'New password' }));
    expect(calls.some((c) => c.path.endsWith('/reset'))).toBe(false);
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'New password' }));
    expect(await screen.findByText('New9pass2x')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    await userEvent.click(await screen.findByRole('button', { name: 'Switch off' }));
    expect(calls.some((c) => c.path.endsWith('/disable'))).toBe(false);
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Switch off' }));
    await waitFor(() => expect(calls.some((c) => c.path === '/student-logins/s2/disable')).toBe(true));
  });

  it('switches the student panel and the fees on or off', async () => {
    signInAs(OWNER);
    const calls = api([row()], { enabled: true, showFees: false });
    renderWithIntl(<StudentLoginsPage />);

    await userEvent.click(await screen.findByLabelText(/Show fees to students/));
    await waitFor(() => expect(calls.find((c) => c.path === '/settings')?.body).toEqual({ studentPortal: { showFees: true } }));
  });
});

describe('login cards', () => {
  it('are made from the logins just shown', async () => {
    signInAs(OWNER);
    let posted: unknown;
    api([row()]);
    server.use(
      http.post(`${API_URL}/student-logins/cards`, async ({ request }) => {
        posted = await request.json();
        return new HttpResponse('%PDF-1.4', { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="student-login-cards.pdf"' } });
      }),
    );
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    renderWithIntl(<StudentLoginsPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Make login' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Download login cards (PDF)' }));
    await waitFor(() => expect(posted).toEqual({ cards: [{ name: 'Riya Verma', loginId: 'RIYA-4821', temporaryPassword: 'Kx7mP2qR9a' }] }));
  });
});
