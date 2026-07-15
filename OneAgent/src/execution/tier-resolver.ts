import type { AgentProfile } from "../types/profile.js";
import { EXECUTION_TIER_METADATA_KEY, type ExecutionTier } from "../types/execution.js";
import type { AgentTask } from "core-agent";

export type TierResolveInput = {
  task: AgentTask;
  profile: AgentProfile;
  defaultTier: ExecutionTier;
  options?: { tier?: ExecutionTier };
};

export function resolveExecutionTier(input: TierResolveInput): ExecutionTier {
  const fromOptions = input.options?.tier;
  if (fromOptions === "standalone" || fromOptions === "kernel") {
    return fromOptions;
  }
  if (fromOptions === "auto") {
    return inferTier(input.task, input.profile);
  }

  const metadataTier = input.task.metadata?.[EXECUTION_TIER_METADATA_KEY];
  if (metadataTier === "standalone" || metadataTier === "kernel") {
    return metadataTier;
  }

  if (shouldEscalateToKernel(input.task, input.profile)) {
    return "kernel";
  }

  const profileTier = input.profile.spec.execution?.defaultTier;
  if (profileTier === "standalone" || profileTier === "kernel") {
    return profileTier;
  }

  if (profileTier === "auto" || input.defaultTier === "auto") {
    return inferTier(input.task, input.profile);
  }

  return input.defaultTier === "kernel" ? "kernel" : "standalone";
}

function shouldEscalateToKernel(task: TierResolveInput["task"], profile: AgentProfile): boolean {
  const rules = profile.spec.execution?.escalateToKernelWhen;
  if (rules?.hasContextRefs && (task.contextRefs?.length ?? 0) > 0) {
    return true;
  }
  if (rules?.requiresTools && (task.allowedCapabilities?.length ?? 0) > 0) {
    return true;
  }
  return false;
}

function inferTier(task: TierResolveInput["task"], profile: AgentProfile): ExecutionTier {
  if (task.metadata?.forceKernel === true) {
    return "kernel";
  }

  const rules = profile.spec.execution?.escalateToKernelWhen;
  if (rules?.requiresTools && (task.allowedCapabilities?.length ?? 0) > 0) {
    return "kernel";
  }
  if (rules?.hasContextRefs && (task.contextRefs?.length ?? 0) > 0) {
    return "kernel";
  }

  const allowList = profile.spec.capabilities?.allow ?? [];
  const toolCapable = allowList.some((item) =>
    ["http_fetch", "host_action_proxy", "skillforge.", "knowledge_lookup"].some((prefix) =>
      item === prefix || item.startsWith(prefix),
    ),
  );

  if (toolCapable && (task.contextRefs?.length ?? 0) > 0) {
    return "kernel";
  }

  return "standalone";
}
