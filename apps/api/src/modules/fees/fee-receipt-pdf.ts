import PDFDocument from 'pdfkit';
import { fontFor, registerFonts } from '../../common/pdf/pdf-fonts.js';

export interface ReceiptPdfInput {
  readonly instituteName: string;
  readonly instituteAddress?: string | null;
  readonly institutePhone?: string | null;
  readonly receiptNumber: string;
  readonly paidAt: Date;
  readonly studentName: string;
  readonly rollNumber?: string | null;
  readonly academicYear: string;
  readonly installmentNo: number;
  /** Rupees */
  readonly amount: number;
  readonly paymentMethod: string;
  /** Rupees still due on this instalment after the payment */
  readonly installmentBalance: number;
  readonly remarks?: string | null;
}

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Cash',
  UPI: 'UPI',
  BANK_TRANSFER: 'Bank transfer',
  CHEQUE: 'Cheque',
  CARD: 'Card',
  ONLINE: 'Online',
};

export function rupeesText(value: number): string {
  return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/** The rows of the receipt, before any drawing, so the wording can be tested */
export function receiptRows(input: ReceiptPdfInput): Array<[string, string]> {
  const date = input.paidAt.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
  const rows: Array<[string, string]> = [
    ['Receipt number', input.receiptNumber],
    ['Date', date],
    ['Student', input.rollNumber ? `${input.studentName} (Roll ${input.rollNumber})` : input.studentName],
    ['Academic year', input.academicYear],
    ['For', `Fee instalment ${input.installmentNo}`],
    ['Paid by', METHOD_LABEL[input.paymentMethod] ?? input.paymentMethod],
    ['Amount paid', rupeesText(input.amount)],
    ['Balance on this instalment', rupeesText(input.installmentBalance)],
  ];
  if (input.remarks) rows.push(['Note', input.remarks]);
  return rows;
}

/** A one-page fee receipt; the buffer is a complete PDF */
export async function renderReceiptPdf(input: ReceiptPdfInput): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A5', margin: 40, info: { Title: `Receipt ${input.receiptNumber}` } });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const fonts = registerFonts(doc);
  const width = doc.page.width - 80;

  doc.font(fontFor(fonts, input.instituteName, true)).fontSize(17).fillColor('#111111').text(input.instituteName, { align: 'center' });
  const contact = [input.instituteAddress, input.institutePhone].filter(Boolean).join('  |  ');
  if (contact) doc.font(fontFor(fonts, contact)).fontSize(9).fillColor('#555555').text(contact, { align: 'center' });
  doc.moveDown(0.6);
  doc.font(fonts.latin.bold).fontSize(12).fillColor('#f26b3a').text('FEE RECEIPT', { align: 'center', characterSpacing: 2 });
  doc.moveDown(0.5);
  doc.moveTo(40, doc.y).lineTo(40 + width, doc.y).strokeColor('#dddddd').stroke();
  doc.moveDown(0.8);

  for (const [label, value] of receiptRows(input)) {
    const top = doc.y;
    doc.font(fonts.latin.regular).fontSize(10).fillColor('#666666').text(label, 40, top, { width: width * 0.42 });
    const strong = label === 'Amount paid';
    doc
      .font(fontFor(fonts, value, strong))
      .fontSize(strong ? 14 : 10.5)
      .fillColor('#111111')
      .text(value, 40 + width * 0.45, top, { width: width * 0.55 });
    doc.moveDown(0.5);
  }

  doc.moveDown(1.2);
  doc.font(fonts.latin.regular).fontSize(8.5).fillColor('#888888').text('This is a computer-generated receipt and needs no signature.', 40, doc.y, {
    align: 'center',
    width,
  });
  doc.end();
  return finished;
}
