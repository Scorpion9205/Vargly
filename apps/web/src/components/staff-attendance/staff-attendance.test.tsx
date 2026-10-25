import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { API_URL } from '@/lib/api';
import { __resetSessionForTests } from '@/lib/auth/session';
import type { StaffDayRow, StaffMonthRow } from '@/lib/staff-attendance';
import { renderWithIntl } from '@/test/render';
import { OWNER, signInAs } from '@/test/session';
import { StaffAttendancePage } from './staff-attendance-page';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => __resetSessionForTests());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const rows: StaffDayRow[] = [
  { teacherId: 't1', name: 'Asha', status: null, note: null },
  { teacherId: 't2', name: 'Ravi', status: null, note: null },
];

describe('StaffAttendancePage', () => {
  it('marks everyone present and saves the day', async () => {
    const saved: unknown[] = [];
    server.use(
      http.get(`${API_URL}/staff-attendance`, () => HttpResponse.json({ data: rows })),
      http.put(`${API_URL}/staff-attendance`, async ({ request }) => {
        saved.push(await request.json());
        return HttpResponse.json({ data: { saved: 2 } });
      }),
    );
    signInAs(OWNER);
    renderWithIntl(<StaffAttendancePage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Mark everyone present' }));
    await userEvent.click(screen.getByRole('group', { name: 'Attendance of Ravi' }).querySelectorAll('button')[2]!);
    expect(screen.getByText('2 of 2 marked')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save attendance' }));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]).toMatchObject({
      entries: [
        { teacherId: 't1', status: 'PRESENT' },
        { teacherId: 't2', status: 'ABSENT' },
      ],
    });
  });

  it('shows the month with the pay for the days worked', async () => {
    const month: StaffMonthRow[] = [
      { teacherId: 't1', name: 'Asha', present: 20, halfDay: 2, absent: 1, leave: 0, marked: 23, monthlySalary: 23000, suggestedAmount: 21000 },
    ];
    server.use(
      http.get(`${API_URL}/staff-attendance`, () => HttpResponse.json({ data: rows })),
      http.get(`${API_URL}/staff-attendance/month`, () => HttpResponse.json({ data: month })),
    );
    signInAs(OWNER);
    renderWithIntl(<StaffAttendancePage />);

    await userEvent.click(await screen.findByRole('tab', { name: 'Month summary' }));
    expect(await screen.findByRole('rowheader', { name: 'Asha' })).toBeInTheDocument();
    expect(screen.getByText('₹21,000')).toBeInTheDocument();
  });
});
