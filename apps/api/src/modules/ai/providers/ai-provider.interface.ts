import { AiProviderType } from '@vargly/types';

export interface AiCompletionOptions {
  readonly prompt: string;
  readonly systemPrompt?: string;
  readonly model?: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
  /** The reply must be a single JSON object. Providers without such a mode ignore it. */
  readonly jsonMode?: boolean;
}

export interface AiCompletionResult {
  readonly content: string;
  readonly provider: AiProviderType;
  readonly model: string;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

export interface IAiProvider {
  readonly providerType: AiProviderType;
  generateCompletion(options: AiCompletionOptions): Promise<AiCompletionResult>;
}

export interface IAiProviderFactory {
  getProvider(providerType?: AiProviderType): IAiProvider;
}
