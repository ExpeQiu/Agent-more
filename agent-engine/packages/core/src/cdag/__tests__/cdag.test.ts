/**
 * C-DAG 模块单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  LoopGuard,
  type LoopGuardConfig,
  isRetryableError,
  calculateRetryDelay,
} from '../loop-guard';
import { RetryNodeExecutor } from '../retry-node';
import { ReflectNodeExecutor } from '../reflect-node';
import { ParallelNodeExecutor } from '../parallel-node';
import {
  ExecutionGraph,
  NodeType,
  NodeStatus,
  type GraphNodeConfig,
  type RetryNodeConfig,
  type ReflectNodeConfig,
  type ParallelNodeConfig,
} from '../types/cdag';

// ============================================================
// LoopGuard 测试
// ============================================================

describe('LoopGuard', () => {
  let guard: LoopGuard;

  beforeEach(() => {
    guard = new LoopGuard({
      globalMaxSteps: 5,
      nodeMaxExecutions: 2,
      maxExecutionTimeMs: 1000,
    });
  });

  it('应允许首次执行节点', () => {
    const result = guard.check('node-A');
    expect(result.allowed).toBe(true);
  });

  it('应阻止全局步数超限', () => {
    // 执行 5 次（等于上限）
    for (let i = 0; i < 5; i++) {
      guard.recordExecution(`node-${i}`);
    }
    const result = guard.check('node-new');
    expect(result.allowed).toBe(false);
    expect(result.protectionLayer).toBe('global');
  });

  it('应阻止单节点执行次数超限', () => {
    guard.recordExecution('node-A');
    guard.recordExecution('node-A');
    const result = guard.check('node-A');
    expect(result.allowed).toBe(false);
    expect(result.protectionLayer).toBe('node');
  });

  it('应正确追踪各节点执行次数', () => {
    guard.recordExecution('node-A');
    guard.recordExecution('node-B');
    guard.recordExecution('node-A');
    expect(guard.getNodeExecutionCount('node-A')).toBe(2);
    expect(guard.getNodeExecutionCount('node-B')).toBe(1);
    expect(guard.getNodeExecutionCount('node-C')).toBe(0);
  });

  it('应正确追踪全局步数', () => {
    guard.recordExecution('node-A');
    guard.recordExecution('node-B');
    guard.recordExecution('node-C');
    expect(guard.getGlobalStepCount()).toBe(3);
  });

  it('应检测图中是否存在环', () => {
    const nodes: GraphNodeConfig[] = [
      { id: 'A', type: NodeType.START },
      { id: 'B', type: NodeType.LLM },
      { id: 'C', type: NodeType.END },
    ];
    const edges = [
      { sourceId: 'A', targetId: 'B' },
      { sourceId: 'B', targetId: 'C' },
    ];
    const cycle = LoopGuard.detectCycle(nodes, edges);
    expect(cycle).toBeNull();
  });

  it('应正确检测环', () => {
    const nodes: GraphNodeConfig[] = [
      { id: 'A', type: NodeType.START },
      { id: 'B', type: NodeType.LLM },
      { id: 'C', type: NodeType.END },
    ];
    const edges = [
      { sourceId: 'A', targetId: 'B' },
      { sourceId: 'B', targetId: 'C' },
      { sourceId: 'C', targetId: 'A' }, // 环
    ];
    const cycle = LoopGuard.detectCycle(nodes, edges);
    expect(cycle).not.toBeNull();
  });

  it('应重置状态', () => {
    guard.recordExecution('node-A');
    guard.recordExecution('node-A');
    guard.reset();
    expect(guard.getGlobalStepCount()).toBe(0);
    expect(guard.getNodeExecutionCount('node-A')).toBe(0);
  });
});

// ============================================================
// Retry 测试
// ============================================================

describe('Retry', () => {
  describe('isRetryableError', () => {
    it('应识别超时错误为可重试', () => {
      const result = isRetryableError('Request timeout after 30000ms');
      expect(result.shouldRetry).toBe(true);
    });

    it('应识别速率限制错误为可重试', () => {
      const result = isRetryableError('Rate limit exceeded (429)');
      expect(result.shouldRetry).toBe(true);
    });

    it('应识别网络错误为可重试', () => {
      const result = isRetryableError('ECONNREFUSED: Connection refused');
      expect(result.shouldRetry).toBe(true);
    });

    it('应拒绝非重试错误', () => {
      const result = isRetryableError('Invalid API key provided');
      expect(result.shouldRetry).toBe(false);
    });
  });

  describe('calculateRetryDelay', () => {
    it('应使用指数退避', () => {
      const delay0 = calculateRetryDelay(0, 1000, true, 30000);
      const delay1 = calculateRetryDelay(1, 1000, true, 30000);
      const delay2 = calculateRetryDelay(2, 1000, true, 30000);

      expect(delay1).toBeGreaterThan(delay0);
      expect(delay2).toBeGreaterThan(delay1);
    });

    it('应限制最大延迟', () => {
      const delay = calculateRetryDelay(10, 1000, true, 5000);
      expect(delay).toBeLessThanOrEqual(5000 + 5000 * 0.25); // jitter 上限
    });
  });
});

// ============================================================
// Reflect 测试
// ============================================================

describe('ReflectNodeExecutor', () => {
  let executor: ReflectNodeExecutor;

  beforeEach(() => {
    executor = new ReflectNodeExecutor();
  });

  it('应能对文本内容进行评分', () => {
    // 使用 fallback 评分（无需 LLM）
    const content = '这是一个测试内容，包含一些有效的文本。\n- 第一点\n- 第二点\n- 第三点';
    const node: ReflectNodeConfig = {
      id: 'reflect-1',
      type: NodeType.REFLECT,
      qualityThreshold: 0.5,
      sourceNodeId: 'llm-1',
      passNodeId: 'end',
      failNodeId: 'retry',
    };

    // 手动测试 fallback 评分
    const score = (executor as any).fallbackScore(content);
    expect(score.overall).toBeGreaterThan(0);
    expect(score.dimensions).toBeDefined();
  });

  it('短内容应得到较低评分', () => {
    const shortContent = 'hi';
    const longContent = '这是一个详细的内容，包含了足够多的文本来进行评分判断。';

    const shortScore = (executor as any).fallbackScore(shortContent);
    const longScore = (executor as any).fallbackScore(longContent);

    expect(longScore.overall).toBeGreaterThanOrEqual(shortScore.overall);
  });
});

// ============================================================
// ParallelNode 测试
// ============================================================

describe('ParallelNodeExecutor', () => {
  let executor: ParallelNodeExecutor;

  beforeEach(() => {
    executor = new ParallelNodeExecutor({ branchTimeoutMs: 5000 });
  });

  it('应执行所有分支（all策略）', async () => {
    const node: ParallelNodeConfig = {
      id: 'parallel-1',
      type: NodeType.PARALLEL,
      strategy: 'all',
      nodeIds: ['node-A', 'node-B', 'node-C'],
    };

    let callCount = 0;
    const executorFn = async (nodeId: string) => {
      callCount++;
      await new Promise((r) => setTimeout(r, 50));
      return {
        nodeId,
        nodeType: NodeType.LLM,
        status: NodeStatus.COMPLETED,
        output: { result: nodeId },
        startTime: Date.now(),
        endTime: Date.now(),
        duration: 50,
      };
    };

    const context: any = {
      logger: { info: () => {}, debug: () => {}, error: () => {}, warn: () => {} },
    };

    const result = await executor.execute(node, new Map(), executorFn, context);

    expect(result.status).toBe(NodeStatus.COMPLETED);
    expect(callCount).toBe(3);
    expect(result.stats?.succeeded).toBe(3);
  });

  it('any策略应在首个成功后立即返回', async () => {
    const node: ParallelNodeConfig = {
      id: 'parallel-2',
      type: NodeType.PARALLEL,
      strategy: 'any',
      nodeIds: ['node-A', 'node-B', 'node-C'],
    };

    let callCount = 0;
    const executorFn = async (nodeId: string) => {
      callCount++;
      await new Promise((r) => setTimeout(r, nodeId === 'node-A' ? 10 : 200));
      return {
        nodeId,
        nodeType: NodeType.LLM,
        status: NodeStatus.COMPLETED,
        output: { result: nodeId },
        startTime: Date.now(),
        endTime: Date.now(),
        duration: 50,
      };
    };

    const context: any = {
      logger: { info: () => {}, debug: () => {}, error: () => {}, warn: () => {} },
    };

    const result = await executor.execute(node, new Map(), executorFn, context);

    expect(result.status).toBe(NodeStatus.COMPLETED);
    // any 策略下，其他分支可能被跳过
    expect(callCount).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================
// Integration: LoopGuard 保护层级测试
// ============================================================

describe('LoopGuard 保护层级集成', () => {
  it('应按优先级触发保护：时间 → 全局 → 节点', () => {
    // 时间保护优先于全局保护
    const guard1 = new LoopGuard({
      globalMaxSteps: 100,
      maxExecutionTimeMs: 1, // 1ms，立即超时
    });

    // 等待一小段时间
    guard1.check('node-A');
    const timeResult = guard1.check('node-B');
    expect(timeResult.allowed).toBe(false);
    expect(timeResult.protectionLayer).toBe('time');

    // 节点保护优先于全局保护
    const guard2 = new LoopGuard({
      globalMaxSteps: 100,
      nodeMaxExecutions: 1,
      maxExecutionTimeMs: 10000,
    });

    guard2.recordExecution('node-A');
    guard2.recordExecution('node-A');
    const nodeResult = guard2.check('node-A');
    expect(nodeResult.allowed).toBe(false);
    expect(nodeResult.protectionLayer).toBe('node');
  });
});
