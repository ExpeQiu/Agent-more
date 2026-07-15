/**
 * Scene Router 单元测试 — P1-T56
 * 覆盖 Layer 0/1/2/3 + 降级逻辑，共 11 个用例
 */

import { describe, it, expect, vi } from 'vitest';
import {
  layer0ExactMatch,
  layer1TriggerWordMatch,
  routeLayer0And1,
} from '../hierarchical-scene-router';
import { HybridMatchRouter } from '../hybrid-match';
import { LLMIntentRouter } from '../llm-intent-router';
import {
  evaluateFallback,
  buildFallbackResponse,
  aggregateLayerResults,
  DEFAULT_FALLBACK_CONFIG,
} from '../router-fallback';
import type {
  SceneDefinition,
  RoutingRequest,
  RoutingResponse,
  LLMIntentRouterConfig,
  FallbackConfig,
  LayerScore,
} from '../types';

// ─── 共享测试 Fixtures ───────────────────────────────────────────────────────

const TECH_PACKAGING_SCENE: SceneDefinition = {
  id: 'tech-packaging',
  name: '技术传播',
  description: '新能源汽车技术亮点包装与传播方案生成',
  triggerWords: ['800V', '高压平台', '技术传播', '技术包装', '电驱动'],
  rules: [],
  fewShotExamples: [
    { query: '800V超充技术介绍', sceneId: 'tech-packaging', label: 'positive' },
  ],
  enabled: true,
  metadata: { team: 'TPD' },
};

const COMPETITOR_SCENE: SceneDefinition = {
  id: 'competitor-analysis',
  name: '竞品分析',
  description: '竞品车型对比分析',
  triggerWords: ['竞品', '对比', '车型分析'],
  rules: [],
  enabled: true,
  metadata: {},
};

const FALLBACK_SCENE: SceneDefinition = {
  id: 'fallback',
  name: '通用咨询',
  description: '通用对话场景',
  triggerWords: [],
  rules: [],
  enabled: true,
  metadata: {},
};

const ALL_SCENES = [TECH_PACKAGING_SCENE, COMPETITOR_SCENE, FALLBACK_SCENE];

// ─── Layer 0 Tests ────────────────────────────────────────────────────────────

describe('Layer 0: 精确 sceneId 匹配', () => {
  it('精确 sceneId 命中 → confidence=1.0', () => {
    const result = layer0ExactMatch('tech-packaging', ALL_SCENES);
    expect(result.matched).toBe(true);
    expect(result.scene?.id).toBe('tech-packaging');
    expect(result.score.score).toBe(1.0);
    expect(result.score.layer).toBe(0);
    expect(result.score.layerName).toBe('exactMatch');
  });

  it('sceneId 大小写不敏感 → confidence=1.0', () => {
    const result = layer0ExactMatch('TECH-PACKAGING', ALL_SCENES);
    expect(result.matched).toBe(true);
    expect(result.score.score).toBe(1.0);
  });

  it('sceneName 作为别名匹配 → confidence=1.0', () => {
    const result = layer0ExactMatch('技术传播', ALL_SCENES);
    expect(result.matched).toBe(true);
    expect(result.scene?.id).toBe('tech-packaging');
    expect(result.score.score).toBe(1.0);
  });

  it('无效 sceneId → matched=false，降级 Layer 1', () => {
    const result = layer0ExactMatch('unknown-scene', ALL_SCENES);
    expect(result.matched).toBe(false);
    expect(result.scene).toBeUndefined();
    expect(result.score.score).toBe(0.0);
  });
});

// ─── Layer 1 Tests ────────────────────────────────────────────────────────────

describe('Layer 1: 触发词匹配', () => {
  it('精确触发词命中 → confidence=0.9', () => {
    const result = layer1TriggerWordMatch('我想了解800V超充技术', ALL_SCENES);
    expect(result.matched).toBe(true);
    expect(result.results[0].scene.id).toBe('tech-packaging');
    expect(result.results[0].confidence).toBe(0.9);
    expect(result.results[0].triggerMatches).toContain('800V');
    expect(result.score.layer).toBe(1);
  });

  it('多个触发词命中 → 仍返回 0.9（不叠加）', () => {
    const result = layer1TriggerWordMatch('800V高压平台电驱动技术', ALL_SCENES);
    expect(result.matched).toBe(true);
    expect(result.results[0].confidence).toBe(0.9);
    expect(result.results[0].triggerMatches.length).toBeGreaterThanOrEqual(2);
  });

  it('无触发词匹配 → matched=false，降级 Layer 2', () => {
    const result = layer1TriggerWordMatch('今天天气怎么样', ALL_SCENES);
    expect(result.matched).toBe(false);
    expect(result.results).toHaveLength(0);
    expect(result.score.score).toBe(0.0);
  });
});

// ─── Layer 0/1 组合路由 Tests ─────────────────────────────────────────────────

describe('Layer 0/1 组合路由', () => {
  it('Layer 0 命中时直接返回，不走 Layer 1', () => {
    const request: RoutingRequest = { query: 'tech-packaging' };
    const { response, layerScores } = routeLayer0And1(request, ALL_SCENES);
    expect(response).not.toBeNull();
    expect(response!.confidence).toBe(1.0);
    expect(response!.layer).toBe(0);
    // Layer 0 matches → early return, Layer 1 NOT executed → only Layer 0 score
    expect(layerScores).toHaveLength(1);
  });

  it('Layer 0 未命中，Layer 1 触发词匹配', () => {
    const request: RoutingRequest = { query: '帮我写800V超充方案' };
    const { response, layerScores } = routeLayer0And1(request, ALL_SCENES);
    expect(response).not.toBeNull();
    expect(response!.confidence).toBe(0.9);
    expect(response!.layer).toBe(1);
    expect(layerScores[0].score).toBe(0.0); // Layer 0 no match
    expect(layerScores[1].score).toBe(0.9); // Layer 1 matched
  });

  it('Layer 0/1 均未命中 → response=null，触发降级', () => {
    const request: RoutingRequest = { query: '今天吃什么' };
    const { response, layerScores } = routeLayer0And1(request, ALL_SCENES);
    expect(response).toBeNull();
    expect(layerScores[0].score).toBe(0.0);
    expect(layerScores[1].score).toBe(0.0);
  });
});

// ─── Layer 2 Tests ────────────────────────────────────────────────────────────

describe('Layer 2: 向量混合匹配', () => {
  it('Qdrant 返回结果 → 使用混合评分 confidence>=0.6', async () => {
    // 使用预置 embedding 的场景，本地向量搜索命中
    const seededScene: SceneDefinition = {
      ...TECH_PACKAGING_SCENE,
      descriptionEmbedding: new Array(1536).fill(0).map((_, i) => (i === 0 ? 1 : 0)),
    };
    const seededScenes = [seededScene, COMPETITOR_SCENE, FALLBACK_SCENE];

    // 生成相同向量（index 0 = 1），确保命中
    const seededRouter = new HybridMatchRouter(
      seededScenes,
      undefined, // no Qdrant → use local fallback
      async () => new Array(1536).fill(0).map((_, i) => (i === 0 ? 1 : 0))
    );

    const request: RoutingRequest = { query: '800V超充技术' };
    const { response, score } = await seededRouter.route(request, []);

    expect(response).not.toBeNull();
    expect(score.layer).toBe(2);
    expect(score.matched).toBe(true);
    expect(score.score).toBeGreaterThanOrEqual(0.6);
  });

  it('embedText 抛出异常 → 异常向上传播（不在 try/catch 范围内）', async () => {
    const errorRouter = new HybridMatchRouter(
      ALL_SCENES,
      { url: 'http://unreachable:6333', collectionName: 'broken', vectorSize: 1536 },
      async () => { throw new Error('network timeout'); }
    );

    const request: RoutingRequest = { query: '800V超充技术' };
    // embedText 在 try 块外抛出，异常直接向上传播
    await expect(errorRouter.route(request, [])).rejects.toThrow('network timeout');
  });

  it('Qdrant 无结果 → score.matched=false，降级 Layer 3', async () => {
    // 零向量 embedding 与任何场景都不匹配（相似度=0 < 0.6阈值）
    const router = new HybridMatchRouter(
      ALL_SCENES,
      undefined,
      async () => new Array(1536).fill(0) // 零向量
    );

    const request: RoutingRequest = { query: '完全无关的查询' };
    const { response, score } = await router.route(request, []);

    expect(response).toBeNull();
    expect(score.matched).toBe(false);
    expect(score.score).toBe(0);
  });
});

// ─── Layer 3 Tests ────────────────────────────────────────────────────────────

describe('Layer 3: LLM 兜底', () => {
  const mockLLMConfig: LLMIntentRouterConfig = {
    provider: 'openai',
    model: 'gpt-4o-mini',
    apiKey: 'test-key',
    confidenceCeiling: 0.85,
  };

  it('LLM 判断高置信 → confidence=0.85（上限），返回场景', async () => {
    const mockAdapter = {
      complete: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          sceneId: 'tech-packaging',
          confidence: 0.9,
          reasoning: 'Query discusses 800V charging technology, best matched to tech-packaging',
        }),
      }),
    };

    const router = new LLMIntentRouter(mockLLMConfig, ALL_SCENES, mockAdapter as any);
    const request: RoutingRequest = { query: '800V超充平台技术原理' };
    const { response, score } = await router.route(request, []);

    expect(response).not.toBeNull();
    expect(response!.sceneId).toBe('tech-packaging');
    expect(response!.confidence).toBe(0.85); // capped at ceiling
    expect(score.layer).toBe(3);
    expect(score.matched).toBe(true);
  });

  it('LLM 判断低置信 → confidence=0.3，返回结果但 fallback=true', async () => {
    const mockAdapter = {
      complete: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          sceneId: 'tech-packaging',
          confidence: 0.3,
          reasoning: 'Query is ambiguous, uncertain match',
        }),
      }),
    };

    const router = new LLMIntentRouter(mockLLMConfig, ALL_SCENES, mockAdapter as any);
    const request: RoutingRequest = { query: '随便聊聊' };
    const { response, score } = await router.route(request, []);

    expect(response).not.toBeNull();
    expect(response!.confidence).toBe(0.3); // not capped
    expect(score.matched).toBe(true);
  });

  it('LLM 调用失败 → score.matched=false，降级 fallback', async () => {
    const mockAdapter = {
      complete: vi.fn().mockRejectedValue(new Error('API timeout')),
    };

    const router = new LLMIntentRouter(mockLLMConfig, ALL_SCENES, mockAdapter as any);
    const request: RoutingRequest = { query: '800V技术' };
    const { response, score } = await router.route(request, []);

    expect(response).toBeNull();
    expect(score.matched).toBe(false);
    expect(score.details).toContain('API timeout');
  });
});

// ─── 降级逻辑 Tests ─────────────────────────────────────────────────────────

describe('降级逻辑', () => {
  const thresholdConfig: FallbackConfig = {
    ...DEFAULT_FALLBACK_CONFIG,
    confidenceThreshold: 0.5,
    defaultSceneId: 'fallback',
  };

  it('confidence < 0.5 → shouldFallback=true', () => {
    const lowConfidenceResponse: RoutingResponse = {
      sceneId: 'tech-packaging',
      sceneName: '技术传播',
      confidence: 0.3,
      layer: 3,
      reasoning: 'Low confidence match',
      fallback: false,
    };

    const eval_ = evaluateFallback(lowConfidenceResponse, thresholdConfig);
    expect(eval_.shouldFallback).toBe(true);
    expect(eval_.confidence).toBe(0.3);
    expect(eval_.clarificationSuggestion).toBeDefined();
  });

  it('confidence >= 0.5 → shouldFallback=false', () => {
    const highConfidenceResponse: RoutingResponse = {
      sceneId: 'tech-packaging',
      sceneName: '技术传播',
      confidence: 0.75,
      layer: 2,
      reasoning: 'Strong match',
      fallback: false,
    };

    const eval_ = evaluateFallback(highConfidenceResponse, thresholdConfig);
    expect(eval_.shouldFallback).toBe(false);
    expect(eval_.confidence).toBe(0.75);
  });

  it('confidence = 0.5 → shouldFallback=false（边界值）', () => {
    const boundaryResponse: RoutingResponse = {
      sceneId: 'tech-packaging',
      sceneName: '技术传播',
      confidence: 0.5,
      layer: 2,
      reasoning: 'Boundary case',
      fallback: false,
    };

    const eval_ = evaluateFallback(boundaryResponse, thresholdConfig);
    expect(eval_.shouldFallback).toBe(false);
  });

  it('无匹配结果（null）→ shouldFallback=true', () => {
    const eval_ = evaluateFallback(null, thresholdConfig);
    expect(eval_.shouldFallback).toBe(true);
    expect(eval_.confidence).toBe(0);
  });

  it('buildFallbackResponse 生成正确的降级响应', () => {
    const request: RoutingRequest = { query: '随便问点什么' };
    const layerScores: LayerScore[] = [
      { layer: 0, layerName: 'exactMatch', score: 0 },
      { layer: 1, layerName: 'triggerRuleMatch', score: 0 },
      { layer: 2, layerName: 'vectorHybridMatch', score: 0 },
    ];

    const fallbackResp = buildFallbackResponse({
      request,
      fallbackConfig: thresholdConfig,
      defaultScene: FALLBACK_SCENE,
      layerScores,
    });

    expect(fallbackResp.fallback).toBe(true);
    expect(fallbackResp.sceneId).toBe('fallback');
    expect(fallbackResp.confidence).toBe(0);
    expect(fallbackResp.clarificationSuggestion).toBeDefined();
    expect(fallbackResp.layerScores).toEqual(layerScores);
  });
});

// ─── 聚合层级结果 Tests ─────────────────────────────────────────────────────

describe('aggregateLayerResults 多层聚合', () => {
  it('返回最高置信度的响应及其层级', () => {
    const responses = new Map<number, RoutingResponse | null>([
      [0, null],
      [1, { sceneId: 'tech-packaging', sceneName: '技术传播', confidence: 0.9, layer: 1, reasoning: 'trigger', fallback: false }],
      [2, { sceneId: 'tech-packaging', sceneName: '技术传播', confidence: 0.75, layer: 2, reasoning: 'vector', fallback: false }],
    ]);
    const scores: LayerScore[] = [
      { layer: 0, layerName: 'exactMatch', score: 0, matched: false },
      { layer: 1, layerName: 'triggerRuleMatch', score: 0.9, matched: true },
      { layer: 2, layerName: 'vectorHybridMatch', score: 0.75, matched: true },
    ];

    const result = aggregateLayerResults(responses, scores);

    expect(result.bestConfidence).toBe(0.9);
    expect(result.bestResponse?.sceneId).toBe('tech-packaging');
    expect(result.matchedLayer).toBe(1);
    expect(result.allScores).toHaveLength(3);
  });

  it('所有层级均无匹配 → bestConfidence=0', () => {
    const responses = new Map<number, RoutingResponse | null>([
      [0, null],
      [1, null],
      [2, null],
      [3, null],
    ]);

    const result = aggregateLayerResults(responses, []);

    expect(result.bestConfidence).toBe(0);
    expect(result.bestResponse).toBeNull();
    expect(result.matchedLayer).toBeNull();
  });
});
