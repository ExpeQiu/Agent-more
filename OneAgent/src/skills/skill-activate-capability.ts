import type { CapabilityContext, CapabilityResult, Capability } from "core-agent";
import type { JsonValue } from "core-agent";
import type { SkillRegistry } from "./skill-registry.js";

export function createSkillActivateCapability(skillRegistry: SkillRegistry): Capability {
  const capabilityId = "skill_activate";

  return {
    id: capabilityId,
    kind: "tool",
    description: "按需加载本地 Skill 全文内容（Lazy 激活）。",
    schema: {
      name: capabilityId,
      description: "Load the full content of a local skill by id.",
      inputSchema: {
        type: "object",
        properties: {
          skillId: { type: "string", description: "Skill ID" },
        },
        required: ["skillId"],
      },
    },
    async execute(input: JsonValue, _ctx: CapabilityContext): Promise<CapabilityResult> {
      const skillId =
        typeof input === "object" && input !== null && "skillId" in input && typeof input.skillId === "string"
          ? input.skillId
          : "";
      if (!skillId) {
        return {
          callId: capabilityId,
          capabilityId,
          status: "failed",
          error: { code: "CAPABILITY_EXECUTION_FAILED", message: "skillId is required" },
        };
      }
      const skill = skillRegistry.tryGet(skillId);
      if (!skill) {
        return {
          callId: capabilityId,
          capabilityId,
          status: "failed",
          error: { code: "CAPABILITY_NOT_FOUND", message: `Skill not found: ${skillId}` },
        };
      }
      return {
        callId: capabilityId,
        capabilityId,
        status: "completed",
        output: {
          skillId: skill.id,
          name: skill.name,
          content: skill.body,
        },
      };
    },
  };
}
