/**
 * C-DAG 核心数据类型定义
 * C-DAG: Conditional Directed Acyclic Graph
 * 支持串行、并行、条件分支的 DAG 执行引擎
 */

// ============================================================
// 节点类型枚举
// ============================================================

export enum NodeType {
  /** LLM 调用节点 */
  LLM = 'llm',
  /** 工具调用节点 */
  TOOL = 'tool',
  /** 条件分支节点 */
  CONDITIONAL = 'conditional',
  /** 并行执行节点 */
  PARALLEL = 'parallel',
  /** 重试节点 */
  RETRY = 'retry',
  /** 反思/质量评审节点 */
  REFLECT = 'reflect',
  /** 开始节点 */
  START = 'start',
  /** 结束节点 */
  END = 'end',
  /** 子图节点（嵌入另一个 DAG） */
  SUBGRAPH = 'subgraph',
}

// ============================================================
// 节点执行状态
// ============================================================

export enum NodeStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
  WAITING = 'waiting', // 等待并行节点完成
}

// ============================================================
// 基础节点配置
// ============================================================

export interface BaseNodeConfig {
  /** 节点唯一 ID */
  id: string;
  /** 节点类型 */
  type: NodeType;
  /** 节点名称（可选，用于日志） */
  name?: string;
  /** 节点描述 */
  description?: string;
  /** 节点超时时间（毫秒），默认 5 分钟 */
  timeout?: number;
  /** 是否启用 */
  enabled?: boolean;
  /** 节点元数据 */
  metadata?: Record<string, any>;
}

export interface LLMNodeConfig extends BaseNodeConfig {
  type: NodeType.LLM;
  /** 系统提示词 */
  systemPrompt?: string;
  /** 用户消息模板 */
  userMessageTemplate?: string;
  /** 动态输入变量映射: { nodeOutputKey: 'variableName' } */
  inputMapping?: Record<string, string>;
  /** LLM 提供者配置 */
  llmConfig: {
    provider: 'openai' | 'azure-openai' | 'qwen' | 'ernie' | 'custom';
    model: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
  };
  /** 期望的输出格式 */
  outputFormat?: 'text' | 'json' | 'structured';
}

export interface ToolNodeConfig extends BaseNodeConfig {
  type: NodeType.TOOL;
  /** 工具 ID 或名称 */
  toolId: string;
  /** 工具参数模板 */
  parameters?: Record<string, any>;
  /** 输入变量映射 */
  inputMapping?: Record<string, string>;
}

export interface ConditionalNodeConfig extends BaseNodeConfig {
  type: NodeType.CONDITIONAL;
  /** 条件表达式，示例: "score < 0.7" */
  conditionExpression: string;
  /** 当条件为 true 时跳转的节点 ID */
  trueNodeId: string;
  /** 当条件为 false 时跳转的节点 ID */
  falseNodeId: string;
  /** 可选：输入变量映射（用于条件求值） */
  inputMapping?: Record<string, string>;
}

export interface ParallelNodeConfig extends BaseNodeConfig {
  type: NodeType.PARALLEL;
  /** 并行策略 */
  strategy: 'all' | 'any';
  /** 要并行执行的子节点 ID 列表 */
  nodeIds: string[];
  /** 汇聚节点 ID（并行分支完成后跳转） */
  convergeNodeId?: string;
}

export interface RetryNodeConfig extends BaseNodeConfig {
  type: NodeType.RETRY;
  /** 最大重试次数，默认 3 */
  maxRetries?: number;
  /** 可重试的错误类型 */
  retryableErrors?: string[];
  /** 重试间隔（毫秒），支持指数退避 */
  retryDelayMs?: number;
  /** 是否使用指数退避 */
  exponentialBackoff?: boolean;
  /** 子节点 ID */
  childNodeId: string;
}

export interface ReflectNodeConfig extends BaseNodeConfig {
  type: NodeType.REFLECT;
  /** 质量评分阈值，低于此值跳转返工 */
  qualityThreshold: number;
  /** 用于评分的前一个节点 ID */
  sourceNodeId: string;
  /** 质量达标时跳转的节点 ID */
  passNodeId: string;
  /** 质量不达标时跳转的节点 ID（返工） */
  failNodeId: string;
  /** 评分维度权重 */
  scoringDimensions?: {
    relevance?: number;   // 相关性 0-1
    accuracy?: number;    // 准确性 0-1
    completeness?: number; // 完整性 0-1
  };
}

export interface StartNodeConfig extends BaseNodeConfig {
  type: NodeType.START;
  /** 初始输入变量 */
  initialInputs?: Record<string, any>;
}

export interface EndNodeConfig extends BaseNodeConfig {
  type: NodeType.END;
  /** 输出字段映射 */
  outputMapping?: Record<string, string>;
}

export interface SubgraphNodeConfig extends BaseNodeConfig {
  type: NodeType.SUBGRAPH;
  /** 子图定义（内联）或子图 ID（引用） */
  subgraph?: ExecutionGraph;
  subgraphId?: string;
  /** 子图输入映射 */
  inputMapping?: Record<string, string>;
  /** 子图输出映射 */
  outputMapping?: Record<string, string>;
}

export type GraphNodeConfig =
  | LLMNodeConfig
  | ToolNodeConfig
  | ConditionalNodeConfig
  | ParallelNodeConfig
  | RetryNodeConfig
  | ReflectNodeConfig
  | StartNodeConfig
  | EndNodeConfig
  | SubgraphNodeConfig;

// ============================================================
// 边定义
// ============================================================

export interface Edge {
  /** 边唯一 ID */
  id?: string;
  /** 源节点 ID */
  sourceId: string;
  /** 目标节点 ID */
  targetId: string;
  /** 边的条件（可选，用于条件边） */
  condition?: string;
  /** 是否启用 */
  enabled?: boolean;
}

// ============================================================
// 图定义
// ============================================================

export interface ExecutionGraph {
  /** 图唯一 ID */
  id: string;
  /** 图名称 */
  name?: string;
  /** 图版本 */
  version?: string;
  /** 所有节点配置 */
  nodes: GraphNodeConfig[];
  /** 所有边（无环检查在执行前完成） */
  edges: Edge[];
  /** 开始节点 ID */
  startNodeId: string;
  /** 结束节点 ID 列表（支持多终点） */
  endNodeIds: string[];
  /** 图级别元数据 */
  metadata?: Record<string, any>;
}

// ============================================================
// 节点执行结果
// ============================================================

export interface NodeExecutionResult {
  /** 节点 ID */
  nodeId: string;
  /** 节点类型 */
  nodeType: NodeType;
  /** 执行状态 */
  status: NodeStatus;
  /** 输出数据 */
  output?: any;
  /** 错误信息 */
  error?: string;
  /** 开始时间 */
  startTime: number;
  /** 结束时间 */
  endTime?: number;
  /** 执行耗时（毫秒） */
  duration?: number;
  /** 重试次数 */
  retryCount?: number;
  /** 质量评分（仅 Reflect 节点） */
  qualityScore?: number;
  /** 详细日志 */
  logs?: string[];
}

export interface GraphExecutionResult {
  /** 图执行 ID */
  executionId: string;
  /** 图 ID */
  graphId: string;
  /** 最终状态 */
  status: 'success' | 'failed' | 'cancelled' | 'timeout';
  /** 所有节点执行结果 */
  nodeResults: Map<string, NodeExecutionResult>;
  /** 最终输出 */
  output?: any;
  /** 开始时间 */
  startTime: number;
  /** 结束时间 */
  endTime?: number;
  /** 总耗时（毫秒） */
  totalDuration?: number;
  /** 触发终止的原因 */
  terminationReason?: string;
}

// ============================================================
// 节点执行上下文
// ============================================================

export interface NodeExecutionContext {
  /** 当前节点配置 */
  node: GraphNodeConfig;
  /** 节点输入（从前序节点输出合并） */
  input: any;
  /** 全局共享状态 */
  globalState: Record<string, any>;
  /** 当前执行深度（用于循环检测） */
  executionPath: string[];
  /** LLM Provider 工厂（用于 LLM 节点） */
  llmProviderFactory?: any;
  /** 工具执行器（用于 Tool 节点） */
  toolExecutor?: any;
  /** 日志收集器 */
  logger: ExecutionLogger;
}

export interface ExecutionLogger {
  info: (message: string, data?: any) => void;
  warn: (message: string, data?: any) => void;
  error: (message: string, data?: any) => void;
  debug: (message: string, data?: any) => void;
}

// ============================================================
// LoopGuard 状态
// ============================================================

export interface LoopGuardState {
  /** 全局已执行步数 */
  globalStepCount: number;
  /** 各节点执行次数 Map */
  nodeExecutionCounts: Map<string, number>;
  /** 开始时间戳 */
  startTime: number;
}

// ============================================================
// Retry 状态
// ============================================================

export interface RetryState {
  /** 当前重试次数 */
  attemptCount: number;
  /** 最大重试次数 */
  maxRetries: number;
  /** 上次错误信息 */
  lastError?: string;
  /** 重试历史 */
  retryHistory: Array<{
    attempt: number;
    error: string;
    timestamp: number;
  }>;
}


