/**
 * MCP Tool Types
 * @package @enterprise-claw/mcp-client
 */

import type { ToolCall, ToolContract } from '@agent-engine/shared-types';

/**
 * Tool call result from MCP server
 */
export interface ToolResult {
  callId: string;
  output?: unknown;
  error?: string;
  durationMs?: number;
}

/**
 * MCP tool list response
 */
export interface ListToolsResponse {
  tools: ToolContract[];
}
