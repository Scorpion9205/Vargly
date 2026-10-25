import PDFDocument from 'pdfkit';
import { fontFor, registerFonts } from '../../common/pdf/pdf-fonts.js';

export const CERTIFICATE_TYPES = ['ACHIEVEMENT', 'COMPLETION', 'PARTICIPATION'] as const;
export type CertificateType = (typeof CERTIFICATE_TYPES)[number];

export interface CertificateInput {
  readonly type: CertificateType;
  readonly instituteName: string;
  readonly studentName: string;
  /** What the certificate is for, in the owner's words; a sensible line is used when empty */
  readonly reason?: string | null;
  /** The India day it is issued on (YYYY-MM-DD) */
  readonly issuedOn: string;
  /** Who signs it: the owner or principal */
  readonly signedBy?: string | null;
}

const COPY: Record<CertificateType, { heading: string; intro: string; defaultReason: string }> = {
  ACHIEVEMENT: {
    heading: 'Certificate of Achievement',
    intro: 'This certificate is proudly presented to',
    defaultReason: 'in recognition of outstanding performance, hard work and dedication',
  },
  COMPLETION: {
    heading: 'Certificate of Completion',
    intro: 'This is to certify that',
    defaultReason: 'has successfully completed the course with us',
  },
  PARTICIPATION: {
    heading: 'Certificate of Participation',
    intro: 'This certificate is awarded to',
    defaultReason: 'for taking part with enthusiasm and sincerity',
  },
};

export interface CertificateLines {
  readonly institute: string;
  readonly heading: string;
  readonly intro: string;
  readonly student: string;
  readonly reason: string;
  readonly dateLine: string;
  readonly signer: string | null;
}

/** What the certificate says, before any drawing, so the wording can be tested */
export function certificateLines(input: CertificateInput): CertificateLines {
  const copy = COPY[input.type];
  const date = new Date(`${input.issuedOn}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return {
    institute: input.instituteName,
    heading: copy.heading,
    intro: copy.intro,
    student: input.studentName,
    reason: input.reason?.trim() || copy.defaultReason,
    dateLine: `Date: ${date}`,
    signer: input.signedBy?.trim() || null,
  };
}

/** An A4 landscape certificate with a border; the buffer is a complete PDF */
export async function renderCertificatePdf(input: CertificateInput): Promise<Buffer> {
  const lines = certificateLines(input);
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0, info: { Title: lines.heading } });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const fonts = registerFonts(doc);
  const { width, height } = doc.page;
  const accent = '#f26b3a';

  // A double border
  doc.rect(24, 24, width - 48, height - 48).lineWidth(3).strokeColor(accent).stroke();
  doc.rect(34, 34, width - 68, height - 68).lineWidth(0.8).strokeColor('#d9a28c').stroke();

  const centered = (text: string, y: number, size: number, bold: boolean, color: string, margin = 70) => {
    doc.font(fontFor(fonts, text, bold)).fontSize(size).fillColor(color);
    doc.text(text, margin, y, { width: width - margin * 2, align: 'center' });
  };

  centered(lines.institute, 70, 20, true, '#222222');
  centered(lines.heading.toUpperCase(), 118, 30, true, accent);
  doc.moveTo(width / 2 - 70, 168).lineTo(width / 2 + 70, 168).lineWidth(1.5).strokeColor(accent).stroke();
  centered(lines.intro, 190, 14, false, '#555555');
  centered(lines.student, 222, 36, true, '#111111');
  doc.moveTo(width / 2 - 180, 276).lineTo(width / 2 + 180, 276).lineWidth(0.6).strokeColor('#999999').stroke();
  centered(lines.reason, 296, 15, false, '#333333', 120);

  doc.font(fonts.latin.regular).fontSize(11).fillColor('#444444');
  doc.text(lines.dateLine, 70, height - 110, { width: 240, align: 'left' });
  if (lines.signer) {
    doc.moveTo(width - 290, height - 118).lineTo(width - 70, height - 118).lineWidth(0.8).strokeColor('#666666').stroke();
    doc.font(fontFor(fonts, lines.signer, true)).fontSize(12).fillColor('#222222');
    doc.text(lines.signer, width - 290, height - 108, { width: 220, align: 'center' });
  }

  doc.end();
  return finished;
}
