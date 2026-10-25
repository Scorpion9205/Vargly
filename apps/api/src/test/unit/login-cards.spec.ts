import { describe, expect, it } from 'vitest';
import { cardLines, CARDS_PER_PAGE, renderLoginCardsPdf } from '../../modules/student-logins/login-card-pdf.js';
import { HomeworkMapper } from '../../modules/homework/homework.mapper.js';

const input = {
  instituteName: 'Sharma Classes',
  instituteCode: 'sharma-classes',
  signInUrl: 'https://vargly.in/login',
  cards: [{ name: 'Riya Verma', loginId: 'RIYA-4821', temporaryPassword: 'Kx7mP2qR9a' }],
};

describe('login cards', () => {
  it('say what a student needs to sign in: ID, password, institute code, and where', () => {
    const lines = cardLines(input, input.cards[0]!);
    expect(lines).toContain('Student ID: RIYA-4821');
    expect(lines).toContain('Password: Kx7mP2qR9a');
    expect(lines).toContain('Institute code: sharma-classes');
    expect(lines).toContain('Sign in at https://vargly.in/login');
    expect(lines[0]).toBe('Sharma Classes');
  });

  it('make a real PDF, one page for eight students and a second page for a ninth', async () => {
    const cards = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Student ${i}`, loginId: `KID-${1000 + i}`, temporaryPassword: 'Kx7mP2qR9a' }));
    const pages = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;

    const one = await renderLoginCardsPdf({ ...input, cards: cards(CARDS_PER_PAGE) });
    expect(one.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pages(one)).toBe(1);
    expect(pages(await renderLoginCardsPdf({ ...input, cards: cards(CARDS_PER_PAGE + 1) }))).toBe(2);
  });

  it('write a Hindi name without failing', async () => {
    const pdf = await renderLoginCardsPdf({ ...input, cards: [{ name: 'रिया वर्मा', loginId: 'STU-1234', temporaryPassword: 'Kx7mP2qR9a' }] });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

describe('homework mapper', () => {
  it('carries how many students marked it done', () => {
    const base = { id: 'h1', coachingId: 'c1', batchId: 'b1', title: 'T', description: 'D', dueDate: '2026-10-28', attachmentUrl: null, createdAt: new Date(), updatedAt: new Date() };
    expect(HomeworkMapper.toResponseDto({ ...base, _count: { completions: 7 } }).completedCount).toBe(7);
    expect(HomeworkMapper.toResponseDto(base).completedCount).toBe(0);
  });
});
