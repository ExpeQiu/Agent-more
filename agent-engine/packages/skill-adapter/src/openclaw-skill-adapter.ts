/**
 * OpenClaw Skill Adapter
 * Wraps OpenClaw Skill schemas as MCP-compatible tool calls
 *
 * @package @enterprise-claw/skill-adapter
 */

import { randomUUID } from 'crypto';
import type {
  OpenClawSkill,
  SkillExecutionContext,
  SkillExecutionResult,
  SkillRegistration,
} from './types';
import { convertSkillInputToMCPSchema, validateInput } from './schema-converter';

/**
 * OpenClaw Skill Adapter
 *
 * Converts OpenClaw Skill Schema → MCP JSON-RPC 2.0 format,
 * executes via injected MCP client, and maps results back.
 *
 * Architecture (ADR-003):
 *   Tier3 Community Skills
 *     └── OpenClaw Skill Adapter (thin wrapper)
 *          └── MCP Client (HTTP/STDIO)
 */
export class OpenClawSkillAdapter {
  private registry: Map<string, SkillRegistration> = new Map();
  // MCP client factory - caller provides the transport
  private mcpClientFactory: (serverId: string) => MCPToolCaller | null;

  constructor(mcpClientFactory: (serverId: string) => MCPToolCaller | null) {
    this.mcpClientFactory = mcpClientFactory;
  }

  /**
   * Register an OpenClaw Skill, mapping it to an MCP server and tool name
   */
  register(skill: OpenClawSkill, serverId: string, toolName: string): void {
    this.registry.set(skill.name, {
      skill,
      serverId,
      toolName,
      adapter: 'community',
    });
  }

  /**
   * Unregister a skill
   */
  unregister(skillName: string): void {
    this.registry.delete(skillName);
  }

  /**
   * List all registered skills
   */
  listSkills(): SkillRegistration[] {
    return Array.from(this.registry.values());
  }

  /**
   * Execute an OpenClaw skill
   *
   * Flow:
   *  1. Lookup registration
   *  2. Convert & validate input schema
   *  3. Build MCP JSON-RPC request
   *  4. Call MCP client
   *  5. Map result back to OpenClaw format
   */
  async execute(
    skillName: string,
    input: Record<string, unknown>,
    ctx: SkillExecutionContext
  ): Promise<SkillExecutionResult> {
    const start = Date.now();
    const toolCallId = randomUUID();

    const reg = this.registry.get(skillName);
    if (!reg) {
      return {
        success: false,
        error: `Skill "${skillName}" not found in registry. Did you register it first?`,
        durationMs: Date.now() - start,
        toolCallId,
      };
    }

    const { skill, toolName } = reg;

    // Convert schema & validate
    const mcpSchema = convertSkillInputToMCPSchema(skill);
    const validation = validateInput(input, mcpSchema);
    if (!validation.valid) {
      return {
        success: false,
        error: `Input validation failed: ${validation.errors.join('; ')}`,
        durationMs: Date.now() - start,
        toolCallId,
      };
    }

    // Get MCP client for the target server
    const mcpClient = this.mcpClientFactory(reg.serverId);
    if (!mcpClient) {
      return {
        success: false,
        error: `MCP server "${reg.serverId}" not available. Check connection.`,
        durationMs: Date.now() - start,
        toolCallId,
      };
    }

    // Execute via MCP
    try {
      const timeoutMs = ctx.timeoutMs ?? skill.timeoutMs ?? 30000;
      const result = await mcpClient.callTool(
        toolName,
        input,
        timeoutMs,
        ctx.signal
      );

      return {
        success: result.success,
        output: result.output,
        error: result.error,
        durationMs: Date.now() - start,
        toolCallId,
      };
    } catch (err) {
      return {
        success: false,
        error: `MCP call failed: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: Date.now() - start,
        toolCallId,
      };
    }
  }
}

/**
 * Minimal interface for MCP tool caller (implemented by caller)
 */
export interface MCPToolCaller {
  callTool(
    toolName: string,
    args: Record<string, unknown>,
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<MCPToolResult>;
}

export interface MCPToolResult {
  success: boolean;
  output?: unknown;
  error?: string;
}
