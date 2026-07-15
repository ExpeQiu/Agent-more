/**
 * P1-M2: State Management Module
 * 
 * 包含：
 * - State Schema 定义（Zod 验证）
 * - State Reducer（4种合并策略）
 * - Context Window Manager（Token 压缩）
 * - Layer1 Memory（进程内内存）
 * - Layer2 Memory（Redis 持久化）
 * - Lineage Tracker（数据血缘追踪）
 */

// State Schema
export {
  // 类型
  type NodeId,
  type ExecutionId,
  type SharedDataField,
  type TechPackagingInput,
  type NodeExecution,
  type TechPackagingNode,
  type TechPackagingOutput,
  type SharedData,
  type TechPackagingState,
  type TechPackagingGraph,
  // 枚举
  NodeType,
  NodeStatus,
  SharedDataType,
  InputSource,
  Priority,
  // Schema
  SharedDataFieldSchema,
  TechPackagingInputSchema,
  NodeExecutionSchema,
  TechPackagingNodeSchema,
  TechPackagingOutputSchema,
  SharedDataSchema,
  TechPackagingStateSchema,
  TechPackagingGraphSchema,
  // 辅助函数
  canExecute,
  isCompleted,
  getNextExecutableNode,
  createEmptyState,
  validateState,
  validateInput,
  NodeId,
  ExecutionId,
} from './state-schema';

// State Reducer
export {
  ReduceStrategy,
  type ConditionalRule,
  type ConditionalOverrideConfig,
  type ReducerConfig,
  type StateAction,
  stateReducer,
  setSharedData,
  setConditionalSharedData,
  validateStateUpdate,
} from './state-reducer';

// Context Window Manager
export {
  type ContextWindowConfig,
  type ContextItem,
  type CompressedContext,
  ContextWindowManager,
  createContextWindowManager,
} from './context-window-manager';

// Layer1 Memory
export {
  type L1MemoryConfig,
  type L1MemoryEntry,
  L1Memory,
  getGlobalL1Memory,
  resetGlobalL1Memory,
} from './memory-l1';

// Layer2 Memory
export {
  type L2MemoryConfig,
  type IRedisClient,
  type RedisTransaction,
  L2Memory,
  createL2Memory,
} from './memory-l2';

// Lineage Tracker
export {
  type LineageNode,
  type LineageEdge,
  type FieldLineage,
  type LineageGraph,
  LineageOperation,
  LineageTracker,
  getGlobalLineageTracker,
  resetGlobalLineageTracker,
} from './lineage-tracker';
