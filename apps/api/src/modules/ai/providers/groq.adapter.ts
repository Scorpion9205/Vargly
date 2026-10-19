import { AiProviderType } from '@vargly/types';
import { OpenAiAdapter } from './openai.adapter.js';
import { envConfig } from '../../../config/env.config.js';

/**
 * Groq runs open models (Llama) behind OpenAI's chat-completions API, with a free tier that
 * needs no card. The free tier's limits are shared by every institute using the key, so this is
 * the default while Vargly is small; set GROQ_API_KEY and, later, switch to a paid model by
 * changing AI_MODEL_GROQ or the provider order in AiProviderFactory.
 */
export class GroqAiAdapter extends OpenAiAdapter {
  public constructor(apiKey: string = (envConfig.get('GROQ_API_KEY') as string | undefined) || '') {
    super(apiKey, 'https://api.groq.com/openai/v1', {
      providerType: AiProviderType.GROQ,
      label: 'Groq',
      keyName: 'GROQ_API_KEY',
      defaultModel: envConfig.get('AI_MODEL_GROQ'),
    });
  }
}
