import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_URL } from '@/lib/api';
import type { CoachingProfile } from '@/lib/api-types';
import { __resetSessionForTests, getSession, getSessionEnd } from '@/lib/auth/session';
import { renderWithIntl } from '@/test/render';
import { OWNER, signInAs, TEACHER } from '@/test/session';
import { AppShell } from './app-shell';
import { isActive, NAV_ITEMS, visibleNav } from './nav-config';
import { initials } from './user-menu';

let pathname = '/app';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  __resetSessionForTests();
  pathname = '/app';
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function coaching(subscription: Partial<CoachingProfile['subscription']> = {}) {
  const profile: CoachingProfile = {
    id: 'c1',
    name: 'Sharma Classes',
    code: 'sharma-classes',
    phone: '9876543210',
    email: 'hello@sharma.in',
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    subscription: {
      status: 'TRIALING',
      trialEndsAt: '2026-11-20T00:00:00.000Z',
      daysRemaining: 57,
      features: [],
      ...subscription,
    },
  };
  server.use(http.get(`${API_URL}/coachings/me`, () => HttpResponse.json({ data: profile })));
}

const sidebar = () => screen.getAllByRole('navigation', { name: 'App' })[0]!;

describe('navigation', () => {
  it('shows owners every institute section, but not the platform console', () => {
    const keys = visibleNav(() => true, ['OWNER']).flatMap((group) => group.items.map((item) => item.key));
    expect(keys).toEqual(NAV_ITEMS.filter((item) => !item.role).map((item) => item.key));
    expect(keys).not.toContain('admin');
  });

  it('gives a platform administrator the console and none of the institute sections', () => {
    const keys = visibleNav(() => true, ['SUPER_ADMIN']).flatMap((group) =>
      group.items.map((item) => item.key),
    );
    expect(keys).toEqual(['admin']);
  });

  it("hides sections outside a teacher's permissions", async () => {
    signInAs(TEACHER);
    coaching();
    renderWithIntl(<AppShell>page</AppShell>);

    const nav = sidebar();
    // Settings holds everyone's own account (password, sessions)
    for (const name of ['Dashboard', 'Students', 'Attendance', 'Homework', 'Notices', 'Settings']) {
      expect(within(nav).getByRole('link', { name })).toBeInTheDocument();
    }
    for (const name of ['Fees', 'Salary', 'Expenses', 'Teachers', 'Billing']) {
      expect(within(nav).queryByRole('link', { name })).toBeNull();
    }
    // A group with nothing visible is dropped entirely
    expect(within(nav).queryByText('Money')).toBeNull();
  });

  it('marks the current section, including its sub-pages', () => {
    const students = NAV_ITEMS.find((item) => item.key === 'students')!;
    const dashboard = NAV_ITEMS.find((item) => item.key === 'dashboard')!;
    expect(isActive(students, '/app/students/42')).toBe(true);
    expect(isActive(students, '/app/studentsx')).toBe(false);
    expect(isActive(dashboard, '/app/students')).toBe(false);
    expect(isActive(dashboard, '/app')).toBe(true);
  });

  it('sets aria-current on the active link', async () => {
    pathname = '/app/students/42';
    signInAs(OWNER);
    coaching();
    renderWithIntl(<AppShell>page</AppShell>);

    expect(within(sidebar()).getByRole('link', { name: 'Students' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(sidebar()).getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('opens a menu on small screens that closes after choosing a section', async () => {
    signInAs(OWNER);
    coaching();
    renderWithIntl(<AppShell>page</AppShell>);

    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const dialog = screen.getByRole('dialog', { name: 'Menu' });
    await userEvent.click(within(dialog).getByRole('link', { name: 'Fees' }));

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('app shell', () => {
  it("shows the institute's name", async () => {
    signInAs(OWNER);
    coaching();
    renderWithIntl(<AppShell>page</AppShell>);

    expect(await screen.findByText('Sharma Classes')).toBeInTheDocument();
  });

  it('signs out from the user menu', async () => {
    server.use(
      http.post(`${location.origin}/api/auth/logout`, () =>
        HttpResponse.json({ data: { signedOut: true } }),
      ),
    );
    signInAs(OWNER);
    coaching();
    renderWithIntl(<AppShell>page</AppShell>);

    await userEvent.click(screen.getByRole('button', { name: 'Account menu for Asha Sharma' }));
    expect(screen.getByText('asha@example.com')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));

    await vi.waitFor(() => expect(getSession()).toBeNull());
    expect(getSessionEnd()).toBe('signedOut');
  });

  it.each([
    [{ status: 'TRIALING', daysRemaining: 57 } as const, null],
    [{ status: 'TRIALING', daysRemaining: 5 } as const, 'Your free trial ends in 5 days.'],
    [{ status: 'TRIALING', daysRemaining: 1 } as const, 'Your free trial ends tomorrow.'],
    [{ status: 'GRACE', daysRemaining: 0 } as const, /payment is overdue/],
    [{ status: 'EXPIRED', daysRemaining: 0 } as const, /subscription has ended/],
    [{ status: 'ACTIVE', daysRemaining: 0 } as const, null],
  ])('subscription %o shows banner %s', async (subscription, message) => {
    signInAs(OWNER);
    coaching(subscription);
    renderWithIntl(<AppShell>page</AppShell>);
    await screen.findByText('Sharma Classes');

    if (message === null) {
      expect(screen.queryByText(/trial ends|overdue|has ended/)).toBeNull();
    } else {
      expect(screen.getByText(message)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Choose a plan' })).toHaveAttribute(
        'href',
        '/app/billing',
      );
    }
  });

  it('tells staff who cannot manage billing to ask the owner', async () => {
    signInAs(TEACHER);
    coaching({ status: 'EXPIRED', daysRemaining: 0 });
    renderWithIntl(<AppShell>page</AppShell>);

    expect(await screen.findByText(/Ask your institute owner/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Choose a plan' })).toBeNull();
  });
});

describe('section access', () => {
  it("explains a section outside the user's role instead of loading it", async () => {
    signInAs(TEACHER);
    coaching();
    pathname = '/app/salary';
    renderWithIntl(<AppShell>salary page</AppShell>);
    expect(await screen.findByText("You don't have access")).toBeInTheDocument();
    expect(screen.queryByText('salary page')).toBeNull();
  });

  it('shows pages the role includes, sub-pages too', async () => {
    signInAs(TEACHER);
    coaching();
    pathname = '/app/students/42';
    renderWithIntl(<AppShell>student page</AppShell>);
    expect(await screen.findByText('student page')).toBeInTheDocument();
  });
});

describe('initials', () => {
  it.each([
    ['Asha Sharma', 'AS'],
    ['asha', 'A'],
    ['Asha  Rani   Sharma', 'AS'],
    ['   ', '?'],
  ])('%s -> %s', (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});
