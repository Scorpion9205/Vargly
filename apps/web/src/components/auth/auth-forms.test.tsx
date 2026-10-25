import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetSessionForTests, getSession } from '@/lib/auth/session';
import { renderWithIntl } from '@/test/render';
import { LoginForm } from './login-form';
import { normalisePhone } from '@/lib/phone';
import { SignupForm } from './signup-form';

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  __resetSessionForTests();
  vi.clearAllMocks();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const BFF = `${location.origin}/api/auth`;
const session = {
  user: {
    id: 'u1',
    name: 'Asha',
    email: 'asha@example.com',
    phone: '',
    roles: [],
    permissions: [],
  },
  accessToken: 'access-1',
  expiresIn: 900,
};

describe('LoginForm', () => {
  it('validates before calling the server', async () => {
    renderWithIntl(<LoginForm />);

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findAllByText('This field is required.')).toHaveLength(2);
    expect(screen.getByLabelText('Email or Student ID')).toHaveAttribute('aria-invalid', 'true');
  });

  it('signs in and goes to the requested page', async () => {
    let body: unknown;
    server.use(
      http.post(`${BFF}/login`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: session });
      }),
    );
    renderWithIntl(<LoginForm next="/app/students" />);

    await userEvent.type(screen.getByLabelText('Email or Student ID'), 'asha@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'secret123');
    await userEvent.type(screen.getByLabelText('Institute code (optional)'), 'Sharma-Classes');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/app/students'));
    expect(body).toEqual({
      email: 'asha@example.com',
      password: 'secret123',
      coachingCode: 'sharma-classes',
    });
    expect(getSession()?.accessToken).toBe('access-1');
  });

  it('signs a student in with a Student ID and the institute code, and lands in the student panel', async () => {
    let body: unknown;
    server.use(
      http.post(`${BFF}/login`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          data: { ...session, user: { ...session.user, roles: ['STUDENT'], permissions: ['portal:student'] } },
        });
      }),
    );
    renderWithIntl(<LoginForm next="/app/students" />);

    await userEvent.type(screen.getByLabelText('Email or Student ID'), 'RIYA-4821');
    await userEvent.type(screen.getByLabelText('Password'), 'secret123');
    await userEvent.type(screen.getByLabelText('Institute code (optional)'), 'Sharma-Classes');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/student'));
    expect(body).toEqual({ email: 'RIYA-4821', password: 'secret123', coachingCode: 'sharma-classes' });
  });

  it('asks for the institute code before it signs in with a Student ID', async () => {
    renderWithIntl(<LoginForm />);

    await userEvent.type(screen.getByLabelText('Email or Student ID'), 'RIYA-4821');
    await userEvent.type(screen.getByLabelText('Password'), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Enter your institute code to sign in with a Student ID.')).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('never redirects off-site after signing in', async () => {
    server.use(http.post(`${BFF}/login`, () => HttpResponse.json({ data: session })));
    renderWithIntl(<LoginForm next="https://evil.example" />);

    await userEvent.type(screen.getByLabelText('Email or Student ID'), 'asha@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/app'));
  });

  it('explains a wrong password', async () => {
    server.use(
      http.post(`${BFF}/login`, () =>
        HttpResponse.json({ error: { code: 'INVALID_CREDENTIALS' } }, { status: 401 }),
      ),
    );
    renderWithIntl(<LoginForm />);

    await userEvent.type(screen.getByLabelText('Email or Student ID'), 'asha@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Wrong email, Student ID or password/);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('can show and hide the password', async () => {
    renderWithIntl(<LoginForm />);
    const password = screen.getByLabelText('Password');
    expect(password).toHaveAttribute('type', 'password');

    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');
  });
});

describe('SignupForm', () => {
  async function fillOwner() {
    await userEvent.type(screen.getByLabelText('Your full name'), 'Asha Sharma');
    await userEvent.type(screen.getByLabelText('Your email'), 'asha@example.com');
    await userEvent.type(screen.getByLabelText('Your mobile number'), '98765 43210');
    await userEvent.type(screen.getByLabelText('Password'), 'secret123');
  }

  it('does not ask for an institute code: Vargly makes one', () => {
    renderWithIntl(<SignupForm />);
    expect(screen.queryByLabelText(/Institute code/)).toBeNull();
  });

  it("uses the owner's contact details for the institute by default", async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post(`${BFF}/register`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ data: session }, { status: 201 });
      }),
    );
    renderWithIntl(<SignupForm />);

    await fillOwner();
    await userEvent.type(screen.getByLabelText('Institute name'), 'Sharma Classes');
    await userEvent.click(screen.getByRole('button', { name: 'Create my institute' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/app'));
    expect(body).toMatchObject({
      ownerPhone: '9876543210',
      phone: '9876543210',
      email: 'asha@example.com',
    });
    expect(body).not.toHaveProperty('sameContact');
    expect(body).not.toHaveProperty('coachingCode');
  });

  it('says how long to wait when sign-ups are rate limited', async () => {
    server.use(
      http.post(`${BFF}/register`, () =>
        HttpResponse.json(
          { error: { code: 'RATE_LIMITED', message: 'x', details: { retryAfterSeconds: 2400 } } },
          { status: 429 },
        ),
      ),
    );
    renderWithIntl(<SignupForm />);
    await fillOwner();
    await userEvent.type(screen.getByLabelText('Institute name'), 'Sharma Classes');
    await userEvent.click(screen.getByRole('button', { name: 'Create my institute' }));

    expect(await screen.findByText(/try again in 40 minutes/)).toBeInTheDocument();
  });

  it('asks for institute contact details when they differ', async () => {
    renderWithIntl(<SignupForm />);
    await fillOwner();
    await userEvent.type(screen.getByLabelText('Institute name'), 'Sharma Classes');
    await userEvent.click(screen.getByLabelText(/Use my email and mobile/));
    await userEvent.click(screen.getByRole('button', { name: 'Create my institute' }));

    expect(await screen.findByText(/Enter a 10-digit mobile number/)).toBeInTheDocument();
    expect(screen.getByLabelText('Institute email')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('signup helpers', () => {
  it('strips spacing people type in phone numbers', () => {
    expect(normalisePhone('+91 98765-43210')).toBe('+919876543210');
    expect(normalisePhone('(0744) 123 4567')).toBe('07441234567');
  });
});
