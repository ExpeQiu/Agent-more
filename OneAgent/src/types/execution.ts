export type ExecutionTier = "standalone" | "kernel" | "auto";

export type ExecutionTierMetadata = ExecutionTier;

export const EXECUTION_TIER_METADATA_KEY = "executionTier";

export type ExecutionResultMeta = {
  tier: "standalone" | "kernel";
  routedBy: "explicit" | "profile" | "config" | "auto";
};

export type OneAgentRunOptions = {
  tier?: ExecutionTier;
};
