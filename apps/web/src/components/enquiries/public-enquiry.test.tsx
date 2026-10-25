import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { API_URL } from '@/lib/api';
import { enquiryLink } from '@/lib/enquiry-link';
import { renderWithIntl } from '@/test/render';
import { EnquiryForm } from './public-enquiry-form';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('enquiryLink', () => {
  it('points at the institute public page', () => {
    expect(enquiryLink('sharma-classes')).toMatch(/\/enquire\/sharma-classes$/);
  });
});

describe('EnquiryForm (the parents page)', () => {
  it('sends the details with a cleaned phone number and thanks the parent', async () => {
    const sent: unknown[] = [];
    server.use(
      http.post(`${API_URL}/public/enquiry/sharma`, async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json({ data: { received: true } }, { status: 201 });
      }),
    );
    renderWithIntl(<EnquiryForm code="sharma" />);

    await userEvent.type(screen.getByLabelText('Your name'), 'Mrs Verma');
    await userEvent.type(screen.getByLabelText('Phone number'), '98765 43210');
    await userEvent.type(screen.getByLabelText(/Class or subject/), 'Class 10');
    await userEvent.click(screen.getByRole('button', { name: 'Send enquiry' }));

    expect(await screen.findByText('Thank you')).toBeInTheDocument();
    expect(sent).toEqual([
      { name: 'Mrs Verma', phone: '9876543210', studentName: '', interestedIn: 'Class 10', message: '', website: '' },
    ]);
  });

  it('asks for a valid phone number before sending anything', async () => {
    renderWithIntl(<EnquiryForm code="sharma" />);
    await userEvent.type(screen.getByLabelText('Your name'), 'Mrs Verma');
    await userEvent.type(screen.getByLabelText('Phone number'), '123');
    await userEvent.click(screen.getByRole('button', { name: 'Send enquiry' }));
    await waitFor(() => expect(screen.getByText('Enter a valid phone number')).toBeInTheDocument());
  });
});
