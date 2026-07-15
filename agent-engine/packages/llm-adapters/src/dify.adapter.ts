/**
 * Dify Adapter — P1-T05
 * Supports Dify AI (self-hosted or cloud) chat completion API
 *
 * Dify API reference:
 *   POST /v1/chat-messages — send message, get response
 *   GET  /v1/messages/{conversation_id} — fetch conversation history
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

export interface DifyConfig extends AdapterConfig {
  appId?: string;       // Dify app ID (required for some deployments)
  conversationId?: string; // persistent conversation
  responseMode?: 'blocking' | 'streaming';
}

export class DifyAdapter implements ILLMAdapter {
  readonly provider: LLMProvider = 'dify';
  readonly name = 'Dify';
  readonly supportedModels: string[] = []; // Dify uses its own model routing

  private apiKey: string;
  private baseUrl: string;
  private appId?: string;
  private timeout: number;
  private maxRetries: number;
  private _conversationId?: string;

  constructor(config: DifyConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? 'https://api.dify.ai/v1';
    this.appId = config.appId;
    this.timeout = config.timeout ?? 60000;
    this.maxRetries = config.maxRetries ?? 3;
    this._conversationId = config.conversationId;
  }

  async complete(options: LLMCallOptions): Promise<LLMResponse> {
    // Dify is primarily streaming, but we can collect the full response
    return this.completeStream(options, () => {});
  }

  async completeStream(
    options: LLMCallOptions,
    onChunk: StreamHandler
  ): Promise<LLMResponse> {
    const isStreaming = options.stream ?? true;
    const url = `${this.baseUrl}/chat-messages`;

    const body: Record<string, unknown> = {
      query: options.messages.at(-1)?.content ?? '',
      user: 'agent-engine',
      response_mode: isStreaming ? 'streaming' : 'blocking',
      conversation_id: this._conversationId,
    };

    // Build conversation history (all messages except the last one)
    if (options.messages.length > 1) {
      const history = options.messages
        .slice(0, -1)
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));
      if (history.length > 0) {
        body.history = history;
      }
    }

    if (options.tools && options.tools.length > 0) {
      // Dify doesn't use OpenAI-style tools, but we can pass them in inputs
      body.tools = options.tools.map((t) => t.function.name);
    }

    if (options.temperature !== undefined) {
      body.temperature = options.temperature;
    }

    const response = await this.fetchWithRetry(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Dify API error ${response.status}: ${error}`);
    }

    if (isStreaming) {
      return this.handleStreamingResponse(response, onChunk);
    } else {
      return this.handleBlockingResponse(response);
    }
  }

  async validateConfig(): Promise<{ valid: boolean; error?: string }> {
    if (!this.apiKey) {
      return { valid: false, error: 'Dify API key is required' };
    }
    return { valid: true };
  }

  async ping(): Promise<boolean> {
    try {
      // Dify has no dedicated ping — do a lightweight chat-messages call
      const response = await fetch(`${this.baseUrl}/chat-messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: 'ping',
          user: 'agent-engine-ping',
          response_mode: 'blocking',
          conversation_id: '',
        }),
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  get conversationId(): string | undefined {
    return this._conversationId;
  }

  setConversationId(id: string): void {
    this._conversationId = id;
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private async handleStreamingResponse(
    response: Response,
    onChunk: StreamHandler
  ): Promise<LLMResponse> {
    if (!response.body) throw new Error('Dify response body is null');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let conversationId: string | undefined;
    let messageId: string | undefined;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        // Dify streaming format: one JSON object per line
        const lines = text.split('\n').filter((l) => l.trim() !== '');

        for (const line of lines) {
          try {
            const event = JSON.parse(line) as {
              event: string;
              conversation_id?: string;
              message_id?: string;
              answer?: string;
              error?: string;
            };

            if (event.event === 'error') {
              throw new Error(`Dify streaming error: ${event.error}`);
            }

            if (event.conversation_id) conversationId = event.conversation_id;
            if (event.message_id) messageId = event.message_id;

            if (event.event === 'message' || event.event === 'agent_message') {
              const answer = event.answer ?? '';
              fullContent += answer;
              await onChunk({
                id: event.message_id ?? `dify-${Date.now()}`,
                delta: answer,
                finishReason: undefined,
              });
            } else if (event.event === 'finished') {
              // Dify sends 'finished' event when done
              await onChunk({
                id: event.message_id ?? 'dify-finish',
                delta: '',
                finishReason: 'stop',
              });
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (conversationId) this._conversationId = conversationId;

    return {
      content: fullContent,
      raw: { conversationId, messageId, streamed: true },
    };
  }

  private async handleBlockingResponse(response: Response): Promise<LLMResponse> {
    const data = await response.json() as {
      answer: string;
      conversation_id?: string;
      message_id?: string;
    };

    if (data.conversation_id) this._conversationId = data.conversation_id;

    return {
      content: data.answer ?? '',
      raw: {
        conversationId: data.conversation_id,
        messageId: data.message_id,
        streamed: false,
      },
    };
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
