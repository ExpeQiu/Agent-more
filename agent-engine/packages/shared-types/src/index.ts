/**
 * @agent-engine/shared-types
 * Shared TypeScript types migrated from @enterprise-claw/core-models and @enterprise-claw/api-contracts
 */

// ─── core-models: tool types ────────────────────────────────────────────

/** Tool call status */
export type ToolCallStatus = 'pending' | 'running' | 'success' | 'error' | 'timeout';

/** Tool tier classification */
export type ToolTier = 'tier1_core' | 'tier2_enterprise' | 'tier3_community';

/** Tool call record */
export interface ToolCall {
  id: string;
  messageId: string;
  toolName: string;
  toolTier: ToolTier;
  input: Record<string, unknown>;
  output?: unknown;
  status: ToolCallStatus;
  duration?: number;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

/** Tool contract (metadata) */
export interface ToolContract {
  name: string;
  tier: ToolTier;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  timeoutMs?: number;
  retryable?: boolean;
  requiresAuth?: boolean;
}

/** Tool call result receipt */
export interface ToolCallResult {
  callId: string;
  output: unknown;
  error?: string;
  duration: number;
  timestamp: Date;
}

/** MCP tool call request */
export interface MCPToolCallRequest {
  toolName: string;
  arguments: Record<string, unknown>;
  timeoutMs?: number;
}

/** MCP tool call response */
export interface MCPToolCallResponse {
  toolName: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

// ─── api-contracts: tool REST types ────────────────────────────────────

export interface SubmitToolResultRequest {
  output?: unknown;
  error?: string;
  durationMs?: number;
}

export interface SubmitToolResultResponse {
  callId: string;
  receivedAt: string;
}

export interface GetToolCallResponse {
  id: string;
  messageId: string;
  toolName: string;
  input: Record<string, unknown>;
  output?: unknown;
  status: 'pending' | 'running' | 'success' | 'error' | 'timeout';
  durationMs?: number;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export interface ListToolCallsRequest {
  threadId?: string;
  messageId?: string;
  status?: 'pending' | 'running' | 'success' | 'error' | 'timeout';
  cursor?: string;
  limit?: number;
}

export interface ListToolCallsResponse {
  calls: GetToolCallResponse[];
  nextCursor: string | null;
  hasMore: boolean;
}
