/**
 * MVP E2E 验收测试 — 场景 4: CDAG 编排引擎
 *
 * P1-T74: MVP端到端验收测试
 *
 * 测试场景: 验证 CDAG 执行引擎的正确性，包括：
 *          - 顺序执行节点
 *          - 并行执行节点
 *          - 失败重试
 *          - 循环检测
 *
 * 验收标准: CDAG 引擎输出质量 ≥70分
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AgentOrchestrator } from '@agent-engine/core';
import { CDAGExecutor } from '@agent-engine/core';

describe('MVP E2E — 场景4: CDAG 编排引擎', () => {
  let executor: CDAGExecutor;
  let orchestrator: AgentOrchestrator;

  beforeAll(async () => {
    orchestrator = new AgentOrchestrator();
    executor = new CDAGExecutor();
  });

  afterAll(async () => {
    await orchestrator.destroy();
  });

  it('01 — CDAG 顺序执行节点', async () => {
    const dag = {
      nodes: [
        { id: 'n1', type: 'router' },
        { id: 'n2', type: 'agent', dependsOn: ['n1'] },
      ],
    };

    const result = await executor.execute(dag, {
      query: '帮我分析这个代码',
    });

    expect(result.status).toBe('completed');
    expect(result.output).toBeTruthy();
  });

  it('02 — CDAG 并行执行节点', async () => {
    const dag = {
      nodes: [
        { id: 'n1', type: 'router' },
        { id: 'n2a', type: 'agent', dependsOn: ['n1'], parallel: true },
        { id: 'n2b', type: 'agent', dependsOn: ['n1'], parallel: true },
      ],
    };

    const start = Date.now();
    const result = await executor.execute(dag, { query: '分析对比两个方案' });
    const elapsed = Date.now() - start;

    // 并行执行应该比顺序快（理论上至少不慢）
    expect(result.status).toBe('completed');
    expect(elapsed).toBeLessThan(10000); // 10秒内完成
  });

  it('03 — CDAG 失败重试机制', async () => {
    const dag = {
      nodes: [
        {
          id: 'n1',
          type: 'agent',
          config: { failOnce: true }, // 模拟一次失败
        },
      ],
    };

    const result = await executor.execute(dag, {
      query: '测试重试机制',
      maxRetries: 3,
    });

    expect(result.status).toBe('completed');
    expect((result.attempts ?? 0)).toBeGreaterThan(1);
  });

  it('04 — CDAG 循环检测防止死循环', async () => {
    const dag = {
      nodes: [
        { id: 'n1', type: 'router' },
        { id: 'n2', type: 'agent', dependsOn: ['n1', 'n3'] },
        { id: 'n3', type: 'agent', dependsOn: ['n2'] }, // n3 → n2 形成循环
      ],
    };

    // 应该抛出循环检测异常，而不是无限等待
    await expect(
      executor.execute(dag, { query: '测试循环检测' })
    ).rejects.toThrow(/loop/i);
  });

  it('05 — 端到端 CDAG 编排质量 ≥70分', async () => {
    const result = await orchestrator.execute({
      query: '帮我分析这个 TypeScript 项目并给出改进建议',
      context: { userId: 'e2e-test-user', channel: 'test' },
    });

    expect(result.output).toBeTruthy();
    expect(result.qualityScore ?? 0).toBeGreaterThanOrEqual(70);
  });
});
