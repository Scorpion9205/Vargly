import { AiProviderType } from '@vargly/types';
import {
  AiCompletionOptions,
  AiCompletionResult,
  AiProviderError,
  IAiProvider,
} from './ai-provider.interface.js';
import { envConfig } from '../../../config/env.config.js';
import { logger } from '../../../common/logger/logger.service.js';
import { MockAiProvider } from './mock-ai.provider.js';

/** What differs between services that speak OpenAI's chat-completions protocol */
export interface OpenAiCompatibleProfile {
  readonly providerType: AiProviderType;
  readonly label: string;
  /** Name of the environment variable holding the key, for error messages */
  readonly keyName: string;
  readonly defaultModel: string;
}

const OPENAI_PROFILE: OpenAiCompatibleProfile = {
  providerType: AiProviderType.OPENAI,
  label: 'OpenAI',
  keyName: 'OPENAI_API_KEY',
  defaultModel: envConfig.get('AI_MODEL_OPENAI'),
};

/**
 * OpenAI's chat-completions API. Groq and others use the same protocol, so they are this class
 * with another base URL, key and model (see GroqAiAdapter).
 */
export class OpenAiAdapter implements IAiProvider {
  public readonly providerType: AiProviderType;
  private readonly defaultModel: string;
  private readonly fallbackMock = new MockAiProvider();

  public constructor(
    private readonly apiKey: string = (envConfig.get('OPENAI_API_KEY') as string | undefined) || '',
    private readonly baseUrl: string = 'https://api.openai.com/v1',
    private readonly profile: OpenAiCompatibleProfile = OPENAI_PROFILE,
  ) {
    this.providerType = profile.providerType;
    this.defaultModel = profile.defaultModel;
  }

  public async generateCompletion(
    options: AiCompletionOptions,
  ): Promise<AiCompletionResult> {
    const { label, keyName } = this.profile;
    if (!this.apiKey) {
      // A mock answer in production would be shown to parents and charged as credits
      if (envConfig.get('NODE_ENV') === 'production') {
        throw new Error(`${keyName} is not configured`);
      }
      logger.warn(`[OpenAiAdapter] ${keyName} not configured. Falling back to MockAiProvider`);
      return this.fallbackMock.generateCompletion(options);
    }

    const model = options.model || this.defaultModel;
    const messages: Array<{ role: string; content: string }> = [];

    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: options.prompt });

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 1000,
          // The reply is one JSON object (the prompt must say so); no prose around it
          ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new AiProviderError(`${label} API request failed (${response.status}): ${errorBody}`, response.status);
      }

      const data = (await response.json()) as any;
      const choice = data.choices?.[0];
      const content = choice?.message?.content || '';
      const usage = data.usage || {};

      return {
        content,
        provider: this.providerType,
        model,
        promptTokens: usage.prompt_tokens || Math.ceil(options.prompt.length / 4),
        completionTokens: usage.completion_tokens || Math.ceil(content.length / 4),
        totalTokens: usage.total_tokens || 0,
      };
    } catch (err) {
      logger.error(`[OpenAiAdapter] Error calling ${label} API:`, err);
      throw err;
    }
  }
}
