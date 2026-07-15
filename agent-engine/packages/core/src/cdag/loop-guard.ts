/**
 * LoopGuard - 三层防死循环机制
 *
 * 保护层级：
 * 1. 全局上限：整个图执行总步数 ≤ 50
 * 2. 节点上限：单个节点执行次数 ≤ 3
 * 3. 时间上限：总执行时间 ≤ 5 分钟
 */

import type { LoopGuardState, GraphNodeConfig } from './types/cdag';

export interface LoopGuardConfig {
  /** 全局最大步数，默认 50 */
  globalMaxSteps?: number;
  /** 单节点最大执行次数，默认 3 */
  nodeMaxExecutions?: number;
  /** 最大执行时间（毫秒），默认 5 分钟 */
  maxExecutionTimeMs?: number;
}

export interface LoopGuardCheckResult {
  allowed: boolean;
  reason?: string;
  /** 触发了哪一层保护 */
  protectionLayer?: 'global' | 'node' | 'time';
}

const DEFAULT_CONFIG: Required<LoopGuardConfig> = {
  globalMaxSteps: 50,
  nodeMaxExecutions: 3,
  maxExecutionTimeMs: 5 * 60 * 1000, // 5 minutes
};

export class LoopGuard {
  private config: Required<LoopGuardConfig>;
  private state: LoopGuardState;

  constructor(config: LoopGuardConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = {
      globalStepCount: 0,
      nodeExecutionCounts: new Map(),
      startTime: Date.now(),
    };
  }

  /**
   * 重置 Guard 状态（用于新的图执行）
   */
  reset(): void {
    this.state = {
      globalStepCount: 0,
      nodeExecutionCounts: new Map(),
      startTime: Date.now(),
    };
  }

  /**
   * 获取当前状态快照
   */
  getState(): Readonly<LoopGuardState> {
    return {
      globalStepCount: this.state.globalStepCount,
      nodeExecutionCounts: new Map(this.state.nodeExecutionCounts),
      startTime: this.state.startTime,
    };
  }

  /**
   * 检查节点执行是否允许（每次执行前调用）
   * 按优先级检查：时间 → 全局步数 → 节点执行次数
   */
  check(nodeId: string): LoopGuardCheckResult {
    // 第一层：时间上限检查
    const timeResult = this.checkTimeLimit();
    if (!timeResult.allowed) {
      return timeResult;
    }

    // 第二层：全局步数上限检查
    const globalResult = this.checkGlobalLimit();
    if (!globalResult.allowed) {
      return globalResult;
    }

    // 第三层：节点执行次数上限检查
    const nodeResult = this.checkNodeLimit(nodeId);
    if (!nodeResult.allowed) {
      return nodeResult;
    }

    return { allowed: true };
  }

  /**
   * 记录一次节点执行（执行后调用）
   */
  recordExecution(nodeId: string): void {
    this.state.globalStepCount++;
    const currentCount = this.state.nodeExecutionCounts.get(nodeId) ?? 0;
    this.state.nodeExecutionCounts.set(nodeId, currentCount + 1);
  }

  /**
   * 获取指定节点已执行次数
   */
  getNodeExecutionCount(nodeId: string): number {
    return this.state.nodeExecutionCounts.get(nodeId) ?? 0;
  }

  /**
   * 获取全局已执行步数
   */
  getGlobalStepCount(): number {
    return this.state.globalStepCount;
  }

  /**
   * 获取已执行时间（毫秒）
   */
  getElapsedTime(): number {
    return Date.now() - this.state.startTime;
  }

  // ============================================================
  // 私有检查方法
  // ============================================================

  private checkTimeLimit(): LoopGuardCheckResult {
    const elapsed = Date.now() - this.state.startTime;
    if (elapsed > this.config.maxExecutionTimeMs) {
      return {
        allowed: false,
        reason: `时间上限触发：已执行 ${Math.round(elapsed / 1000)}s，超过上限 ${Math.round(this.config.maxExecutionTimeMs / 1000)}s`,
        protectionLayer: 'time',
      };
    }
    return { allowed: true };
  }

  private checkGlobalLimit(): LoopGuardCheckResult {
    if (this.state.globalStepCount >= this.config.globalMaxSteps) {
      return {
        allowed: false,
        reason: `全局步数上限触发：已执行 ${this.state.globalStepCount} 步，达到上限 ${this.config.globalMaxSteps}`,
        protectionLayer: 'global',
      };
    }
    return { allowed: true };
  }

  private checkNodeLimit(nodeId: string): LoopGuardCheckResult {
    const count = this.state.nodeExecutionCounts.get(nodeId) ?? 0;
    if (count >= this.config.nodeMaxExecutions) {
      return {
        allowed: false,
        reason: `节点 "${nodeId}" 执行次数上限触发：已执行 ${count} 次，达到上限 ${this.config.nodeMaxExecutions}`,
        protectionLayer: 'node',
      };
    }
    return { allowed: true };
  }

  /**
   * 验证整个图在执行前是否会出现环（拓扑排序检查）
   * 如果检测到环，返回环上的节点 ID 列表
   */
  static detectCycle(
    nodes: GraphNodeConfig[],
    edges: { sourceId: string; targetId: string }[]
  ): string[] | null {
    // 构建邻接表和入度表
    const adjacency = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    const allNodeIds = new Set(nodes.map((n) => n.id));

    for (const nodeId of allNodeIds) {
      adjacency.set(nodeId, []);
      inDegree.set(nodeId, 0);
    }

    for (const edge of edges) {
      if (allNodeIds.has(edge.sourceId) && allNodeIds.has(edge.targetId)) {
        adjacency.get(edge.sourceId)!.push(edge.targetId);
        inDegree.set(edge.targetId, (inDegree.get(edge.targetId) ?? 0) + 1);
      }
    }

    // Kahn 算法：拓扑排序
    // 用队列保存入度为 0 的节点
    const queue: string[] = [];
    for (const [nodeId, degree] of inDegree) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }

    const visited: string[] = [];
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      visited.push(nodeId);

      for (const neighbor of adjacency.get(nodeId) ?? []) {
        const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    // 如果访问的节点数 < 总节点数，说明有环
    if (visited.length < allNodeIds.size) {
      // 找出未被访问的节点（环中的节点）
      const unvisited = [...allNodeIds].filter((id) => !visited.includes(id));
      return unvisited;
    }

    return null;
  }
}
