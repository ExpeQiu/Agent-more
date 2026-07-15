/**
 * MVP E2E 验收测试 — 场景 3: 路由降级
 *
 * P1-T74: MVP端到端验收测试
 *
 * 测试场景: 验证三层路由在边界情况下的降级行为，
 *          以及 fallback 机制的正确性。
 *
 * 验收标准: 所有情况都有合理的降级响应
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { HierarchicalSceneRouter } from '@agent-engine/scene-router';

describe('MVP E2E — 场景3: 路由降级测试', () => {
  let router: HierarchicalSceneRouter;

  beforeAll(async () => {
    router = new HierarchicalSceneRouter();
  });

  it('01 — Layer 0 关键词匹配命中', async () => {
    const result = await router.route('我的服务器 CPU 占用很高');

    expect(result.layer).toBe(0);
    expect(result.sceneName).toBeTruthy();
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it('02 — Layer 1 LLM 意图识别生效（无明确关键词）', async () => {
    const result = await router.route('这个功能怎么做比较合理');

    expect(result.layer).toBeGreaterThanOrEqual(1);
    expect(result.sceneName).toBeTruthy();
  });

  it('03 — 模糊查询降级到 Layer 3 Fallback', async () => {
    const result = await router.route('随便聊聊');

    // Fallback 应该触发，但仍有响应
    expect(result.sceneName).toBeTruthy();
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('04 — 路由决策响应时间 <500ms', async () => {
    const queries = [
      '服务器问题',
      '帮我分析代码',
      '下周计划',
    ];

    for (const query of queries) {
      const start = Date.now();
      await router.route(query);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(500);
    }
  });

  it('05 — 路由决策被正确记录', async () => {
    const query = '测试路由日志记录';
    const result = await router.route(query, {
      sessionId: 'e2e-session-routing-test',
    });

    expect(result).toHaveProperty('sceneId');
    expect(result).toHaveProperty('processingTimeMs');
  });
});
