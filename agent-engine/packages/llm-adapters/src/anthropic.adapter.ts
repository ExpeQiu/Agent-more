/**
 * Anthropic Adapter — P1-T05
 * Supports Claude models via Anthropic API
 */

import {
  ILLMAdapter,
  LLMCallOptions,
  LLMMessage,
  LLMResponse,
  LLMStreamChunk,
  StreamHandler,
  AdapterConfig,
  LLMProvider,
} from './adapter.interface.js';

export class AnthropicAdapter implements ILLMAdapter {
  readonly provider: LLMProvider = 'anthropic';
  readonly name = 'Anthropic';
  readonly supportedModels = [
    'claude-3-5-sonnet-latest',
    'claude-3-5-haiku-latest',
    'claude-3-opus-latest',
    'claude-3-sonnet-latest',
    'claude-3-haiku-latest',
  ];

  private apiKey: string;
  private baseUrl: string;
  private timeout: number;
  private maxRetries: number;

  constructor(config: AdapterConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? 'https://api.anthropic.com/v1';
    this.timeout = config.timeout ?? 60000;
    this.maxRetries = config.maxRetries ?? 3;
  }

  async complete(options: LLMCallOptions): Promise<LLMResponse> {
    const body = this.buildRequestBody(options, false);
    const response = await this.fetchWithRetry(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: this.headers(options.model),
      body: JSON.stringify(body),
    });

    const data = await response.json() as {
      content: Array<{ type: string; text?: string }>;
      stop_reason: string;
      usage: { input_tokens: number; output_tokens: number };
    };

    const text = data.content.find((c) => c.type === 'text')?.text ?? '';

    return {
      content: text,
      finishReason: data.stop_reason,
      usage: {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens,
      },
      raw: data,
    };
  }

  async completeStream(
    options: LLMCallOptions,
    onChunk: StreamHandler
  ): Promise<LLMResponse> {
    const body = this.buildRequestBody(options, true);
    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: this.headers(options.model, true),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${error}`);
    }

    if (!response.body) {
      throw new Error('Anthropic response body is null');
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
        const lines = chunk.split('\n').filter((line) => line.trim() !== '');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') continue;

          try {
            const parsed = JSON.parse(raw) as {
              type: string;
              index?: number;
              delta?: { type: string; text?: string };
              content_block?: { type: string; text?: string };
              usage?: { input_tokens: number; output_tokens: number };
              stop_reason?: string;
            };

            if (parsed.type === 'content_block_delta') {
              const text = parsed.delta?.text ?? '';
              fullContent += text;
              await onChunk({
                id: `anthropic-${Date.now()}`,
                delta: text,
                finishReason: undefined,
              });
            } else if (parsed.type === 'message_delta' && parsed.usage) {
              usage = {
                promptTokens: parsed.usage.input_tokens,
                completionTokens: parsed.usage.output_tokens,
                totalTokens: parsed.usage.input_tokens + parsed.usage.output_tokens,
              };
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return {
      content: fullContent,
      usage,
      raw: { streamed: true },
    };
  }

  async validateConfig(): Promise<{ valid: boolean; error?: string }> {
    if (!this.apiKey) {
      return { valid: false, error: 'Anthropic API key is required' };
    }
    if (!this.apiKey.startsWith('sk-')) {
      return { valid: false, error: 'Invalid Anthropic API key format' };
    }
    return { valid: true };
  }

  async ping(): Promise<boolean> {
    try {
      // Anthropic doesn't have a dedicated ping endpoint, so we do a cheap models call
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-latest',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        }),
        signal: AbortSignal.timeout(5000),
      });
      // 400 means auth worked but invalid request — that's fine for ping
      return response.ok || response.status === 400;
    } catch {
      return false;
    }
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private buildRequestBody(
    options: LLMCallOptions,
    stream: boolean
  ): Record<string, unknown> {
    const systemMessage = options.messages.find((m) => m.role === 'system');
    const conversationMessages = options.messages.filter((m) => m.role !== 'system');

    const body: Record<string, unknown> = {
      model: options.model,
      max_tokens: options.maxTokens ?? 4096,
      messages: conversationMessages.map(this.mapMessage),
      stream,
    };

    if (options.temperature !== undefined) {
      body.temperature = options.temperature;
    }

    if (systemMessage) {
      body.system = systemMessage.content;
    }

    return body;
  }

  private mapMessage(msg: LLMMessage): { role: string; content: string } {
    return {
      role: msg.role === 'tool' ? 'assistant' : msg.role,
      content: msg.content,
    };
  }

  private headers(model: string, stream = false): Record<string, string> {
    const headers: Record<string, string> = {
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    };

    if (stream) {
      headers.prefer = 'run=smth'; // hint for streaming
    }

    return headers;
  }

  private async fetchWithRetry(
    url: string,
    init: RequestInit,
    retries = this.maxRetries
  ): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          ...init,
          signal: AbortSignal.timeout(this.timeout),
        });

        if (response.status === 429 || response.status >= 500) {
          if (attempt < retries) {
            const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
            await this.sleep(delay);
            continue;
          }
        }

        return response;
      } catch (err) {
        lastError = err as Error;
        if (attempt < retries) {
          await this.sleep(Math.min(1000 * Math.pow(2, attempt), 5000));
        }
      }
    }

    throw lastError ?? new Error('Fetch failed after retries');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
