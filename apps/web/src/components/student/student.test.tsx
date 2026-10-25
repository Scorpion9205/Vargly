import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoleGuard } from '@/components/auth/role-guard';
import { API_URL } from '@/lib/api';
import { __resetSessionForTests } from '@/lib/auth/session';
import type {
  PortalAttendance,
  PortalFees,
  PortalHomework,
  PortalOverview,
  PortalProfile,
  PortalResult,
} from '@/lib/student-portal';
import { calendarCells, dayStatus, safeHttpUrl } from '@/lib/student-portal';
import { renderWithIntl } from '@/test/render';
import { OWNER, signInAs, STUDENT } from '@/test/session';
import { StudentAttendancePage } from './attendance-page';
import { StudentHomeworkPage } from './homework-page';
import { StudentHomePage } from './home-page';
import { StudentFeesPage, StudentMaterialsPage, StudentNoticesPage, StudentProfilePage, StudentTimetablePage } from './other-pages';
import { StudentDoubtsPage } from './doubts-page';
import { PASSWORD_PATH, StudentGate } from './student-gate';
import { StudentResultsPage, trendPoints } from './results-page';

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
let pathname = '/student';
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => pathname }));

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  __resetSessionForTests();
  vi.clearAllMocks();
  pathname = '/student';
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const summary = (percentage: number | null, overrides = {}) => ({ present: 8, late: 1, absent: 3, excused: 0, counted: 12, percentage, ...overrides });

const homework = (overrides: Partial<PortalHomework> = {}): PortalHomework => ({
  id: 'h1',
  title: 'Chapter 3 exercise',
  description: 'Do exercise 3.1',
  dueDate: '2026-10-28',
  batchName: 'Class 10 Maths',
  attachmentUrl: null,
  status: 'UPCOMING',
  doneAt: null,
  ...overrides,
});

const result = (overrides: Partial<PortalResult> = {}): PortalResult => ({
  testId: 't1',
  title: 'Unit test 1',
  subject: 'Maths',
  date: '2026-10-10',
  batchName: 'Class 10 Maths',
  marks: 42,
  totalMarks: 50,
  percentage: 84,
  absent: false,
  passed: true,
  standing: { rank: 2, outOf: 20, classAveragePercentage: 61.5 },
  ...overrides,
});

const overview = (overrides: Partial<PortalOverview> = {}): PortalOverview => ({
  student: { name: 'Riya Verma', rollNumber: '12', institute: 'Sharma Classes' },
  today: '2026-10-24',
  classesToday: [{ id: 'b1', name: 'Class 10 Maths', subject: 'Maths', startTime: '08:00', endTime: '09:30', teachers: ['Mr Sharma'] }],
  attendance: { thisMonth: summary(80), overall: summary(66.7), threshold: 75, belowThreshold: true },
  homework: { open: 2, overdue: 1, next: [homework({ status: 'OVERDUE', dueDate: '2026-10-22' }), homework({ id: 'h2', title: 'Read chapter 4' })] },
  latestResult: result(),
  averagePercentage: 84,
  notices: [{ id: 'n1', title: 'Diwali holiday', content: 'Closed on Monday', isPinned: false, batchName: null, createdAt: '2026-10-18T05:00:00.000Z' }],
  fees: null,
  showFees: false,
  doubtsEnabled: false,
  ...overrides,
});

const api = (path: string, data: unknown) => http.get(`${API_URL}/student-portal${path}`, () => HttpResponse.json({ data }));

describe('calendar helpers', () => {
  it('lays a month out Monday first, with each day\'s marks', () => {
    // 1 Oct 2026 is a Thursday: three blanks, then 31 days
    const cells = calendarCells('2026-10', [
      { date: '2026-10-05', status: 'PRESENT', batchName: 'A' },
      { date: '2026-10-05', status: 'ABSENT', batchName: 'B' },
    ]);
    expect(cells.slice(0, 3)).toEqual([null, null, null]);
    expect(cells).toHaveLength(3 + 31);
    expect(cells[3]).toMatchObject({ day: 1, statuses: [] });
    expect(cells.find((c) => c?.day === 5)?.statuses).toEqual(['PRESENT', 'ABSENT']);
  });

  it('shows an absence over everything else on a day with several classes', () => {
    expect(dayStatus(['PRESENT', 'ABSENT'])).toBe('ABSENT');
    expect(dayStatus(['PRESENT', 'LATE'])).toBe('LATE');
    expect(dayStatus(['EXCUSED'])).toBe('EXCUSED');
    expect(dayStatus([])).toBeNull();
  });

  it('opens a link only when it is a web address', () => {
    expect(safeHttpUrl('https://api.test/papers/dl/x')).toBe('https://api.test/papers/dl/x');
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpUrl(null)).toBeNull();
  });

  it('draws a trend only with two or more tests, oldest on the left', () => {
    expect(trendPoints([result()], 100, 40)).toBe('');
    expect(trendPoints([result({ percentage: 100, testId: 'b' }), result({ percentage: 0, testId: 'a' })], 100, 40)).toBe('0,40 100,0');
  });
});

describe('StudentHomePage', () => {
  it('greets the student and shows the day: classes, homework, the latest result', async () => {
    signInAs(STUDENT);
    server.use(api('/overview', overview()));
    renderWithIntl(<StudentHomePage />);

    expect(await screen.findByRole('heading', { name: 'Hi, Riya' })).toBeInTheDocument();
    expect(screen.getAllByText('Class 10 Maths').length).toBeGreaterThan(0);
    expect(screen.getByText('8:00 AM – 9:30 AM')).toBeInTheDocument();
    expect(screen.getByText('Chapter 3 exercise')).toBeInTheDocument();
    expect(screen.getByText('Unit test 1')).toBeInTheDocument();
    expect(screen.getByText('42 / 50')).toBeInTheDocument();
    expect(screen.getByText('Rank 2 of 20 in the class')).toBeInTheDocument();
    expect(screen.getByText('Diwali holiday')).toBeInTheDocument();
  });

  it('warns when attendance is under the institute\'s level, and says nothing otherwise', async () => {
    signInAs(STUDENT);
    server.use(api('/overview', overview()));
    const { unmount } = renderWithIntl(<StudentHomePage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Your attendance is 66.7%, below your institute\'s 75%');
    unmount();

    server.use(api('/overview', overview({ attendance: { thisMonth: summary(90), overall: summary(92), threshold: 75, belowThreshold: false } })));
    renderWithIntl(<StudentHomePage />);
    await screen.findByRole('heading', { name: 'Hi, Riya' });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows fees only when the institute lets students see them', async () => {
    signInAs(STUDENT);
    server.use(api('/overview', overview({ showFees: true, fees: { balance: 1500, overdue: 500, nextDue: { amount: 500, dueDate: '2026-10-10' } } })));
    renderWithIntl(<StudentHomePage />);
    expect(await screen.findByText('₹1,500')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Fees to pay/ })).toHaveAttribute('href', '/student/fees');
  });

  it('says so when there are no classes today', async () => {
    signInAs(STUDENT);
    server.use(api('/overview', overview({ classesToday: [] })));
    renderWithIntl(<StudentHomePage />);
    expect(await screen.findByText('No classes today.')).toBeInTheDocument();
  });
});

describe('StudentAttendancePage', () => {
  const attendance: PortalAttendance = {
    month: '2026-10',
    days: [
      { date: '2026-10-05', status: 'PRESENT', batchName: 'Class 10 Maths' },
      { date: '2026-10-06', status: 'ABSENT', batchName: 'Class 10 Maths' },
    ],
    summary: summary(50, { present: 1, late: 0, absent: 1, counted: 2 }),
    overall: summary(66.7),
    threshold: 75,
    belowThreshold: true,
  };

  it('shows the month as a calendar a screen reader can read, with the totals', async () => {
    signInAs(STUDENT);
    server.use(http.get(`${API_URL}/student-portal/attendance`, () => HttpResponse.json({ data: attendance })));
    renderWithIntl(<StudentAttendancePage />);

    expect(await screen.findByLabelText('5 Oct 2026: Present')).toBeInTheDocument();
    expect(screen.getByLabelText('6 Oct 2026: Absent')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('66.7%');
    const stats = screen.getByRole('region', { name: 'Attendance summary' });
    expect(within(stats).getByText('50%')).toBeInTheDocument();
  });

  it('says when nothing was marked', async () => {
    signInAs(STUDENT);
    server.use(
      http.get(`${API_URL}/student-portal/attendance`, () =>
        HttpResponse.json({ data: { ...attendance, days: [], summary: summary(null, { present: 0, late: 0, absent: 0, counted: 0 }), belowThreshold: false, overall: summary(90) } }),
      ),
    );
    renderWithIntl(<StudentAttendancePage />);
    expect(await screen.findByText('No attendance has been marked this month.')).toBeInTheDocument();
  });
});

describe('StudentHomeworkPage', () => {
  it('lists what is to do first and what is done after, and marks one done', async () => {
    signInAs(STUDENT);
    const marked: unknown[] = [];
    server.use(
      api('/homework', [homework({ status: 'OVERDUE', dueDate: '2026-10-22' }), homework({ id: 'h3', title: 'Old chapter', status: 'DONE', doneAt: '2026-10-14T05:00:00.000Z' })]),
      http.put(`${API_URL}/student-portal/homework/:id/done`, async ({ request, params }) => {
        marked.push({ id: params.id, ...(await request.json() as object) });
        return HttpResponse.json({ data: { message: 'Saved' } });
      }),
    );
    renderWithIntl(<StudentHomeworkPage />);

    expect(await screen.findByRole('heading', { name: 'To do (1)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Done (1)' })).toBeInTheDocument();
    expect(screen.getByText('Late: was due 22 Oct 2026')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Mark as done' }));
    await waitFor(() => expect(marked).toEqual([{ id: 'h1', done: true }]));
  });

  it('opens a homework file only when it is a web address', async () => {
    signInAs(STUDENT);
    server.use(api('/homework', [homework({ attachmentUrl: 'https://api.test/papers/dl/abc' }), homework({ id: 'h2', title: 'Bad link', attachmentUrl: 'javascript:alert(1)' })]));
    renderWithIntl(<StudentHomeworkPage />);

    const links = await screen.findAllByRole('link', { name: 'Open the file' });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', 'https://api.test/papers/dl/abc');
  });

  it('explains an empty list', async () => {
    signInAs(STUDENT);
    server.use(api('/homework', []));
    renderWithIntl(<StudentHomeworkPage />);
    expect(await screen.findByText('No homework')).toBeInTheDocument();
  });
});

describe('StudentResultsPage', () => {
  it('shows marks, pass mark, and the student\'s own rank and the class average', async () => {
    signInAs(STUDENT);
    server.use(
      api('/results', {
        results: [result(), result({ testId: 't2', title: 'Unit test 0', percentage: 40, marks: 20, passed: false, standing: null }), result({ testId: 't3', title: 'Missed test', absent: true, passed: null, standing: null, marks: 0, percentage: 0 })],
        summary: { tests: 2, averagePercentage: 62 },
      }),
    );
    renderWithIntl(<StudentResultsPage />);

    expect(await screen.findByText('62%')).toBeInTheDocument();
    expect(screen.getByText('Rank 2 of 20. Class average 61.5%.')).toBeInTheDocument();
    expect(screen.getByText('Passed')).toBeInTheDocument();
    expect(screen.getByText('Below pass mark')).toBeInTheDocument();
    expect(screen.getByText('You were absent for this test.')).toBeInTheDocument();
  });

  it('explains an empty list', async () => {
    signInAs(STUDENT);
    server.use(api('/results', { results: [], summary: { tests: 0, averagePercentage: null } }));
    renderWithIntl(<StudentResultsPage />);
    expect(await screen.findByText('No results yet')).toBeInTheDocument();
  });
});

describe('the other pages', () => {
  it('lists study material with a download link', async () => {
    signInAs(STUDENT);
    server.use(api('/materials', [{ id: 'm1', title: 'Light notes', subject: 'Science', kind: 'MATERIAL', batchName: 'Class 10', sharedAt: '2026-10-20T05:00:00.000Z', link: 'https://api.test/papers/dl/abc' }]));
    renderWithIntl(<StudentMaterialsPage />);
    expect(await screen.findByText('Light notes')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute('href', 'https://api.test/papers/dl/abc');
  });

  it('shows notices, pinned first as the API sends them', async () => {
    signInAs(STUDENT);
    server.use(api('/notices', [{ id: 'n1', title: 'Fee day', content: 'Please pay', isPinned: true, batchName: null, createdAt: '2026-10-18T05:00:00.000Z' }]));
    renderWithIntl(<StudentNoticesPage />);
    expect(await screen.findByRole('heading', { name: 'Fee day' })).toBeInTheDocument();
    expect(screen.getByText('Pinned')).toBeInTheDocument();
  });

  it('shows the timetable: times, days in order, teachers', async () => {
    signInAs(STUDENT);
    server.use(api('/schedule', [{ id: 'b1', name: 'Class 10 Maths', subject: 'Maths', daysOfWeek: ['WED', 'MON'], startTime: '17:30', endTime: '19:00', teachers: ['Mr Sharma'] }]));
    renderWithIntl(<StudentTimetablePage />);
    expect(await screen.findByText('5:30 PM – 7:00 PM')).toBeInTheDocument();
    const days = within(screen.getByRole('list', { name: 'Days of the week' })).getAllByRole('listitem');
    expect(days.map((d) => d.textContent)).toEqual(['Mon', 'Wed']);
    expect(screen.getByText('Taught by Mr Sharma')).toBeInTheDocument();
  });

  it('keeps fees hidden when the institute has not shown them, and does not even ask for them', async () => {
    signInAs(STUDENT);
    let asked = false;
    server.use(
      api('/overview', overview({ showFees: false })),
      http.get(`${API_URL}/student-portal/fees`, () => {
        asked = true;
        return HttpResponse.json({ error: { code: 'FEES_HIDDEN' } }, { status: 403 });
      }),
    );
    renderWithIntl(<StudentFeesPage />);
    expect(await screen.findByText('Not available here')).toBeInTheDocument();
    expect(asked).toBe(false);
  });

  it('shows fees with balances and receipts when the institute shows them', async () => {
    signInAs(STUDENT);
    const fees: PortalFees = {
      plans: [
        {
          id: 'p1',
          academicYear: '2026-27',
          total: 3000,
          installments: [{ id: 'i1', number: 1, amount: 1500, paid: 1000, balance: 500, dueDate: '2026-10-10', status: 'PARTIAL', overdue: true, payments: [{ amount: 1000, paidAt: '2026-10-05T05:00:00.000Z', receiptNumber: 'RCT/1', receiptLink: 'https://api.test/fees/receipt/x/sig' }] }],
        },
      ],
      totals: { balance: 500, overdue: 500 },
    };
    server.use(api('/overview', overview({ showFees: true })), api('/fees', fees));
    renderWithIntl(<StudentFeesPage />);

    expect(await screen.findByText('Overdue: ₹500')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Receipt RCT/1' })).toHaveAttribute('href', 'https://api.test/fees/receipt/x/sig');
  });

  it('lets the student choose light, dark or the phone setting', async () => {
    signInAs(STUDENT);
    server.use(api('/profile', { institute: 'Sharma Classes', name: 'Riya Verma', loginId: 'RIYA-4821', rollNumber: null, phone: null, email: null, joiningDate: '2026-04-01T00:00:00.000Z', batches: [] }));
    renderWithIntl(<StudentProfilePage />);

    const group = await screen.findByRole('radiogroup', { name: 'Appearance' });
    const dark = within(group).getByRole('radio', { name: 'Dark' });
    await userEvent.click(dark);
    expect(dark).toHaveAttribute('aria-checked', 'true');
    expect(within(group).getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'false');
  });

  it('shows the profile with the Student ID', async () => {
    signInAs(STUDENT);
    const profile: PortalProfile = {
      institute: 'Sharma Classes',
      name: 'Riya Verma',
      loginId: 'RIYA-4821',
      rollNumber: '12',
      phone: null,
      email: null,
      joiningDate: '2026-04-01T00:00:00.000Z',
      batches: [{ id: 'b1', name: 'Class 10 Maths', subject: 'Maths' }],
    };
    server.use(api('/profile', profile));
    renderWithIntl(<StudentProfilePage />);
    expect(await screen.findByText('RIYA-4821')).toBeInTheDocument();
    expect(screen.getByText('Class 10 Maths')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save password' })).toBeInTheDocument();
  });
});

describe('StudentDoubtsPage', () => {
  it('says so when the institute has not switched doubt help on', async () => {
    signInAs(STUDENT);
    server.use(api('/overview', overview({ doubtsEnabled: false })));
    renderWithIntl(<StudentDoubtsPage />);
    expect(await screen.findByText('Doubt help is not switched on')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ask' })).toBeNull();
  });

  it('shows the answer under the question, newest first, and clears the box', async () => {
    signInAs(STUDENT);
    const asked: unknown[] = [];
    server.use(
      api('/overview', overview({ doubtsEnabled: true })),
      http.post(`${API_URL}/student-portal/doubts`, async ({ request }) => {
        const body = (await request.json()) as { question: string };
        asked.push(body);
        return HttpResponse.json({ data: { answer: `Answer to ${body.question}` } });
      }),
    );
    renderWithIntl(<StudentDoubtsPage />);

    const box = await screen.findByLabelText('Your doubt');
    await userEvent.type(box, 'Why does ice float?');
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByText('Answer to Why does ice float?')).toBeInTheDocument();
    expect(asked).toEqual([{ question: 'Why does ice float?' }]);
    expect(box).toHaveValue('');

    await userEvent.type(box, 'What is speed?');
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }));
    const answers = await screen.findAllByText(/^Answer to /);
    expect(answers.map((a) => a.textContent)).toEqual(['Answer to What is speed?', 'Answer to Why does ice float?']);
  });

  it('keeps the question and shows the reason when the AI cannot answer', async () => {
    signInAs(STUDENT);
    server.use(
      api('/overview', overview({ doubtsEnabled: true })),
      http.post(`${API_URL}/student-portal/doubts`, () =>
        HttpResponse.json({ error: { code: 'AI_BUSY', message: 'The AI is busy right now. Please try again in a minute.' } }, { status: 429 }),
      ),
    );
    renderWithIntl(<StudentDoubtsPage />);
    const box = await screen.findByLabelText('Your doubt');
    await userEvent.type(box, 'Why does ice float?');
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(box).toHaveValue('Why does ice float?');
  });
});

describe('StudentGate and RoleGuard', () => {
  it('sends a student with a temporary password to choose their own, from any page', async () => {
    signInAs({ ...STUDENT, mustChangePassword: true });
    pathname = '/student/homework';
    render(<StudentGate><p>the page</p></StudentGate>);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(PASSWORD_PATH));
    expect(screen.queryByText('the page')).toBeNull();
  });

  it('lets the password page itself show, and everything once the password is their own', () => {
    signInAs({ ...STUDENT, mustChangePassword: true });
    pathname = PASSWORD_PATH;
    const { unmount } = render(<StudentGate><p>the page</p></StudentGate>);
    expect(screen.getByText('the page')).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
    unmount();

    signInAs(STUDENT);
    render(<StudentGate><p>another page</p></StudentGate>);
    expect(screen.getByText('another page')).toBeInTheDocument();
  });

  it('keeps each kind of person in their own area', async () => {
    signInAs(STUDENT);
    const { unmount } = render(<RoleGuard area="staff"><p>staff app</p></RoleGuard>);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/student'));
    expect(screen.queryByText('staff app')).toBeNull();
    unmount();

    vi.clearAllMocks();
    signInAs(OWNER);
    const second = render(<RoleGuard area="student"><p>panel</p></RoleGuard>);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/app'));
    expect(screen.queryByText('panel')).toBeNull();
    second.unmount();

    vi.clearAllMocks();
    signInAs(STUDENT);
    render(<RoleGuard area="student"><p>panel</p></RoleGuard>);
    expect(screen.getByText('panel')).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
