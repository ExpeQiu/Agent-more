/**
 * P1-M2: State Schema 定义
 * TechPackagingState + 子类型，Zod验证
 * 
 * 用于技术传播场景的 Agent 编排引擎状态管理
 */

import { z } from 'zod';

// ============================================================================
// 基础类型定义
// ============================================================================

/** 节点ID类型 */
export type NodeId = string & { __brand: 'NodeId' };
export const NodeId = (id: string): NodeId => id as NodeId;

/** 执行ID类型 */
export type ExecutionId = string & { __brand: 'ExecutionId' };
export const ExecutionId = (id: string): ExecutionId => id as ExecutionId;

/** 节点类型枚举 */
export enum NodeType {
  /** LLM 调用节点 */
  LLM = 'llm',
  /** 工具调用节点 */
  Tool = 'tool',
  /** 条件路由节点 */
  Condition = 'condition',
  /** 并行分支节点 */
  Parallel = 'parallel',
  /** 串行节点 */
  Sequential = 'sequential',
  /** 子图节点 */
  SubGraph = 'subgraph',
  /** 开始节点 */
  Start = 'start',
  /** 结束节点 */
  End = 'end',
}

/** 节点状态枚举 */
export enum NodeStatus {
  Pending = 'pending',
  Running = 'running',
  Completed = 'completed',
  Failed = 'failed',
  Skipped = 'skipped',
}

/** 共享数据类型 */
export enum SharedDataType {
  String = 'string',
  Number = 'number',
  Boolean = 'boolean',
  Object = 'object',
  Array = 'array',
  Text = 'text',       // 技术文档文本
  Markdown = 'markdown',
  Structured = 'structured', // JSON结构化数据
}

/** 输入来源 */
export enum InputSource {
  User = 'user',           // 用户直接输入
  Context = 'context',     // 上下文/历史
  Config = 'config',       // 配置参数
  LLM = 'llm',             // LLM生成
  Tool = 'tool',           // 工具产出
  PreviousNode = 'previous', // 前置节点
}

/** 优先级 */
export enum Priority {
  Critical = 1,   // 必须保留（key fields）
  High = 2,       // 高优先级
  Medium = 3,     // 中优先级
  Low = 4,        // 可压缩
  Discardable = 5, // 可丢弃
}

// ============================================================================
// Zod Schemas
// ============================================================================

/** SharedDataField: 单个共享字段 */
export const SharedDataFieldSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
  type: z.nativeEnum(SharedDataType),
  producerNodeId: z.string().optional(),  // 血缘追踪：生产者节点ID
  priority: z.number().int().min(1).max(5).default(3),
  source: z.nativeEnum(InputSource).default(InputSource.LLM),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.number().default(() => Date.now()),
  updatedAt: z.number().default(() => Date.now()),
});
export type SharedDataField = z.infer<typeof SharedDataFieldSchema>;

/** TechPackagingInput: 技术传播输入 */
export const TechPackagingInputSchema = z.object({
  /** 任务类型 */
  taskType: z.enum(['technical-doc', 'product-intro', 'feature-explain', 'comparison', 'faq', 'custom']),
  /** 产品/技术名称 */
  subjectName: z.string().min(1),
  /** 目标受众 */
  targetAudience: z.enum(['developer', 'product-manager', 'sales', 'customer', 'general']).default('general'),
  /** 语言偏好 */
  language: z.string().default('zh-CN'),
  /** 用户提供的原始输入 */
  userQuery: z.string().min(1),
  /** 用户提供的上下文/参考资料 */
  context: z.record(z.unknown()).optional(),
  /** 配置参数 */
  config: z.object({
    maxLength: z.number().optional(),
    style: z.enum(['formal', 'casual', 'technical']).optional(),
    includeExamples: z.boolean().optional(),
    tone: z.string().optional(),
  }).optional(),
  /** 优先级字段（key fields，这些字段在压缩时必须保留） */
  priorityFields: z.array(z.string()).default([]),
});
export type TechPackagingInput = z.infer<typeof TechPackagingInputSchema>;

/** NodeExecution: 单个节点执行记录 */
export const NodeExecutionSchema = z.object({
  nodeId: z.string(),
  nodeType: z.nativeEnum(NodeType),
  status: z.nativeEnum(NodeStatus).default(NodeStatus.Pending),
  input: z.record(z.unknown()).optional(),
  output: z.record(z.unknown()).optional(),
  error: z.string().optional(),
  startTime: z.number().optional(),
  endTime: z.number().optional(),
  retryCount: z.number().default(0),
  metadata: z.record(z.unknown()).optional(),
});
export type NodeExecution = z.infer<typeof NodeExecutionSchema>;

/** TechPackagingNode: 技术传播节点 */
export const TechPackagingNodeSchema = z.object({
  id: z.string(),
  type: z.nativeEnum(NodeType),
  name: z.string(),
  config: z.record(z.unknown()).optional(),
  inputMapping: z.record(z.string()).optional(),   // 外部输入到本节点的映射
  outputMapping: z.record(z.string()).optional(), // 本节点输出到共享数据的映射
  condition: z.string().optional(),               // 条件节点的判断条件
  priority: z.number().int().min(1).max(5).default(3),
});
export type TechPackagingNode = z.infer<typeof TechPackagingNodeSchema>;

/** TechPackagingOutput: 技术传播输出 */
export const TechPackagingOutputSchema = z.object({
  /** 最终生成的内容 */
  content: z.string(),
  /** 内容格式 */
  format: z.enum(['markdown', 'html', 'json', 'text']).default('markdown'),
  /** 内容类型 */
  contentType: z.string(),
  /** 生成的章节/段落结构 */
  sections: z.array(z.object({
    title: z.string(),
    content: z.string(),
    order: z.number(),
  })).optional(),
  /** 关键信息摘要 */
  keyPoints: z.array(z.string()).optional(),
  /** 输出元数据 */
  metadata: z.object({
    model: z.string().optional(),
    finishReason: z.string().optional(),
    tokenUsage: z.object({
      promptTokens: z.number(),
      completionTokens: z.number(),
      totalTokens: z.number(),
    }).optional(),
  }).optional(),
});
export type TechPackagingOutput = z.infer<typeof TechPackagingOutputSchema>;

/** SharedData: 节点间共享数据 */
export const SharedDataSchema = z.object({
  fields: z.record(SharedDataFieldSchema),
  version: z.number().default(1),
  lastUpdatedBy: z.string().optional(),
});
export type SharedData = z.infer<typeof SharedDataSchema>;

/** TechPackagingState: 主状态类型 */
export const TechPackagingStateSchema = z.object({
  /** 执行ID */
  executionId: z.string(),
  /** 任务状态 */
  status: z.enum(['idle', 'running', 'completed', 'failed', 'cancelled']).default('idle'),
  /** 创建时间 */
  createdAt: z.number(),
  /** 更新时间 */
  updatedAt: z.number(),
  /** 开始执行时间 */
  startedAt: z.number().optional(),
  /** 结束时间 */
  endedAt: z.number().optional(),
  /** 输入 */
  input: TechPackagingInputSchema,
  /** 节点执行记录 */
  nodes: z.array(TechPackagingNodeSchema),
  /** 当前待执行节点队列 */
  pendingNodeIds: z.array(z.string()).default([]),
  /** 正在执行的节点ID */
  runningNodeId: z.string().optional(),
  /** 已完成节点ID集合 */
  completedNodeIds: z.array(z.string()).default([]),
  /** 失败的节点ID */
  failedNodeIds: z.array(z.string()).default([]),
  /** 节点执行详情 */
  nodeExecutions: z.record(z.string(), NodeExecutionSchema),
  /** 共享数据（节点间传递） */
  sharedData: SharedDataSchema,
  /** 最终输出 */
  output: TechPackagingOutputSchema.optional(),
  /** 执行错误 */
  error: z.string().optional(),
  /** 执行错误详情 */
  errorDetails: z.record(z.unknown()).optional(),
  /** 全局元数据 */
  metadata: z.record(z.unknown()).optional(),
});
export type TechPackagingState = z.infer<typeof TechPackagingStateSchema>;

/** TechPackagingGraph: DAG 图结构 */
export const TechPackagingGraphSchema = z.object({
  nodes: z.array(TechPackagingNodeSchema),
  edges: z.array(z.object({
    from: z.string(),
    to: z.string(),
    label: z.string().optional(),
  })),
});
export type TechPackagingGraph = z.infer<typeof TechPackagingGraphSchema>;

// ============================================================================
// 验证辅助函数
// ============================================================================

/** 验证状态是否可执行 */
export function canExecute(state: TechPackagingState): boolean {
  return state.status === 'running' && 
         state.pendingNodeIds.length > 0 &&
         !state.runningNodeId;
}

/** 验证状态是否已完成 */
export function isCompleted(state: TechPackagingState): boolean {
  return state.status === 'completed' || 
         state.status === 'failed' ||
         state.status === 'cancelled';
}

/** 获取下一个可执行节点 */
export function getNextExecutableNode(state: TechPackagingState): TechPackagingNode | null {
  if (!canExecute(state)) return null;
  const nextNodeId = state.pendingNodeIds[0];
  return state.nodes.find(n => n.id === nextNodeId) || null;
}

/** 创建空状态 */
export function createEmptyState(executionId: string, input: TechPackagingInput): TechPackagingState {
  return {
    executionId,
    status: 'idle',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    input,
    nodes: [],
    pendingNodeIds: [],
    completedNodeIds: [],
    failedNodeIds: [],
    nodeExecutions: {},
    sharedData: { fields: {}, version: 1 },
  };
}

/** 验证状态 */
export function validateState(state: unknown): { valid: boolean; error?: string } {
  try {
    TechPackagingStateSchema.parse(state);
    return { valid: true };
  } catch (e) {
    if (e instanceof z.ZodError) {
      return { valid: false, error: e.message };
    }
    return { valid: false, error: String(e) };
  }
}

/** 验证输入 */
export function validateInput(input: unknown): { valid: boolean; error?: string } {
  try {
    TechPackagingInputSchema.parse(input);
    return { valid: true };
  } catch (e) {
    if (e instanceof z.ZodError) {
      return { valid: false, error: e.message };
    }
    return { valid: false, error: String(e) };
  }
}
