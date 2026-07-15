/**
 * Quality Score API Route — P1-T33
 * tRPC router for quality scoring endpoint
 * GET /quality-score?agentId=xxx&output=yyy
 */

import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

export type { ScoreResult, ScoreParams } from '@agent-engine/core';

export const qualityRouter = t.router({
  /**
   * GET /quality-score
   * 传入 agentId + output，返回质量分 + 详细评语
   */
  getScore: t.procedure
    .input(
      z.object({
        agentId: z.string().optional(),
        output: z.string().min(1, 'output is required'),
        agentType: z.string().optional(),
        mode: z.enum(['strict', 'normal', 'lenient']).optional().default('normal'),
        threshold: z.number().min(0).max(100).optional().default(70),
      })
    )
    .query(async ({ input }) => {
      const { LLMJudge } = await import('@agent-engine/core');

      const scorer = new LLMJudge({ threshold: input.threshold });
      const result = await scorer.score({
        content: input.output,
        agentId: input.agentId,
        agentType: input.agentType,
        mode: input.mode,
      });

      return {
        score: result.score,
        passed: result.passed,
        threshold: result.threshold,
        dimensions: result.dimensions as Record<string, number>,
        deductions: result.deductions,
        bonuses: result.bonuses,
        comments: result.comments,
        durationMs: result.durationMs,
        method: result.method,
        agentId: input.agentId,
      };
    }),
});

export type QualityRouter = typeof qualityRouter;
