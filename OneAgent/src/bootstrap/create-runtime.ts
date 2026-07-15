import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  bootstrapFederationFromEnv,
  CompositeEventBus,
  createHostActionProxyCapability,
  createHttpFetchRegistration,
  createKnowledgeLookupCapability,
  DefaultAgentKernel,
  DefaultMemoryManager,
  DefaultPolicyEngine,
  InMemoryCapabilityRegistry,
  MockModelAdapter,
  OpenAICompatibleModelAdapter,
  SqliteSessionStore,
  StaticModelResolver,
  type AgentKernel,
  type CapabilityContext,
  type ContextPipeline,
  type HostBridge,
  type JsonValue,
  type ModelResolver,
  type SessionStore,
} from "core-agent";
import { loadConfig } from "../config/load-config.js";
import { createOneAgentExecutor, OneAgentExecutor } from "../execution/agent-executor.js";
import { createDelegateAgentCapability } from "../delegation/delegate-agent-capability.js";
import { createDefaultHostBridge, mergeHostBridge } from "../host/default-host-bridge.js";
import { createLogger, type Logger } from "../logging/logger.js";
import { PersonaContextPipeline } from "../persona/persona-context-pipeline.js";
import { ProfileRegistry } from "../profile/profile-registry.js";
import { createSkillActivateCapability } from "../skills/skill-activate-capability.js";
import { SkillRegistry } from "../skills/skill-registry.js";
import type { OneAgentConfig } from "../types/profile.js";

export type OneAgentRuntime = {
  config: OneAgentConfig;
  kernel: AgentKernel;
  executor: OneAgentExecutor;
  profileRegistry: ProfileRegistry;
  skillRegistry: SkillRegistry;
  capabilityRegistry: InMemoryCapabilityRegistry;
  hostBridge: HostBridge;
  modelResolver: ModelResolver;
  contextPipeline: ContextPipeline;
  sessionStore: SessionStore;
  sidecarUrl?: string;
  logger: Logger;
};

function resolveModel(config: OneAgentConfig, mockMode: boolean): ModelResolver {
  if (mockMode || process.env.ONEAGENT_MOCK_MODE === "true") {
    return new StaticModelResolver(
      MockModelAdapter.final("[mock] OneAgent response — set OPENAI_API_KEY for real inference."),
      "mock",
      "mock",
    );
  }

  const apiKey = config.model.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new StaticModelResolver(
      MockModelAdapter.final("[mock] Missing OPENAI_API_KEY — running in mock mode."),
      "mock",
      "mock",
    );
  }

  const baseUrl = config.model.baseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = config.model.model || process.env.OPENAI_MODEL || "gpt-4o-mini";
  return new StaticModelResolver(
    new OpenAICompatibleModelAdapter({
      providerId: "openai-compatible",
      baseUrl,
      apiKey,
    }),
    "openai-compatible",
    model,
  );
}

export async function createOneAgentRuntime(options: {
  cwd?: string;
  configPath?: string;
  mockMode?: boolean;
  hostBridge?: Partial<HostBridge>;
} = {}): Promise<OneAgentRuntime> {
  const config = loadConfig({ cwd: options.cwd, configPath: options.configPath });
  const logger = createLogger({ level: config.logging.level, file: config.logging.file });
  const runtimeLogger = logger.child("runtime");

  const profileRegistry = new ProfileRegistry(config.agents.dir, logger.child("profile"));
  profileRegistry.loadAll();

  const skillRegistry = new SkillRegistry(config.skills.dir, logger.child("skill"));
  skillRegistry.loadAll();

  const capabilityRegistry = new InMemoryCapabilityRegistry();
  capabilityRegistry.register(createHttpFetchRegistration());
  capabilityRegistry.register(
    createKnowledgeLookupCapability({
      documents: [
        {
          id: "oneagent_overview",
          title: "OneAgent Overview",
          content: "OneAgent is a Copilot-style auxiliary agent with persona injection and local skills.",
          tags: ["oneagent", "copilot"],
        },
      ],
    }),
  );
  capabilityRegistry.register(createSkillActivateCapability(skillRegistry));

  let executorRef: OneAgentExecutor | null = null;
  capabilityRegistry.register(
    createDelegateAgentCapability({
      getExecutor: () => {
        if (!executorRef) {
          throw new Error("OneAgent executor is not initialized");
        }
        return executorRef;
      },
      profileRegistry,
      defaultAgentId: config.defaults.agent,
    }),
  );

  capabilityRegistry.register(
    createHostActionProxyCapability({
      handler: async (input: JsonValue, ctx: CapabilityContext) => ({
        accepted: true,
        forwarded: input,
        actorId: ctx.actor.userId,
      }),
    }),
  );

  const memoryManager = new DefaultMemoryManager();
  if (config.federation?.config) {
    process.env.COMPO_PLUGINS_CONFIG ??= config.federation.config;
  }

  const federation = await bootstrapFederationFromEnv({
    capabilityRegistry,
    memoryManager,
  });
  if (federation.loaded.length > 0) {
    runtimeLogger.info("federation loaded", { plugins: federation.loaded });
  }
  if (federation.skipped.length > 0) {
    runtimeLogger.warn("federation skipped", { plugins: federation.skipped });
  }

  const hostBridge = mergeHostBridge(createDefaultHostBridge(runtimeLogger), options.hostBridge);

  mkdirSync(dirname(config.kernel.sessionDb), { recursive: true });
  const sessionStore = new SqliteSessionStore({ filename: config.kernel.sessionDb });
  const modelResolver = resolveModel(config, options.mockMode ?? false);
  const contextPipeline = new PersonaContextPipeline({
    profileRegistry,
    skillRegistry,
    config,
  });

  const kernel = new DefaultAgentKernel({
    modelResolver,
    capabilityRegistry,
    memoryManager,
    contextPipeline,
    sessionStore,
    eventBus: new CompositeEventBus(),
    policyEngine: new DefaultPolicyEngine(),
    hostBridge,
  });

  const sidecarUrl =
    config.kernel.mode === "sidecar" && config.kernel.spagentUrl ? config.kernel.spagentUrl : undefined;

  const runtime: OneAgentRuntime = {
    config,
    kernel,
    executor: null as unknown as OneAgentExecutor,
    profileRegistry,
    skillRegistry,
    capabilityRegistry,
    hostBridge,
    modelResolver,
    contextPipeline,
    sessionStore,
    sidecarUrl,
    logger,
  };
  runtime.executor = createOneAgentExecutor(runtime, logger.child("executor"));
  executorRef = runtime.executor;

  runtimeLogger.info("OneAgent runtime ready", {
    agents: profileRegistry.list().length,
    skills: skillRegistry.list().length,
    kernelMode: config.kernel.mode,
    defaultTier: config.defaults.executionTier,
  });

  return runtime;
}
