/**
 * P1-M2: State Reducer 策略实现
 * 
 * 四种状态合并策略：
 * 1. override - 完全覆盖
 * 2. append - 追加（数组）
 * 3. merge - 深度合并（对象）
 * 4. conditional_override - 条件覆盖
 */

import type {
  TechPackagingState,
  TechPackagingNode,
  NodeExecution,
  SharedData,
  SharedDataField,
  NodeStatus,
  TechPackagingOutput,
} from './state-schema';
import { TechPackagingStateSchema, NodeExecutionSchema } from './state-schema';

// ============================================================================
// 策略类型定义
// ============================================================================

export enum ReduceStrategy {
  /** 完全覆盖 */
  Override = 'override',
  /** 追加（数组） */
  Append = 'append',
  /** 深度合并（对象） */
  Merge = 'merge',
  /** 条件覆盖 */
  ConditionalOverride = 'conditional_override',
}

/** 条件覆盖的条件定义 */
export interface ConditionalRule {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'exists' | 'notExists';
  value?: unknown;
}

/** 条件覆盖配置 */
export interface ConditionalOverrideConfig {
  rules: ConditionalRule[];
  // 当所有规则满足时使用 sourceValue，否则使用 targetValue
  sourceValue: unknown;
  targetValue: unknown;
}

/** Reducer 配置 */
export interface ReducerConfig {
  strategy: ReduceStrategy;
  fieldPath?: string;
  conditionalConfig?: ConditionalOverrideConfig;
}

// ============================================================================
// 状态更新动作类型
// ============================================================================

export type StateAction =
  | { type: 'INIT'; payload: { executionId: string; nodes: TechPackagingNode[]; input: TechPackagingState['input'] } }
  | { type: 'START' }
  | { type: 'COMPLETE' }
  | { type: 'FAIL'; payload: { error: string; details?: Record<string, unknown> } }
  | { type: 'CANCEL' }
  | { type: 'NODE_START'; payload: { nodeId: string } }
  | { type: 'NODE_COMPLETE'; payload: { nodeId: string; output: Record<string, unknown> } }
  | { type: 'NODE_FAIL'; payload: { nodeId: string; error: string } }
  | { type: 'NODE_SKIP'; payload: { nodeId: string; reason?: string } }
  | { type: 'SET_SHARED_DATA'; payload: { key: string; value: unknown; field?: Partial<SharedDataField> }; strategy?: ReduceStrategy }
  | { type: 'MERGE_SHARED_DATA'; payload: SharedData }
  | { type: 'SET_OUTPUT'; payload: TechPackagingOutput }
  | { type: 'UPDATE_METADATA'; payload: Record<string, unknown> }
  | { type: 'CUSTOM_UPDATE'; payload: Partial<TechPackagingState> };

// ============================================================================
// 核心 Reducer
// ============================================================================

/**
 * 状态 Reducer 主函数
 */
export function stateReducer(state: TechPackagingState, action: StateAction): TechPackagingState {
  const now = Date.now();

  switch (action.type) {
    case 'INIT':
      return {
        ...state,
        executionId: action.payload.executionId,
        status: 'idle',
        createdAt: now,
        updatedAt: now,
        input: action.payload.input,
        nodes: action.payload.nodes,
        pendingNodeIds: action.payload.nodes.map(n => n.id),
        completedNodeIds: [],
        failedNodeIds: [],
        nodeExecutions: {},
        sharedData: { fields: {}, version: 1 },
        output: undefined,
        error: undefined,
        errorDetails: undefined,
      };

    case 'START':
      return {
        ...state,
        status: 'running',
        updatedAt: now,
        startedAt: now,
      };

    case 'COMPLETE':
      return {
        ...state,
        status: 'completed',
        updatedAt: now,
        endedAt: now,
        pendingNodeIds: [],
        runningNodeId: undefined,
      };

    case 'FAIL':
      return {
        ...state,
        status: 'failed',
        updatedAt: now,
        endedAt: now,
        pendingNodeIds: [],
        runningNodeId: undefined,
        error: action.payload.error,
        errorDetails: action.payload.details,
      };

    case 'CANCEL':
      return {
        ...state,
        status: 'cancelled',
        updatedAt: now,
        endedAt: now,
        pendingNodeIds: [],
        runningNodeId: undefined,
      };

    case 'NODE_START': {
      const nodeId = action.payload.nodeId;
      const nodeExecution: NodeExecution = {
        nodeId,
        nodeType: state.nodes.find(n => n.id === nodeId)?.type || 'llm',
        status: NodeStatus.Running,
        startTime: now,
        retryCount: state.nodeExecutions[nodeId]?.retryCount || 0,
      };
      return {
        ...state,
        status: 'running',
        updatedAt: now,
        runningNodeId: nodeId,
        pendingNodeIds: state.pendingNodeIds.filter(id => id !== nodeId),
        nodeExecutions: {
          ...state.nodeExecutions,
          [nodeId]: nodeExecution,
        },
      };
    }

    case 'NODE_COMPLETE': {
      const { nodeId, output } = action.payload;
      const existing = state.nodeExecutions[nodeId];
      const nodeExecution: NodeExecution = {
        nodeId,
        nodeType: existing?.nodeType || 'llm',
        status: NodeStatus.Completed,
        input: existing?.input,
        output,
        startTime: existing?.startTime,
        endTime: now,
        retryCount: existing?.retryCount || 0,
      };
      return {
        ...state,
        updatedAt: now,
        runningNodeId: undefined,
        completedNodeIds: [...state.completedNodeIds, nodeId],
        nodeExecutions: {
          ...state.nodeExecutions,
          [nodeId]: nodeExecution,
        },
        // 如果没有更多待执行节点，自动完成
        status: state.pendingNodeIds.filter(id => id !== nodeId).length === 0 ? 'completed' : 'running',
        endedAt: state.pendingNodeIds.filter(id => id !== nodeId).length === 0 ? now : undefined,
      };
    }

    case 'NODE_FAIL': {
      const { nodeId, error } = action.payload;
      const existing = state.nodeExecutions[nodeId];
      const nodeExecution: NodeExecution = {
        nodeId,
        nodeType: existing?.nodeType || 'llm',
        status: NodeStatus.Failed,
        input: existing?.input,
        output: existing?.output,
        error,
        startTime: existing?.startTime,
        endTime: now,
        retryCount: existing?.retryCount || 0,
      };
      return {
        ...state,
        updatedAt: now,
        runningNodeId: undefined,
        failedNodeIds: [...state.failedNodeIds, nodeId],
        nodeExecutions: {
          ...state.nodeExecutions,
          [nodeId]: nodeExecution,
        },
      };
    }

    case 'NODE_SKIP': {
      const { nodeId } = action.payload;
      const existing = state.nodeExecutions[nodeId];
      const nodeExecution: NodeExecution = {
        nodeId,
        nodeType: existing?.nodeType || 'llm',
        status: NodeStatus.Skipped,
        input: existing?.input,
        output: existing?.output,
        startTime: existing?.startTime,
        endTime: now,
        retryCount: existing?.retryCount || 0,
      };
      return {
        ...state,
        updatedAt: now,
        pendingNodeIds: state.pendingNodeIds.filter(id => id !== nodeId),
        nodeExecutions: {
          ...state.nodeExecutions,
          [nodeId]: nodeExecution,
        },
      };
    }

    case 'SET_SHARED_DATA': {
      const { key, value, field } = action.payload;
      const strategy = action.strategy || ReduceStrategy.Override;
      const existingField = state.sharedData.fields[key];
      const newValue = applyStrategy(existingField?.value, value, strategy);
      const newField: SharedDataField = {
        key,
        value: newValue,
        type: inferType(newValue),
        producerNodeId: field?.producerNodeId || state.runningNodeId,
        priority: field?.priority ?? existingField?.priority ?? 3,
        source: field?.source ?? existingField?.source ?? 'llm',
        metadata: field?.metadata ?? existingField?.metadata,
        createdAt: existingField?.createdAt || now,
        updatedAt: now,
      };
      return {
        ...state,
        updatedAt: now,
        sharedData: {
          fields: {
            ...state.sharedData.fields,
            [key]: newField,
          },
          version: state.sharedData.version + 1,
          lastUpdatedBy: state.runningNodeId,
        },
      };
    }

    case 'MERGE_SHARED_DATA':
      return {
        ...state,
        updatedAt: now,
        sharedData: mergeSharedData(state.sharedData, action.payload),
      };

    case 'SET_OUTPUT':
      return {
        ...state,
        updatedAt: now,
        output: action.payload,
      };

    case 'UPDATE_METADATA':
      return {
        ...state,
        updatedAt: now,
        metadata: {
          ...state.metadata,
          ...action.payload,
        },
      };

    case 'CUSTOM_UPDATE':
      return {
        ...state,
        ...action.payload,
        updatedAt: now,
      };

    default:
      return state;
  }
}

// ============================================================================
// 策略实现
// ============================================================================

/**
 * 应用策略合并两个值
 */
function applyStrategy(
  target: unknown,
  source: unknown,
  strategy: ReduceStrategy,
  config?: ConditionalOverrideConfig
): unknown {
  switch (strategy) {
    case ReduceStrategy.Override:
      return source;

    case ReduceStrategy.Append:
      if (Array.isArray(target) && Array.isArray(source)) {
        return [...target, ...source];
      }
      if (Array.isArray(target)) {
        return [...target, source];
      }
      if (Array.isArray(source)) {
        return [target, ...source];
      }
      return [target, source];

    case ReduceStrategy.Merge:
      if (isObject(target) && isObject(source)) {
        return deepMerge(target, source);
      }
      return source;

    case ReduceStrategy.ConditionalOverride:
      if (config) {
        return evaluateConditionalOverride(target, config);
      }
      return source;

    default:
      return source;
  }
}

/**
 * 深度合并两个对象
 */
function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };
  
  for (const key of Object.keys(source)) {
    const targetValue = target[key];
    const sourceValue = source[key];
    
    if (isObject(targetValue) && isObject(sourceValue)) {
      result[key] = deepMerge(targetValue as Record<string, unknown>, sourceValue as Record<string, unknown>);
    } else {
      result[key] = sourceValue;
    }
  }
  
  return result;
}

/**
 * 推断值的类型
 */
function inferType(value: unknown): import('./state-schema').SharedDataType {
  if (typeof value === 'string') {
    if (value.length > 1000 || value.includes('\n')) {
      return 'text';
    }
    return 'string';
  }
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (Array.isArray(value)) return 'array';
  if (isObject(value)) return 'object';
  return 'string';
}

/**
 * 检查是否为普通对象
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 评估条件覆盖
 */
function evaluateConditionalOverride(target: unknown, config: ConditionalOverrideConfig): unknown {
  const allMatch = config.rules.every(rule => {
    const actualValue = getNestedValue(target, rule.field);
    
    switch (rule.operator) {
      case 'eq':
        return actualValue === rule.value;
      case 'neq':
        return actualValue !== rule.value;
      case 'gt':
        return typeof actualValue === 'number' && typeof rule.value === 'number' && actualValue > rule.value;
      case 'lt':
        return typeof actualValue === 'number' && typeof rule.value === 'number' && actualValue < rule.value;
      case 'gte':
        return typeof actualValue === 'number' && typeof rule.value === 'number' && actualValue >= rule.value;
      case 'lte':
        return typeof actualValue === 'number' && typeof rule.value === 'number' && actualValue <= rule.value;
      case 'exists':
        return actualValue !== undefined && actualValue !== null;
      case 'notExists':
        return actualValue === undefined || actualValue === null;
      default:
        return false;
    }
  });
  
  return allMatch ? config.sourceValue : config.targetValue;
}

/**
 * 获取嵌套对象的值
 */
function getNestedValue(obj: unknown, path: string): unknown {
  const keys = path.split('.');
  let current: unknown = obj;
  
  for (const key of keys) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  
  return current;
}

/**
 * 合并 SharedData
 */
function mergeSharedData(target: SharedData, source: SharedData): SharedData {
  const mergedFields = { ...target.fields };
  
  for (const [key, sourceField] of Object.entries(source.fields)) {
    const targetField = mergedFields[key];
    
    if (targetField) {
      // 字段已存在，深度合并
      mergedFields[key] = {
        ...sourceField,
        value: deepMerge(
          isObject(targetField.value) ? targetField.value as Record<string, unknown> : {},
          isObject(sourceField.value) ? sourceField.value as Record<string, unknown> : {}
        ),
        createdAt: Math.min(targetField.createdAt, sourceField.createdAt),
        updatedAt: Math.max(targetField.updatedAt, sourceField.updatedAt),
      };
    } else {
      mergedFields[key] = sourceField;
    }
  }
  
  return {
    fields: mergedFields,
    version: Math.max(target.version, source.version) + 1,
    lastUpdatedBy: source.lastUpdatedBy || target.lastUpdatedBy,
  };
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 创建带策略的 SET_SHARED_DATA action
 */
export function setSharedData(
  key: string,
  value: unknown,
  strategy: ReduceStrategy = ReduceStrategy.Override,
  field?: Partial<SharedDataField>
): StateAction {
  return {
    type: 'SET_SHARED_DATA',
    payload: { key, value, field },
    strategy,
  };
}

/**
 * 创建带条件覆盖配置的 action
 */
export function setConditionalSharedData(
  key: string,
  config: ConditionalOverrideConfig,
  field?: Partial<SharedDataField>
): StateAction {
  return {
    type: 'SET_SHARED_DATA',
    payload: { key, value: config, field },
    strategy: ReduceStrategy.ConditionalOverride,
  };
}

/**
 * 验证更新后的状态
 */
export function validateStateUpdate(state: TechPackagingState): { valid: boolean; error?: string } {
  try {
    TechPackagingStateSchema.parse(state);
    return { valid: true };
  } catch (e) {
    if (e instanceof import('zod').ZodError) {
      return { valid: false, error: e.message };
    }
    return { valid: false, error: String(e) };
  }
}
