import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_URL } from '@/lib/api';
import { __resetSessionForTests } from '@/lib/auth/session';
import { renderWithIntl } from '@/test/render';
import { OWNER, signInAs } from '@/test/session';
import { certificatePath, CertificatesPage } from './certificates-page';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => __resetSessionForTests());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('certificatePath', () => {
  it('asks the API for the PDF, leaving out what was not filled in', () => {
    const base = { studentId: 's1', type: 'ACHIEVEMENT' as const, reason: '', issuedOn: '2026-10-20', signedBy: '' };
    expect(certificatePath(base)).toBe('/certificates/pdf?studentId=s1&type=ACHIEVEMENT&issuedOn=2026-10-20');
    expect(certificatePath({ ...base, reason: ' for first rank ', signedBy: 'Dr. Sharma' })).toBe(
      '/certificates/pdf?studentId=s1&type=ACHIEVEMENT&reason=for+first+rank&issuedOn=2026-10-20&signedBy=Dr.+Sharma',
    );
  });
});

describe('CertificatesPage', () => {
  it('needs a student before it can make anything, then asks for that student’s PDF', async () => {
    const asked: string[] = [];
    server.use(
      http.get(`${API_URL}/students`, () =>
        HttpResponse.json({
          data: [{ id: 's1', firstName: 'Riya', lastName: 'Verma', rollNumber: '12', joiningDate: '2026-04-01', isActive: true, createdAt: '2026-04-01T00:00:00.000Z' }],
          meta: { total: 1, page: 1, limit: 25 },
        }),
      ),
      http.get(`${API_URL}/certificates/pdf`, ({ request }) => {
        asked.push(new URL(request.url).search);
        return new HttpResponse('%PDF-1.4', { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="Certificate.pdf"' } });
      }),
    );
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    signInAs(OWNER);
    renderWithIntl(<CertificatesPage />);

    const download = screen.getByRole('button', { name: 'Download PDF' });
    expect(download).toBeDisabled();

    await screen.findByRole('option', { name: /Riya Verma/ });
    await userEvent.selectOptions(screen.getByLabelText('Student'), 's1');
    expect(download).toBeEnabled();
    await userEvent.click(download);

    await waitFor(() => expect(asked).toHaveLength(1));
    expect(asked[0]).toContain('studentId=s1');
    expect(asked[0]).toContain('type=ACHIEVEMENT');
  });
});
