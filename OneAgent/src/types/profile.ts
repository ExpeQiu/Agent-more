export type ProfileVariableDef = {
  type?: "string" | "enum";
  default?: string;
  enum?: string[];
};

export type AgentProfileSpec = {
  persona: {
    system: string;
    variables?: Record<string, ProfileVariableDef | string>;
  };
  capabilities?: {
    allow?: string[];
    deny?: string[];
    requireApproval?: string[];
  };
  constraints?: {
    maxIterations?: number;
    maxToolCalls?: number;
    timeoutMs?: number;
  };
  skills?: {
    autoLoad?: string[];
    remote?: string[];
  };
  context?: {
    injectRules?: string[];
  };
  execution?: {
    defaultTier?: "standalone" | "kernel" | "auto";
    escalateToKernelWhen?: {
      hasContextRefs?: boolean;
      requiresTools?: boolean;
    };
  };
  delegation?: {
    allow?: string[];
    defaultTier?: "standalone" | "kernel" | "auto";
  };
};

export type AgentProfile = {
  apiVersion: string;
  kind: "AgentProfile";
  metadata: {
    id: string;
    name: string;
    version: string;
    description?: string;
  };
  spec: AgentProfileSpec;
};

export type AgentProfileSummary = {
  id: string;
  name: string;
  version: string;
  description?: string;
};

export type OneAgentConfig = {
  server: {
    port: number;
    gatewayToken?: string;
  };
  kernel: {
    mode: "embedded" | "sidecar";
    spagentUrl?: string;
    sessionDb: string;
  };
  agents: {
    dir: string;
  };
  skills: {
    dir: string;
    maxInjectChars: number;
    remote?: {
      skillforge?: {
        base: string;
        enabled: boolean;
      };
    };
  };
  federation?: {
    config?: string;
  };
  model: {
    provider: string;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
  };
  defaults: {
    agent: string;
    tenant: string;
    executionTier: "standalone" | "kernel" | "auto";
  };
  logging: {
    level: "debug" | "info" | "warn" | "error";
    file?: string;
  };
};

export const AGENT_ID_METADATA_KEY = "agentId";
export const PERSONA_OVERRIDES_METADATA_KEY = "personaOverrides";
