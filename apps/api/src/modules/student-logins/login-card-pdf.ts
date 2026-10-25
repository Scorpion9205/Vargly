import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { fontFor, registerFonts } from '../../common/pdf/pdf-fonts.js';

export interface LoginCard {
  readonly name: string;
  readonly loginId: string;
  readonly temporaryPassword: string;
}

export interface LoginCardsInput {
  readonly instituteName: string;
  readonly instituteCode: string;
  /** Where students sign in, shown as text and as a QR code */
  readonly signInUrl: string;
  readonly cards: readonly LoginCard[];
}

/** Eight cards to an A4 page: two across, four down, so a page is cut into slips and handed out */
export const CARDS_PER_PAGE = 8;

/** What each card says, before any drawing, so the wording can be tested */
export function cardLines(input: LoginCardsInput, card: LoginCard): string[] {
  return [
    input.instituteName,
    'Student panel login',
    card.name,
    `Student ID: ${card.loginId}`,
    `Password: ${card.temporaryPassword}`,
    `Institute code: ${input.instituteCode}`,
    `Sign in at ${input.signInUrl}`,
    'You will choose your own password the first time.',
  ];
}

/** A4 sheets of login cards, one per student; the buffer is a complete PDF */
export async function renderLoginCardsPdf(input: LoginCardsInput): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: 'Student login cards' } });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const fonts = registerFonts(doc);
  const qr = Buffer.from((await QRCode.toDataURL(input.signInUrl, { margin: 1, width: 240 })).split(',')[1]!, 'base64');

  const margin = 28;
  const gap = 12;
  const columns = 2;
  const rows = CARDS_PER_PAGE / columns;
  const cardWidth = (doc.page.width - margin * 2 - gap * (columns - 1)) / columns;
  const cardHeight = (doc.page.height - margin * 2 - gap * (rows - 1)) / rows;

  input.cards.forEach((card, index) => {
    const slot = index % CARDS_PER_PAGE;
    if (index > 0 && slot === 0) doc.addPage();
    const x = margin + (slot % columns) * (cardWidth + gap);
    const y = margin + Math.floor(slot / columns) * (cardHeight + gap);
    const lines = cardLines(input, card);

    // A dashed outline to cut along
    doc.save().dash(4, { space: 3 }).lineWidth(0.8).strokeColor('#999999').roundedRect(x, y, cardWidth, cardHeight, 8).stroke().undash().restore();

    const textWidth = cardWidth - 28 - 74;
    doc.font(fontFor(fonts, lines[0]!, true)).fontSize(10.5).fillColor('#f26b3a').text(lines[0]!, x + 14, y + 12, { width: cardWidth - 28 });
    doc.font(fonts.latin.regular).fontSize(8).fillColor('#777777').text(lines[1]!, x + 14, y + 27, { width: cardWidth - 28 });
    doc.font(fontFor(fonts, lines[2]!, true)).fontSize(13).fillColor('#111111').text(lines[2]!, x + 14, y + 44, { width: textWidth });
    doc.font(fonts.latin.bold).fontSize(10.5).fillColor('#111111').text(lines[3]!, x + 14, y + 66, { width: textWidth });
    doc.font(fonts.latin.bold).fontSize(10.5).fillColor('#111111').text(lines[4]!, x + 14, y + 82, { width: textWidth });
    doc.font(fonts.latin.regular).fontSize(9).fillColor('#444444').text(lines[5]!, x + 14, y + 100, { width: textWidth });
    doc.font(fonts.latin.regular).fontSize(7.5).fillColor('#666666').text(lines[6]!, x + 14, y + 118, { width: cardWidth - 28 });
    doc.font(fonts.latin.regular).fontSize(7.5).fillColor('#666666').text(lines[7]!, x + 14, y + cardHeight - 22, { width: cardWidth - 28 });
    doc.image(qr, x + cardWidth - 14 - 64, y + 40, { width: 64 });
  });

  if (input.cards.length === 0) doc.font(fonts.latin.regular).fontSize(12).text('No cards.', margin, margin);
  doc.end();
  return finished;
}
