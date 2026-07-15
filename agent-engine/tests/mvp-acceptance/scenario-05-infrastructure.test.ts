/**
 * MVP E2E 验收测试 — 场景 5: 基础设施健康度
 *
 * P1-T74: MVP端到端验收测试
 *
 * 测试场景: 验证数据库、Redis、API 响应时间等基础设施
 *          的健康度和性能指标。
 *
 * 验收标准:
 *   - PostgreSQL 查询 <100ms (100并发)
 *   - Redis 响应 <10ms
 *   - API P99 <500ms
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

describe('MVP E2E — 场景5: 基础设施健康度', () => {
  let prisma: PrismaClient;
  const latencies: number[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL || 'postgresql://agent_engine:agent_engine_dev@localhost:5432/agent_engine',
        },
      },
    });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('01 — PostgreSQL 连接成功', async () => {
    const result = await prisma.$queryRaw`SELECT 1 as ok`;
    expect(result).toBeTruthy();
  });

  it('02 — PostgreSQL 单次查询 <100ms', async () => {
    const start = Date.now();
    await prisma.agent.findMany({ take: 10 });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(100);
  });

  it('03 — PostgreSQL 100并发查询 P99 <100ms', async () => {
    const CONCURRENCY = 100;
    const promises: Promise<void>[] = [];

    for (let i = 0; i < CONCURRENCY; i++) {
      promises.push(
        (async () => {
          const start = Date.now();
          await prisma.agent.findMany({ take: 10 });
          latencies.push(Date.now() - start);
        })()
      );
    }

    await Promise.all(promises);

    latencies.sort((a, b) => a - b);
    const p99 = latencies[Math.floor(latencies.length * 0.99)];

    expect(p99).toBeLessThan(100);
  });

  it('04 — PostgreSQL 路由决策写入', async () => {
    const start = Date.now();
    await prisma.routingDecision.create({
      data: {
        id: `rd_e2e_${Date.now()}`,
        query: 'E2E测试路由决策',
        queryHash: 'e2e-test-hash',
        sceneId: 'scene_test',
        sceneName: 'test',
        confidence: 0.99,
        layer: 1,
        reasoning: 'E2E test',
        layerScores: { keyword: 0.9, llm: 0.99 },
        processingTimeMs: 50,
      },
    });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(100);
  });

  it('05 — Prisma Transaction 批量写入性能', async () => {
    const start = Date.now();
    await prisma.$transaction([
      prisma.llmCall.create({
        data: {
          id: `llm_e2e_1_${Date.now()}`,
          model: 'claude-sonnet-4',
          provider: 'anthropic',
          latencyMs: 300,
          status: 'success',
        },
      }),
      prisma.llmCall.create({
        data: {
          id: `llm_e2e_2_${Date.now()}`,
          model: 'gpt-4o',
          provider: 'openai',
          latencyMs: 200,
          status: 'success',
        },
      }),
    ]);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(200);
  });

  it('06 — 健康检查端点响应正常', async () => {
    const response = await fetch(`${BASE_URL}/health`);
    const data = await response.json();

    expect(data.ok).toBe(true);
    expect(data.database).toBe(true);
    expect(data.redis).toBe(true);
    expect(data.version).toBe('0.1.0');
  });

  it('07 — Session 创建和查询', async () => {
    // 创建 agent
    const agent = await prisma.agent.create({
      data: { name: 'e2e-test-agent', type: 'tester' },
    });

    // 创建 session
    const session = await prisma.session.create({
      data: { agentId: agent.id },
    });

    // 查询
    const found = await prisma.session.findUnique({
      where: { id: session.id },
      include: { agent: true },
    });

    expect(found).toBeTruthy();
    expect(found!.agent.name).toBe('e2e-test-agent');

    // 清理
    await prisma.session.delete({ where: { id: session.id } });
    await prisma.agent.delete({ where: { id: agent.id } });
  });
});
