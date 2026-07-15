import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { OneAgentRuntime } from "../bootstrap/create-runtime.js";
import type { Logger } from "../logging/logger.js";
import type { ExecutionTier } from "../types/execution.js";

function textResult(text: string) {
  return {
    content: [{ type: "text" as const, text }],
  };
}

export function createOneAgentMcpServer(runtime: OneAgentRuntime, logger: Logger): McpServer {
  const server = new McpServer({
    name: "oneagent",
    version: "0.1.0",
  });

  server.registerTool(
    "oneagent_run",
    {
      title: "Run OneAgent",
      description: "Execute a OneAgent profile with optional execution tier.",
      inputSchema: {
        agentId: z.string().describe("Agent Profile ID"),
        goal: z.string().describe("Task goal / user message"),
        tier: z.enum(["standalone", "kernel", "auto"]).optional(),
        sessionId: z.string().optional(),
        userId: z.string().optional(),
      },
    },
    async ({ agentId, goal, tier, sessionId, userId }) => {
      logger.info("mcp oneagent_run", { agentId, tier });
      const result = await runtime.executor.run(
        {
          taskId: `mcp_${Date.now()}`,
          sessionId,
          actor: { userId: userId ?? "mcp-client" },
          goal,
          metadata: { agentId },
        },
        { agentId, tier: tier as ExecutionTier | undefined },
      );
      return textResult(
        JSON.stringify(
          {
            agentId,
            executionTier: result.executionTier,
            sessionId: result.sessionId,
            status: result.status,
            finalText: result.finalText,
          },
          null,
          2,
        ),
      );
    },
  );

  server.registerTool(
    "oneagent_delegate",
    {
      title: "Delegate to Subagent",
      description: "Delegate a subtask to another Agent Profile (subagent).",
      inputSchema: {
        fromAgentId: z.string().describe("Caller Agent Profile ID"),
        toAgentId: z.string().describe("Target Agent Profile ID"),
        goal: z.string().describe("Delegated subtask goal"),
        tier: z.enum(["standalone", "kernel", "auto"]).optional(),
        userId: z.string().optional(),
      },
    },
    async ({ fromAgentId, toAgentId, goal, tier, userId }) => {
      const parent = runtime.profileRegistry.get(fromAgentId);
      const allowed = parent.spec.delegation?.allow ?? [];
      if (!allowed.includes(toAgentId)) {
        return textResult(`Delegation denied: ${fromAgentId} -> ${toAgentId}`);
      }

      const result = await runtime.executor.run(
        {
          taskId: `mcp_deleg_${Date.now()}`,
          actor: { userId: userId ?? "mcp-client" },
          goal,
          metadata: {
            agentId: toAgentId,
            delegatedFrom: fromAgentId,
          },
        },
        { agentId: toAgentId, tier: tier as ExecutionTier | undefined },
      );
      return textResult(
        JSON.stringify(
          {
            fromAgentId,
            toAgentId,
            executionTier: result.executionTier,
            finalText: result.finalText,
          },
          null,
          2,
        ),
      );
    },
  );

  server.registerTool(
    "oneagent_list_agents",
    {
      title: "List Agents",
      description: "List available OneAgent profiles.",
      inputSchema: {},
    },
    async () => {
      return textResult(JSON.stringify(runtime.profileRegistry.list(), null, 2));
    },
  );

  server.registerTool(
    "oneagent_get_skill",
    {
      title: "Get Skill",
      description: "Load a local skill document by id.",
      inputSchema: {
        skillId: z.string(),
      },
    },
    async ({ skillId }) => {
      const skill = runtime.skillRegistry.get(skillId);
      return textResult(JSON.stringify({ id: skill.id, name: skill.name, content: skill.body }, null, 2));
    },
  );

  return server;
}

export async function startOneAgentMcpStdio(runtime: OneAgentRuntime, logger: Logger): Promise<void> {
  const server = createOneAgentMcpServer(runtime, logger.child("mcp"));
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("OneAgent MCP stdio server connected");
}
