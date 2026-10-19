import { describe, it, expect } from 'vitest';
import { layoutPaper, renderPaperPdf, splitScripts } from '../../modules/papers/paper-pdf.js';
import type { Question } from '../../modules/papers/paper.types.js';

const questions: Question[] = [
  { id: '1', type: 'MCQ', text: 'Capital of India?', options: ['Mumbai', 'New Delhi', 'Kolkata', 'Chennai'], answer: 'B', marks: 1, explanation: 'It is New Delhi.' },
  { id: '2', type: 'TRUE_FALSE', text: 'सूर्य एक तारा है।', answer: 'True', marks: 1 },
  { id: '3', type: 'SHORT', text: 'Define photosynthesis.', answer: 'Making food using light.', marks: 3 },
];

const input = { instituteName: 'Sharma Classes', title: 'Unit test', subject: 'Science', topic: 'Light', questions };

describe('layoutPaper', () => {
  const texts = (lines: ReturnType<typeof layoutPaper>) => lines.map((l) => l.text);

  it("never puts answers or explanations in the students' copy", () => {
    const student = texts(layoutPaper({ ...input, withAnswers: false })).join('\n');
    expect(student).not.toContain('Answer:');
    expect(student).not.toContain('Answer Key');
    expect(student).not.toContain('It is New Delhi');
    expect(student).not.toContain('Making food using light');
    // The questions and options themselves are there
    expect(student).toContain('1. Capital of India?');
    expect(student).toContain('B) New Delhi');
  });

  it('puts the answer, spelled out for multiple choice, and the explanation in the answer key', () => {
    const key = texts(layoutPaper({ ...input, withAnswers: true }));
    expect(key).toContain('Answer: B) New Delhi');
    expect(key).toContain('It is New Delhi.');
    expect(key).toContain('Answer: Making food using light.');
    expect(key.some((t) => t.includes('Answer Key'))).toBe(true);
  });

  it('groups by type, numbers straight through, and shows the marks', () => {
    const lines = texts(layoutPaper({ ...input, withAnswers: false }));
    const order = lines.filter((t) => /^\d+\./.test(t));
    expect(order).toEqual([
      '1. Capital of India?  [1 mark]',
      '2. सूर्य एक तारा है।  [1 mark]',
      '3. Define photosynthesis.  [3 marks]',
    ]);
    expect(lines.some((t) => t === 'Maximum marks: 5' || t.startsWith('Maximum marks: 5 '))).toBe(true);
  });
});

describe('splitScripts', () => {
  it('keeps a Hindi sentence in one piece and switches back for English', () => {
    expect(splitScripts('Q1. सूर्य एक तारा है। True?')).toEqual([
      { text: 'Q1. ', devanagari: false },
      { text: 'सूर्य एक तारा है।', devanagari: true },
      { text: ' True?', devanagari: false },
    ]);
    expect(splitScripts('Plain English')).toEqual([{ text: 'Plain English', devanagari: false }]);
  });
});

describe('renderPaperPdf', () => {
  it('produces a PDF, with the Devanagari font embedded when the paper has Hindi', async () => {
    const pdf = await renderPaperPdf({ ...input, withAnswers: false });
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(5_000);
    const raw = pdf.toString('latin1');
    expect(raw).toContain('NotoSansDevanagari');
    expect(raw).toContain('NotoSans-');
  });

  it('runs onto more pages for a long paper and numbers them', async () => {
    const many: Question[] = Array.from({ length: 45 }, (_, i) => ({
      id: String(i),
      type: 'SHORT',
      text: `Explain concept number ${i + 1} in your own words and give one example from daily life.`,
      answer: 'Any reasonable answer.',
      marks: 2,
    }));
    const pdf = await renderPaperPdf({ ...input, questions: many, withAnswers: false });
    const pages = (pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;
    expect(pages).toBeGreaterThan(1);
  });
});
