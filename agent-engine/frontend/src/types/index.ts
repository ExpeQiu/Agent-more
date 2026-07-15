// ─── Core Types for Agent编排引擎 Frontend ───────────────────────────────────

// ─── Scene Types ─────────────────────────────────────────────────────────────

export interface SceneRule {
  field: string;
  operator: 'contains' | 'equals' | 'startsWith' | 'endsWith' | 'regex' | 'in' | 'gt' | 'lt';
  value: string | string[] | number | RegExp;
  weight?: number;
}

export interface FewShotExample {
  query: string;
  sceneId: string;
  label: 'positive' | 'negative';
}

export interface SceneDefinition {
  id: string;
  name: string;
  description: string;
  triggerWords: string[];
  rules: SceneRule[];
  fewShotExamples?: FewShotExample[];
  priority?: number;
  enabled: boolean;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateSceneInput {
  name: string;
  description: string;
  triggerWords: string[];
  rules: SceneRule[];
  priority?: number;
  enabled?: boolean;
}

export interface UpdateSceneInput extends Partial<CreateSceneInput> {
  id: string;
}

// ─── Execution Types ─────────────────────────────────────────────────────────

export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface AgentExecutionResult {
  agentId: string;
  agentName: string;
  agentType: string;
  output?: string;
  qualityScore?: number;
  durationMs?: number;
  status: ExecutionStatus;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface Execution {
  id: string;
  task: string;
  status: ExecutionStatus;
  result?: {
    agents: AgentExecutionResult[];
    totalDurationMs: number;
    routingDecision?: {
      sceneId: string;
      sceneName: string;
      confidence: number;
    };
  };
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  sceneId?: string;
  sceneName?: string;
}

export interface SSEEvent {
  type: 'execution_started' | 'agent_progress' | 'agent_completed' | 'execution_completed' | 'execution_failed' | 'ping';
  executionId?: string;
  agentId?: string;
  agentName?: string;
  agentType?: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

// ─── Agent Types ─────────────────────────────────────────────────────────────

export type AgentType = 'coder' | 'pm' | 'qa' | 'pmo';

export interface Agent {
  id: string;
  name: string;
  type: AgentType;
  config?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ─── Health Check ─────────────────────────────────────────────────────────────

export interface HealthStatus {
  ok: boolean;
  redis: boolean;
  database: boolean;
}

// ─── API Response Wrapper ────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}
