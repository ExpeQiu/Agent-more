/**
 * Quality Score API Routes (P1-T33)
 * tRPC router for quality scoring endpoints
 *
 * Endpoints:
 *   GET  /quality-score  - 对任意内容进行质量评分
 *   POST /quality-score/batch - 批量评分
 */

import { z } from 'zod';
import type { LLMJudge, ScoreResult } from '../cdag/quality-scorer';
import { LLMJudge } from '../cdag/quality-scorer';
import type { ILLMProvider } from '../types/llm';

// ─── Input Schema ────────────────────────────────────────────────────────────

export const QualityScoreInputSchema = z.object({
  /** 待评分内容 */
  content: z.string().min(1, '内容不能为空'),
  /** Agent ID（可选，用于针对性评分） */
  agentId: z.string().optional(),
  /** Agent 类型（可选） */
  agentType: z.string().optional(),
  /** 评分模式 */
  mode: z.enum(['strict', 'normal', 'lenient']).optional().default('normal'),
  /** 质量阈值（默认 70） */
  threshold: z.number().min(0).max(100).optional().default(70),
});

export const BatchQualityScoreInputSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        content: z.string().min(1),
        agentId: z.string().optional(),
        agentType: z.string().optional(),
      })
    )
    .min(1)
    .max(20),
  mode: z.enum(['strict', 'normal', 'lenient']).optional().default('normal'),
  threshold: z.number().min(0).max(100).optional().default(70),
});

export type QualityScoreInput = z.infer<typeof QualityScoreInputSchema>;
export type BatchQualityScoreInput = z.infer<typeof BatchQualityScoreInputSchema>;

// ─── Output Types ─────────────────────────────────────────────────────────────

export interface QualityScoreOutput {
  score: number;
  passed: boolean;
  threshold: number;
  dimensions: ScoreResult['dimensions'];
  deductions: ScoreResult['deductions'];
  bonuses: ScoreResult['bonuses'];
  comments: string[];
  durationMs: number;
  method: 'llm' | 'heuristic';
}

export interface BatchQualityScoreOutput {
  results: Array<{
    id: string;
    score: number;
    passed: boolean;
    threshold: number;
    durationMs: number;
    error?: string;
  }>;
  total: number;
  passedCount: number;
}

// ─── Quality Router ───────────────────────────────────────────────────────────

export interface QualityRouterDeps {
  /** LLM Provider（不传则使用启发式评分） */
  llmProvider?: ILLMProvider;
  /** 评分模型（默认 gpt-4o-mini） */
  model?: string;
  /** 默认阈值 */
  defaultThreshold?: number;
}

/**
 * 创建质量评分 tRPC Router
 *
 * @example
 * ```ts
 * import { createQualityRouter } from '@agent-engine/core/routes/quality';
 *
 * const appRouter = t.router({
 *   quality: createQualityRouter({ llmProvider, model: 'gpt-4o-mini' }),
 * });
 * ```
 */
export function createQualityRouter(deps: QualityRouterDeps = {}) {
  const { llmProvider, model = 'gpt-4o-mini', defaultThreshold = 70 } = deps;

  const judge = llmProvider
    ? new LLMJudge({ model, threshold: defaultThreshold })
    : new LLMJudge({ model, threshold: defaultThreshold });

  return {
    /**
     * GET /quality-score
     * 对单条内容进行质量评分
     */
    getScore: async (input: QualityScoreInput): Promise<QualityScoreOutput> => {
      const validated = QualityScoreInputSchema.parse(input);
      const threshold = validated.threshold ?? defaultThreshold;

      const judgeInstance = new LLMJudge({ model, threshold });

      const result = await judgeInstance.score({
        content: validated.content,
        agentId: validated.agentId,
        agentType: validated.agentType,
        mode: validated.mode,
        llmProvider,
      });

      return {
        score: result.score,
        passed: result.passed,
        threshold: result.threshold,
        dimensions: result.dimensions,
        deductions: result.deductions,
        bonuses: result.bonuses,
        comments: result.comments,
        durationMs: result.durationMs,
        method: result.method,
      };
    },

    /**
     * POST /quality-score/batch
     * 批量评分（最多 20 条）
     */
    batchScore: async (
      input: BatchQualityScoreInput
    ): Promise<BatchQualityScoreOutput> => {
      const validated = BatchQualityScoreInputSchema.parse(input);
      const threshold = validated.threshold ?? defaultThreshold;

      const results = await Promise.all(
        validated.items.map(async (item) => {
          const start = Date.now();
          try {
            const judgeInstance = new LLMJudge({ model, threshold });
            const result = await judgeInstance.score({
              content: item.content,
              agentId: item.agentId,
              agentType: item.agentType,
              mode: validated.mode,
              llmProvider,
            });
            return {
              id: item.id,
              score: result.score,
              passed: result.passed,
              threshold: result.threshold,
              durationMs: Date.now() - start,
            };
          } catch (err) {
            return {
              id: item.id,
              score: 0,
              passed: false,
              threshold,
              durationMs: Date.now() - start,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        })
      );

      return {
        results,
        total: results.length,
        passedCount: results.filter((r) => r.passed).length,
      };
    },
  };
}

// ─── 独立 HTTP Handler（无 tRPC 时的快速集成） ─────────────────────────────────

export interface QualityHttpHandlerConfig extends QualityRouterDeps {
  /** 认证密钥（可选） */
  apiKey?: string;
}

/**
 * 创建独立 HTTP Handler
 * 可直接挂载到 Express/Fastify 等框架
 *
 * @example
 * ```ts
 * import express from 'express';
 * import { createQualityHttpHandler } from '@agent-engine/core/routes/quality';
 *
 * const app = express();
 * app.use('/api', createQualityHttpHandler({ llmProvider }));
 * ```
 */
export function createQualityHttpHandler(config: QualityHttpHandlerConfig = {}) {
  const router = createQualityRouter(config);

  return async (req: any, res: any): Promise<void> => {
    // 认证检查
    if (config.apiKey && req.headers['x-api-key'] !== config.apiKey) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { method, path } = req;
    const url = new URL(path || req.url, 'http://localhost');

    try {
      // GET /quality-score
      if (method === 'GET' && url.pathname === '/quality-score') {
        const content = url.searchParams.get('content');
        if (!content) {
          res.status(400).json({ error: 'Missing required query param: content' });
          return;
        }

        const input: QualityScoreInput = {
          content,
          agentId: url.searchParams.get('agentId') ?? undefined,
          agentType: url.searchParams.get('agentType') ?? undefined,
          mode: (url.searchParams.get('mode') as any) ?? 'normal',
          threshold: url.searchParams.get('threshold')
            ? Number(url.searchParams.get('threshold'))
            : 70,
        };

        const result = await router.getScore(input);
        res.status(200).json(result);
        return;
      }

      // POST /quality-score/batch
      if (method === 'POST' && url.pathname === '/quality-score/batch') {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const result = await router.batchScore(body);
        res.status(200).json(result);
        return;
      }

      // 404
      res.status(404).json({ error: `Route ${method} ${url.pathname} not found` });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', details: err.errors });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: 'Internal server error', message });
    }
  };
}
