import { describe, expect, it } from "vitest";
import { resolveExecutionTier } from "../src/execution/tier-resolver.js";
import type { AgentProfile } from "../src/types/profile.js";

const baseProfile: AgentProfile = {
  apiVersion: "oneagent.io/v1",
  kind: "AgentProfile",
  metadata: { id: "test", name: "test", version: "1.0.0" },
  spec: {
    persona: { system: "test" },
    execution: {
      defaultTier: "standalone",
      escalateToKernelWhen: { hasContextRefs: true },
    },
    capabilities: {
      allow: ["knowledge_lookup", "http_fetch"],
    },
  },
};

describe("tier-resolver", () => {
  it("uses explicit option tier", () => {
    const tier = resolveExecutionTier({
      task: { taskId: "t1", actor: { userId: "u1" }, goal: "hi" },
      profile: baseProfile,
      defaultTier: "auto",
      options: { tier: "kernel" },
    });
    expect(tier).toBe("kernel");
  });

  it("escalates to kernel when context refs exist", () => {
    const tier = resolveExecutionTier({
      task: {
        taskId: "t1",
        actor: { userId: "u1" },
        goal: "review",
        contextRefs: [{ kind: "document", ref: "doc:1" }],
      },
      profile: baseProfile,
      defaultTier: "auto",
    });
    expect(tier).toBe("kernel");
  });

  it("stays standalone for simple prompts", () => {
    const tier = resolveExecutionTier({
      task: { taskId: "t1", actor: { userId: "u1" }, goal: "hello" },
      profile: baseProfile,
      defaultTier: "auto",
    });
    expect(tier).toBe("standalone");
  });
});
