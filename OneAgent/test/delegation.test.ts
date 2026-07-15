import { describe, expect, it } from "vitest";
import { isDelegationAllowed } from "../src/delegation/delegate-agent-capability.js";
import type { AgentProfile } from "../src/types/profile.js";

const profile: AgentProfile = {
  apiVersion: "oneagent.io/v1",
  kind: "AgentProfile",
  metadata: { id: "copilot", name: "copilot", version: "1.0.0" },
  spec: {
    persona: { system: "test" },
    delegation: { allow: ["planner", "reviewer"] },
  },
};

describe("delegation", () => {
  it("allows configured targets", () => {
    expect(isDelegationAllowed(profile, "planner")).toBe(true);
    expect(isDelegationAllowed(profile, "reviewer")).toBe(true);
  });

  it("denies unknown targets", () => {
    expect(isDelegationAllowed(profile, "unknown")).toBe(false);
  });
});
