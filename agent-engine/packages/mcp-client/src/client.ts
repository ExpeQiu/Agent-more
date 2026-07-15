/**
 * MCP Client main class
 * @package @enterprise-claw/mcp-client
 */
import type { ToolCall } from '@agent-engine/shared-types';
import { HttpTransport, type HttpTransportOptions } from './transports/http-transport';
import { StdioTransport, type StdioTransportOptions } from './transports/stdio-transport';
import type { ListToolsResponse } from './types/tools';
import type { ToolResult } from './types/tools';

export type MCPTransport = HttpTransport | StdioTransport;

export interface MCPClientOptions {
  transport: 'http' | 'stdio';
  http?: HttpTransportOptions;
  stdio?: StdioTransportOptions;
}

export class MCPClient {
  private transport!: HttpTransport | StdioTransport;

  constructor(options: MCPClientOptions) {
    if (options.transport === 'http' && options.http) {
      this.transport = new HttpTransport(options.http);
    } else if (options.transport === 'stdio' && options.stdio) {
      this.transport = new StdioTransport(options.stdio);
    } else {
      throw new Error('Invalid MCP transport configuration');
    }
  }

  async connect(): Promise<void> {
    await this.transport.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      clientInfo: { name: 'agent-engine', version: '0.1.0' },
    });
  }

  async listTools(): Promise<ListToolsResponse> {
    const res = await this.transport.request('tools/list');
    return res.result as ListToolsResponse;
  }

  async callTool(toolName: string, input: Record<string, unknown>): Promise<ToolResult> {
    const res = await this.transport.request('tools/call', {
      name: toolName,
      arguments: input,
    });
    return res.result as ToolResult;
  }

  async close(): Promise<void> {
    if (this.transport instanceof StdioTransport) {
      this.transport.close();
    }
  }
}
