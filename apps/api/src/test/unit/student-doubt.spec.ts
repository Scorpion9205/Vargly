import { describe, expect, it, vi } from 'vitest';
import { AiProviderType } from '@vargly/types';
import { InsufficientAiCreditsError } from '../../modules/ai/ai.service.js';
import { AiProviderError } from '../../modules/ai/providers/ai-provider.interface.js';
import { buildDoubtPrompt, doubtSchema, DOUBT_CREDITS, StudentDoubtService } from '../../modules/student-portal/student-doubt.service.js';
import type { PortalStudent } from '../../modules/student-portal/student-portal.repository.js';

const student: PortalStudent = {
  id: 's1',
  coachingId: 'c1',
  name: 'Riya Verma',
  rollNumber: null,
  phone: null,
  email: null,
  joiningDate: new Date('2026-04-01'),
  loginId: 'RIYA-4821',
  instituteName: 'Sharma Classes',
};

const reply = (content: string, creditsDeducted = DOUBT_CREDITS) => ({
  content,
  feature: 'student.doubt',
  provider: AiProviderType.GROQ,
  model: 'm',
  promptTokens: 1,
  completionTokens: 1,
  creditsDeducted,
  isCached: false,
  balanceRemaining: 10,
});

function setup(generate: (...args: any[]) => Promise<any>) {
  const ai = { generateCompletion: vi.fn(generate), refundCredits: vi.fn(async () => undefined) };
  return { ai, service: new StudentDoubtService(ai as any) };
}

describe('asking the AI a doubt', () => {
  it('answers, charging one credit to the institute and telling the model it is a tutor', async () => {
    const { ai, service } = setup(async () => reply('  Speed is distance divided by time.  '));
    const result = await service.ask(student, { question: 'What is speed?' }, 'u1', ['Physics']);

    expect(result).toEqual({ answer: 'Speed is distance divided by time.' });
    const [dto, coachingId, userId, , credits] = ai.generateCompletion.mock.calls[0];
    expect(coachingId).toBe('c1');
    expect(userId).toBe('u1');
    expect(credits).toBe(DOUBT_CREDITS);
    expect(dto.feature).toBe('student.doubt');
    expect(dto.systemPrompt).toMatch(/tutor/i);
    expect(dto.prompt).toContain('Physics');
    expect(dto.prompt).toContain('What is speed?');
  });

  it('prefers the subject the student picked over their batch subjects', () => {
    expect(buildDoubtPrompt({ question: 'why?', subject: 'Chemistry' }, ['Physics'])).toContain('Subject: Chemistry');
    expect(buildDoubtPrompt({ question: 'why?', subject: 'Chemistry' }, ['Physics'])).not.toContain('Physics');
  });

  it('refunds and says so when the AI sent nothing', async () => {
    const { ai, service } = setup(async () => reply('   '));
    await expect(service.ask(student, { question: 'What is speed?' })).rejects.toMatchObject({ code: 'AI_BAD_RESPONSE' });
    expect(ai.refundCredits).toHaveBeenCalledWith('c1', DOUBT_CREDITS);
  });

  it('does not tell a student about the institute\'s empty wallet', async () => {
    const { service } = setup(async () => {
      throw new InsufficientAiCreditsError(0, 1);
    });
    const error: any = await service.ask(student, { question: 'What is speed?' }).catch((e) => e);
    expect(error).toMatchObject({ code: 'DOUBTS_UNAVAILABLE', statusCode: 503 });
    expect(error.message).not.toMatch(/credit/i);
  });

  it('asks the student to wait when the shared AI tier is busy, and hides other provider errors', async () => {
    const busy = setup(async () => {
      throw new AiProviderError('Groq API request failed (429)', 429);
    });
    await expect(busy.service.ask(student, { question: 'What is speed?' })).rejects.toMatchObject({ code: 'AI_BUSY' });

    const broken = setup(async () => {
      throw new Error('secret provider detail');
    });
    const error: any = await broken.service.ask(student, { question: 'What is speed?' }).catch((e) => e);
    expect(error.code).toBe('AI_UNAVAILABLE');
    expect(error.message).not.toContain('secret');
  });
});

describe('the doubt a student may send', () => {
  it('needs a few words, keeps it short, and takes nothing extra', () => {
    expect(doubtSchema.safeParse({ question: 'a' }).success).toBe(false);
    expect(doubtSchema.safeParse({ question: 'x'.repeat(1001) }).success).toBe(false);
    expect(doubtSchema.safeParse({ question: 'What is speed?', coachingId: 'other' }).success).toBe(false);
    expect(doubtSchema.parse({ question: '  What is speed?  ' }).question).toBe('What is speed?');
  });
});
