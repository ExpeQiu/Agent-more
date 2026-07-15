/**
 * OpenAI Adapter — P1-T05
 */

import {
  ILLMAdapter,
  LLMCallOptions,
  LLMResponse,
  LLMStreamChunk,
  StreamHandler,
  AdapterConfig,
  LLMProvider,
} from './adapter.interface.js';

export class OpenAIAdapter implements ILLMAdapter {
  readonly provider: LLMProvider = 'openai';
  readonly name = 'OpenAI';
  readonly supportedModels = [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'gpt-4',
    'gpt-3.5-turbo',
  ];

  private apiKey: string;
  private baseUrl: string;
  private timeout: number;
  private maxRetries: number;

  constructor(config: AdapterConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? 'https://api.openai.com/v1';
    this.timeout = config.timeout ?? 60000;
    this.maxRetries = config.maxRetries ?? 3;
  }

  async complete(options: LLMCallOptions): Promise<LLMResponse> {
    const body = this.buildRequestBody(options);
    const response = await this.fetchWithRetry(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    const data = await response.json() as {
      choices: Array<{ message: { role: string; content: string }; finish_reason: string }>;
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };

    const choice = data.choices[0];
    return {
      content: choice.message.content ?? '',
      role: choice.message.role,
      finishReason: choice.finish_reason,
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      },
      raw: data,
    };
  }

  async completeStream(
    options: LLMCallOptions,
    onChunk: StreamHandler
  ): Promise<LLMResponse> {
    const body = this.buildRequestBody({ ...options, stream: true });
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${error}`);
    }

    if (!response.body) {
      throw new Error('OpenAI response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let usage: LLMResponse['usage'] | undefined;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter((line) => line.trim() !== '' && line.trim() !== 'data: [DONE]');

        for (const line of lines) {
          const raw = line.replace(/^data: /, '');
          if (!raw || raw === '[DONE]') continue;

          try {
            const parsed = JSON.parse(raw) as {
              id: string;
              choices: Array<{
                delta: { content?: string; role?: string };
                finish_reason?: string;
              }>;
              usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
            };

            const delta = parsed.choices[0]?.delta;
            const content = delta?.content ?? '';
            fullContent += content;

            if (parsed.usage) {
              usage = {
                promptTokens: parsed.usage.prompt_tokens,
                completionTokens: parsed.usage.completion_tokens,
                totalTokens: parsed.usage.total_tokens,
              };
            }

            await onChunk({
              id: parsed.id,
              delta: content,
              role: delta?.role,
              finishReason: parsed.choices[0]?.finish_reason,
            });
          } catch {
            // skip malformed JSON lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return { content: fullContent, usage, raw: { streamed: true } };
  }

  async validateConfig(): Promise<{ valid: boolean; error?: string }> {
    if (!this.apiKey) return { valid: false, error: 'OpenAI API key is required' };
    if (!this.apiKey.startsWith('sk-')) return { valid: false, error: 'Invalid OpenAI API key format' };
    return { valid: true };
  }

  async ping(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch { return false; }
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private buildRequestBody(options: LLMCallOptions): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: options.model,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
    };
    if (options.tools?.length) body.tools = options.tools;
    if (options.topP !== undefined) body.top_p = options.topP;
    return body;
  }

  private headers(): Record<string, string> {
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` };
  }

  private async fetchWithRetry(url: string, init: RequestInit, retries = this.maxRetries): Promise<Response> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, { ...init, signal: AbortSignal.timeout(this.timeout) });
        if (response.status === 429 || response.status >= 500) {
          if (attempt < retries) { await this.sleep(Math.min(1000 * Math.pow(2, attempt), 10000)); continue; }
        }
        return response;
      } catch (err) {
        lastError = err as Error;
        if (attempt < retries) await this.sleep(Math.min(1000 * Math.pow(2, attempt), 5000));
      }
    }
    throw lastError ?? new Error('Fetch failed after retries');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
