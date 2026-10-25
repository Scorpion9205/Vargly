import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type PDFDocument from 'pdfkit';
import { logger } from '../logger/logger.service.js';

// apps/api/assets/fonts, from both src/ (tsx) and dist/ (compiled): the same depth
const FONT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../assets/fonts');

const FONT_FILES = {
  latin: 'NotoSans-Regular.ttf',
  latinBold: 'NotoSans-Bold.ttf',
  deva: 'NotoSansDevanagari-Regular.ttf',
  devaBold: 'NotoSansDevanagari-Bold.ttf',
} as const;

export interface PdfFonts {
  readonly regular: string;
  readonly bold: string;
}

const HAS_DEVANAGARI = /[ऀ-ॿ]/;

let available: boolean | undefined;

function fontsExist(): boolean {
  if (available === undefined) {
    available = Object.values(FONT_FILES).every((file) => fs.existsSync(path.join(FONT_DIR, file)));
    if (!available) logger.warn('[PdfFonts] Font files are missing; PDFs fall back to Helvetica', { dir: FONT_DIR });
  }
  return available;
}

/**
 * Registers Noto Sans (Latin, with the rupee sign) and Noto Sans Devanagari on a document and
 * returns their names; Helvetica when the files are missing, so a PDF is still made.
 */
export function registerFonts(doc: InstanceType<typeof PDFDocument>): { latin: PdfFonts; deva: PdfFonts } {
  if (!fontsExist()) {
    return { latin: { regular: 'Helvetica', bold: 'Helvetica-Bold' }, deva: { regular: 'Helvetica', bold: 'Helvetica-Bold' } };
  }
  const file = (name: keyof typeof FONT_FILES) => path.join(FONT_DIR, FONT_FILES[name]);
  doc.registerFont('NotoSans', file('latin'));
  doc.registerFont('NotoSans-Bold', file('latinBold'));
  doc.registerFont('NotoSansDeva', file('deva'));
  doc.registerFont('NotoSansDeva-Bold', file('devaBold'));
  return {
    latin: { regular: 'NotoSans', bold: 'NotoSans-Bold' },
    deva: { regular: 'NotoSansDeva', bold: 'NotoSansDeva-Bold' },
  };
}

/** The font for a piece of text: the Devanagari one when it holds any Hindi, so a name never turns into boxes */
export function fontFor(fonts: { latin: PdfFonts; deva: PdfFonts }, text: string, bold = false): string {
  const set = HAS_DEVANAGARI.test(text) ? fonts.deva : fonts.latin;
  return bold ? set.bold : set.regular;
}
