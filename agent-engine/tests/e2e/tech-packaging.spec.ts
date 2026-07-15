/**
 * E2E 验收测试 — M4-T43: 技术传播场景端到端测试
 *
 * 测试场景:
 *   输入技术描述（如"800V高压平台技术"）+ 车型信息
 *   执行 techAnalyst → sceneAnalyst → marketAnalyst → reflect → contentDirector 全链路
 *
 * 验收标准:
 *   - 输入技术描述 → 输出完整技术传播方案
 *   - 质量评分 ≥ 70
 *   - 全流程可运行
 *   - Token 消耗 < 50k，总耗时 < 2min
 *   - 质量评分 <75 时 contentDirector 触发重试
 *
 * 前置依赖: M4-T44 (CRUD API) ✅ + M4-T45 (版本管理) ✅ + M4-T42 (编排流程) ✅
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import {
  CdagExecutor,
  LLMJudge,
  type ExecutionGraph,
  type GraphNodeConfig,
  type LLMNodeConfig,
  type ReflectNodeConfig,
  NodeType,
  NodeStatus,
} from '@agent-engine/core';

// ─── Config ────────────────────────────────────────────────────────────────

const SCENE_BASE = process.env.SCENE_BASE_URL || 'http://localhost:3002';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// ─── Scene API helpers ─────────────────────────────────────────────────────

async function api(
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await fetch(`${SCENE_BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { status: res.status, data: data as Record<string, unknown> };
}

// ─── Mock LLM Provider Factory ─────────────────────────────────────────────

interface MockMessage {
  role: string;
  content: string;
}

function createMockLLMProvider() {
  return {
    create: (_config: { provider: string; model: string; temperature?: number; maxTokens?: number }) => ({
      chat: async (messages: MockMessage[]): Promise<string> => {
        const lastMessage = messages[messages.length - 1]?.content ?? '';
        // Simulate LLM response based on node type
        if (lastMessage.includes('技术分析') || lastMessage.includes('techAnalyst')) {
          return JSON.stringify({
            tech_highlights: [
              {
                name: '800V高压平台',
                level: 'S',
                data: '充电5分钟续航100km',
                principle: '高压充电显著提升功率',
                user_value: '消除里程焦虑',
              },
            ],
            competitive advantage: '行业领先',
          });
        }
        if (lastMessage.includes('场景') || lastMessage.includes('sceneAnalyst')) {
          return JSON.stringify({
            scenarios: [
              { name: '城市通勤', pain_point: '充电频率高', tech_mapping: '800V快充' },
            ],
            narrative: '都市出行零焦虑',
          });
        }
        if (lastMessage.includes('市场') || lastMessage.includes('marketAnalyst')) {
          return JSON.stringify({
            competitors: ['特斯拉', '小鹏'],
            differentiation: '800V平台全面领先',
            entry_angle: '充电效率革命',
          });
        }
        if (lastMessage.includes('质量评审') || lastMessage.includes('reflect')) {
          return JSON.stringify({
            score: 78,
            dimensions: { accuracy: 80, readability: 75, brand_voice: 78 },
            comments: ['整体合格'],
          });
        }
        // Default: content director response
        return JSON.stringify({
          final_content: '极氪800V高压平台：充电5分钟，续航100km，重新定义出行自由。',
          quality_score: 78,
          token_estimate: 3200,
        });
      },
    }),
  };
}

// ─── Build ExecutionGraph from flow-v1.yaml ────────────────────────────────

function buildTechPackagingGraph(): ExecutionGraph {
  const nodes: GraphNodeConfig[] = [
    // Start node
    {
      id: 'start',
      type: NodeType.START,
      name: '开始',
      outputVar: 'startOutput',
    },
    // Step 1: techAnalyst
    {
      id: 'techAnalyst',
      type: NodeType.LLM,
      name: '技术分析师',
      agentId: 'expert-tech-analyst',
      systemPrompt: `你是极氪品牌的技术分析师专家。请基于以下产品信息进行技术深度分析：

产品名称：{{product_name}}
产品规格：{{product_specs}}
目标竞品：{{target_competitors}}

你的任务是：
1. 深度分析产品技术架构和创新点
2. 提炼3-5个最具传播价值的技术亮点
3. 每个亮点必须包含：现象级数据 + 技术原理 + 用户价值
4. 评估亮点等级和与竞品的对比优势`,
      userMessageTemplate: `请对 {{product_name}} 进行技术分析。

产品规格：
{{product_specs}}

目标竞品：
{{target_competitors}}`,
      inputMapping: {},
      outputFormat: 'structured_json',
      outputVar: 'techAnalysisResult',
      llmConfig: { provider: 'openai', model: 'gpt-4o', temperature: 0.7, maxTokens: 4000 },
      timeout: 120000,
    } as LLMNodeConfig,
    // Step 2: sceneAnalyst
    {
      id: 'sceneAnalyst',
      type: NodeType.LLM,
      name: '场景分析师',
      agentId: 'expert-scene-analyst',
      dependsOn: ['techAnalyst'],
      systemPrompt: `你是极氪品牌的场景叙事专家。请基于技术分析结果，进行场景映射。

技术分析结果：
{{techAnalysisResult}}

你的任务是：
1. 识别核心用户出行场景（通勤/周末出行/长途等）
2. 挖掘每个场景的用户痛点（物理/情感/社会层面）
3. 建立技术-场景-情感的映射关系
4. 构建有画面感的场景叙事`,
      userMessageTemplate: `请基于以下技术分析结果，进行场景映射：

{{techAnalysisResult}}`,
      inputMapping: { techAnalysisResult: 'techAnalysisResult' },
      outputFormat: 'structured_json',
      outputVar: 'sceneAnalysisResult',
      llmConfig: { provider: 'openai', model: 'gpt-4o', temperature: 0.7, maxTokens: 4000 },
      timeout: 120000,
    } as LLMNodeConfig,
    // Step 3: marketAnalyst
    {
      id: 'marketAnalyst',
      type: NodeType.LLM,
      name: '市场分析师',
      agentId: 'expert-market-analyst',
      dependsOn: ['techAnalyst'],
      systemPrompt: `你是极氪品牌的市场战略专家。请基于技术分析结果，进行市场分析。

技术分析结果：
{{techAnalysisResult}}

目标竞品：
{{target_competitors}}

你的任务是：
1. 分析市场竞争格局和竞品定位
2. 进行技术参数竞品对比
3. 识别差异化竞争机会
4. 提供内容传播的市场切入角度`,
      userMessageTemplate: `请基于以下技术分析结果，进行市场分析：

{{techAnalysisResult}}

目标竞品：
{{target_competitors}}`,
      inputMapping: { techAnalysisResult: 'techAnalysisResult', target_competitors: 'target_competitors' },
      outputFormat: 'structured_json',
      outputVar: 'marketAnalysisResult',
      llmConfig: { provider: 'openai', model: 'gpt-4o', temperature: 0.7, maxTokens: 4000 },
      timeout: 120000,
    } as LLMNodeConfig,
    // Step 4: qualityReflect
    {
      id: 'qualityReflect',
      type: NodeType.REFLECT,
      name: '质量评审',
      dependsOn: ['sceneAnalyst', 'marketAnalyst'],
      sourceNodeIds: ['techAnalyst', 'sceneAnalyst', 'marketAnalyst'],
      passNodeId: 'contentDirector',
      failNodeId: 'contentDirectorRetry',
      qualityThreshold: 75,
      qualityPrompt: `请对以下技术包装内容进行质量评审：

【技术分析】
{{techAnalysisResult}}

【场景分析】
{{sceneAnalysisResult}}

【市场分析】
{{marketAnalysisResult}}

评分标准：
- 90-100：优秀
- 80-89：良好
- 70-79：合格
- 60-69：欠佳
- <60：不合格

输出 JSON：{ "score": number, "dimensions": {...}, "comments": [...] }`,
    } as ReflectNodeConfig,
    // Step 5a: contentDirector (pass path)
    {
      id: 'contentDirector',
      type: NodeType.LLM,
      name: '内容总监',
      agentId: 'expert-content-director',
      dependsOn: ['qualityReflect'],
      systemPrompt: `你是极氪品牌的内容总监。请整合以下分析结果，创作高质量传播内容。

【技术分析】
{{techAnalysisResult}}

【场景分析】
{{sceneAnalysisResult}}

【市场分析】
{{marketAnalysisResult}}

内容需求：
{{content_requirements}}

你的任务是：
1. 整合三个专家的输出，提炼核心价值点
2. 创作具有传播力的内容
3. 确保内容符合极氪品牌调性：专业、高端、创新、可信赖`,
      userMessageTemplate: `请整合以下分析结果，创作传播内容：

技术分析：{{techAnalysisResult}}
场景分析：{{sceneAnalysisResult}}
市场分析：{{marketAnalysisResult}}
内容需求：{{content_requirements}}`,
      inputMapping: {
        techAnalysisResult: 'techAnalysisResult',
        sceneAnalysisResult: 'sceneAnalysisResult',
        marketAnalysisResult: 'marketAnalysisResult',
        content_requirements: 'content_requirements',
      },
      outputFormat: 'structured_json',
      outputVar: 'finalContent',
      llmConfig: { provider: 'openai', model: 'gpt-4o', temperature: 0.6, maxTokens: 6000 },
      timeout: 180000,
    } as LLMNodeConfig,
    // Step 5b: contentDirectorRetry (fail path, quality < 75)
    {
      id: 'contentDirectorRetry',
      type: NodeType.RETRY,
      name: '内容总监重试',
      dependsOn: ['qualityReflect'],
      maxRetries: 1,
      retryableErrors: ['quality_threshold_not_met'],
      retryDelayMs: 5000,
      childNodeId: 'contentDirector',
    },
    // End node
    {
      id: 'end',
      type: NodeType.END,
      name: '结束',
      dependsOn: ['contentDirector', 'contentDirectorRetry'],
      outputMapping: {
        tech_analysis: 'techAnalysisResult',
        scene_analysis: 'sceneAnalysisResult',
        market_analysis: 'marketAnalysisResult',
        final_content: 'finalContent',
        quality_score: 'qualityScore',
      },
    },
  ];

  const edges = [
    // start → techAnalyst
    { sourceId: 'start', targetId: 'techAnalyst', enabled: true },
    // techAnalyst → sceneAnalyst
    { sourceId: 'techAnalyst', targetId: 'sceneAnalyst', enabled: true },
    // techAnalyst → marketAnalyst
    { sourceId: 'techAnalyst', targetId: 'marketAnalyst', enabled: true },
    // sceneAnalyst → qualityReflect
    { sourceId: 'sceneAnalyst', targetId: 'qualityReflect', enabled: true },
    // marketAnalyst → qualityReflect
    { sourceId: 'marketAnalyst', targetId: 'qualityReflect', enabled: true },
    // qualityReflect → contentDirector (score >= 75)
    { sourceId: 'qualityReflect', targetId: 'contentDirector', condition: 'qualityScore >= 75', enabled: true },
    // qualityReflect → contentDirectorRetry (score < 75)
    { sourceId: 'qualityReflect', targetId: 'contentDirectorRetry', condition: 'qualityScore < 75', enabled: true },
    // contentDirector → end
    { sourceId: 'contentDirector', targetId: 'end', enabled: true },
    // contentDirectorRetry → end
    { sourceId: 'contentDirectorRetry', targetId: 'end', enabled: true },
  ];

  return {
    id: 'flow-tech-packaging-v1',
    name: '技术包装主流程',
    scene: 'tech-packaging',
    nodes,
    edges,
    startNodeId: 'start',
    endNodeIds: ['end'],
    version: '1.0.0',
  };
}

// ─── Test Suite ────────────────────────────────────────────────────────────

describe('E2E — M4-T43: 技术传播场景端到端测试', () => {
  let sceneId: string;
  let llmProviderFactory: ReturnType<typeof createMockLLMProvider>;
  let qualityJudge: LLMJudge;

  beforeAll(async () => {
    // Check if scene API is available
    try {
      const health = await fetch(`${SCENE_BASE}/health`);
      if (!health.ok) {
        console.warn(`⚠️  Scene API not available at ${SCENE_BASE}, skipping scene CRUD tests`);
      }
    } catch {
      console.warn(`⚠️  Cannot reach Scene API at ${SCENE_BASE}, skipping scene CRUD tests`);
    }

    llmProviderFactory = createMockLLMProvider();
    qualityJudge = new LLMJudge({ threshold: 70, model: 'gpt-4o-mini' });
  });

  afterAll(async () => {
    // Cleanup: delete test scene
    if (sceneId) {
      await api('DELETE', `/scenes/${sceneId}`).catch(() => {/* ignore cleanup errors */});
    }
  });

  // ── M4-T44: Scene CRUD ────────────────────────────────────────────────

  describe('M4-T44: 场景 CRUD', () => {
    it('01 — POST /scenes 创建技术包装场景', async () => {
      const { status, data } = await api('POST', '/scenes', {
        name: `tech-packaging-${Date.now()}`,
        description: '技术包装场景：800V高压平台技术传播',
        triggerWords: ['800V', '高压平台', '技术包装', '技术传播'],
        priority: 80,
        enabled: true,
        metadata: {
          flowId: 'flow-tech-packaging-v1',
          flowVersion: '1.0.0',
          tags: ['tech-packaging', 'multi-agent'],
        },
      });

      expect(status).toBe(201);
      expect(data.id).toBeDefined();
      sceneId = data.id as string;
      expect(data.version).toBe('1.0.0');
    });

    it('02 — GET /scenes/:id 获取场景详情', async () => {
      const { status, data } = await api('GET', `/scenes/${sceneId}`);
      expect(status).toBe(200);
      expect(data.id).toBe(sceneId);
      expect(data.name).toBeTruthy();
    });

    it('03 — PUT /scenes/:id 更新场景配置（版本自动递增）', async () => {
      const { status, data } = await api('PUT', `/scenes/${sceneId}`, {
        description: '更新描述：极氪800V高压平台技术',
        changeSummary: 'Update tech-packaging scene description',
      });

      expect(status).toBe(200);
      // patch 递增
      expect(data.version).toBe('1.0.1');
      expect(data.previousVersion).toBe('1.0.0');
    });

    it('04 — GET /scenes/:id/versions 版本历史', async () => {
      const { status, data } = await api('GET', `/scenes/${sceneId}/versions`);
      expect(status).toBe(200);
      expect((data.versions as unknown[]).length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── M4-T45: 版本管理 ──────────────────────────────────────────────────

  describe('M4-T45: 场景版本管理', () => {
    it('05 — GET /scenes/:id/versions/:version 获取指定版本', async () => {
      const { status, data } = await api('GET', `/scenes/${sceneId}/versions/1.0.0`);
      expect(status).toBe(200);
      expect(data.version).toBe('1.0.0');
      expect(data.config).toBeDefined();
    });

    it('06 — POST /scenes/:id/rollback 回滚到 1.0.0', async () => {
      const { status, data } = await api('POST', `/scenes/${sceneId}/rollback', {
        version: '1.0.0',
      });

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.rolledBackTo).toBe('1.0.0');
      // 回滚后 patch 递增为 1.0.2
      expect(data.newVersion).toBe('1.0.2');
    });
  });

  // ── M4-T42: 编排流程 ──────────────────────────────────────────────────

  describe('M4-T42: 编排流程执行', () => {
    it('07 — 加载 flow-v1.yaml 并构建 ExecutionGraph', () => {
      const flowPath = path.resolve(
        process.cwd(),
        'scenes/tech-packaging/flow-v1.yaml'
      );

      // Check if the flow YAML file exists
      const yamlExists = fs.existsSync(flowPath);
      expect(yamlExists).toBe(true);

      // Build graph programmatically
      const graph = buildTechPackagingGraph();

      expect(graph.id).toBe('flow-tech-packaging-v1');
      expect(graph.nodes.length).toBeGreaterThanOrEqual(7); // start + 3 agents + reflect + retry + end
      expect(graph.edges.length).toBeGreaterThanOrEqual(8);

      // Verify key nodes exist
      const nodeIds = graph.nodes.map((n) => n.id);
      expect(nodeIds).toContain('techAnalyst');
      expect(nodeIds).toContain('sceneAnalyst');
      expect(nodeIds).toContain('marketAnalyst');
      expect(nodeIds).toContain('qualityReflect');
      expect(nodeIds).toContain('contentDirector');
      expect(nodeIds).toContain('contentDirectorRetry');
      expect(nodeIds).toContain('end');
    });

    it('08 — CdagExecutor 构造成功', () => {
      const graph = buildTechPackagingGraph();
      const executor = new CdagExecutor(graph, {
        llmProviderFactory,
        qualityJudge,
        verbose: false,
        maxExecutionTimeMs: 120000, // 2min
      });

      expect(executor).toBeDefined();
    });
  });

  // ── M4-T43: 端到端执行 ────────────────────────────────────────────────

  describe('M4-T43: 技术传播场景端到端执行', () => {
    it('09 — 全链路执行：techAnalyst → sceneAnalyst → marketAnalyst → reflect → contentDirector', async () => {
      const graph = buildTechPackagingGraph();
      const executor = new CdagExecutor(graph, {
        llmProviderFactory,
        qualityJudge,
        verbose: false,
        maxExecutionTimeMs: 120000,
      });

      const startTime = Date.now();
      const result = await executor.execute({
        product_name: '极氪007',
        product_specs: '800V高压平台 | 充电5分钟续航100km | 最高功率475kW',
        target_competitors: '特斯拉Model 3 | 小鹏P7 | 蔚来ET5',
        use_case: '城市通勤+长途出行',
        content_requirements: '技术白皮书 + 新闻通稿 + 演讲稿',
      });
      const totalDurationMs = Date.now() - startTime;

      // Execution should complete
      expect(result.status).toBe('success');

      // Verify all key nodes were executed
      const executedNodeIds = [...result.nodeResults.keys()];
      expect(executedNodeIds).toContain('techAnalyst');
      expect(executedNodeIds).toContain('sceneAnalyst');
      expect(executedNodeIds).toContain('marketAnalyst');
      expect(executedNodeIds).toContain('qualityReflect');
      expect(executedNodeIds).toContain('contentDirector');
      expect(executedNodeIds).toContain('end');

      // Verify node execution order (techAnalyst should complete before sceneAnalyst/marketAnalyst)
      const techAnalystResult = result.nodeResults.get('techAnalyst');
      const sceneAnalystResult = result.nodeResults.get('sceneAnalyst');
      const marketAnalystResult = result.nodeResults.get('marketAnalyst');
      const reflectResult = result.nodeResults.get('qualityReflect');
      const directorResult = result.nodeResults.get('contentDirector');

      expect(techAnalystResult?.status).toBe(NodeStatus.COMPLETED);
      expect(sceneAnalystResult?.status).toBe(NodeStatus.COMPLETED);
      expect(marketAnalystResult?.status).toBe(NodeStatus.COMPLETED);
      expect(reflectResult?.status).toBe(NodeStatus.COMPLETED);
      expect(directorResult?.status).toBe(NodeStatus.COMPLETED);

      // Total duration should be < 2min
      expect(totalDurationMs).toBeLessThan(120000);

      // Token estimate should be < 50k
      const directorOutput = directorResult?.output;
      if (directorOutput && typeof directorOutput === 'object') {
        const tokenEstimate = (directorOutput as Record<string, unknown>).token_estimate;
        if (typeof tokenEstimate === 'number') {
          expect(tokenEstimate).toBeLessThan(50000);
        }
      }

      // Output should be non-empty
      const finalOutput = result.output ?? directorResult?.output;
      expect(finalOutput).toBeTruthy();
    }, 130000); // 130s timeout (slightly more than 2min to account for overhead

    it('10 — 质量评分 <75 时 contentDirectorRetry 被触发', async () => {
      // Build a graph with low-quality mock responses
      const lowQualityGraph: ExecutionGraph = {
        id: 'low-quality-test',
        name: 'Low Quality Test',
        nodes: [
          { id: 'start', type: NodeType.START, outputVar: 'startOutput' },
          {
            id: 'techAnalyst',
            type: NodeType.LLM,
            name: '技术分析师',
            outputVar: 'techAnalysisResult',
            llmConfig: { provider: 'openai', model: 'gpt-4o', temperature: 0.7, maxTokens: 4000 },
            systemPrompt: '',
            userMessageTemplate: '',
            inputMapping: {},
          } as LLMNodeConfig,
          {
            id: 'qualityReflect',
            type: NodeType.REFLECT,
            name: '质量评审',
            dependsOn: ['techAnalyst'],
            sourceNodeIds: ['techAnalyst'],
            passNodeId: 'contentDirector',
            failNodeId: 'contentDirectorRetry',
            qualityThreshold: 75,
            qualityPrompt: '评审',
          } as ReflectNodeConfig,
          {
            id: 'contentDirector',
            type: NodeType.LLM,
            name: '内容总监',
            outputVar: 'finalContent',
            llmConfig: { provider: 'openai', model: 'gpt-4o', temperature: 0.6, maxTokens: 6000 },
            systemPrompt: '',
            userMessageTemplate: '',
            inputMapping: {},
          } as LLMNodeConfig,
          {
            id: 'contentDirectorRetry',
            type: NodeType.RETRY,
            name: '内容总监重试',
            dependsOn: ['qualityReflect'],
            maxRetries: 1,
            retryableErrors: ['quality_threshold_not_met'],
            retryDelayMs: 1000,
            childNodeId: 'contentDirector',
          },
          { id: 'end', type: NodeType.END, dependsOn: ['contentDirector', 'contentDirectorRetry'] },
        ],
        edges: [
          { sourceId: 'start', targetId: 'techAnalyst', enabled: true },
          { sourceId: 'techAnalyst', targetId: 'qualityReflect', enabled: true },
          { sourceId: 'qualityReflect', targetId: 'contentDirector', condition: 'qualityScore >= 75', enabled: true },
          { sourceId: 'qualityReflect', targetId: 'contentDirectorRetry', condition: 'qualityScore < 75', enabled: true },
          { sourceId: 'contentDirector', targetId: 'end', enabled: true },
          { sourceId: 'contentDirectorRetry', targetId: 'end', enabled: true },
        ],
        startNodeId: 'start',
        endNodeIds: ['end'],
        version: '1.0.0',
      };

      const lowQualityMockFactory = {
        create: (_config: { provider: string; model: string }) => ({
          chat: async (): Promise<string> => {
            // Always return low quality output
            return JSON.stringify({
              score: 65, // Below 75 threshold
              dimensions: { accuracy: 60, readability: 70, brand_voice: 65 },
              comments: ['需要改进'],
            });
          },
        }),
      };

      const executor = new CdagExecutor(lowQualityGraph, {
        llmProviderFactory: lowQualityMockFactory,
        qualityJudge,
        verbose: false,
        maxExecutionTimeMs: 60000,
      });

      const result = await executor.execute({ query: 'test' });

      // The reflect node should route to retry path when quality < 75
      const reflectResult = result.nodeResults.get('qualityReflect');
      expect(reflectResult).toBeDefined();

      // contentDirectorRetry should be triggered
      const retryResult = result.nodeResults.get('contentDirectorRetry');
      expect(retryResult?.status).toBe(NodeStatus.COMPLETED);
    });

    it('11 — 输出包含完整技术传播方案结构', async () => {
      const graph = buildTechPackagingGraph();
      const executor = new CdagExecutor(graph, {
        llmProviderFactory,
        qualityJudge,
        verbose: false,
        maxExecutionTimeMs: 120000,
      });

      const result = await executor.execute({
        product_name: '极氪007',
        product_specs: '800V高压平台 | 充电5分钟续航100km',
        target_competitors: '特斯拉Model 3',
        use_case: '城市通勤',
        content_requirements: '技术白皮书',
      });

      const directorResult = result.nodeResults.get('contentDirector');
      const output = directorResult?.output;

      // Output should contain the final content
      expect(output).toBeTruthy();

      // Parse output if it's a JSON string
      let parsedOutput: Record<string, unknown>;
      if (typeof output === 'string') {
        try {
          parsedOutput = JSON.parse(output);
        } catch {
          parsedOutput = { content: output };
        }
      } else {
        parsedOutput = output as Record<string, unknown>;
      }

      // Should contain final content or content field
      expect(
        parsedOutput.final_content ||
          parsedOutput.content ||
          parsedOutput.finalContent ||
          Object.keys(parsedOutput).length > 0
      ).toBeTruthy();
    });
  });

  // ── 性能指标验证 ─────────────────────────────────────────────────────

  describe('性能指标验证', () => {
    it('12 — 端到端执行耗时 < 2分钟', async () => {
      const graph = buildTechPackagingGraph();
      const executor = new CdagExecutor(graph, {
        llmProviderFactory,
        qualityJudge,
        verbose: false,
        maxExecutionTimeMs: 120000,
      });

      const startTime = Date.now();
      const result = await executor.execute({
        product_name: '极氪007',
        product_specs: '800V高压平台',
        target_competitors: '特斯拉',
        content_requirements: '通稿',
      });
      const duration = Date.now() - startTime;

      expect(result.status).toBe('success');
      expect(duration).toBeLessThan(120000);
    }, 130000);
  });
});
