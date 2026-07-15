/**
 * LLM Intent Router — Layer 3
 * P1-T52: LLM Few-shot 意图分类
 *
 * 使用 gpt-4o-mini 判断，confidence 上限 0.85，包含 reasoning 字段
 */

import type {
  SceneDefinition,
  RoutingRequest,
  RoutingResponse,
  LayerScore,
  LLMIntentRouterConfig,
  FewShotExample,
  ChatMessage,
} from './types.js';

// ─── LLM Adapter Interface ──────────────────────────────────────────────────

/**
 * LLM Provider 接口（与 @agent-engine/llm-adapters 保持一致）
 */
export interface LLMAdapter {
  complete(options: {
    messages: ChatMessage[];
    model?: string;
    temperature?: number;
    maxTokens?: number;
    tools?: unknown[];
  }): Promise<LLMResponse>;
}

export interface LLMResponse {
  content: string;
  role?: string;
  finishReason?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  raw?: unknown;
}

// ─── OpenAI Adapter（内联实现，避免循环依赖）────────────────────────────────

export class InlineOpenAIAdapter implements LLMAdapter {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private timeout: number;

  constructor(config: LLMIntentRouterConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.apiBaseUrl ?? 'https://api.openai.com/v1';
    this.model = config.model;
    this.timeout = 60000;
  }

  async complete(options: {
    messages: ChatMessage[];
    model?: string;
    temperature?: number;
    maxTokens?: number;
    tools?: unknown[];
  }): Promise<LLMResponse> {
    const body: Record<string, unknown> = {
      model: options.model ?? this.model,
      messages: options.messages,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 1024,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (globalThis as any).fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      signal: (globalThis as any).AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${error}`);
    }

    const data = await response.json() as {
      choices: Array<{ message: { role: string; content: string }; finish_reason: string }>;
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };

    const choice = data.choices[0];
    return {
      content: choice.message.content ?? '',
      role: choice.message.role,
      finishReason: choice.finish_reason,
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      },
      raw: data,
    };
  }
}

// ─── LLM Intent Router ──────────────────────────────────────────────────────

export interface LLMIntentRouterResult {
  response: RoutingResponse | null;
  score: LayerScore;
}

/**
 * Layer 3 LLM Few-shot Intent Router
 *
 * 工作流程：
 * 1. 构建 Few-shot prompt（包含正负示例）
 * 2. 调用 LLM 判断用户 query 最可能匹配的 scene
 * 3. 解析 LLM 返回的 JSON 结果
 * 4. 置信度上限 0.85（任务要求）
 */
export class LLMIntentRouter {
  private config: LLMIntentRouterConfig;
  private adapter: LLMAdapter;
  private confidenceCeiling: number;
  private scenes: SceneDefinition[];

  constructor(
    config: LLMIntentRouterConfig,
    scenes: SceneDefinition[],
    adapter?: LLMAdapter
  ) {
    this.config = config;
    this.confidenceCeiling = config.confidenceCeiling ?? 0.85;
    this.scenes = scenes;
    this.adapter = adapter ?? new InlineOpenAIAdapter(config);
  }

  /**
   * 执行 Layer 3 LLM 意图分类
   */
  async route(
    request: RoutingRequest,
    previousScores: LayerScore[] = []
  ): Promise<LLMIntentRouterResult> {
    const { query } = request;

    // 构建 few-shot prompt
    const messages = this.buildFewShotPrompt(query);

    try {
      const llmResponse = await this.adapter.complete({
        messages,
        temperature: 0.3,
        maxTokens: 512,
      });

      const parsed = this.parseLLMResponse(llmResponse.content);

      if (!parsed) {
        return {
          response: null,
          score: {
            layer: 3,
            layerName: 'llmIntent',
            score: 0,
            matched: false,
            details: 'Failed to parse LLM response',
          },
        };
      }

      const matchedScene = this.scenes.find((s) => s.id === parsed.sceneId);
      if (!matchedScene) {
        return {
          response: null,
          score: {
            layer: 3,
            layerName: 'llmIntent',
            score: 0,
            matched: false,
            details: `Scene not found: ${parsed.sceneId}`,
          },
        };
      }

      // 置信度上限 0.85
      const confidence = Math.min(parsed.confidence, this.confidenceCeiling);

      const score: LayerScore = {
        layer: 3,
        layerName: 'llmIntent',
        score: confidence,
        matched: true,
        details: `LLM classified: ${matchedScene.name}, confidence: ${confidence.toFixed(2)}`,
      };

      return {
        response: {
          sceneId: matchedScene.id,
          sceneName: matchedScene.name,
          confidence,
          layer: 3,
          reasoning: parsed.reasoning,
          fallback: false,
          metadata: matchedScene.metadata,
          layerScores: [...previousScores, score],
          decisionId: generateDecisionId(),
        },
        score,
      };
    } catch (err) {
      console.error('[LLMIntentRouter] LLM call failed:', err);
      return {
        response: null,
        score: {
          layer: 3,
          layerName: 'llmIntent',
          score: 0,
          matched: false,
          details: `LLM error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        },
      };
    }
  }

  /**
   * 构建 Few-shot Prompt
   */
  private buildFewShotPrompt(query: string): ChatMessage[] {
    const systemPrompt = this.buildSystemPrompt();
    const userMessage: ChatMessage = {
      role: 'user',
      content: `User query: "${query}"\n\nBased on the scene definitions and examples above, classify this query.`,
    };

    return [
      { role: 'system', content: systemPrompt },
      userMessage,
    ];
  }

  /**
   * 构建 System Prompt
   */
  private buildSystemPrompt(): string {
    const sceneDescriptions = this.scenes
      .filter((s) => s.enabled)
      .map((s) => {
        const examples = this.buildFewShotExamples(s);
        return `## Scene: ${s.name} (ID: ${s.id})
Description: ${s.description}
${examples}`;
      })
      .join('\n\n');

    return `You are a scene classification assistant. Your task is to classify user queries into the most appropriate scene.

## Available Scenes
${sceneDescriptions}

## Output Format
You MUST respond with a valid JSON object (no other text):
{
  "sceneId": "the_matched_scene_id",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation of why this scene matches"
}

## Rules
1. Only output valid JSON
2. Confidence must be between 0.0 and 1.0
3. Choose the scene that best matches the user's intent
4. If no scene is a good match, return confidence: 0.0 with a null sceneId
5. The maximum confidence is 0.85 (due to uncertainty inherent in LLM classification)`;
  }

  /**
   * 为每个场景构建 few-shot 示例
   */
  private buildFewShotExamples(scene: SceneDefinition): string {
    if (!scene.fewShotExamples || scene.fewShotExamples.length === 0) {
      return '';
    }

    const examples = scene.fewShotExamples
      .filter((ex) => ex.label === 'positive')
      .map((ex) => `  - "${ex.query}"`)
      .join('\n');

    if (!examples) return '';

    return `Positive examples:\n${examples}`;
  }

  /**
   * 解析 LLM 返回的 JSON
   */
  private parseLLMResponse(content: string): LLMParseResult | null {
    try {
      // 尝试提取 JSON（可能在 markdown 代码块中）
      let jsonStr = content.trim();

      // 移除 markdown 代码块
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      // 尝试找到 JSON 对象
      const objMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (!objMatch) return null;

      const parsed = JSON.parse(objMatch[0]);

      return {
        sceneId: parsed.sceneId ?? null,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
        reasoning: parsed.reasoning ?? '',
      };
    } catch {
      return null;
    }
  }
}

interface LLMParseResult {
  sceneId: string | null;
  confidence: number;
  reasoning: string;
}

// ─── 辅助函数 ───────────────────────────────────────────────────────────────

function generateDecisionId(): string {
  return `rd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
