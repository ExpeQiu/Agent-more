/**
 * LLM Adapters — P1-T05
 * ILLMAdapter interface + OpenAI + Anthropic + Dify implementations
 * + LLMProviderFactory for core ILLMProvider integration
 */

export {
  // Types
  type LLMMessage,
  type LLMToolCall,
  type LLMTool,
  type LLMStreamChunk,
  type LLMResponse,
  type LLMCallOptions,
  type LLMProvider,
  type AdapterConfig,
} from './types.js';

export {
  // StreamHandler is defined in adapter.interface
  type StreamHandler,
} from './adapter.interface.js';

export {
  // Interface
  type ILLMAdapter,
} from './adapter.interface.js';

export {
  // Implementations
  OpenAIAdapter,
} from './openai.adapter.js';

export {
  AnthropicAdapter,
} from './anthropic.adapter.js';

export {
  DifyAdapter,
  type DifyConfig,
} from './dify.adapter.js';

export {
  LLMProviderFactory,
} from './llm-provider-factory.js';

// ─── Factory ───────────────────────────────────────────────────────────────

import { OpenAIAdapter } from './openai.adapter.js';
import { AnthropicAdapter } from './anthropic.adapter.js';
import { DifyAdapter } from './dify.adapter.js';
import type { AdapterConfig, ILLMAdapter } from './adapter.interface.js';
import type { DifyConfig } from './dify.adapter.js';

export type { ILLMProvider } from '../../core/src/types/llm.js';

/**
 * Create an LLM adapter by provider name
 */
export function createAdapter(
  provider: 'openai' | 'anthropic' | 'dify',
  config: AdapterConfig | DifyConfig
): ILLMAdapter {
  switch (provider) {
    case 'openai':
      return new OpenAIAdapter(config);
    case 'anthropic':
      return new AnthropicAdapter(config);
    case 'dify':
      return new DifyAdapter(config as DifyConfig);
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

/**
 * Validate all adapters at startup
 */
export async function validateAdapters(
  configs: Record<string, AdapterConfig | DifyConfig>
): Promise<Record<string, { valid: boolean; error?: string }>> {
  const results: Record<string, { valid: boolean; error?: string }> = {};

  for (const [name, config] of Object.entries(configs)) {
    try {
      const adapter = createAdapter(config.provider as 'openai' | 'anthropic' | 'dify', config);
      results[name] = await adapter.validateConfig();
    } catch (err) {
      results[name] = { valid: false, error: String(err) };
    }
  }

  return results;
}
