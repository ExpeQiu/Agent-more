// @agent-engine/core
export const VERSION = '0.1.0';

// IOC / DI Container (P1-T08)
export {
  Container,
  getRootContainer,
  setRootContainer,
  resetRootContainer,
  mockOf,
  ROLE_MODEL_TOKEN,
  EXECUTION_TRACE_MODEL_TOKEN,
  PERFORMANCE_METRIC_MODEL_TOKEN,
  CHAT_MESSAGE_SERVICE_TOKEN,
  LLM_PROVIDER_FACTORY_TOKEN,
  DIFY_CLIENT_TOKEN,
  DIFY_GATEWAY_TOKEN,
  WORKFLOW_ENGINE_TOKEN,
  AGENT_DEPENDENCIES_TOKEN,
} from './di/index.js';

// Types
export * from './types';

// Interfaces (for host applications to implement)
export * from './interfaces';

// Events (ToolCallEventManager)
export { ToolCallEventManager, toolCallEventManager, ToolCallEventType } from './events/ToolCallEventManager';
export type { ToolCallEvent } from './events/ToolCallEventManager';

// Prompt
export { PromptManager } from './prompt';

// Context
export { ContextManager } from './context';
export type { ContextManagerConfig } from './context';

// Executor
export { ToolExecutor, toolToRoleMapping, toolToFeatureTypeMapping } from './executor';
export type { ToolExecutorConfig, ToolExecutionResult, SingleToolResult } from './executor';

// Orchestrator
export { AgentOrchestrator } from './orchestrator';
export type { AgentExecutionResult, AgentOrchestratorConfig } from './orchestrator';

// Expert Tools
export { expertTools, toolToRoleMapping as expertToolToRoleMapping, toolToFeatureTypeMapping as expertToolToFeatureTypeMapping } from './tools';

// C-DAG Execution Engine
export {
  CdagExecutor,
  LoopGuard,
  RetryNodeExecutor,
  ReflectNodeExecutor,
  ParallelNodeExecutor,
} from './cdag';
export type {
  CdagExecutorConfig,
  LoopGuardConfig,
  LoopGuardCheckResult,
  RetryOptions,
  RetryState,
  ReflectOptions,
  QualityScore,
  ReflectNodeResult,
  ParallelExecutionResult,
  ParallelNodeExecutorOptions,
} from './cdag';
export * from './cdag/types/cdag';

// Quality Scorer (P1-T30)
export {
  LLMJudge,
  quickScore,
} from './cdag/quality-scorer';
export type {
  QualityScorer,
  ScoreParams,
  ScoreResult,
  ScoreDimensions,
  ScoreMode,
} from './cdag/quality-scorer';

// State Management (P1-M2)
export * from './state';
