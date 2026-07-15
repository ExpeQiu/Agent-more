/**
 * Enterprise MCP Adapter
 * Handles Tier2 enterprise system MCP servers with auth & permission gating
 *
 * @package @enterprise-claw/skill-adapter
 */

import { randomUUID } from 'crypto';
import type {
  MCPServerConfig,
  SkillExecutionContext,
  SkillExecutionResult,
} from './types';
import type { MCPToolCaller } from './openclaw-skill-adapter';

/**
 * Enterprise MCP Adapter
 *
 * Responsibilities:
 *  - Inject enterprise auth credentials into MCP requests
 *  - Enforce tool whitelist / blacklist per server
 *  - Wrap tool results with enterprise metadata
 *  - Circuit-breaker for failed enterprise servers
 */
export class EnterpriseMCPAdapter {
  private servers: Map<string, MCPServerConfig> = new Map();
  private mcpClientFactory: (serverId: string) => MCPToolCaller | null;
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();

  constructor(mcpClientFactory: (serverId: string) => MCPToolCaller | null) {
    this.mcpClientFactory = mcpClientFactory;
  }

  /**
   * Register an enterprise MCP server
   */
  registerServer(config: MCPServerConfig): void {
    if (config.tier !== 'tier2_enterprise' && config.tier !== 'tier1_core') {
      throw new Error(`EnterpriseMCPAdapter only supports tier1/tier2, got ${config.tier}`);
    }
    this.servers.set(config.id, config);
    this.circuitBreakers.set(config.id, new CircuitBreaker(config.id));
  }

  /**
   * Unregister a server
   */
  unregisterServer(serverId: string): void {
    this.servers.delete(serverId);
    this.circuitBreakers.delete(serverId);
  }

  /**
   * List registered servers
   */
  listServers(): MCPServerConfig[] {
    return Array.from(this.servers.values());
  }

  /**
   * List available tools for a server (respecting whitelist/blacklist)
   */
  async listTools(serverId: string): Promise<string[]> {
    const config = this.servers.get(serverId);
    if (!config) return [];

    const client = this.mcpClientFactory(serverId);
    if (!client) return [];

    try {
      // MCP list_tools call - filtered by whitelist/blacklist
      const result = await client.callTool(
        '__list_tools__',
        {},
        10000
      ) as { success: boolean; output?: { tools: string[] } };

      if (!result.success || !result.output) return [];

      let tools = result.output.tools as string[];

      // Apply whitelist
      if (config.tools && config.tools.length > 0 && !config.tools.includes('*')) {
        tools = tools.filter(t => config.tools!.includes(t));
      }

      // Apply blacklist
      if (config.blockedTools && config.blockedTools.length > 0) {
        tools = tools.filter(t => !config.blockedTools!.includes(t));
      }

      return tools;
    } catch {
      return [];
    }
  }

  /**
   * Execute a tool on an enterprise MCP server
   *
   * Security chain:
   *  1. Lookup server config
   *  2. Check whitelist / blacklist
   *  3. Inject enterprise credentials
   *  4. Circuit breaker check
   *  5. Execute via MCP
   */
  async executeTool(
    serverId: string,
    toolName: string,
    input: Record<string, unknown>,
    ctx: SkillExecutionContext
  ): Promise<SkillExecutionResult> {
    const start = Date.now();
    const toolCallId = randomUUID();

    const config = this.servers.get(serverId);
    if (!config) {
      return {
        success: false,
        error: `Server "${serverId}" not registered`,
        durationMs: Date.now() - start,
        toolCallId,
      };
    }

    // Whitelist check
    if (config.tools && config.tools.length > 0 && config.tools !== ['*'] as unknown as string[]) {
      if (!config.tools.includes(toolName)) {
        return {
          success: false,
          error: `Tool "${toolName}" is not whitelisted on server "${serverId}"`,
          durationMs: Date.now() - start,
          toolCallId,
        };
      }
    }

    // Blacklist check
    if (config.blockedTools?.includes(toolName)) {
      return {
        success: false,
        error: `Tool "${toolName}" is blacklisted on server "${serverId}"`,
        durationMs: Date.now() - start,
        toolCallId,
      };
    }

    // Circuit breaker check
    const cb = this.circuitBreakers.get(serverId);
    if (cb && cb.isOpen()) {
      return {
        success: false,
        error: `Server "${serverId}" circuit breaker is OPEN. Too many recent failures.`,
        durationMs: Date.now() - start,
        toolCallId,
      };
    }

    // Get MCP client
    const client = this.mcpClientFactory(serverId);
    if (!client) {
      return {
        success: false,
        error: `MCP client for server "${serverId}" not available`,
        durationMs: Date.now() - start,
        toolCallId,
      };
    }

    // Inject enterprise auth headers into input
    const enrichedInput = this.injectCredentials(config, input);

    try {
      const timeoutMs = ctx.timeoutMs ?? 30000;
      const result = await client.callTool(toolName, enrichedInput, timeoutMs, ctx.signal);

      cb?.recordSuccess();

      return {
        success: result.success,
        output: result.output,
        error: result.error,
        durationMs: Date.now() - start,
        toolCallId,
      };
    } catch (err) {
      cb?.recordFailure();

      return {
        success: false,
        error: `Enterprise MCP call failed: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: Date.now() - start,
        toolCallId,
      };
    }
  }

  /**
   * Inject enterprise credentials into tool input based on auth type
   */
  private injectCredentials(
    config: MCPServerConfig,
    input: Record<string, unknown>
  ): Record<string, unknown> {
    const cred = config.credential;
    if (!cred) return input;

    return {
      ...input,
      // Credentials injected as special headers (transport handles them)
      __ec_tenant_id: config.id,
      __ec_auth_type: cred.type,
      __ec_auth_token: cred.token,
      __ec_auth_username: cred.username,
      __ec_auth_password: cred.password,
      __ec_auth_apikey: cred.apiKey,
    };
  }

  /**
   * Get circuit breaker status for a server
   */
  getCircuitBreakerStatus(serverId: string): { state: string; failures: number } | null {
    const cb = this.circuitBreakers.get(serverId);
    if (!cb) return null;
    return cb.getStatus();
  }
}

/**
 * Simple circuit breaker implementation
 *
 * States:
 *  - CLOSED: normal operation, failures counted
 *  - OPEN: too many failures, reject immediately
 *  - HALF_OPEN: testing if server recovered
 */
class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half_open' = 'closed';
  private readonly threshold = 5;         // open after 5 failures
  private readonly recoveryMs = 30000;  // try again after 30s

  constructor(private serverId: string) {}

  isOpen(): boolean {
    if (this.state === 'closed') return false;

    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.recoveryMs) {
        this.state = 'half_open';
        return false;
      }
      return true;
    }

    // half_open: allow one test request
    return false;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.threshold) {
      this.state = 'open';
    }
  }

  getStatus(): { state: string; failures: number } {
    return { state: this.state, failures: this.failures };
  }
}
