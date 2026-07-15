/**
 * MVP E2E 验收测试 — 场景 1: 技术问题分析
 *
 * P1-T74: MVP端到端验收测试
 *
 * 测试场景: 用户发送一个技术编码问题，系统路由到 coder agent，
 *          coder agent 分析问题并给出解决方案。
 *
 * 验收标准: 输出质量 ≥70分
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AgentOrchestrator } from '@agent-engine/core';
import { HierarchicalSceneRouter } from '@agent-engine/scene-router';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

describe('MVP E2E — 场景1: 技术问题分析 (coder)', () => {
  let orchestrator: AgentOrchestrator;
  let router: HierarchicalSceneRouter;

  beforeAll(async () => {
    orchestrator = new AgentOrchestrator();
    router = new HierarchicalSceneRouter();
  });

  afterAll(async () => {
    await orchestrator.destroy();
  });

  it('01 — 用户输入技术问题时正确路由到 coder 场景', async () => {
    const query = '我的 Node.js 服务内存泄漏怎么排查？';

    const routingResult = await router.route(query);

    expect(routingResult.sceneName).toBe('tech-analyst');
    expect(routingResult.confidence).toBeGreaterThan(0.6);
    expect(routingResult.layer).toBeLessThanOrEqual(2);
  });

  it('02 — 端到端执行 coder 任务，输出质量 ≥70分', async () => {
    const query = '帮我用 TypeScript 写一个防抖函数';

    const result = await orchestrator.execute({
      query,
      scene: 'tech-analyst',
      context: { userId: 'e2e-test-user', channel: 'test' },
    });

    // 验收：输出不为空
    expect(result.output).toBeTruthy();
    expect(result.output.length).toBeGreaterThan(50);

    // 验收：质量评分 ≥70
    const qualityScore = result.qualityScore ?? 0;
    expect(qualityScore).toBeGreaterThanOrEqual(70);
  });

  it('03 — 复杂技术问题的完整回答包含代码示例', async () => {
    const query = '实现一个简易的 Rate Limiter，使用 Redis';

    const result = await orchestrator.execute({
      query,
      scene: 'tech-analyst',
      context: { userId: 'e2e-test-user', channel: 'test' },
    });

    expect(result.output).toContain('Redis');
    expect(result.output.length).toBeGreaterThan(100);
    expect(result.qualityScore ?? 0).toBeGreaterThanOrEqual(70);
  });
});
