import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AiProviderType } from '@vargly/types';
import { GroqAiAdapter } from '../../modules/ai/providers/groq.adapter.js';
import { OpenAiAdapter } from '../../modules/ai/providers/openai.adapter.js';
import { AiProviderFactory } from '../../modules/ai/providers/ai-provider.factory.js';
import { MockAiProvider } from '../../modules/ai/providers/mock-ai.provider.js';
import { envConfig } from '../../config/env.config.js';
import { EventBus } from '../../events/event-bus.js';
import { NotificationSubscribers } from '../../modules/notifications/notification.subscribers.js';
import type { NotificationService } from '../../modules/notifications/notification.service.js';
import { createHomeworkCreatedEvent } from '../../modules/homework/homework.events.js';
import { createPaperSharedEvent } from '../../modules/papers/paper.events.js';
import { renderTemplate } from '../../modules/notifications/whatsapp-templates.js';
import { buildUserPrompt, parseGeneratedQuestions } from '../../modules/papers/question-generator.js';

const okResponse = (content: string) => ({
  ok: true,
  json: async () => ({ choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } }),
});

afterEach(() => vi.restoreAllMocks());

describe('Groq', () => {
  it('speaks OpenAI\'s protocol to Groq with its own key and model, and asks for JSON when told to', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('{"questions":[]}'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new GroqAiAdapter('groq-key').generateCompletion({ prompt: 'p', systemPrompt: 's', jsonMode: true });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer groq-key');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: 'llama-3.3-70b-versatile', response_format: { type: 'json_object' } });
    expect(body.messages).toEqual([{ role: 'system', content: 's' }, { role: 'user', content: 'p' }]);
    expect(result).toMatchObject({ provider: AiProviderType.GROQ, model: 'llama-3.3-70b-versatile', totalTokens: 30 });
  });

  it('does not ask for JSON unless told to, and OpenAI keeps working as before', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('hello'));
    vi.stubGlobal('fetch', fetchMock);

    await new OpenAiAdapter('openai-key').generateCompletion({ prompt: 'hi' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(JSON.parse(init.body)).not.toHaveProperty('response_format');
  });

  it('names the provider when it fails, so the logs and the error say which one', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => 'rate limit' }));
    await expect(new GroqAiAdapter('k').generateCompletion({ prompt: 'x' })).rejects.toThrow('Groq API request failed (429)');
  });

  it('is the provider chosen when its key is set, ahead of the others', () => {
    const real = envConfig.get.bind(envConfig);
    vi.spyOn(envConfig, 'get').mockImplementation(((key: string) =>
      key === 'GROQ_API_KEY' || key === 'GEMINI_API_KEY' ? 'a-key' : real(key as never)) as never);

    expect(new AiProviderFactory().getProvider().providerType).toBe(AiProviderType.GROQ);
    expect(new AiProviderFactory().getProvider(AiProviderType.GEMINI).providerType).toBe(AiProviderType.GEMINI);
  });
});

describe('the mock provider, for trying the paper studio without a key', () => {
  it('returns questions in exactly the sections the prompt asks for, in a form the parser accepts', async () => {
    const prompt = buildUserPrompt(
      { subject: 'Science', topic: 'Light', language: 'en', difficulty: 'mixed' },
      [{ type: 'MCQ', count: 3, marks: 1 }, { type: 'TRUE_FALSE', count: 2, marks: 1 }, { type: 'LONG', count: 1, marks: 5 }],
    );
    const { content } = await new MockAiProvider().generateCompletion({ prompt, jsonMode: true });

    const questions = parseGeneratedQuestions(content, { MCQ: 1, TRUE_FALSE: 1, LONG: 5 });
    expect(questions.map((q) => q.type)).toEqual(['MCQ', 'MCQ', 'MCQ', 'TRUE_FALSE', 'TRUE_FALSE', 'LONG']);
    expect(questions[0].text).toContain('GROQ_API_KEY');
  });
});

describe('WhatsApp messages for papers', () => {
  let eventBus: EventBus;
  let enqueue: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    eventBus = new EventBus();
    enqueue = vi.fn().mockResolvedValue({ id: 'n1' });
    NotificationSubscribers.register(
      eventBus,
      { enqueueNotification: enqueue } as unknown as NotificationService,
      async () => ({ receiptPrefix: 'RCT', whatsappEnabled: true }),
    );
  });

  const homework = (attachmentUrl?: string) =>
    createHomeworkCreatedEvent(
      { homeworkId: 'hw-1', coachingId: 'c1', batchId: 'b1', title: 'Light worksheet', dueDate: new Date('2026-11-01'), attachmentUrl },
      'corr',
    );

  it('sends homework with a file as one message that carries the download link', async () => {
    await eventBus.publish(homework('https://api.vargly.in/api/v1/papers/dl/abc'));

    expect(enqueue).toHaveBeenCalledTimes(1);
    const [dto] = enqueue.mock.calls[0];
    expect(dto).toMatchObject({
      recipient: 'batch:b1:contacts',
      templateName: 'homework_with_file',
      templateVariables: { title: 'Light worksheet', dueDate: '1 Nov 2026', link: 'https://api.vargly.in/api/v1/papers/dl/abc' },
      idempotencyKey: 'homework.created.hw-1',
    });
    expect(dto.content).toContain('https://api.vargly.in/api/v1/papers/dl/abc');
  });

  it('keeps plain homework on the plain template', async () => {
    await eventBus.publish(homework(undefined));
    expect(enqueue.mock.calls[0][0]).toMatchObject({ templateName: 'homework_assigned', templateVariables: { title: 'Light worksheet', dueDate: '1 Nov 2026' } });
    expect(enqueue.mock.calls[0][0].templateVariables).not.toHaveProperty('link');
  });

  it('sends a practice paper to the batch\'s parents once, however often the event is replayed', async () => {
    await eventBus.publish(
      createPaperSharedEvent({ shareId: 's1', paperId: 'p1', coachingId: 'c1', batchId: 'b1', title: 'Light worksheet', link: 'https://x.in/dl/t' }, 'corr'),
    );

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0][0]).toMatchObject({
      recipient: 'batch:b1:contacts',
      recipientType: 'PARENT',
      templateName: 'paper_shared',
      templateVariables: { title: 'Light worksheet', link: 'https://x.in/dl/t' },
      idempotencyKey: 'paper.shared.s1',
    });
  });

  it('reads as plain sentences, with the link inside the text and not first or last in the template', () => {
    const vars = { institute: 'Sharma Classes', student: 'Riya', title: 'Light worksheet', dueDate: '1 Nov 2026', link: 'https://x.in/dl/t' };
    expect(renderTemplate('paper_shared', vars)).toBe(
      'New practice paper from Sharma Classes for Riya: Light worksheet. Download it here: https://x.in/dl/t Thank you.',
    );
    expect(renderTemplate('homework_with_file', vars)).toBe(
      'New homework from Sharma Classes for Riya: Light worksheet. Please complete it by 1 Nov 2026. Download the paper here: https://x.in/dl/t Thank you.',
    );
  });
});
