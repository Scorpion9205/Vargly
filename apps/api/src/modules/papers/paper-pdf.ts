import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import { logger } from '../../common/logger/logger.service.js';
import { Question, QuestionType } from './paper.types.js';

export interface PaperPdfInput {
  readonly instituteName: string;
  readonly title: string;
  readonly subject: string;
  readonly topic?: string | null;
  readonly questions: readonly Question[];
  /** The teacher's copy: answers and explanations under each question. Never sent to students. */
  readonly withAnswers: boolean;
  readonly date?: Date;
}

// apps/api/assets/fonts, from both src/ (tsx) and dist/ (compiled): the same depth
const FONT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../assets/fonts');

const FONT_FILES = {
  latin: 'NotoSans-Regular.ttf',
  latinBold: 'NotoSans-Bold.ttf',
  deva: 'NotoSansDevanagari-Regular.ttf',
  devaBold: 'NotoSansDevanagari-Bold.ttf',
} as const;

type FontSet = Record<keyof typeof FONT_FILES, string> | null;
let fontSet: FontSet | undefined;

/** Noto Sans for Latin text and Noto Sans Devanagari for Hindi; null when the files are missing */
function loadFonts(): FontSet {
  if (fontSet !== undefined) return fontSet;
  const paths = Object.fromEntries(
    Object.entries(FONT_FILES).map(([key, file]) => [key, path.join(FONT_DIR, file)]),
  ) as Record<keyof typeof FONT_FILES, string>;
  if (Object.values(paths).every((file) => fs.existsSync(file))) {
    fontSet = paths;
  } else {
    logger.warn('[PaperPdf] Font files are missing; Hindi text will not render', { dir: FONT_DIR });
    fontSet = null;
  }
  return fontSet;
}

// A run of Devanagari, including the spaces and punctuation between its words, so a Hindi
// sentence is one piece instead of switching fonts at every space
const DEVANAGARI_RUN = /[ऀ-ॿ‌‍]+(?:[\s,.;:!?()'"\-–]+[ऀ-ॿ‌‍]+)*/g;

export function splitScripts(text: string): Array<{ text: string; devanagari: boolean }> {
  const parts: Array<{ text: string; devanagari: boolean }> = [];
  let last = 0;
  for (const match of text.matchAll(DEVANAGARI_RUN)) {
    const at = match.index ?? 0;
    if (at > last) parts.push({ text: text.slice(last, at), devanagari: false });
    parts.push({ text: match[0], devanagari: true });
    last = at + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), devanagari: false });
  return parts.length ? parts : [{ text, devanagari: false }];
}

const SECTION_ORDER: QuestionType[] = ['MCQ', 'TRUE_FALSE', 'FILL_BLANK', 'SHORT', 'LONG'];
const SECTION_TITLE: Record<QuestionType, string> = {
  MCQ: 'Multiple Choice Questions',
  TRUE_FALSE: 'True or False',
  FILL_BLANK: 'Fill in the Blanks',
  SHORT: 'Short Answer Questions',
  LONG: 'Long Answer Questions',
};

const MARGIN = 50;

export interface PdfLine {
  readonly kind: 'title' | 'subtitle' | 'meta' | 'rule' | 'section' | 'question' | 'option' | 'answer' | 'explanation';
  readonly text: string;
  readonly size: number;
  readonly bold?: boolean;
  readonly align?: 'left' | 'center';
  readonly indent?: number;
  /** Space after the line */
  readonly gap?: number;
}

/**
 * What the page says, line by line, before any drawing. Kept apart from the renderer so it can be
 * tested: the student version must contain no answers, and PDF text is not searchable.
 */
export function layoutPaper(input: PaperPdfInput): PdfLine[] {
  const totalMarks = input.questions.reduce((sum, q) => sum + q.marks, 0);
  const date = (input.date ?? new Date()).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });

  const lines: PdfLine[] = [
    { kind: 'title', text: input.instituteName, size: 17, bold: true, align: 'center', gap: 2 },
    {
      kind: 'subtitle',
      text: input.withAnswers ? `${input.title} - Answer Key` : input.title,
      size: 14,
      bold: true,
      align: 'center',
      gap: 2,
    },
    { kind: 'meta', text: [input.subject, input.topic].filter(Boolean).join(' - '), size: 11, align: 'center', gap: 6 },
    { kind: 'meta', text: `Maximum marks: ${totalMarks}        Date: ${date}`, size: 10, gap: 4 },
    { kind: 'rule', text: '', size: 0 },
  ];

  let number = 0;
  for (const type of SECTION_ORDER) {
    const group = input.questions.filter((q) => q.type === type);
    if (group.length === 0) continue;

    lines.push({ kind: 'section', text: SECTION_TITLE[type], size: 12, bold: true, gap: 4 });
    for (const q of group) {
      number += 1;
      const marks = q.marks === 1 ? '1 mark' : `${q.marks} marks`;
      lines.push({ kind: 'question', text: `${number}. ${q.text}  [${marks}]`, size: 11, gap: q.options ? 1 : 5 });
      q.options?.forEach((option, i) => {
        lines.push({ kind: 'option', text: `${'ABCD'[i]}) ${option}`, size: 10.5, indent: 18, gap: i === 3 ? 5 : 0 });
      });
      if (input.withAnswers) {
        const answer =
          q.type === 'MCQ' && q.options ? `${q.answer}) ${q.options['ABCD'.indexOf(q.answer)] ?? ''}` : q.answer;
        lines.push({ kind: 'answer', text: `Answer: ${answer}`, size: 10, bold: true, indent: 18, gap: q.explanation ? 0 : 6 });
        if (q.explanation) lines.push({ kind: 'explanation', text: q.explanation, size: 9.5, indent: 18, gap: 6 });
      }
    }
  }
  return lines;
}

/** Renders the paper; the buffer is a complete PDF. Questions are grouped by type, numbered through. */
export async function renderPaperPdf(input: PaperPdfInput): Promise<Buffer> {
  const fonts = loadFonts();
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true, info: { Title: input.title } });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  if (fonts) {
    doc.registerFont('Latin', fonts.latin);
    doc.registerFont('Latin-Bold', fonts.latinBold);
    doc.registerFont('Deva', fonts.deva);
    doc.registerFont('Deva-Bold', fonts.devaBold);
  }

  /** Writes text that may mix Latin and Devanagari, switching fonts between the runs */
  const write = (line: PdfLine) => {
    const parts = splitScripts(line.text);
    doc.fontSize(line.size);
    parts.forEach((part, i) => {
      const name = fonts
        ? `${part.devanagari ? 'Deva' : 'Latin'}${line.bold ? '-Bold' : ''}`
        : line.bold
          ? 'Helvetica-Bold'
          : 'Helvetica';
      doc.font(name).text(part.text, {
        continued: i < parts.length - 1,
        align: line.align ?? 'left',
        indent: line.indent ?? 0,
        paragraphGap: i === parts.length - 1 ? (line.gap ?? 0) : 0,
      });
    });
  };

  for (const line of layoutPaper(input)) {
    if (line.kind === 'rule') {
      doc.moveTo(MARGIN, doc.y).lineTo(doc.page.width - MARGIN, doc.y).lineWidth(0.7).stroke();
      doc.moveDown(0.8);
    } else if (line.text) {
      write(line);
    }
  }

  // ---- page numbers (written last, when the page count is known)
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // otherwise writing in the margin starts a new page
    doc.font(fonts ? 'Latin' : 'Helvetica').fontSize(8.5).text(
      `Page ${i + 1} of ${range.count}`,
      MARGIN,
      doc.page.height - 32,
      { width: doc.page.width - MARGIN * 2, align: 'center' },
    );
    doc.page.margins.bottom = bottom;
  }

  doc.end();
  return finished;
}
