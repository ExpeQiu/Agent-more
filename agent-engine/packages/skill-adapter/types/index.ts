/**
 * Skill Adapter Types
 * @package @enterprise-claw/skill-adapter
 */

// Re-export core models
export type { ToolContract, ToolTier, ToolCall } from '@enterprise-claw/core-models';

// OpenClaw Skill Schema Types (社区技能格式)
export interface OpenClawSkill {
  name: string;
  description: string;
  version: string;
  category?: string;
  inputSchema: OpenClawInputSchema;
  outputSchema?: OpenClawOutputSchema;
  timeoutMs?: number;
  retryable?: boolean;
  requiresAuth?: boolean;
  tier: 'tier3_community';
}

export interface OpenClawInputSchema {
  type: 'object';
  properties: Record<string, OpenClawProperty>;
  required?: string[];
}

export interface OpenClawProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'file' | 'select';
  description?: string;
  default?: unknown;
  enum?: string[];
  items?: OpenClawProperty;
  format?: string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  properties?: Record<string, OpenClawProperty>;
}

export interface OpenClawOutputSchema {
  type: 'object';
  properties: Record<string, OpenClawProperty>;
}

// MCP-compatible input schema (JSON Schema draft-07)
export type MCPSchema = Record<string, unknown>;

// Enterprise MCP Server credential
export interface MCPCredential {
  type: 'bearer' | 'basic' | 'apikey' | 'oauth2';
  token?: string;
  username?: string;
  password?: string;
  apiKey?: string;
}

// MCP Server config (Tier1 / Tier2)
export interface MCPServerConfig {
  id: string;
  name: string;
  tier: 'tier1_core' | 'tier2_enterprise';
  transport: 'http' | 'stdio';
  baseUrl?: string;          // for http transport
  command?: string;          // for stdio transport
  args?: string[];           // for stdio transport
  env?: Record<string, string>;
  credential?: MCPCredential;
  tools?: string[];          // whitelist of tool names, '*' = all
  blockedTools?: string[];  // blacklist
  healthCheckIntervalMs?: number;
}

// Skill Adapter registration entry
export interface SkillRegistration {
  skill: OpenClawSkill;
  serverId: string;
  toolName: string;         // MCP tool name (may differ from skill.name)
  adapter: 'community' | 'enterprise';
}

// Adapter execution context
export interface SkillExecutionContext {
  tenantId: string;
  workspaceId: string;
  userId: string;
  traceId: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

// Adapter result
export interface SkillExecutionResult {
  success: boolean;
  output?: unknown;
  error?: string;
  durationMs: number;
  toolCallId: string;
}
