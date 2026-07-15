import {
  DefaultContextPipeline,
  type ContextBuildInput,
  type ContextBuildOutput,
  type ContextPipeline,
} from "core-agent";
import type { CapabilityResult } from "core-agent";
import type { OneAgentConfig } from "../types/profile.js";
import type { ProfileRegistry } from "../profile/profile-registry.js";
import { readPersonaOverrides, resolveAgentId } from "../profile/task-enricher.js";
import { renderTemplate, resolveProfileVariables } from "../profile/template-renderer.js";
import type { SkillRegistry } from "../skills/skill-registry.js";

export class PersonaContextPipeline implements ContextPipeline {
  private readonly defaultPipeline = new DefaultContextPipeline();

  constructor(
    private readonly deps: {
      profileRegistry: ProfileRegistry;
      skillRegistry: SkillRegistry;
      config: OneAgentConfig;
    },
  ) {}

  async build(input: ContextBuildInput): Promise<ContextBuildOutput> {
    const base = await this.defaultPipeline.build(input);
    const agentId = resolveAgentId(input.task, this.deps.config.defaults.agent);
    const profile = this.deps.profileRegistry.get(agentId);

    const variables = resolveProfileVariables(
      profile.spec.persona.variables,
      readPersonaOverrides(input.task),
      this.deps.config.defaults.tenant,
    );
    const personaPrompt = renderTemplate(profile.spec.persona.system, variables);

    const autoLoad = profile.spec.skills?.autoLoad ?? [];
    const skills = this.deps.skillRegistry.resolveForAgent(agentId, autoLoad);
    const skillsBlock = this.deps.skillRegistry.buildInjectionBlock(
      skills,
      this.deps.config.skills.maxInjectChars,
    );

    const sections = [personaPrompt, skillsBlock].filter((value): value is string => Boolean(value));
    const systemPrompt = sections.join("\n\n");

    return {
      ...base,
      request: {
        ...base.request,
        systemPrompt,
      },
      metadata: {
        ...base.metadata,
        agentId,
        personaVariableCount: Object.keys(variables).length,
        injectedSkillCount: skills.length,
      },
    };
  }

  async appendCapabilityResults(
    current: ContextBuildOutput,
    results: CapabilityResult[],
    input: ContextBuildInput,
  ): Promise<ContextBuildOutput> {
    return this.defaultPipeline.appendCapabilityResults(current, results, input);
  }
}
