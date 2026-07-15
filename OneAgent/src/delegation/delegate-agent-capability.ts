import type { AgentTask, Capability, CapabilityContext, CapabilityResult, JsonValue } from "core-agent";
import type { OneAgentExecutor } from "../execution/agent-executor.js";
import type { ProfileRegistry } from "../profile/profile-registry.js";
import { resolveAgentId } from "../profile/task-enricher.js";
import type { ExecutionTier } from "../types/execution.js";
import type { AgentProfile } from "../types/profile.js";

export const DELEGATE_AGENT_CAPABILITY_ID = "delegate_agent";

export function isDelegationAllowed(profile: AgentProfile, targetAgentId: string): boolean {
  const allowed = profile.spec.delegation?.allow ?? [];
  return allowed.includes(targetAgentId);
}

export function createDelegateAgentCapability(deps: {
  getExecutor: () => OneAgentExecutor;
  profileRegistry: ProfileRegistry;
  defaultAgentId: string;
}): Capability {
  return {
    id: DELEGATE_AGENT_CAPABILITY_ID,
    kind: "subagent",
    description: "将子任务委派给另一个 Agent Profile 执行（Subagent delegation）。",
    schema: {
      name: DELEGATE_AGENT_CAPABILITY_ID,
      description: "Delegate a subtask to another configured OneAgent profile.",
      inputSchema: {
        type: "object",
        properties: {
          agentId: { type: "string", description: "目标 Agent Profile ID" },
          goal: { type: "string", description: "委派子任务目标" },
          tier: {
            type: "string",
            enum: ["standalone", "kernel", "auto"],
            description: "子 Agent 执行层级，默认 inherit",
          },
        },
        required: ["agentId", "goal"],
      },
    },
    async execute(input: JsonValue, ctx: CapabilityContext): Promise<CapabilityResult> {
      const agentId =
        typeof input === "object" && input !== null && "agentId" in input && typeof input.agentId === "string"
          ? input.agentId
          : "";
      const goal =
        typeof input === "object" && input !== null && "goal" in input && typeof input.goal === "string"
          ? input.goal
          : "";
      const tierRaw =
        typeof input === "object" && input !== null && "tier" in input && typeof input.tier === "string"
          ? input.tier
          : undefined;

      if (!agentId || !goal) {
        return {
          callId: DELEGATE_AGENT_CAPABILITY_ID,
          capabilityId: DELEGATE_AGENT_CAPABILITY_ID,
          status: "failed",
          error: { code: "CAPABILITY_EXECUTION_FAILED", message: "agentId and goal are required" },
        };
      }

      const parentAgentId = resolveAgentId(ctx.task, deps.defaultAgentId);
      let parentProfile: AgentProfile;
      try {
        parentProfile = deps.profileRegistry.get(parentAgentId);
      } catch {
        return {
          callId: DELEGATE_AGENT_CAPABILITY_ID,
          capabilityId: DELEGATE_AGENT_CAPABILITY_ID,
          status: "failed",
          error: { code: "CAPABILITY_NOT_FOUND", message: `Parent agent profile not found: ${parentAgentId}` },
        };
      }

      if (!isDelegationAllowed(parentProfile, agentId)) {
        return {
          callId: DELEGATE_AGENT_CAPABILITY_ID,
          capabilityId: DELEGATE_AGENT_CAPABILITY_ID,
          status: "failed",
          error: {
            code: "CAPABILITY_DENIED",
            message: `Agent ${parentAgentId} cannot delegate to ${agentId}`,
          },
        };
      }

      if (!deps.profileRegistry.tryGet(agentId)) {
        return {
          callId: DELEGATE_AGENT_CAPABILITY_ID,
          capabilityId: DELEGATE_AGENT_CAPABILITY_ID,
          status: "failed",
          error: { code: "CAPABILITY_NOT_FOUND", message: `Target agent profile not found: ${agentId}` },
        };
      }

      const delegatedTier =
        tierRaw === "standalone" || tierRaw === "kernel" || tierRaw === "auto"
          ? tierRaw
          : parentProfile.spec.delegation?.defaultTier ?? "auto";

      const childTask: AgentTask = {
        taskId: `${ctx.task.taskId}_deleg_${Date.now()}`,
        sessionId: ctx.session.sessionId,
        traceId: ctx.traceId,
        actor: ctx.actor,
        tenant: ctx.tenant,
        goal,
        contextRefs: ctx.task.contextRefs,
        metadata: {
          ...ctx.task.metadata,
          agentId,
          delegatedFrom: parentAgentId,
          parentTaskId: ctx.task.taskId,
        },
      };

      const result = await deps.getExecutor().run(childTask, {
        agentId,
        tier: delegatedTier as ExecutionTier,
      });

      return {
        callId: DELEGATE_AGENT_CAPABILITY_ID,
        capabilityId: DELEGATE_AGENT_CAPABILITY_ID,
        status: "completed",
        output: {
          agentId,
          delegatedFrom: parentAgentId,
          executionTier: result.executionTier,
          finalText: result.finalText ?? "",
          sessionId: result.sessionId,
          status: result.status,
        } as import("core-agent").JsonValue,
      };
    },
  };
}
