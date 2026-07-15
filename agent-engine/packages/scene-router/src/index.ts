/**
 * Scene Router — Main Entry Point
 * P1-M5: Agent编排引擎 Scene Router 路由任务
 *
 * 分层路由架构：
 * - Layer 0: 精确 sceneId 匹配 → confidence = 1.0
 * - Layer 1: 触发词 + 规则匹配 → confidence = 0.9
 * - Layer 2: 向量混合匹配（Qdrant） → confidence = similarity score
 * - Layer 3: LLM Few-shot 意图分类 → confidence ≤ 0.85
 *
 * 降级逻辑：confidence < 0.5 时触发 fallback
 */

export * from './types.js';
export * from './hierarchical-scene-router.js';
export * from './hybrid-match.js';
export * from './llm-intent-router.js';
export * from './router-fallback.js';
export * from './routing-logger.js';

import type {
  SceneDefinition,
  RoutingRequest,
  RoutingResponse,
  SceneRouterConfig,
  FallbackConfig,
  LayerScore,
} from './types.js';

import {
  routeLayer0And1,
  type TriggerMatchResult,
} from './hierarchical-scene-router.js';

import {
  HybridMatchRouter,
  cosineSimilarity,
  generateTextEmbedding,
  type QdrantSearchResult,
} from './hybrid-match.js';

import {
  LLMIntentRouter,
  type LLMIntentRouterResult,
} from './llm-intent-router.js';

import {
  evaluateFallback,
  buildFallbackResponse,
  aggregateLayerResults,
  DEFAULT_FALLBACK_CONFIG,
  type FallbackEvaluation,
} from './router-fallback.js';

import {
  RoutingDecisionLogger,
  type LogEntryBuilder,
  buildLogEntry,
} from './routing-logger.js';

import type { RoutingDecisionLog, RouteDecisionLog } from './types.js';

// ─── Scene Router ────────────────────────────────────────────────────────────

/**
 * 场景路由器主类
 * 组合所有层级，提供统一的路由接口
 */
export class SceneRouter {
  private scenes: SceneDefinition[];
  private fallbackConfig: FallbackConfig;
  private hybridRouter?: HybridMatchRouter;
  private llmRouter?: LLMIntentRouter;
  private logger: RoutingDecisionLogger;
  private qdrantConfig?: SceneRouterConfig['qdrant'];
  private llmConfig?: SceneRouterConfig['llmIntent'];
  private defaultScene?: SceneDefinition;

  constructor(config: SceneRouterConfig) {
    this.scenes = config.scenes.filter((s) => s.enabled);
    this.fallbackConfig = config.fallback ?? DEFAULT_FALLBACK_CONFIG;
    this.qdrantConfig = config.qdrant;
    this.llmConfig = config.llmIntent;
    this.defaultScene = this.scenes.find(
      (s) => s.id === config.defaultSceneId
    );

    // 初始化 Layer 2 向量路由器
    if (config.qdrant) {
      this.hybridRouter = new HybridMatchRouter(
        this.scenes,
        config.qdrant,
        generateTextEmbedding
      );
    }

    // 初始化 Layer 3 LLM 路由器
    if (config.llmIntent) {
      this.llmRouter = new LLMIntentRouter(config.llmIntent, this.scenes);
    }

    // 初始化日志记录器
    this.logger = new RoutingDecisionLogger({
      enabled: config.logger?.enabled ?? true,
      writeLog: config.logger?.writeLog,
    });
  }

  /**
   * 初始化（用于异步初始化，如 Qdrant collection 创建）
   */
  async initialize(): Promise<void> {
    if (this.hybridRouter) {
      await this.hybridRouter.initialize();
    }
  }

  /**
   * 执行路由
   * 按层级顺序尝试，直到找到置信度足够的匹配
   */
  async route(request: RoutingRequest): Promise<RoutingResponse> {
    const startTime = Date.now();
    const layerScores: LayerScore[] = [];
    const layerResponses = new Map<number, RoutingResponse | null>();

    // ─── Layer 0/1 ────────────────────────────────────────────────────────

    const { response: layer01Response, layerScores: layer01Scores } =
      routeLayer0And1(request, this.scenes);

    layerScores.push(...layer01Scores);
    layerResponses.set(0, layer01Response);
    layerResponses.set(1, layer01Response);

    if (layer01Response && layer01Response.confidence >= this.fallbackConfig.confidenceThreshold) {
      return this.finalizeResponse(layer01Response, request, layerScores, startTime);
    }

    // ─── Layer 2 ──────────────────────────────────────────────────────────

    let layer2Response: RoutingResponse | null = null;

    if (this.hybridRouter) {
      const { response, score } = await this.hybridRouter.route(
        request,
        layerScores
      );
      layerScores.push(score);
      layer2Response = response;
      layerResponses.set(2, response);

      if (response && response.confidence >= this.fallbackConfig.confidenceThreshold) {
        return this.finalizeResponse(response, request, layerScores, startTime);
      }
    }

    // ─── Layer 3 ──────────────────────────────────────────────────────────

    let layer3Response: RoutingResponse | null = null;

    if (this.llmRouter) {
      const { response, score } = await this.llmRouter.route(
        request,
        layerScores
      );
      layerScores.push(score);
      layer3Response = response;
      layerResponses.set(3, response);

      if (response && response.confidence >= this.fallbackConfig.confidenceThreshold) {
        return this.finalizeResponse(response, request, layerScores, startTime);
      }
    }

    // ─── Fallback ─────────────────────────────────────────────────────────

    const { bestResponse, bestConfidence } = aggregateLayerResults(
      layerResponses,
      layerScores
    );

    const fallbackEval = evaluateFallback(bestResponse, this.fallbackConfig);

    if (fallbackEval.shouldFallback) {
      const fallbackResp = buildFallbackResponse({
        request,
        fallbackConfig: this.fallbackConfig,
        defaultScene: this.defaultScene,
        layerScores,
        partialMatch: bestResponse ?? undefined,
      });

      return this.finalizeResponse(fallbackResp, request, layerScores, startTime);
    }

    // 返回最佳匹配
    if (bestResponse) {
      return this.finalizeResponse(bestResponse, request, layerScores, startTime);
    }

    // 兜底：完全无法匹配
    const noMatchResp: RoutingResponse = {
      sceneId: this.fallbackConfig.defaultSceneId,
      sceneName: this.defaultScene?.name ?? 'Fallback',
      confidence: 0,
      layer: 0,
      reasoning: 'No scene matched across all routing layers',
      fallback: true,
      clarificationSuggestion: fallbackEval.clarificationSuggestion,
      layerScores,
      decisionId: `rd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    };

    return this.finalizeResponse(noMatchResp, request, layerScores, startTime);
  }

  /**
   * 同步路由（不带 LLM 调用）
   * 仅 Layer 0/1，用于不需要 LLM 的快速路由
   */
  routeSync(request: RoutingRequest): RoutingResponse {
    const startTime = Date.now();
    const layerScores: LayerScore[] = [];

    // Layer 0/1
    const { response: layer01Response, layerScores: layer01Scores } =
      routeLayer0And1(request, this.scenes);
    layerScores.push(...layer01Scores);

    if (layer01Response && layer01Response.confidence >= this.fallbackConfig.confidenceThreshold) {
      return this.finalizeResponse(layer01Response, request, layerScores, startTime);
    }

    const fallbackEval = evaluateFallback(layer01Response, this.fallbackConfig);
    if (fallbackEval.shouldFallback) {
      return this.finalizeResponse(
        buildFallbackResponse({
          request,
          fallbackConfig: this.fallbackConfig,
          defaultScene: this.defaultScene,
          layerScores,
        }),
        request,
        layerScores,
        startTime
      );
    }

    if (layer01Response) {
      return this.finalizeResponse(layer01Response, request, layerScores, startTime);
    }

    return this.finalizeResponse(
      buildFallbackResponse({
        request,
        fallbackConfig: this.fallbackConfig,
        defaultScene: this.defaultScene,
        layerScores,
      }),
      request,
      layerScores,
      startTime
    );
  }

  /**
   * 记录路由日志
   */
  async logRoute(
    request: RoutingRequest,
    response: RoutingResponse,
    processingTimeMs: number
  ): Promise<RoutingDecisionLog> {
    return this.logger.log(request, response, processingTimeMs);
  }

  /**
   * 查询路由日志
   */
  async getRouteLogs(limit?: number): Promise<RoutingDecisionLog[]> {
    return this.logger.getRecentLogs(limit);
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private finalizeResponse(
    response: RoutingResponse,
    request: RoutingRequest,
    layerScores: LayerScore[],
    startTime: number
  ): RoutingResponse {
    // 确保 layerScores 被包含在响应中
    response.layerScores = layerScores;

    // 异步记录日志（不阻塞响应）
    const processingTimeMs = Date.now() - startTime;
    this.logger.log(request, response, processingTimeMs).catch((err) => {
      console.error('[SceneRouter] Failed to write routing log:', err);
    });

    // 写入 PostgreSQL routing_logs 表（P1-T55）
    // logDecision 异步执行，不阻塞路由主流程
    const routeLog: RouteDecisionLog = {
      executionId: response.decisionId ?? `rd_${Date.now()}`,
      inputQuery: request.query,
      matchedSceneId: response.sceneId ?? null,
      confidence: response.confidence,
      layer: response.layer,
      routingTimeMs: processingTimeMs,
    };
    this.logger.logDecision(routeLog).catch((err) => {
      console.error('[SceneRouter] logDecision failed:', err);
    });

    return response;
  }
}

// ─── 便捷工厂函数 ────────────────────────────────────────────────────────────

/**
 * 创建场景路由器（简化配置）
 */
export function createSceneRouter(
  scenes: SceneDefinition[],
  options?: {
    qdrant?: SceneRouterConfig['qdrant'];
    llmIntent?: SceneRouterConfig['llmIntent'];
    fallback?: Partial<FallbackConfig>;
    defaultSceneId?: string;
  }
): SceneRouter {
  return new SceneRouter({
    scenes,
    qdrant: options?.qdrant,
    llmIntent: options?.llmIntent,
    fallback: options?.fallback
      ? { ...DEFAULT_FALLBACK_CONFIG, ...options.fallback }
      : undefined,
    defaultSceneId: options?.defaultSceneId,
  });
}

// ─── 类型导出（用于外部扩展）───────────────────────────────────────────────

export type { TriggerMatchResult } from './hierarchical-scene-router.js';
export type { QdrantSearchResult } from './hybrid-match.js';
export type { LogEntryBuilder } from './routing-logger.js';
