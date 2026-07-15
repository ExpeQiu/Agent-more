/**
 * ILLMAdapter Interface — P1-T05
 * 所有 LLM Adapter 必须实现的统一接口
 */

import {
  LLMCallOptions,
  LLMMessage,
  LLMResponse,
  LLMStreamChunk,
  LLMProvider,
  AdapterConfig,
} from './types.js';

export type {
  LLMCallOptions,
  LLMMessage,
  LLMResponse,
  LLMStreamChunk,
  LLMProvider,
  AdapterConfig,
};

/**
 * Streaming callback type
 */
export type StreamHandler = (chunk: LLMStreamChunk) => void | Promise<void>;

export interface ILLMAdapter {
  /** Provider identifier */
  readonly provider: LLMProvider;

  /** Human-readable name */
  readonly name: string;

  /** Supported models by this adapter */
  readonly supportedModels: string[];

  /**
   * Synchronous (non-streaming) chat completion
   */
  complete(options: LLMCallOptions): Promise<LLMResponse>;

  /**
   * Streaming chat completion — calls handler with each chunk
   */
  completeStream(
    options: LLMCallOptions,
    onChunk: StreamHandler
  ): Promise<LLMResponse>;

  /**
   * Validate that the adapter is properly configured
   */
  validateConfig(): Promise<{ valid: boolean; error?: string }>;

  /**
   * Health check — verifies API connectivity
   */
  ping(): Promise<boolean>;
}
