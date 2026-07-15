import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { OneAgentConfig } from "../types/profile.js";

function substituteEnv(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_match, name: string) => process.env[name] ?? "");
}

function walkEnv(node: unknown): unknown {
  if (typeof node === "string") {
    return substituteEnv(node);
  }
  if (Array.isArray(node)) {
    return node.map(walkEnv);
  }
  if (typeof node === "object" && node !== null) {
    return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, walkEnv(value)]));
  }
  return node;
}

const DEFAULT_CONFIG: OneAgentConfig = {
  server: { port: 8790 },
  kernel: { mode: "embedded", sessionDb: "./data/sessions.sqlite" },
  agents: { dir: "./agents" },
  skills: { dir: "./skills", maxInjectChars: 8000 },
  model: { provider: "openai-compatible" },
  defaults: { agent: "copilot", tenant: "default", executionTier: "auto" },
  logging: { level: "info" },
};

function mergeConfig(base: OneAgentConfig, patch: Partial<OneAgentConfig>): OneAgentConfig {
  return {
    ...base,
    ...patch,
    server: { ...base.server, ...patch.server },
    kernel: { ...base.kernel, ...patch.kernel },
    agents: { ...base.agents, ...patch.agents },
    skills: { ...base.skills, ...patch.skills },
    model: { ...base.model, ...patch.model },
    defaults: { ...base.defaults, ...patch.defaults },
    logging: { ...base.logging, ...patch.logging },
    federation: patch.federation ?? base.federation,
  };
}

export function resolveConfigPath(cwd: string, explicit?: string): string | undefined {
  const candidates = [
    explicit,
    process.env.ONEAGENT_CONFIG,
    resolve(cwd, "oneagent.config.yaml"),
    resolve(process.env.HOME ?? "", ".oneagent/config.yaml"),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

export function loadConfig(options: { cwd?: string; configPath?: string } = {}): OneAgentConfig {
  const cwd = options.cwd ?? process.cwd();
  const configPath = resolveConfigPath(cwd, options.configPath);
  if (!configPath) {
    return DEFAULT_CONFIG;
  }

  const raw = parseYaml(readFileSync(configPath, "utf8")) as Partial<OneAgentConfig>;
  const substituted = walkEnv(raw) as Partial<OneAgentConfig>;
  const merged = mergeConfig(DEFAULT_CONFIG, substituted);

  merged.agents.dir = resolve(cwd, merged.agents.dir);
  merged.skills.dir = resolve(cwd, merged.skills.dir);
  merged.kernel.sessionDb = resolve(cwd, merged.kernel.sessionDb);
  if (merged.logging.file) {
    merged.logging.file = resolve(cwd, merged.logging.file);
  }

  return merged;
}
