/**
 * Router Fallback — 路由降级逻辑
 * P1-T54: confidence < 0.5 时返回 fallback=true，附带澄清建议
 */

import type {
  RoutingResponse,
  FallbackConfig,
  LayerScore,
  RoutingRequest,
  SceneDefinition,
} from './types.js';

// ─── Fallback Evaluator ──────────────────────────────────────────────────────

export interface FallbackEvaluation {
  shouldFallback: boolean;
  confidence: number;
  threshold: number;
  clarificationSuggestion?: string;
}

/**
 * 评估是否需要降级
 */
export function evaluateFallback(
  response: RoutingResponse | null,
  config: FallbackConfig
): FallbackEvaluation {
  // 无任何匹配结果时必须降级
  if (!response) {
    return {
      shouldFallback: true,
      confidence: 0,
      threshold: config.confidenceThreshold,
      clarificationSuggestion: buildClarificationSuggestion(
        'No matching scene found. ',
        config,
        []
      ),
    };
  }

  const { confidence } = response;

  // 置信度低于阈值时降级
  if (confidence < config.confidenceThreshold) {
    return {
      shouldFallback: true,
      confidence,
      threshold: config.confidenceThreshold,
      clarificationSuggestion: buildClarificationSuggestion(
        `Low confidence (${(confidence * 100).toFixed(0)}%). `,
        config,
        []
      ),
    };
  }

  return {
    shouldFallback: false,
    confidence,
    threshold: config.confidenceThreshold,
  };
}

/**
 * 构建澄清建议
 */
export function buildClarificationSuggestion(
  prefix: string,
  config: FallbackConfig,
  availableScenes: SceneDefinition[]
): string {
  if (config.clarificationTemplate) {
    return config.clarificationTemplate(
      prefix,
      availableScenes.map((s) => s.name)
    );
  }

  // 默认模板
  const sceneNames = availableScenes
    .slice(0, 3)
    .map((s) => `"${s.name}"`)
    .join(', ');

  return `${prefix}Could you please clarify your request? Available actions include: ${sceneNames}.`;
}

// ─── Fallback Response Builder ──────────────────────────────────────────────

export interface FallbackResponseOptions {
  request: RoutingRequest;
  fallbackConfig: FallbackConfig;
  defaultScene?: SceneDefinition;
  layerScores: LayerScore[];
  partialMatch?: RoutingResponse;  // 可能是 Layer 1/2 匹配但置信度不够
}

/**
 * 构建降级响应
 */
export function buildFallbackResponse(
  options: FallbackResponseOptions
): RoutingResponse {
  const { request, fallbackConfig, defaultScene, layerScores, partialMatch } =
    options;

  const clarificationSuggestion = buildClarificationSuggestion(
    partialMatch
      ? `Partial match found with confidence ${(partialMatch.confidence * 100).toFixed(0)}%, but it is below the threshold (${(fallbackConfig.confidenceThreshold * 100).toFixed(0)}%). `
      : 'No matching scene found. ',
    fallbackConfig,
    []
  );

  // 如果有默认场景，使用默认场景
  if (defaultScene) {
    return {
      sceneId: defaultScene.id,
      sceneName: defaultScene.name,
      confidence: 0,
      layer: 0,
      reasoning: partialMatch
        ? `Fallback: matched ${partialMatch.sceneName} but confidence too low`
        : `Fallback: no match, using default scene ${defaultScene.name}`,
      fallback: true,
      clarificationSuggestion,
      layerScores,
      decisionId: generateDecisionId(),
    };
  }

  // 没有默认场景时返回通用降级响应
  return {
    sceneId: 'fallback',
    sceneName: 'Fallback',
    confidence: 0,
    layer: 0,
    reasoning: 'No confident match found across all routing layers',
    fallback: true,
    clarificationSuggestion,
    layerScores,
    decisionId: generateDecisionId(),
  };
}

// ─── Multi-Layer Fallback Helper ────────────────────────────────────────────

export interface LayerAggregationResult {
  bestResponse: RoutingResponse | null;
  bestConfidence: number;
  matchedLayer: 0 | 1 | 2 | 3 | null;
  allScores: LayerScore[];
}

/**
 * 聚合多层路由结果，返回最佳匹配
 * 用于在进入 fallback 之前，确定最佳匹配
 */
export function aggregateLayerResults(
  responses: Map<number, RoutingResponse | null>,
  scores: LayerScore[]
): LayerAggregationResult {
  let bestResponse: RoutingResponse | null = null;
  let bestConfidence = 0;
  let matchedLayer: 0 | 1 | 2 | 3 | null = null;

  for (const [layer, response] of responses) {
    if (response && response.confidence > bestConfidence) {
      bestConfidence = response.confidence;
      bestResponse = response;
      matchedLayer = layer as 0 | 1 | 2 | 3;
    }
  }

  return {
    bestResponse,
    bestConfidence,
    matchedLayer,
    allScores: scores,
  };
}

// ─── Default Fallback Config ────────────────────────────────────────────────

export const DEFAULT_FALLBACK_CONFIG: FallbackConfig = {
  confidenceThreshold: 0.5,
  defaultSceneId: 'fallback',
  clarificationTemplate: (prefix, suggestions) => {
    if (suggestions.length > 0) {
      return `${prefix}Did you mean one of these: ${suggestions.join(', ')}?`;
    }
    return `${prefix}Please try rephrasing your request or provide more details.`;
  },
};

// ─── 辅助函数 ───────────────────────────────────────────────────────────────

function generateDecisionId(): string {
  return `rd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
