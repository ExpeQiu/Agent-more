/**
 * HTTP Transport for MCP
 * @package @enterprise-claw/mcp-client
 */
import type { MCPRequest, MCPResponse, MCPNotification } from '../types/protocol';

export interface HttpTransportOptions {
  baseUrl: string;
  headers?: Record<string, string>;
  timeout?: number;
}

export class HttpTransport {
  private baseUrl: string;
  private headers: Record<string, string>;
  private timeout: number;
  private requestId = 0;

  constructor(options: HttpTransportOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    this.timeout = options.timeout ?? 30000;
  }

  private nextId(): string | number {
    return ++this.requestId;
  }

  async request(method: string, params?: Record<string, unknown>): Promise<MCPResponse> {
    const body: MCPRequest = {
      jsonrpc: '2.0',
      id: this.nextId(),
      method,
      params,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(`${this.baseUrl}/mcp`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      return res.json();
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }

  async notify(method: string, params?: Record<string, unknown>): Promise<void> {
    const body: MCPNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    await fetch(`${this.baseUrl}/mcp`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });
  }
}
