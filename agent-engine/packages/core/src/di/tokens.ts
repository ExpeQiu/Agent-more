/**
 * DI Tokens — P1-T08
 * Symbol-based injection tokens for all core services
 */

import type {
  IRoleModel,
  IExecutionTraceModel,
  IPerformanceMetricModel,
  IChatMessageService,
  ILLMProviderFactory,
  IDifyClient,
  IDifyGateway,
  IWorkflowEngine,
} from '../interfaces/index.js';

// ─── Model Tokens ────────────────────────────────────────────────────────────

/** Role persistence model */
export const ROLE_MODEL_TOKEN = Symbol.for('IRoleModel');
export type RoleModelToken = typeof ROLE_MODEL_TOKEN;

/** Execution trace persistence model */
export const EXECUTION_TRACE_MODEL_TOKEN = Symbol.for('IExecutionTraceModel');
export type ExecutionTraceModelToken = typeof EXECUTION_TRACE_MODEL_TOKEN;

/** Performance metric persistence model */
export const PERFORMANCE_METRIC_MODEL_TOKEN = Symbol.for('IPerformanceMetricModel');
export type PerformanceMetricModelToken = typeof PERFORMANCE_METRIC_MODEL_TOKEN;

// ─── Service Tokens ───────────────────────────────────────────────────────────

/** Chat message persistence + retrieval service */
export const CHAT_MESSAGE_SERVICE_TOKEN = Symbol.for('IChatMessageService');
export type ChatMessageServiceToken = typeof CHAT_MESSAGE_SERVICE_TOKEN;

/** LLM provider factory (creates ILLMProvider instances) */
export const LLM_PROVIDER_FACTORY_TOKEN = Symbol.for('ILLMProviderFactory');
export type LLMProviderFactoryToken = typeof LLM_PROVIDER_FACTORY_TOKEN;

// ─── External Integration Tokens ───────────────────────────────────────────────

/** Dify HTTP client */
export const DIFY_CLIENT_TOKEN = Symbol.for('IDifyClient');
export type DifyClientToken = typeof DIFY_CLIENT_TOKEN;

/** Dify Gateway (chat + workflow execution) */
export const DIFY_GATEWAY_TOKEN = Symbol.for('IDifyGateway');
export type DifyGatewayToken = typeof DIFY_GATEWAY_TOKEN;

/** Workflow execution engine */
export const WORKFLOW_ENGINE_TOKEN = Symbol.for('IWorkflowEngine');
export type WorkflowEngineToken = typeof WORKFLOW_ENGINE_TOKEN;

// ─── Aggregate Token ──────────────────────────────────────────────────────────

/**
 * All agent dependencies aggregated (convenience token for full config injection)
 */
export const AGENT_DEPENDENCIES_TOKEN = Symbol.for('AgentDependencies');
export type AgentDependenciesToken = typeof AGENT_DEPENDENCIES_TOKEN;
