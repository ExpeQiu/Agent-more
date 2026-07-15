import type { AgentTask } from "core-agent";
import type { AgentProfile } from "../types/profile.js";
import {
  AGENT_ID_METADATA_KEY,
  PERSONA_OVERRIDES_METADATA_KEY,
} from "../types/profile.js";
import { DELEGATE_AGENT_CAPABILITY_ID } from "../delegation/delegate-agent-capability.js";
import type { ProfileRegistry } from "./profile-registry.js";

function patternMatches(id: string, pattern: string): boolean {
  if (pattern.endsWith(".*")) {
    const prefix = pattern.slice(0, -2);
    return id === prefix || id.startsWith(`${prefix}.`);
  }
  if (pattern.endsWith("*")) {
    return id.startsWith(pattern.slice(0, -1));
  }
  return id === pattern;
}

export function expandCapabilityPatterns(allIds: string[], patterns: string[]): string[] {
  const matched = new Set<string>();
  for (const pattern of patterns) {
    for (const id of allIds) {
      if (patternMatches(id, pattern)) {
        matched.add(id);
      }
    }
  }
  return [...matched];
}

export function resolveAgentId(task: AgentTask, defaultAgentId: string): string {
  const metadata = task.metadata ?? {};
  const agentId = metadata[AGENT_ID_METADATA_KEY];
  return typeof agentId === "string" && agentId.trim() ? agentId : defaultAgentId;
}

export function readPersonaOverrides(task: AgentTask): Record<string, string> {
  const raw = task.metadata?.[PERSONA_OVERRIDES_METADATA_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") {
      result[key] = value;
    }
  }
  return result;
}

export function enrichTaskWithProfile(
  task: AgentTask,
  profileRegistry: ProfileRegistry,
  options: {
    defaultAgentId: string;
    allCapabilityIds: string[];
  },
): { task: AgentTask; profile: AgentProfile; agentId: string } {
  const agentId = resolveAgentId(task, options.defaultAgentId);
  const profile = profileRegistry.get(agentId);

  const allowPatterns = profile.spec.capabilities?.allow ?? [];
  const denyPatterns = profile.spec.capabilities?.deny ?? [];
  const allowed = expandCapabilityPatterns(options.allCapabilityIds, allowPatterns);
  const denied = new Set(expandCapabilityPatterns(options.allCapabilityIds, denyPatterns));
  const allowedCapabilities = allowed.filter((id) => !denied.has(id));
  if ((profile.spec.delegation?.allow?.length ?? 0) > 0 && !allowedCapabilities.includes(DELEGATE_AGENT_CAPABILITY_ID)) {
    allowedCapabilities.push(DELEGATE_AGENT_CAPABILITY_ID);
  }

  const profileConstraints = profile.spec.constraints ?? {};
  const mergedConstraints = {
    ...profileConstraints,
    ...task.constraints,
    requireApprovalFor: [
      ...(profile.spec.capabilities?.requireApproval ?? []),
      ...(task.constraints?.requireApprovalFor ?? []),
    ],
  };

  return {
    agentId,
    profile,
    task: {
      ...task,
      metadata: {
        ...task.metadata,
        [AGENT_ID_METADATA_KEY]: agentId,
      },
      allowedCapabilities: allowedCapabilities.length > 0 ? allowedCapabilities : task.allowedCapabilities,
      constraints: mergedConstraints,
    },
  };
}
