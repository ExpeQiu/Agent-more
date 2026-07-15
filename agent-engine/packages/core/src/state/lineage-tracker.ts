/**
 * P1-M2: 数据血缘追踪器
 * 
 * 功能：
 * - 追踪每条 sharedData 字段的生产者节点ID
 * - 记录数据 transformations
 * - 支持数据溯源查询
 */

import type { TechPackagingState, SharedDataField } from './state-schema';
import { InputSource } from './state-schema';

// ============================================================================
// 血缘记录类型
// ============================================================================

/** 血缘操作类型 */
export enum LineageOperation {
  Create = 'create',
  Read = 'read',
  Update = 'update',
  Delete = 'delete',
  Transform = 'transform',
  Merge = 'merge',
  Split = 'split',
  Route = 'route',
}

/** 血缘节点 */
export interface LineageNode {
  /** 血缘记录 ID */
  id: string;
  /** 所属执行 ID */
  executionId: string;
  /** 操作类型 */
  operation: LineageOperation;
  /** 操作的字段 */
  fieldKey: string;
  /** 源节点 ID（生产者） */
  sourceNodeId?: string;
  /** 目标节点 ID（消费者） */
  targetNodeId?: string;
  /** 源字段（用于 transform、merge 等操作） */
  sourceFields?: Array<{ key: string; nodeId?: string }>;
  /** 变换类型（用于 transform 操作） */
  transformType?: string;
  /** 变换参数 */
  transformParams?: Record<string, unknown>;
  /** 时间戳 */
  timestamp: number;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/** 血缘边（字段级别的依赖关系） */
export interface LineageEdge {
  /** 边的唯一 ID */
  id: string;
  /** 源字段 key */
  sourceField: string;
  /** 源节点 ID */
  sourceNodeId?: string;
  /** 目标字段 key */
  targetField: string;
  /** 目标节点 ID */
  targetNodeId?: string;
  /** 操作类型 */
  operation: LineageOperation;
  /** 时间戳 */
  timestamp: number;
}

/** 字段溯源信息 */
export interface FieldLineage {
  fieldKey: string;
  currentValue: unknown;
  producerNodeId?: string;
  createdAt: number;
  updatedAt: number;
  /** 完整血缘链 */
  lineageChain: Array<{
    fieldKey: string;
    nodeId?: string;
    operation: LineageOperation;
    timestamp: number;
  }>;
  /** 数据消费者 */
  consumers: Array<{
    nodeId: string;
    consumedAt: number;
  }>;
}

/** 血缘图 */
export interface LineageGraph {
  /** 节点 Map */
  nodes: Map<string, LineageNode>;
  /** 边 Map */
  edges: Map<string, LineageEdge>;
  /** 字段到边的映射 */
  fieldEdges: Map<string, LineageEdge[]>;
  /** 节点到边的映射 */
  nodeEdges: Map<string, LineageEdge[]>;
}

// ============================================================================
// 血缘追踪器
// ============================================================================

export class LineageTracker {
  private graph: LineageGraph;
  private currentExecutionId: string | null = null;

  constructor() {
    this.graph = {
      nodes: new Map(),
      edges: new Map(),
      fieldEdges: new Map(),
      nodeEdges: new Map(),
    };
  }

  /**
   * 开始新的执行会话
   */
  beginExecution(executionId: string): void {
    this.currentExecutionId = executionId;
    this.graph = {
      nodes: new Map(),
      edges: new Map(),
      fieldEdges: new Map(),
      nodeEdges: new Map(),
    };
  }

  /**
   * 结束执行会话
   */
  endExecution(): LineageGraph {
    const result = { ...this.graph };
    return result;
  }

  /**
   * 记录字段创建
   */
  recordCreate(
    fieldKey: string,
    nodeId: string,
    value: unknown,
    metadata?: Record<string, unknown>
  ): LineageNode {
    if (!this.currentExecutionId) {
      throw new Error('No active execution');
    }

    const nodeId = this.generateLineageNodeId(fieldKey, LineageOperation.Create);
    
    const lineageNode: LineageNode = {
      id: nodeId,
      executionId: this.currentExecutionId,
      operation: LineageOperation.Create,
      fieldKey,
      targetNodeId: nodeId,
      timestamp: Date.now(),
      metadata: {
        valuePreview: this.getValuePreview(value),
        ...metadata,
      },
    };

    this.addLineageNode(lineageNode);

    // 添加边
    this.addLineageEdge({
      sourceField: fieldKey,
      sourceNodeId: undefined,
      targetField: fieldKey,
      targetNodeId: nodeId,
      operation: LineageOperation.Create,
    });

    return lineageNode;
  }

  /**
   * 记录字段读取
   */
  recordRead(fieldKey: string, nodeId: string, sourceNodeId?: string): LineageNode {
    if (!this.currentExecutionId) {
      throw new Error('No active execution');
    }

    const lineageNode: LineageNode = {
      id: this.generateLineageNodeId(fieldKey, LineageOperation.Read),
      executionId: this.currentExecutionId,
      operation: LineageOperation.Read,
      fieldKey,
      sourceNodeId,
      targetNodeId: nodeId,
      timestamp: Date.now(),
    };

    this.addLineageNode(lineageNode);

    return lineageNode;
  }

  /**
   * 记录字段更新
   */
  recordUpdate(
    fieldKey: string,
    nodeId: string,
    oldValue: unknown,
    newValue: unknown,
    metadata?: Record<string, unknown>
  ): LineageNode {
    if (!this.currentExecutionId) {
      throw new Error('No active execution');
    }

    const lineageNode: LineageNode = {
      id: this.generateLineageNodeId(fieldKey, LineageOperation.Update),
      executionId: this.currentExecutionId,
      operation: LineageOperation.Update,
      fieldKey,
      sourceNodeId: this.findProducerNodeId(fieldKey),
      targetNodeId: nodeId,
      timestamp: Date.now(),
      metadata: {
        oldValuePreview: this.getValuePreview(oldValue),
        newValuePreview: this.getValuePreview(newValue),
        ...metadata,
      },
    };

    this.addLineageNode(lineageNode);

    // 添加边
    this.addLineageEdge({
      sourceField: fieldKey,
      sourceNodeId: this.findProducerNodeId(fieldKey),
      targetField: fieldKey,
      targetNodeId: nodeId,
      operation: LineageOperation.Update,
    });

    return lineageNode;
  }

  /**
   * 记录数据变换（从一个或多个字段生成新字段）
   */
  recordTransform(
    outputFieldKey: string,
    outputNodeId: string,
    inputFields: Array<{ key: string; nodeId?: string }>,
    transformType: string,
    transformParams?: Record<string, unknown>
  ): LineageNode {
    if (!this.currentExecutionId) {
      throw new Error('No active execution');
    }

    const lineageNode: LineageNode = {
      id: this.generateLineageNodeId(outputFieldKey, LineageOperation.Transform),
      executionId: this.currentExecutionId,
      operation: LineageOperation.Transform,
      fieldKey: outputFieldKey,
      targetNodeId: outputNodeId,
      sourceFields: inputFields,
      transformType,
      transformParams,
      timestamp: Date.now(),
    };

    this.addLineageNode(lineageNode);

    // 为每个输入字段添加边
    for (const inputField of inputFields) {
      this.addLineageEdge({
        sourceField: inputField.key,
        sourceNodeId: inputField.nodeId,
        targetField: outputFieldKey,
        targetNodeId: outputNodeId,
        operation: LineageOperation.Transform,
      });
    }

    return lineageNode;
  }

  /**
   * 记录字段合并
   */
  recordMerge(
    outputFieldKey: string,
    outputNodeId: string,
    sourceFields: Array<{ key: string; nodeId?: string }>
  ): LineageNode {
    return this.recordTransform(outputFieldKey, outputNodeId, sourceFields, 'merge');
  }

  /**
   * 记录字段分裂（一个字段分裂为多个）
   */
  recordSplit(
    outputFields: Array<{ key: string; sourceKey: string }>,
    nodeId: string,
    splitType: string,
    splitParams?: Record<string, unknown>
  ): LineageNode[] {
    if (!this.currentExecutionId) {
      throw new Error('No active execution');
    }

    const nodes: LineageNode[] = [];

    for (const output of outputFields) {
      const lineageNode: LineageNode = {
        id: this.generateLineageNodeId(output.key, LineageOperation.Split),
        executionId: this.currentExecutionId,
        operation: LineageOperation.Split,
        fieldKey: output.key,
        targetNodeId: nodeId,
        sourceFields: [{ key: output.sourceKey }],
        transformType: splitType,
        transformParams: splitParams,
        timestamp: Date.now(),
      };

      this.addLineageNode(lineageNode);

      this.addLineageEdge({
        sourceField: output.sourceKey,
        targetField: output.key,
        targetNodeId: nodeId,
        operation: LineageOperation.Split,
      });

      nodes.push(lineageNode);
    }

    return nodes;
  }

  /**
   * 记录条件路由
   */
  recordRoute(
    fieldKey: string,
    nodeId: string,
    condition: string,
    selectedValue: unknown
  ): LineageNode {
    if (!this.currentExecutionId) {
      throw new Error('No active execution');
    }

    const lineageNode: LineageNode = {
      id: this.generateLineageNodeId(fieldKey, LineageOperation.Route),
      executionId: this.currentExecutionId,
      operation: LineageOperation.Route,
      fieldKey,
      targetNodeId: nodeId,
      transformType: 'route',
      transformParams: { condition, selectedValuePreview: this.getValuePreview(selectedValue) },
      timestamp: Date.now(),
    };

    this.addLineageNode(lineageNode);

    return lineageNode;
  }

  /**
   * 从 TechPackagingState 初始化血缘
   */
  initializeFromState(state: TechPackagingState): void {
    this.beginExecution(state.executionId);

    // 从 sharedData.fields 初始化
    for (const [fieldKey, field] of Object.entries(state.sharedData.fields)) {
      if (field.producerNodeId) {
        this.recordCreate(fieldKey, field.producerNodeId, field.value, {
          source: field.source,
          type: field.type,
        });
      }
    }

    // 从节点执行记录初始化
    for (const [nodeId, execution] of Object.entries(state.nodeExecutions)) {
      if (execution.output) {
        // 假设节点输出会更新 sharedData
        for (const [key, value] of Object.entries(execution.output)) {
          this.recordUpdate(key, nodeId, undefined, value, {
            nodeType: execution.nodeType,
          });
        }
      }
    }
  }

  /**
   * 获取字段的完整血缘
   */
  getFieldLineage(fieldKey: string, currentValue: unknown): FieldLineage {
    const chain = this.getLineageChain(fieldKey);
    const consumers = this.getFieldConsumers(fieldKey);
    const producerNodeId = this.findProducerNodeId(fieldKey);

    const firstEntry = chain[0];
    const lastEntry = chain[chain.length - 1];

    return {
      fieldKey,
      currentValue,
      producerNodeId,
      createdAt: firstEntry?.timestamp || Date.now(),
      updatedAt: lastEntry?.timestamp || Date.now(),
      lineageChain: chain,
      consumers,
    };
  }

  /**
   * 获取字段的血缘链
   */
  getLineageChain(fieldKey: string): Array<{
    fieldKey: string;
    nodeId?: string;
    operation: LineageOperation;
    timestamp: number;
  }> {
    const edges = this.graph.fieldEdges.get(fieldKey) || [];
    const chain: Array<{
      fieldKey: string;
      nodeId?: string;
      operation: LineageOperation;
      timestamp: number;
    }> = [];

    for (const edge of edges) {
      chain.push({
        fieldKey: edge.sourceField,
        nodeId: edge.sourceNodeId,
        operation: edge.operation,
        timestamp: edge.timestamp,
      });
    }

    return chain.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * 获取字段的消费者
   */
  getFieldConsumers(fieldKey: string): Array<{
    nodeId: string;
    consumedAt: number;
  }> {
    const edges = this.graph.fieldEdges.get(fieldKey) || [];
    return edges
      .filter(e => e.targetNodeId)
      .map(e => ({
        nodeId: e.targetNodeId!,
        consumedAt: e.timestamp,
      }));
  }

  /**
   * 查找字段的生产者节点 ID
   */
  findProducerNodeId(fieldKey: string): string | undefined {
    const edges = this.graph.fieldEdges.get(fieldKey) || [];
    const createEdges = edges.filter(e => 
      e.operation === LineageOperation.Create || 
      e.operation === LineageOperation.Transform
    );
    
    if (createEdges.length > 0) {
      return createEdges[0].targetNodeId;
    }
    
    return undefined;
  }

  /**
   * 获取节点创建/更新的所有字段
   */
  getNodeProducedFields(nodeId: string): string[] {
    const edges = this.graph.nodeEdges.get(nodeId) || [];
    return edges
      .filter(e => e.operation !== LineageOperation.Read)
      .map(e => e.targetField);
  }

  /**
   * 获取节点消费的所有字段
   */
  getNodeConsumedFields(nodeId: string): string[] {
    const edges = this.graph.nodeEdges.get(nodeId) || [];
    return edges
      .filter(e => e.operation !== LineageOperation.Create && e.operation !== LineageOperation.Update)
      .map(e => e.sourceField);
  }

  /**
   * 获取完整的血缘图
   */
  getLineageGraph(): LineageGraph {
    return { ...this.graph };
  }

  /**
   * 导出为可序列化的格式
   */
  toJSON(): {
    nodes: LineageNode[];
    edges: LineageEdge[];
  } {
    return {
      nodes: Array.from(this.graph.nodes.values()),
      edges: Array.from(this.graph.edges.values()),
    };
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  private addLineageNode(node: LineageNode): void {
    this.graph.nodes.set(node.id, node);
  }

  private addLineageEdge(edge: Omit<LineageEdge, 'id' | 'timestamp'>): void {
    const id = this.generateEdgeId(edge);
    const fullEdge: LineageEdge = {
      ...edge,
      id,
      timestamp: Date.now(),
    };

    this.graph.edges.set(id, fullEdge);

    // 更新 fieldEdges
    if (!this.graph.fieldEdges.has(edge.targetField)) {
      this.graph.fieldEdges.set(edge.targetField, []);
    }
    this.graph.fieldEdges.get(edge.targetField)!.push(fullEdge);

    // 更新 nodeEdges
    if (edge.targetNodeId) {
      if (!this.graph.nodeEdges.has(edge.targetNodeId)) {
        this.graph.nodeEdges.set(edge.targetNodeId, []);
      }
      this.graph.nodeEdges.get(edge.targetNodeId)!.push(fullEdge);
    }
  }

  private generateLineageNodeId(fieldKey: string, operation: LineageOperation): string {
    return `ln_${fieldKey}_${operation}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateEdgeId(edge: Omit<LineageEdge, 'id' | 'timestamp'>): string {
    return `le_${edge.sourceField}_${edge.targetField}_${edge.operation}_${Date.now()}`;
  }

  private getValuePreview(value: unknown): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'string') {
      return value.length > 50 ? value.substring(0, 50) + '...' : value;
    }
    if (typeof value === 'object') {
      return JSON.stringify(value).substring(0, 50);
    }
    return String(value);
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

let globalLineageTracker: LineageTracker | null = null;

export function getGlobalLineageTracker(): LineageTracker {
  if (!globalLineageTracker) {
    globalLineageTracker = new LineageTracker();
  }
  return globalLineageTracker;
}

export function resetGlobalLineageTracker(): void {
  globalLineageTracker = null;
}
