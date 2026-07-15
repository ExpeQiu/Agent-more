import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { AgentProfile, AgentProfileSummary } from "../types/profile.js";
import type { Logger } from "../logging/logger.js";

function validateProfile(profile: AgentProfile, source: string): void {
  if (profile.apiVersion !== "oneagent.io/v1") {
    throw new Error(`Invalid apiVersion in ${source}: ${profile.apiVersion}`);
  }
  if (profile.kind !== "AgentProfile") {
    throw new Error(`Invalid kind in ${source}: ${profile.kind}`);
  }
  if (!profile.metadata?.id) {
    throw new Error(`Missing metadata.id in ${source}`);
  }
  if (!profile.spec?.persona?.system) {
    throw new Error(`Missing spec.persona.system in ${source}`);
  }
}

export class ProfileRegistry {
  private readonly profiles = new Map<string, AgentProfile>();

  constructor(
    private readonly agentsDir: string,
    private readonly logger: Logger,
  ) {}

  loadAll(): void {
    this.profiles.clear();
    const files = readdirSync(this.agentsDir).filter(
      (name) => (name.endsWith(".yaml") || name.endsWith(".yml")) && !name.startsWith("._"),
    );
    for (const file of files) {
      const filePath = join(this.agentsDir, file);
      const profile = parseYaml(readFileSync(filePath, "utf8")) as AgentProfile;
      validateProfile(profile, filePath);
      if (this.profiles.has(profile.metadata.id)) {
        throw new Error(`Duplicate agent profile id: ${profile.metadata.id}`);
      }
      this.profiles.set(profile.metadata.id, profile);
      this.logger.info("loaded agent profile", { agentId: profile.metadata.id, file });
    }
  }

  get(agentId: string): AgentProfile {
    const profile = this.profiles.get(agentId);
    if (!profile) {
      throw new Error(`Agent profile not found: ${agentId}`);
    }
    return profile;
  }

  tryGet(agentId: string): AgentProfile | undefined {
    return this.profiles.get(agentId);
  }

  list(): AgentProfileSummary[] {
    return [...this.profiles.values()].map((profile) => ({
      id: profile.metadata.id,
      name: profile.metadata.name,
      version: profile.metadata.version,
      description: profile.metadata.description,
    }));
  }

  validateAll(): { ok: boolean; errors: string[] } {
    const errors: string[] = [];
    for (const profile of this.profiles.values()) {
      try {
        validateProfile(profile, profile.metadata.id);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    return { ok: errors.length === 0, errors };
  }
}
