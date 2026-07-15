// tRPC Server Router — P1-T64
// Shared tRPC router definitions for type-safe communication

import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

// ─── Scene Router ────────────────────────────────────────────────────────────

export const sceneRouter = router({
  list: publicProcedure.query(async () => {
    // Will be implemented with Prisma in backend
    return [];
  }),

  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return null;
    }),

  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string(),
        triggerWords: z.array(z.string()),
        rules: z.array(
          z.object({
            field: z.string(),
            operator: z.enum(['contains', 'equals', 'startsWith', 'endsWith', 'regex', 'in', 'gt', 'lt']),
            value: z.union([z.string(), z.array(z.string()), z.number()]),
            weight: z.number().optional(),
          })
        ),
        priority: z.number().optional(),
        enabled: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return { id: `scene_${Date.now()}`, ...input };
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        triggerWords: z.array(z.string()).optional(),
        rules: z.array(
          z.object({
            field: z.string(),
            operator: z.enum(['contains', 'equals', 'startsWith', 'endsWith', 'regex', 'in', 'gt', 'lt']),
            value: z.union([z.string(), z.array(z.string()), z.number()]),
            weight: z.number().optional(),
          })
        ).optional(),
        priority: z.number().optional(),
        enabled: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return { success: true, id: input.id };
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      return { success: true, id: input.id };
    }),
});

// ─── Execution Router ────────────────────────────────────────────────────────

export const executionRouter = router({
  // SSE stream endpoint for real-time execution
  execute: publicProcedure
    .input(
      z.object({
        task: z.string().min(1),
        sceneId: z.string().optional(),
        context: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      // Returns executionId immediately, SSE client should connect to /api/executions/:id/stream
      return { executionId: `exec_${Date.now()}` };
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return null;
    }),

  list: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      }).optional()
    )
    .query(async () => {
      return { items: [], total: 0 };
    }),
});

// ─── Health Router ────────────────────────────────────────────────────────────

export const healthRouter = router({
  check: publicProcedure.query(async () => {
    return { ok: true, redis: true, database: true };
  }),
});

// ─── App Router ──────────────────────────────────────────────────────────────

export const appRouter = router({
  scene: sceneRouter,
  execution: executionRouter,
  health: healthRouter,
});

export type AppRouter = typeof appRouter;
