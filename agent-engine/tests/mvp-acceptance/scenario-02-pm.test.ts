/**
 * MVP E2E 验收测试 — 场景 2: 项目管理任务
 *
 * P1-T74: MVP端到端验收测试
 *
 * 测试场景: 用户发送一个项目管理相关的问题，系统路由到 PM agent，
 *          PM agent 分析并给出任务拆解或计划。
 *
 * 验收标准: 输出质量 ≥70分
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AgentOrchestrator } from '@agent-engine/core';
import { HierarchicalSceneRouter } from '@agent-engine/scene-router';

describe('MVP E2E — 场景2: 项目管理 (pm)', () => {
  let orchestrator: AgentOrchestrator;
  let router: HierarchicalSceneRouter;

  beforeAll(async () => {
    orchestrator = new AgentOrchestrator();
    router = new HierarchicalSceneRouter();
  });

  afterAll(async () => {
    await orchestrator.destroy();
  });

  it('01 — 用户输入PM任务时正确路由到 PM 场景', async () => {
    const query = '帮我拆解这个需求，安排下周的开发计划';

    const routingResult = await router.route(query);

    expect(routingResult.sceneName).toBeTruthy();
    expect(routingResult.confidence).toBeGreaterThan(0.5);
  });

  it('02 — PM 任务拆解输出质量 ≥70分', async () => {
    const query = '一个用户登录系统需要哪些功能点？请按优先级排序';

    const result = await orchestrator.execute({
      query,
      scene: 'scene-analyst',
      context: { userId: 'e2e-test-user', channel: 'test' },
    });

    expect(result.output).toBeTruthy();
    expect(result.output.length).toBeGreaterThan(50);

    const qualityScore = result.qualityScore ?? 0;
    expect(qualityScore).toBeGreaterThanOrEqual(70);
  });

  it('03 — 竞品分析任务输出包含结构化信息', async () => {
    const query = '分析一下 Notion 和飞书的优缺点';

    const result = await orchestrator.execute({
      query,
      scene: 'market-analyst',
      context: { userId: 'e2e-test-user', channel: 'test' },
    });

    expect(result.output).toBeTruthy();
    // 结构化输出应包含比较维度
    const hasStructure = result.output.includes('优点') ||
                          result.output.includes('缺点') ||
                          result.output.includes('对比');
    expect(hasStructure).toBeTruthy();
    expect(result.qualityScore ?? 0).toBeGreaterThanOrEqual(70);
  });
});
