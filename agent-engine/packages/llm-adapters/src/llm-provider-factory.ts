/**
 * LLM Provider Factory — P1-T05
 * Bridges @agent-engine/llm-adapters → packages/core ILLMProvider interface
 *
 * Used by AgentOrchestrator via AgentDependencies.llmProviderFactory
 */

import type { ChatMessage, Tool, ILLMProvider, LLMConfig, LLMResponse } from '../../core/src/types/llm.js';
import {
  OpenAIAdapter,
  AnthropicAdapter,
  DifyAdapter,
  type DifyConfig,
  type LLMCallOptions,
  type AdapterConfig,
} from './index.js';

/**
 * Adapter → ILLMProvider bridge
 * Wraps our ILLMAdapter to satisfy the core ILLMProvider interface
 */
class AdapterBridge implements ILLMProvider {
  constructor(
    private adapter: OpenAIAdapter | AnthropicAdapter | DifyAdapter,
    private model: string
  ) {}

  async chat(
    messages: ChatMessage[],
    config: LLMConfig,
    tools?: Tool[]
  ): Promise<LLMResponse> {
    const options: LLMCallOptions = {
      model: config.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        name: m.name,
        toolCallId: m.tool_call_id,
      })),
      tools: tools as any,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      topP: config.topP,
      stream: config.stream,
    };

    if (this.adapter.provider === 'anthropic') {
      // Anthropic doesn't support topP
      delete (options as any).topP;
    }

    const result = await this.adapter.complete(options);

    // Map tool calls if present
    const assistantMsg = messages.find((m) => m.role === 'assistant');
    let toolCalls;
    if (result.raw && typeof result.raw === 'object') {
      const raw = result.raw as Record<string, unknown>;
      // OpenAI returns tool_calls in the response
      if (Array.isArray(raw['choices'])) {
        const choices = raw['choices'] as Array<{ message?: { tool_calls?: unknown[] } }>;
        if (choices[0]?.message?.tool_calls) {
          toolCalls = choices[0].message.tool_calls as LLMResponse['toolCalls'];
        }
      }
    }

    return {
      content: result.content,
      toolCalls,
      usage: result.usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      model: this.model,
      finishReason: (result.finishReason as LLMResponse['finishReason']) ?? 'stop',
    };
  }

  async testConnection(): Promise<boolean> {
    return this.adapter.ping();
  }
}

/**
 * Factory that creates ILLMProvider instances for the AgentOrchestrator
 */
export class LLMProviderFactory {
  /**
   * Create an ILLMProvider from an LLMConfig (as used by AgentOrchestrator)
   */
  create(llmConfig: LLMConfig): ILLMProvider {
    const baseConfig: AdapterConfig = {
      provider: llmConfig.provider as 'openai' | 'anthropic' | 'dify',
      apiKey: llmConfig.apiKey,
      baseUrl: llmConfig.apiBaseUrl,
      timeout: 60000,
      maxRetries: 3,
    };

    let adapter: OpenAIAdapter | AnthropicAdapter | DifyAdapter;

    switch (llmConfig.provider) {
      case 'openai':
        adapter = new OpenAIAdapter(baseConfig);
        break;
      case 'anthropic':
        adapter = new AnthropicAdapter(baseConfig);
        break;
      case 'dify':
        adapter = new DifyAdapter(baseConfig as DifyConfig);
        break;
      default:
        // Fallback to OpenAI for custom providers that use OpenAI-compatible API
        adapter = new OpenAIAdapter({
          ...baseConfig,
          baseUrl: llmConfig.apiBaseUrl ?? 'https://api.openai.com/v1',
        });
    }

    return new AdapterBridge(adapter, llmConfig.model);
  }
}
