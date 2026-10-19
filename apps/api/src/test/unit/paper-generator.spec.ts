import { describe, it, expect, vi } from 'vitest';
import {
  QuestionGenerator,
  buildUserPrompt,
  parseGeneratedQuestions,
  type CompletionService,
} from '../../modules/papers/question-generator.js';

const reply = (questions: unknown[]) => JSON.stringify({ questions });

describe('parseGeneratedQuestions', () => {
  const marks = { MCQ: 1, SHORT: 3, TRUE_FALSE: 1, FILL_BLANK: 1, LONG: 5 } as const;

  it('reads a well-formed reply and gives each question the marks of its section', () => {
    const questions = parseGeneratedQuestions(
      reply([
        { type: 'MCQ', question: 'Which gas do plants take in?', options: ['Oxygen', 'Carbon dioxide', 'Helium', 'Neon'], answer: 'B', explanation: 'Photosynthesis.' },
        { type: 'SHORT', question: 'Define photosynthesis.', answer: 'Making food using light.' },
      ]),
      marks,
    );
    expect(questions).toHaveLength(2);
    expect(questions[0]).toMatchObject({ type: 'MCQ', answer: 'B', marks: 1, explanation: 'Photosynthesis.' });
    expect(questions[1]).toMatchObject({ type: 'SHORT', marks: 3 });
    expect(new Set(questions.map((q) => q.id)).size).toBe(2);
  });

  it('copes with the formats models really produce', () => {
    const questions = parseGeneratedQuestions(
      'Here you go:\n```json\n' +
        reply([
          // option prefixes, a lower-case type with spaces, and the answer written as the option itself
          { type: 'multiple choice', question: 'Capital of India?', options: ['A) Mumbai', 'B) New Delhi', 'C) Kolkata', 'D) Chennai'], answer: 'New Delhi' },
          // answer as "C) text"
          { type: 'MCQ', question: 'Largest planet?', options: ['Mars', 'Earth', 'Jupiter', 'Venus'], answer: 'C) Jupiter' },
          // answer as a number
          { type: 'MCQ', question: 'Smallest prime?', options: ['1', '2', '3', '5'], answer: '2' },
          { type: 'True/False', question: 'The Sun is a star.', answer: 'true' },
          { type: 'fill in the blanks', question: 'Water boils at ___ degrees Celsius.', answer: '100' },
        ]) +
        '\n```\nHope this helps!',
      marks,
    );
    expect(questions.map((q) => q.type)).toEqual(['MCQ', 'MCQ', 'MCQ', 'TRUE_FALSE', 'FILL_BLANK']);
    expect(questions[0]).toMatchObject({ answer: 'B', options: ['Mumbai', 'New Delhi', 'Kolkata', 'Chennai'] });
    expect(questions[1].answer).toBe('C');
    expect(questions[2].answer).toBe('B');
    expect(questions[3].answer).toBe('True');
  });

  it('drops questions that cannot be trusted instead of showing them to a teacher', () => {
    const questions = parseGeneratedQuestions(
      reply([
        { type: 'MCQ', question: 'Only three options?', options: ['a', 'b', 'c'], answer: 'A' },
        { type: 'MCQ', question: 'Answer is not an option?', options: ['a', 'b', 'c', 'd'], answer: 'the moon' },
        { type: 'TRUE_FALSE', question: 'Maybe?', answer: 'perhaps' },
        { type: 'ESSAY', question: 'Unknown type', answer: 'x' },
        { type: 'SHORT', question: '', answer: 'no text' },
        { type: 'SHORT', question: 'Why is the sky blue?', answer: '' },
        { type: 'SHORT', question: 'Name the largest ocean.', answer: 'Pacific' },
      ]),
      marks,
    );
    expect(questions.map((q) => q.text)).toEqual(['Name the largest ocean.']);
  });

  it('removes duplicates, however they are spaced or capitalised', () => {
    const questions = parseGeneratedQuestions(
      reply([
        { type: 'SHORT', question: 'Name  the largest ocean.', answer: 'Pacific' },
        { type: 'SHORT', question: 'name the largest OCEAN.', answer: 'Pacific' },
      ]),
      marks,
    );
    expect(questions).toHaveLength(1);
  });

  it('keeps Hindi text as written', () => {
    const [q] = parseGeneratedQuestions(
      reply([{ type: 'TRUE_FALSE', question: 'सूर्य एक तारा है।', answer: 'सही' }]),
      marks,
    );
    expect(q).toMatchObject({ text: 'सूर्य एक तारा है।', answer: 'True' });
  });

  it('refuses a reply that is not JSON, so the caller can retry', () => {
    expect(() => parseGeneratedQuestions('Sorry, I cannot help with that.', marks)).toThrow();
    expect(() => parseGeneratedQuestions('{"answer": 42}', marks)).toThrow(/no questions/i);
  });
});

describe('buildUserPrompt', () => {
  const brief = { subject: 'Science', topic: 'Photosynthesis', language: 'en', difficulty: 'easy' } as const;
  const sections = [
    { type: 'MCQ', count: 5, marks: 1 },
    { type: 'SHORT', count: 3, marks: 3 },
  ] as const;

  it('lists the sections in the form the mock and the model both read', () => {
    const prompt = buildUserPrompt(brief, sections);
    expect(prompt).toMatch(/^- 5 MCQ$/m);
    expect(prompt).toMatch(/^- 3 SHORT$/m);
    expect(prompt).toContain('Chapter / topic: Photosynthesis');
  });

  it('asks for Hindi in Devanagari or Roman letters as chosen', () => {
    expect(buildUserPrompt({ ...brief, language: 'hi' }, sections)).toContain('Devanagari');
    expect(buildUserPrompt({ ...brief, language: 'hinglish' }, sections)).toContain('Roman letters');
  });

  it('is different every time, so a second request is not answered from the cache', () => {
    expect(buildUserPrompt(brief, sections)).not.toBe(buildUserPrompt(brief, sections));
  });

  it('tells the model which questions already exist', () => {
    const prompt = buildUserPrompt(brief, sections, ['What is chlorophyll?']);
    expect(prompt).toContain('What is chlorophyll?');
  });
});

describe('QuestionGenerator', () => {
  const brief = { subject: 'Science', topic: 'Light', language: 'en', difficulty: 'mixed' } as const;
  const context = { coachingId: 'c1', userId: 'u1' };
  const sections = [{ type: 'SHORT', count: 2, marks: 2 }] as const;
  const good = reply([
    { type: 'SHORT', question: 'What is reflection?', answer: 'Bouncing of light.' },
    { type: 'SHORT', question: 'What is refraction?', answer: 'Bending of light.' },
  ]);

  function fakeAi(contents: string[]) {
    const generateCompletion = vi.fn(async (..._args: unknown[]) => ({ content: contents.shift() ?? '' }));
    const refundCredits = vi.fn(async () => undefined);
    return { ai: { generateCompletion, refundCredits } as unknown as CompletionService, generateCompletion, refundCredits };
  }

  it('asks for JSON and charges once for a good reply', async () => {
    const { ai, generateCompletion, refundCredits } = fakeAi([good]);
    const questions = await new QuestionGenerator(ai).generate(brief, sections, context, 5);

    expect(questions).toHaveLength(2);
    expect(generateCompletion).toHaveBeenCalledTimes(1);
    const [dto, , , , credits] = generateCompletion.mock.calls[0] as [{ jsonMode: boolean; feature: string }, string, string, string, number];
    expect(dto).toMatchObject({ jsonMode: true, feature: 'paper.generate' });
    expect(credits).toBe(5);
    expect(refundCredits).not.toHaveBeenCalled();
  });

  it('retries once on an unreadable reply, and the retry is free', async () => {
    const { ai, generateCompletion, refundCredits } = fakeAi(['not json at all', good]);
    const questions = await new QuestionGenerator(ai).generate(brief, sections, context, 5);

    expect(questions).toHaveLength(2);
    expect(generateCompletion).toHaveBeenCalledTimes(2);
    expect(generateCompletion.mock.calls[0][4]).toBe(5);
    expect(generateCompletion.mock.calls[1][4]).toBe(0);
    expect(refundCredits).not.toHaveBeenCalled();
  });

  it('gives the credits back and fails clearly when both replies are unusable', async () => {
    const { ai, refundCredits } = fakeAi(['nope', reply([{ type: 'MCQ', question: 'Broken', options: ['a'], answer: 'A' }])]);
    await expect(new QuestionGenerator(ai).generate(brief, sections, context, 5)).rejects.toMatchObject({
      code: 'AI_BAD_RESPONSE',
      statusCode: 502,
    });
    expect(refundCredits).toHaveBeenCalledWith('c1', 5);
  });

  it('never returns more than was asked for', async () => {
    const many = reply(
      Array.from({ length: 6 }, (_, i) => ({ type: 'SHORT', question: `Question number ${i}?`, answer: 'x' })),
    );
    const { ai } = fakeAi([many]);
    expect(await new QuestionGenerator(ai).generate(brief, sections, context, 5)).toHaveLength(2);
  });
});
