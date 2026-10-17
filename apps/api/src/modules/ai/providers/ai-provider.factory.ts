import { AiProviderType } from '@vargly/types';
import {
  IAiProvider,
  IAiProviderFactory,
} from './ai-provider.interface.js';
import { OpenAiAdapter } from './openai.adapter.js';
import { ClaudeAiAdapter } from './claude.adapter.js';
import { GeminiAiAdapter } from './gemini.adapter.js';
import { GroqAiAdapter } from './groq.adapter.js';
import { MockAiProvider } from './mock-ai.provider.js';
import { envConfig } from '../../../config/env.config.js';

export class AiProviderFactory implements IAiProviderFactory {
  private readonly providers: Map<AiProviderType, IAiProvider> = new Map();

  public constructor(customProviders?: Partial<Record<AiProviderType, IAiProvider>>) {
    this.providers.set(AiProviderType.OPENAI, customProviders?.OPENAI || new OpenAiAdapter());
    this.providers.set(AiProviderType.CLAUDE, customProviders?.CLAUDE || new ClaudeAiAdapter());
    this.providers.set(AiProviderType.GEMINI, customProviders?.GEMINI || new GeminiAiAdapter());
    this.providers.set(AiProviderType.GROQ, customProviders?.GROQ || new GroqAiAdapter());
  }

  public getProvider(providerType?: AiProviderType): IAiProvider {
    if (providerType && this.providers.has(providerType)) {
      return this.providers.get(providerType)!;
    }
    // Groq first: its free tier is what keeps AI features affordable while Vargly is small
    if (envConfig.get('GROQ_API_KEY')) {
      return this.providers.get(AiProviderType.GROQ) || new MockAiProvider();
    }
    if (envConfig.get('GEMINI_API_KEY')) {
      return this.providers.get(AiProviderType.GEMINI) || new MockAiProvider();
    }
    if (envConfig.get('OPENAI_API_KEY')) {
      return this.providers.get(AiProviderType.OPENAI) || new MockAiProvider();
    }
    if (envConfig.get('ANTHROPIC_API_KEY')) {
      return this.providers.get(AiProviderType.CLAUDE) || new MockAiProvider();
    }
    return this.providers.get(AiProviderType.GEMINI) || new MockAiProvider();
  }
}
