import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_URL } from '@/lib/api';
import type { Batch, Student } from '@/lib/academics';
import { __resetSessionForTests } from '@/lib/auth/session';
import { renderWithIntl } from '@/test/render';
import { OWNER, signInAs, TEACHER } from '@/test/session';
import { StudentDetail } from './student-detail';
import { StudentFormDialog } from './student-form-dialog';
import { StudentsPage } from './students-page';

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  __resetSessionForTests();
  vi.clearAllMocks();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function student(overrides: Partial<Student> = {}): Student {
  return {
    id: 's1',
    firstName: 'Aarav',
    lastName: 'Sharma',
    rollNumber: '12',
    phone: '9876543210',
    joiningDate: '2026-06-01T00:00:00.000Z',
    isActive: true,
    createdAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

const batch: Batch = {
  id: 'b1',
  name: 'Class 10 Morning',
  subject: 'Physics',
  academicYear: '2026-27',
  daysOfWeek: ['MON'],
  isActive: true,
  createdAt: '2026-06-01T00:00:00.000Z',
};

describe('StudentsPage', () => {
  it('lists a page of students and asks the API for that page only', async () => {
    let query: URLSearchParams | undefined;
    server.use(
      http.get(`${API_URL}/students`, ({ request }) => {
        query = new URL(request.url).searchParams;
        return HttpResponse.json({
          data: [student(), student({ id: 's2', firstName: 'Diya', rollNumber: null })],
          meta: { total: 60, page: 2, limit: 25 },
        });
      }),
    );
    signInAs(OWNER);
    renderWithIntl(<StudentsPage />, { searchParams: '?page=2&q=sh' });

    expect(await screen.findByRole('link', { name: 'Aarav Sharma' })).toHaveAttribute(
      'href',
      '/app/students/s1',
    );
    expect(screen.getByText('60 students')).toBeInTheDocument();
    expect(screen.getByText('26–50 of 60')).toBeInTheDocument();
    expect(query?.get('page')).toBe('2');
    expect(query?.get('limit')).toBe('25');
    expect(query?.get('search')).toBe('sh');
    expect(query?.get('isActive')).toBe('true');
  });

  it('keeps the search in the URL and goes back to page 1', async () => {
    server.use(
      http.get(`${API_URL}/students`, () =>
        HttpResponse.json({ data: [], meta: { total: 0, page: 1, limit: 25 } }),
      ),
    );
    const onUrlUpdate = vi.fn();
    signInAs(OWNER);
    renderWithIntl(<StudentsPage />, { searchParams: '?page=3', onUrlUpdate });

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search students' }), 'diya');

    await waitFor(() =>
      expect(onUrlUpdate).toHaveBeenLastCalledWith(
        expect.objectContaining({ queryString: '?q=diya' }),
      ),
    );
    expect(await screen.findByText('No matches')).toBeInTheDocument();
  });

  it('invites owners to add their first student; teachers only see the list', async () => {
    server.use(
      http.get(`${API_URL}/students`, () =>
        HttpResponse.json({ data: [], meta: { total: 0, page: 1, limit: 25 } }),
      ),
    );
    signInAs(OWNER);
    const { unmount } = renderWithIntl(<StudentsPage />);
    expect(await screen.findByText('No students yet')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Add student' })).toHaveLength(2);
    unmount();

    signInAs(TEACHER);
    renderWithIntl(<StudentsPage />);
    expect(await screen.findByText('No students yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add student' })).toBeNull();
  });
});

describe('StudentFormDialog', () => {
  beforeEach(() => {
    server.use(http.get(`${API_URL}/batches`, () => HttpResponse.json({ data: [batch] })));
  });

  it('adds a student with their parent and batch in one go', async () => {
    const calls: Record<string, unknown> = {};
    server.use(
      http.post(`${API_URL}/students`, async ({ request }) => {
        calls.student = await request.json();
        return HttpResponse.json({ data: student({ id: 'new' }) }, { status: 201 });
      }),
      http.post(`${API_URL}/parents`, async ({ request }) => {
        calls.parent = await request.json();
        return HttpResponse.json({ data: {} }, { status: 201 });
      }),
      http.post(`${API_URL}/batches/b1/students`, async ({ request }) => {
        calls.enrol = await request.json();
        return HttpResponse.json({ data: {} });
      }),
    );
    signInAs(OWNER);
    const onCreated = vi.fn();
    renderWithIntl(<StudentFormDialog open onOpenChange={() => {}} onCreated={onCreated} />);

    await userEvent.type(screen.getByLabelText('First name'), 'Aarav');
    await userEvent.type(screen.getByLabelText('Last name'), 'Sharma');
    await userEvent.type(screen.getByLabelText("Parent's name"), 'Rakesh Sharma');
    await userEvent.type(screen.getByLabelText("Parent's mobile (WhatsApp)"), '98765 43210');
    await userEvent.selectOptions(await screen.findByLabelText('Add to batch'), 'b1');
    await userEvent.click(screen.getByRole('button', { name: 'Add student' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    // Blank optional fields are left out; the API rejects "" for dates and emails
    expect(calls.student).toEqual({
      firstName: 'Aarav',
      lastName: 'Sharma',
      joiningDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
    expect(calls.parent).toEqual({
      name: 'Rakesh Sharma',
      phone: '9876543210',
      relation: 'FATHER',
      studentId: 'new',
      isPrimary: true,
    });
    expect(calls.enrol).toEqual({ studentId: 'new' });
  });

  it('will not save half a parent', async () => {
    signInAs(OWNER);
    renderWithIntl(<StudentFormDialog open onOpenChange={() => {}} />);

    await userEvent.type(screen.getByLabelText('First name'), 'Aarav');
    await userEvent.type(screen.getByLabelText('Last name'), 'Sharma');
    await userEvent.type(screen.getByLabelText("Parent's name"), 'Rakesh');
    await userEvent.click(screen.getByRole('button', { name: 'Add student' }));

    expect(await screen.findByText('This field is required.')).toBeInTheDocument();
    expect(screen.getByLabelText("Parent's mobile (WhatsApp)")).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('still counts the student as added when saving the parent fails', async () => {
    server.use(
      http.post(`${API_URL}/students`, () =>
        HttpResponse.json({ data: student({ id: 'new' }) }, { status: 201 }),
      ),
      http.post(`${API_URL}/parents`, () =>
        HttpResponse.json({ error: { code: 'INTERNAL_ERROR' } }, { status: 500 }),
      ),
    );
    signInAs(OWNER);
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();
    renderWithIntl(<StudentFormDialog open onOpenChange={onOpenChange} onCreated={onCreated} />);

    await userEvent.type(screen.getByLabelText('First name'), 'Aarav');
    await userEvent.type(screen.getByLabelText('Last name'), 'Sharma');
    await userEvent.type(screen.getByLabelText("Parent's name"), 'Rakesh');
    await userEvent.type(screen.getByLabelText("Parent's mobile (WhatsApp)"), '9876543210');
    await userEvent.click(screen.getByRole('button', { name: 'Add student' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('sends only what changed when editing', async () => {
    let body: unknown;
    server.use(
      http.put(`${API_URL}/students/s1`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: student() });
      }),
    );
    signInAs(OWNER);
    const onOpenChange = vi.fn();
    renderWithIntl(
      <StudentFormDialog open onOpenChange={onOpenChange} student={student({ phone: null })} />,
    );

    expect(screen.queryByLabelText("Parent's name")).toBeNull();
    const roll = screen.getByLabelText('Roll no.');
    await userEvent.clear(roll);
    await userEvent.type(roll, '14');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(body).toEqual({ rollNumber: '14' });
  });

  it('clears a detail that was emptied', async () => {
    let body: unknown;
    server.use(
      http.put(`${API_URL}/students/s1`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: student() });
      }),
    );
    signInAs(OWNER);
    const onOpenChange = vi.fn();
    renderWithIntl(
      <StudentFormDialog
        open
        onOpenChange={onOpenChange}
        student={student({ email: 'aarav@example.com', dob: '2011-04-02T00:00:00.000Z' })}
      />,
    );

    expect(screen.getByLabelText('Date of birth')).toHaveValue('2011-04-02');
    await userEvent.clear(screen.getByLabelText("Student's email"));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(body).toEqual({ email: null });
  });

  it('closes without a request when nothing changed', async () => {
    signInAs(OWNER);
    const onOpenChange = vi.fn();
    renderWithIntl(<StudentFormDialog open onOpenChange={onOpenChange} student={student()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});

describe('StudentDetail', () => {
  // The profile also shows test results; those have their own tests
  beforeEach(() => {
    server.use(
      http.get(`${API_URL}/tests/student/:id`, () => HttpResponse.json({ data: [] })),
      http.get(`${API_URL}/student-logins/:id`, () =>
        HttpResponse.json({ data: { studentId: 's1', name: 'Aarav Sharma', rollNumber: null, loginId: null, active: false, lastLoginAt: null } }),
      ),
    );
  });

  const profile = student({
    parents: [
      { id: 'p1', name: 'Rakesh Sharma', phone: '9876543210', relation: 'FATHER', isPrimary: true },
    ],
    batches: [{ id: 'b1', name: 'Class 10 Morning', subject: 'Physics' }],
  });

  it('shows parents with call and WhatsApp links, and batches', async () => {
    server.use(http.get(`${API_URL}/students/s1`, () => HttpResponse.json({ data: profile })));
    signInAs(OWNER);
    renderWithIntl(<StudentDetail id="s1" />);

    expect(await screen.findByRole('heading', { name: 'Aarav Sharma' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '9876543210' })).toHaveAttribute(
      'href',
      'tel:9876543210',
    );
    expect(screen.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute(
      'href',
      'https://wa.me/919876543210',
    );
    expect(screen.getByText('Primary contact')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Class 10 Morning · Physics' })).toHaveAttribute(
      'href',
      '/app/batches/b1',
    );
  });

  it('offers an owner a login for the student panel, and does not offer it to a teacher', async () => {
    server.use(http.get(`${API_URL}/students/s1`, () => HttpResponse.json({ data: profile })));
    signInAs(OWNER);
    const owner = renderWithIntl(<StudentDetail id="s1" />);
    expect(await screen.findByRole('button', { name: 'Make login' })).toBeInTheDocument();
    expect(screen.getByText('No login')).toBeInTheDocument();
    owner.unmount();

    signInAs(TEACHER);
    renderWithIntl(<StudentDetail id="s1" />);
    await screen.findByRole('heading', { name: 'Aarav Sharma' });
    expect(screen.queryByRole('button', { name: 'Make login' })).toBeNull();
  });

  it('asks before deleting, then returns to the list', async () => {
    server.use(
      http.get(`${API_URL}/students/s1`, () => HttpResponse.json({ data: profile })),
      http.delete(`${API_URL}/students/s1`, () => HttpResponse.json({ data: {} })),
    );
    signInAs(OWNER);
    renderWithIntl(<StudentDetail id="s1" />);

    await userEvent.click(await screen.findByRole('button', { name: 'Delete student' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete Aarav Sharma?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete student' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/app/students'));
  });

  it('is read-only for teachers', async () => {
    server.use(http.get(`${API_URL}/students/s1`, () => HttpResponse.json({ data: profile })));
    signInAs(TEACHER);
    renderWithIntl(<StudentDetail id="s1" />);

    await screen.findByRole('heading', { name: 'Aarav Sharma' });
    for (const name of ['Edit', 'Delete student', 'Add parent', 'Add to batch', 'Mark inactive']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
  });

  it('explains a missing student', async () => {
    server.use(
      http.get(`${API_URL}/students/nope`, () =>
        HttpResponse.json({ error: { code: 'STUDENT_NOT_FOUND' } }, { status: 404 }),
      ),
    );
    signInAs(OWNER);
    renderWithIntl(<StudentDetail id="nope" />);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All students' })).toHaveAttribute(
      'href',
      '/app/students',
    );
  });
});
