/**
 * Skill Adapter Facade
 * Unified entry point for all skill execution (Tier1 / Tier2 / Tier3)
 *
 * @package @enterprise-claw/skill-adapter
 *
 * Architecture (ADR-003):
 *
 *   Tier1 Core Skills          Tier2 Enterprise Skills      Tier3 Community Skills
 *         │                          │                            │
 *         │                          │                            │
 *         ▼                          ▼                            ▼
 *   ┌─────────────┐           ┌──────────────┐            ┌────────────────┐
 *   │ Enterprise  │           │  Enterprise  │            │ OpenClaw Skill │
 *   │ MCP Adapter │           │ MCP Adapter  │            │    Adapter     │
 *   └─────────────┘           └──────────────┘            └────────────────┘
 *         │                          │                            │
 *         └──────────────────────────┼────────────────────────────┘
 *                                    │
 *                              Skill Adapter Facade
 *                         (unified execution interface)
 */

import { randomUUID } from 'crypto';
import type {
  OpenClawSkill,
  MCPServerConfig,
  SkillExecutionContext,
  SkillExecutionResult,
  SkillRegistration,
  ToolContract,
  ToolTier,
} from './types';
import type { MCPToolCaller } from './openclaw-skill-adapter';
import { OpenClawSkillAdapter } from './openclaw-skill-adapter';
import { EnterpriseMCPAdapter } from './enterprise-adapter';
import { convertSkillInputToMCPSchema } from './schema-converter';

export { type MCPToolCaller, type MCPToolResult } from './openclaw-skill-adapter';

/**
 * Skill Adapter Facade
 * Provides a unified interface for executing skills across all tiers.
 */
export class SkillAdapterFacade {
  // Tier3: OpenClaw community skills (via thin adapter)
  private openClawAdapter: OpenClawSkillAdapter;
  // Tier1 & Tier2: Enterprise MCP servers
  private enterpriseAdapter: EnterpriseMCPAdapter;

  constructor(mcpClientFactory: (serverId: string) => MCPToolCaller | null) {
    this.openClawAdapter = new OpenClawSkillAdapter(mcpClientFactory);
    this.enterpriseAdapter = new EnterpriseMCPAdapter(mcpClientFactory);
  }

  // ─── Enterprise MCP Server Management ───────────────────────────────

  /**
   * Register an enterprise MCP server (Tier1 / Tier2)
   */
  registerServer(config: MCPServerConfig): void {
    this.enterpriseAdapter.registerServer(config);
  }

  /**
   * Unregister an enterprise MCP server
   */
  unregisterServer(serverId: string): void {
    this.enterpriseAdapter.unregisterServer(serverId);
  }

  /**
   * List all registered enterprise servers
   */
  listServers(): MCPServerConfig[] {
    return this.enterpriseAdapter.listServers();
  }

  /**
   * List available tools on a server (filtered by white/black list)
   */
  async listTools(serverId: string): Promise<string[]> {
    return this.enterpriseAdapter.listTools(serverId);
  }

  // ─── OpenClaw Community Skill Management ──────────────────────────

  /**
   * Register an OpenClaw community skill (Tier3)
   */
  registerCommunitySkill(
    skill: OpenClawSkill,
    serverId: string,
    toolName: string
  ): void {
    this.openClawAdapter.register(skill, serverId, toolName);
  }

  /**
   * Unregister an OpenClaw community skill
   */
  unregisterCommunitySkill(skillName: string): void {
    this.openClawAdapter.unregister(skillName);
  }

  /**
   * List all registered community skills
   */
  listCommunitySkills(): SkillRegistration[] {
    return this.openClawAdapter.listSkills();
  }

  // ─── Unified Execution ────────────────────────────────────────────

  /**
   * Execute a tool skill (Tier1 / Tier2 / Tier3) by name
   *
   * Routing:
   *  - If skillName registered in community adapter → use OpenClawSkillAdapter
   *  - Otherwise → route to enterprise MCP adapter by serverId
   */
  async execute(
    skillName: string,
    input: Record<string, unknown>,
    serverId: string,
    ctx: SkillExecutionContext
  ): Promise<SkillExecutionResult> {
    // Check community skills first
    const communitySkills = this.openClawAdapter.listSkills();
    const isCommunity = communitySkills.some(r => r.skill.name === skillName);

    if (isCommunity) {
      return this.openClawAdapter.execute(skillName, input, ctx);
    }

    // Route to enterprise adapter
    return this.enterpriseAdapter.executeTool(serverId, skillName, input, ctx);
  }

  // ─── Tool Contract Generation ─────────────────────────────────────

  /**
   * Generate ToolContract metadata for all registered skills
   * Used by Model Gateway to know what tools are available
   */
  generateToolContracts(): ToolContract[] {
    const contracts: ToolContract[] = [];

    // Community skills (Tier3)
    for (const reg of this.openClawAdapter.listSkills()) {
      contracts.push({
        name: reg.skill.name,
        tier: 'tier3_community' as ToolTier,
        description: reg.skill.description,
        inputSchema: convertSkillInputToMCPSchema(reg.skill),
        outputSchema: reg.skill.outputSchema as unknown as Record<string, unknown>,
        timeoutMs: reg.skill.timeoutMs,
        retryable: reg.skill.retryable ?? true,
        requiresAuth: reg.skill.requiresAuth ?? false,
      });
    }

    // Enterprise servers (Tier1 / Tier2)
    for (const server of this.enterpriseAdapter.listServers()) {
      // Placeholder contracts - actual tools loaded dynamically via listTools
      // Real contracts are generated when tools are discovered from the MCP server
      contracts.push({
        name: `__server__${server.id}__`,
        tier: server.tier as ToolTier,
        description: `MCP Server: ${server.name} (${server.tier})`,
        inputSchema: { type: 'object', properties: {}, additionalProperties: true },
        timeoutMs: 30000,
        retryable: true,
        requiresAuth: !!server.credential,
      });
    }

    return contracts;
  }

  /**
   * Get circuit breaker status for a server
   */
  getCircuitBreakerStatus(serverId: string) {
    return this.enterpriseAdapter.getCircuitBreakerStatus(serverId);
  }
}
