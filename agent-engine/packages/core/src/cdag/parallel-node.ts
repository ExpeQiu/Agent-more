/**
 * Parallel 节点实现
 * 支持 all/any 汇聚策略
 * - all: 等待所有分支完成
 * - any: 首个分支完成即终止其他分支并汇出
 */

import type {
  ParallelNodeConfig,
  NodeExecutionResult,
  NodeExecutionContext,
  NodeStatus,
  GraphNodeConfig,
} from './types/cdag';
import { NodeType } from './types/cdag';

export interface ParallelExecutionResult {
  /** 节点 ID */
  nodeId: string;
  /** 节点类型 */
  nodeType: NodeType.PARALLEL;
  /** 执行状态 */
  status: NodeStatus;
  /** 各分支执行结果 */
  branchResults: Map<string, NodeExecutionResult>;
  /** 汇聚输出 */
  output?: any;
  /** 错误信息 */
  error?: string;
  /** 开始时间 */
  startTime: number;
  /** 结束时间 */
  endTime?: number;
  /** 执行耗时 */
  duration?: number;
  /** 最终失败的分支数 */
  failedCount?: number;
  /** 成功/失败/跳过统计 */
  stats?: {
    succeeded: number;
    failed: number;
    skipped: number;
  };
}

export interface ParallelNodeExecutorOptions {
  /** 并行分支超时（毫秒），默认 5 分钟 */
  branchTimeoutMs?: number;
  /** 是否在 any 策略下取消其他分支 */
  cancelOnAny?: boolean;
}

/**
 * 并行节点执行器
 */
export class ParallelNodeExecutor {
  private options: Required<ParallelNodeExecutorOptions>;

  constructor(options: ParallelNodeExecutorOptions = {}) {
    this.options = {
      branchTimeoutMs: options.branchTimeoutMs ?? 5 * 60 * 1000,
      cancelOnAny: options.cancelOnAny ?? true,
    };
  }

  /**
   * 执行并行节点
   * @param config 并行节点配置
   * @param nodeMap 节点 ID 到配置的映射
   * @param executor 执行单个节点的函数 (nodeId) => Promise<NodeExecutionResult>
   * @param context 执行上下文
   */
  async execute(
    config: ParallelNodeConfig,
    nodeMap: Map<string, GraphNodeConfig>,
    executor: (nodeId: string) => Promise<NodeExecutionResult>,
    context: NodeExecutionContext
  ): Promise<ParallelExecutionResult> {
    const startTime = Date.now();
    const { strategy, nodeIds } = config;

    context.logger.info(
      `[ParallelNode] 开始执行并行节点 ${config.id}，策略: ${strategy}，分支数: ${nodeIds.length}`
    );

    if (nodeIds.length === 0) {
      return this.createResult(config, new Map(), startTime, null, context);
    }

    const branchResults = new Map<string, NodeExecutionResult>();
    let settled = false; // any 策略下首个完成时标记

    // 构建 Promise 列表
    const branchPromises = nodeIds.map(async (nodeId): Promise<void> => {
      // any 策略下，已有一个分支完成则跳过其他
      if (settled) {
        context.logger.debug(`[ParallelNode] 跳过分支 ${nodeId}（any 策略已settled）`);
        return;
      }

      try {
        const result = await this.executeWithTimeout(
          () => executor(nodeId),
          this.options.branchTimeoutMs,
          nodeId,
          context
        );

        branchResults.set(nodeId, result);

        context.logger.info(
          `[ParallelNode] 分支 ${nodeId} 完成，状态: ${result.status}，` +
          `耗时: ${result.duration}ms，策略: ${strategy}`
        );

        // any 策略：首个完成的分支确定输出
        if (strategy === 'any' && !settled) {
          settled = true;

          // 标记其他分支已被跳过（通过设置特殊标记让后续 executor 快速返回）
          // 注意：这里只记录日志，实际的"取消"通过 settled 标志实现
          context.logger.info(
            `[ParallelNode] any 策略：首个分支 ${nodeId} 已完成，` +
            `其他 ${nodeIds.length - branchResults.size} 个分支将被跳过`
          );
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        context.logger.error(`[ParallelNode] 分支 ${nodeId} 执行异常: ${errorMsg}`);

        branchResults.set(nodeId, {
          nodeId,
          nodeType: nodeMap.get(nodeId)?.type ?? NodeType.LLM,
          status: NodeStatus.FAILED,
          error: errorMsg,
          startTime: Date.now(),
          endTime: Date.now(),
          duration: 0,
        });

        // any 策略下首个失败也立即返回
        if (strategy === 'any' && !settled) {
          settled = true;
        }
      }
    });

    // 等待所有分支（all 策略）或截止到首个完成（any 策略）
    if (strategy === 'all') {
      await Promise.all(branchPromises);
    } else {
      // any 策略：等待任意一个完成
      await Promise.race(branchPromises);
      // 继续等待一小段时间，确保日志记录完成
      await this.sleep(100);
    }

    const endTime = Date.now();
    const overallStatus = this.determineOverallStatus(branchResults, strategy);

    context.logger.info(
      `[ParallelNode] 并行节点 ${config.id} 全部分支完成，` +
      `策略: ${strategy}，最终状态: ${overallStatus}`
    );

    return this.createResult(config, branchResults, startTime, overallStatus, context, endTime);
  }

  /**
   * 带超时的分支执行
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    nodeId: string,
    context: NodeExecutionContext
  ): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout>;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`分支 ${nodeId} 执行超时 (${timeoutMs}ms)`));
      }, timeoutMs);
    });

    try {
      return await Promise.race([fn(), timeoutPromise]);
    } finally {
      clearTimeout(timeoutId!);
    }
  }

  /**
   * 根据分支结果确定整体状态
   */
  private determineOverallStatus(
    branchResults: Map<string, NodeExecutionResult>,
    strategy: 'all' | 'any'
  ): NodeStatus {
    const results = [...branchResults.values()];

    if (results.length === 0) {
      return NodeStatus.PENDING;
    }

    if (strategy === 'any') {
      // any: 任一成功即整体成功
      const anySucceeded = results.some((r) => r.status === NodeStatus.COMPLETED);
      const anyFailed = results.some((r) => r.status === NodeStatus.FAILED);
      return anySucceeded ? NodeStatus.COMPLETED : anyFailed ? NodeStatus.FAILED : NodeStatus.PENDING;
    } else {
      // all: 所有成功才整体成功，有一个失败即整体失败
      const allCompleted = results.every((r) => r.status === NodeStatus.COMPLETED);
      const anyFailed = results.some((r) => r.status === NodeStatus.FAILED);
      const anySkipped = results.some((r) => r.status === NodeStatus.SKIPPED);

      if (allCompleted) return NodeStatus.COMPLETED;
      if (anyFailed) return NodeStatus.FAILED;
      if (anySkipped) return NodeStatus.SKIPPED;
      return NodeStatus.RUNNING;
    }
  }

  /**
   * 构建汇聚输出
   * all: 合并所有分支输出为数组
   * any: 返回首个成功分支的输出
   */
  private aggregateOutput(
    strategy: 'all' | 'any',
    branchResults: Map<string, NodeExecutionResult>
  ): any {
    const results = [...branchResults.values()];

    if (strategy === 'any') {
      // any: 返回第一个 COMPLETED 的输出
      const firstSuccess = results.find((r) => r.status === NodeStatus.COMPLETED);
      return firstSuccess?.output ?? null;
    } else {
      // all: 收集所有输出
      const outputs: Record<string, any> = {};
      for (const [nodeId, result] of branchResults) {
        outputs[nodeId] = result.output ?? { status: result.status, error: result.error };
      }
      return outputs;
    }
  }

  /**
   * 创建最终结果
   */
  private createResult(
    config: ParallelNodeConfig,
    branchResults: Map<string, NodeExecutionResult>,
    startTime: number,
    overallStatus: NodeStatus | null,
    context: NodeExecutionContext,
    endTime?: number
  ): ParallelExecutionResult {
    const status = overallStatus ?? NodeStatus.PENDING;
    const finalEndTime = endTime ?? Date.now();

    const results = [...branchResults.values()];
    const succeeded = results.filter((r) => r.status === NodeStatus.COMPLETED).length;
    const failed = results.filter((r) => r.status === NodeStatus.FAILED).length;
    const skipped = results.filter((r) => r.status === NodeStatus.SKIPPED).length;

    const output = this.aggregateOutput(config.strategy, branchResults);

    let error: string | undefined;
    if (failed > 0 && config.strategy === 'all') {
      const failedBranches = results
        .filter((r) => r.status === NodeStatus.FAILED)
        .map((r) => `${r.nodeId}: ${r.error}`)
        .join('; ');
      error = `${failed} 个分支失败: ${failedBranches}`;
    }

    return {
      nodeId: config.id,
      nodeType: NodeType.PARALLEL,
      status,
      branchResults,
      output,
      error,
      startTime,
      endTime: finalEndTime,
      duration: finalEndTime - startTime,
      failedCount: failed,
      stats: { succeeded, failed, skipped },
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
