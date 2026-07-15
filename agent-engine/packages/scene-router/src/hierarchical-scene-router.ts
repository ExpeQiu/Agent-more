/**
 * Hierarchical Scene Router — Layer 0/1
 * P1-T50: 精确匹配 + 规则匹配
 *
 * Layer 0: 精确 sceneId 命中 → confidence = 1.0
 * Layer 1: 触发词匹配 → confidence = 0.9
 */

import type {
  SceneDefinition,
  SceneRule,
  RoutingRequest,
  RoutingResponse,
  LayerScore,
  RoutingContext,
} from './types.js';

// ─── Layer 0: 精确 Scene ID 匹配 ────────────────────────────────────────────

/**
 * Layer 0 - 精确 sceneId 匹配
 * 如果 query 本身就是一个有效的 sceneId，直接返回
 */
export function layer0ExactMatch(
  query: string,
  scenes: SceneDefinition[]
): { matched: boolean; scene?: SceneDefinition; score: LayerScore } {
  const normalizedQuery = query.trim().toLowerCase();
  const matchedScene = scenes.find(
    (s) =>
      s.enabled &&
      (s.id.toLowerCase() === normalizedQuery ||
        s.name.toLowerCase() === normalizedQuery)
  );

  const score: LayerScore = {
    layer: 0,
    layerName: 'exactMatch',
    score: matchedScene ? 1.0 : 0.0,
    matched: !!matchedScene,
    details: matchedScene
      ? `Matched sceneId: ${matchedScene.id}`
      : 'No exact sceneId match',
  };

  return { matched: !!matchedScene, scene: matchedScene, score };
}

// ─── Layer 1: 触发词 + 规则匹配 ────────────────────────────────────────────

/**
 * Layer 1 - 触发词匹配
 * 检查 query 是否命中某个场景的触发词
 */
export function layer1TriggerWordMatch(
  query: string,
  scenes: SceneDefinition[],
  context?: RoutingContext
): { matched: boolean; results: TriggerMatchResult[]; score: LayerScore } {
  const normalizedQuery = query.trim().toLowerCase();
  const results: TriggerMatchResult[] = [];

  for (const scene of scenes) {
    if (!scene.enabled) continue;

    // 检查触发词
    const triggerMatches = scene.triggerWords.filter((trigger) =>
      normalizedQuery.includes(trigger.toLowerCase())
    );

    // 检查规则
    const ruleMatches = evaluateRules(scene.rules, query, context);

    if (triggerMatches.length > 0 || ruleMatches.length > 0) {
      // 触发词命中 = 0.9，规则命中可叠加权重
      let confidence = 0.0;
      if (triggerMatches.length > 0) {
        confidence = 0.9;
      }
      // 规则匹配的额外权重
      const ruleWeight = ruleMatches.reduce((sum, r) => sum + (r.weight || 0), 0);
      confidence = Math.min(1.0, confidence + ruleWeight);

      results.push({
        scene,
        triggerMatches,
        ruleMatches,
        confidence,
        matchedRules: ruleMatches.map((r) => r.rule),
      });
    }
  }

  // 按置信度排序
  results.sort((a, b) => b.confidence - a.confidence);

  const topResult = results[0];
  const score: LayerScore = {
    layer: 1,
    layerName: 'triggerRuleMatch',
    score: topResult?.confidence ?? 0.0,
    matched: results.length > 0,
    details:
      results.length > 0
        ? `Matched scene: ${topResult.scene.id}, triggers: ${topResult.triggerMatches.join(', ')}, rules: ${topResult.matchedRules.length}`
        : 'No trigger/rule match',
  };

  return { matched: results.length > 0, results, score };
}

// ─── 触发词匹配结果 ─────────────────────────────────────────────────────────

export interface TriggerMatchResult {
  scene: SceneDefinition;
  triggerMatches: string[];
  ruleMatches: EvaluatedRule[];
  confidence: number;
  matchedRules: SceneRule[];
}

// ─── 规则评估 ──────────────────────────────────────────────────────────────

export interface EvaluatedRule {
  rule: SceneRule;
  matched: boolean;
  weight: number;
}

export function evaluateRules(
  rules: SceneRule[],
  query: string,
  context?: RoutingContext
): EvaluatedRule[] {
  if (!rules || rules.length === 0) return [];

  return rules.map((rule) => {
    const matched = evaluateSingleRule(rule, query, context);
    return {
      rule,
      matched,
      weight: matched ? rule.weight ?? 0.1 : 0,
    };
  });
}

function evaluateSingleRule(
  rule: SceneRule,
  query: string,
  context?: RoutingContext
): boolean {
  const { field, operator, value } = rule;

  // 根据 field 决定取值来源
  let fieldValue: string | number | string[] | undefined;
  if (field === 'query') {
    fieldValue = query;
  } else if (context?.metadata && field in context.metadata) {
    fieldValue = context.metadata[field] as string | number;
  } else if (context?.userType && field === 'userType') {
    fieldValue = context.userType;
  }

  if (fieldValue === undefined) return false;

  switch (operator) {
    case 'contains':
      return typeof fieldValue === 'string' && fieldValue.toLowerCase().includes(String(value).toLowerCase());

    case 'equals':
      return String(fieldValue).toLowerCase() === String(value).toLowerCase();

    case 'startsWith':
      return typeof fieldValue === 'string' && fieldValue.toLowerCase().startsWith(String(value).toLowerCase());

    case 'endsWith':
      return typeof fieldValue === 'string' && fieldValue.toLowerCase().endsWith(String(value).toLowerCase());

    case 'regex':
      if (value instanceof RegExp) return value.test(String(fieldValue));
      try {
        return new RegExp(String(value), 'i').test(String(fieldValue));
      } catch {
        return false;
      }

    case 'in':
      if (Array.isArray(value)) {
        const normalizedField = String(fieldValue).toLowerCase();
        return value.map((v) => String(v).toLowerCase()).includes(normalizedField);
      }
      return false;

    case 'gt':
      return typeof fieldValue === 'number' && fieldValue > Number(value);

    case 'lt':
      return typeof fieldValue === 'number' && fieldValue < Number(value);

    default:
      return false;
  }
}

// ─── 组合路由 ───────────────────────────────────────────────────────────────

/**
 * 执行 Layer 0/1 组合路由
 * 优先 Layer 0，失败则 Layer 1
 */
export function routeLayer0And1(
  request: RoutingRequest,
  scenes: SceneDefinition[]
): {
  response: RoutingResponse | null;
  layerScores: LayerScore[];
} {
  const { query, context } = request;
  const layerScores: LayerScore[] = [];

  // Layer 0: 精确匹配
  const layer0 = layer0ExactMatch(query, scenes);
  layerScores.push(layer0.score);

  if (layer0.matched && layer0.scene) {
    return {
      response: {
        sceneId: layer0.scene.id,
        sceneName: layer0.scene.name,
        confidence: 1.0,
        layer: 0,
        reasoning: `Exact sceneId match: ${layer0.scene.id}`,
        fallback: false,
        metadata: layer0.scene.metadata,
        layerScores,
        decisionId: generateDecisionId(),
      },
      layerScores,
    };
  }

  // Layer 1: 触发词 + 规则匹配
  const layer1 = layer1TriggerWordMatch(query, scenes, context);
  layerScores.push(layer1.score);

  if (layer1.matched && layer1.results.length > 0) {
    const top = layer1.results[0];
    return {
      response: {
        sceneId: top.scene.id,
        sceneName: top.scene.name,
        confidence: top.confidence,
        layer: 1,
        reasoning: buildLayer1Reasoning(top),
        fallback: false,
        metadata: top.scene.metadata,
        layerScores,
        decisionId: generateDecisionId(),
      },
      layerScores,
    };
  }

  return { response: null, layerScores };
}

// ─── 辅助函数 ───────────────────────────────────────────────────────────────

function buildLayer1Reasoning(result: TriggerMatchResult): string {
  const parts: string[] = [];
  if (result.triggerMatches.length > 0) {
    parts.push(`Trigger words matched: ${result.triggerMatches.join(', ')}`);
  }
  if (result.matchedRules.length > 0) {
    parts.push(`Rules matched: ${result.matchedRules.map((r) => `${r.field} ${r.operator} ${r.value}`).join('; ')}`);
  }
  return parts.join('; ') || `Matched scene: ${result.scene.id}`;
}

function generateDecisionId(): string {
  return `rd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
