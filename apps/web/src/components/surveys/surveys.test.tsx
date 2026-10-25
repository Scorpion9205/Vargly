import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { API_URL } from '@/lib/api';
import { __resetSessionForTests } from '@/lib/auth/session';
import { responseRate, type SurveyDetail, type SurveySummary } from '@/lib/surveys';
import { renderWithIntl } from '@/test/render';
import { OWNER, signInAs } from '@/test/session';
import { PublicSurveyForm } from './public-survey-form';
import { SurveysPage } from './surveys-page';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => __resetSessionForTests());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const survey: SurveySummary = {
  id: 's1',
  title: 'October feedback',
  question: 'How happy are you with our classes and teaching?',
  batchName: null,
  sent: 20,
  answered: 5,
  averageRating: 4.2,
  closed: false,
  createdAt: '2026-10-18T05:00:00.000Z',
};

describe('responseRate', () => {
  it('is the share of parents who answered, and 0 when nothing was sent', () => {
    expect(responseRate({ sent: 20, answered: 5 })).toBe(25);
    expect(responseRate({ sent: 0, answered: 0 })).toBe(0);
  });
});

describe('SurveysPage', () => {
  it('lists surveys with how many parents answered and the average', async () => {
    server.use(http.get(`${API_URL}/surveys`, () => HttpResponse.json({ data: [survey] })));
    signInAs(OWNER);
    renderWithIntl(<SurveysPage />);

    expect(await screen.findByRole('heading', { name: 'October feedback' })).toBeInTheDocument();
    expect(screen.getByText('5 of 20 parents answered (25%)')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Average 4.2 out of 5' })).toBeInTheDocument();
  });

  it('shows the answers of a survey', async () => {
    const detail: SurveyDetail = {
      ...survey,
      distribution: { '1': 0, '2': 0, '3': 1, '4': 0, '5': 4 },
      responses: [{ parentName: 'Mrs Verma', rating: 5, comment: 'Great teachers', respondedAt: '2026-10-19T05:00:00.000Z' }],
    };
    server.use(
      http.get(`${API_URL}/surveys`, () => HttpResponse.json({ data: [survey] })),
      http.get(`${API_URL}/surveys/s1`, () => HttpResponse.json({ data: detail })),
    );
    signInAs(OWNER);
    renderWithIntl(<SurveysPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'See answers' }));
    expect(await screen.findByText('Mrs Verma')).toBeInTheDocument();
    expect(screen.getByText('Great teachers')).toBeInTheDocument();
  });

  it('explains an empty list', async () => {
    server.use(http.get(`${API_URL}/surveys`, () => HttpResponse.json({ data: [] })));
    signInAs(OWNER);
    renderWithIntl(<SurveysPage />);
    expect(await screen.findByText('No surveys yet')).toBeInTheDocument();
  });
});

describe('PublicSurveyForm (the parent page)', () => {
  it('asks for a rating, then sends it with the comment', async () => {
    const sent: unknown[] = [];
    server.use(
      http.post(`${API_URL}/public/survey/${'t'.repeat(30)}`, async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json({ data: { received: true } }, { status: 201 });
      }),
    );
    renderWithIntl(<PublicSurveyForm token={'t'.repeat(30)} question="How are we doing?" answered={false} closed={false} />);

    await userEvent.click(screen.getByRole('button', { name: 'Send my rating' }));
    expect(screen.getByText('Tap a star to give your rating.')).toBeInTheDocument();
    expect(sent).toHaveLength(0);

    await userEvent.click(screen.getByRole('radio', { name: '4 stars' }));
    await userEvent.type(screen.getByLabelText(/Anything you would like to tell us/), 'Good  ');
    await userEvent.click(screen.getByRole('button', { name: 'Send my rating' }));

    expect(await screen.findByText('Thank you')).toBeInTheDocument();
    await waitFor(() => expect(sent).toEqual([{ rating: 4, comment: 'Good' }]));
  });

  it('thanks a parent who already answered, and tells one that the survey is over', () => {
    const { unmount } = renderWithIntl(<PublicSurveyForm token="x" question="Q" answered closed={false} />);
    expect(screen.getByText('Thank you')).toBeInTheDocument();
    unmount();
    renderWithIntl(<PublicSurveyForm token="x" question="Q" answered={false} closed />);
    expect(screen.getByText(/This survey has ended/)).toBeInTheDocument();
  });
});
