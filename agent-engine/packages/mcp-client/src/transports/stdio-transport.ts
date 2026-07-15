/**
 * STDIO Transport for MCP (local MCP server execution)
 * @package @enterprise-claw/mcp-client
 */
import { spawn, ChildProcess } from 'child_process';
import type { MCPRequest, MCPResponse, MCPNotification } from '../types/protocol';

export interface StdioTransportOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export class StdioTransport {
  private process: ChildProcess;
  private pendingRequests = new Map<string | number, {
    resolve: (v: MCPResponse) => void;
    reject: (e: Error) => void;
  }>();
  private requestId = 0;
  private messageBuffer = '';

  constructor(options: StdioTransportOptions) {
    this.process = spawn(options.command, options.args ?? [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...options.env },
    });

    this.process.stdout?.on('data', (data: Buffer) => {
      this.messageBuffer += data.toString();
      this.flushMessages();
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      console.error('[MCP STDIO stderr]', data.toString());
    });

    this.process.on('exit', (code) => {
      console.log(`[MCP STDIO] Process exited with code ${code}`);
    });
  }

  private flushMessages() {
    const lines = this.messageBuffer.split('\n');
    this.messageBuffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line) as MCPResponse;
        const pending = this.pendingRequests.get(msg.id);
        if (pending) {
          this.pendingRequests.delete(msg.id);
          pending.resolve(msg);
        }
      } catch {
        // ignore parse errors
      }
    }
  }

  private nextId(): string | number {
    return ++this.requestId;
  }

  async request(method: string, params?: Record<string, unknown>): Promise<MCPResponse> {
    const id = this.nextId();
    const body: MCPRequest = { jsonrpc: '2.0', id, method, params };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.process.stdin?.write(JSON.stringify(body) + '\n');

      // timeout
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`MCP request ${method} timed out`));
        }
      }, 60000);
    });
  }

  async notify(method: string, params?: Record<string, unknown>): Promise<void> {
    const body: MCPNotification = { jsonrpc: '2.0', method, params };
    this.process.stdin?.write(JSON.stringify(body) + '\n');
  }

  close() {
    this.process.kill();
  }
}
