/**
 * Routing Logger Service — P1-T55
 * PostgreSQL 持久化路由决策日志
 *
 * 使用方式：
 *   import { routingLogger } from './services/routing-logger.js';
 *   await routingLogger.logDecision({ executionId, inputQuery, matchedSceneId, confidence, layer, routingTimeMs });
 */

import { prisma } from '../index.js';

// ─── 类型定义 ─────────────────────────────────────────────────────────────

export interface RouteDecisionLog {
  executionId: string;
  inputQuery: string;
  matchedSceneId: string | null;
  confidence: number;
  layer: number;
  routingTimeMs: number;
}

// ─── RoutingLogger 类 ──────────────────────────────────────────────────────

/**
 * 路由决策日志写入器
 * 异步写入，不阻塞路由主流程
 */
export class RoutingLogger {
  /**
   * 写入单条路由决策日志
   */
  async logDecision(log: RouteDecisionLog): Promise<void> {
    // 异步写入，不 await（不阻塞路由主流程）
    this.writeLog(log).catch((err) => {
      console.error('[RoutingLogger] Failed to write routing log:', err);
    });
  }

  /**
   * 批量写入路由决策日志（可选，用于高吞吐场景）
   */
  async logDecisionBatch(logs: RouteDecisionLog[]): Promise<void> {
    if (logs.length === 0) return;

    prisma.routingLog
      .createMany({
        data: logs.map((log) => ({
          executionId: log.executionId,
          inputQuery: log.inputQuery,
          matchedSceneId: log.matchedSceneId,
          confidence: log.confidence,
          layer: log.layer,
          routingTimeMs: log.routingTimeMs,
        })),
      })
      .catch((err) => {
        console.error('[RoutingLogger] Batch write failed:', err);
      });
  }

  /**
   * 查询历史路由记录
   */
  async getLogs(options?: {
    limit?: number;
    offset?: number;
    matchedSceneId?: string;
    executionId?: string;
    fromDate?: Date;
    toDate?: Date;
  }): Promise<
    Array<{
      id: string;
      executionId: string | null;
      inputQuery: string;
      matchedSceneId: string | null;
      confidence: number;
      layer: number;
      routingTimeMs: number;
      createdAt: Date;
    }>
  > {
    const where: Record<string, unknown> = {};

    if (options?.matchedSceneId) {
      where.matchedSceneId = options.matchedSceneId;
    }
    if (options?.executionId) {
      where.executionId = options.executionId;
    }
    if (options?.fromDate || options?.toDate) {
      where.createdAt = {};
      if (options.fromDate) (where.createdAt as Record<string, Date>).gte = options.fromDate;
      if (options.toDate) (where.createdAt as Record<string, Date>).lte = options.toDate;
    }

    return prisma.routingLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options?.limit ?? 100,
      skip: options?.offset ?? 0,
    });
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private async writeLog(log: RouteDecisionLog): Promise<void> {
    await prisma.routingLog.create({
      data: {
        executionId: log.executionId,
        inputQuery: log.inputQuery,
        matchedSceneId: log.matchedSceneId,
        confidence: log.confidence,
        layer: log.layer,
        routingTimeMs: log.routingTimeMs,
      },
    });
  }
}

// ─── 单例导出 ─────────────────────────────────────────────────────────────

export const routingLogger = new RoutingLogger();
