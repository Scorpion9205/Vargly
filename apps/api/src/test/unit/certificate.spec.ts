import { describe, expect, it } from 'vitest';
import { certificateLines, renderCertificatePdf } from '../../modules/certificates/certificate-pdf.js';
import { certificateQuerySchema } from '../../modules/certificates/certificate.module.js';

const base = { instituteName: 'Sharma Classes', studentName: 'Riya Verma', issuedOn: '2026-10-20' } as const;

describe('certificateLines', () => {
  it('words each kind of certificate and dates it', () => {
    expect(certificateLines({ ...base, type: 'ACHIEVEMENT' })).toMatchObject({
      heading: 'Certificate of Achievement',
      student: 'Riya Verma',
      dateLine: 'Date: 20 October 2026',
      signer: null,
    });
    expect(certificateLines({ ...base, type: 'COMPLETION' }).heading).toBe('Certificate of Completion');
    expect(certificateLines({ ...base, type: 'PARTICIPATION' }).heading).toBe('Certificate of Participation');
  });

  it('uses the owner\'s words for the reason, or a sensible line when there are none', () => {
    expect(certificateLines({ ...base, type: 'ACHIEVEMENT', reason: '  for first rank in the unit test  ' }).reason).toBe('for first rank in the unit test');
    expect(certificateLines({ ...base, type: 'ACHIEVEMENT', reason: '   ' }).reason).toContain('outstanding performance');
  });

  it('carries the signer when there is one', () => {
    expect(certificateLines({ ...base, type: 'COMPLETION', signedBy: 'Dr. Sharma' }).signer).toBe('Dr. Sharma');
  });
});

describe('renderCertificatePdf', () => {
  it('makes a real PDF, also for a Hindi name', async () => {
    const pdf = await renderCertificatePdf({ ...base, type: 'ACHIEVEMENT', studentName: 'रिया वर्मा', signedBy: 'डॉ. शर्मा' });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1500);
  });
});

describe('certificateQuerySchema', () => {
  const studentId = '3f2c1b9e-8a44-4d3e-9d55-0a1b2c3d4e5f';
  it('needs a student and a known kind', () => {
    expect(certificateQuerySchema.parse({ studentId, type: 'ACHIEVEMENT' })).toEqual({ studentId, type: 'ACHIEVEMENT' });
    expect(() => certificateQuerySchema.parse({ studentId, type: 'WINNER' })).toThrow();
    expect(() => certificateQuerySchema.parse({ studentId: 'nope', type: 'ACHIEVEMENT' })).toThrow();
    expect(() => certificateQuerySchema.parse({ studentId, type: 'COMPLETION', issuedOn: '20/10/2026' })).toThrow();
  });
});
