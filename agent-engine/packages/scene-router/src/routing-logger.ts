/**
 * Routing Logger — P1-T55
 * 路由决策日志，每次路由决策写入数据库
 */

import type {
  RoutingDecisionLog,
  RoutingResponse,
  RoutingContext,
  LayerScore,
  RoutingLoggerConfig,
  RouteDecisionLog,
} from './types.js';

// ─── In-Memory Logger（默认实现）────────────────────────────────────────────

/**
 * 内存日志存储（适用于测试或短期运行）
 */
export class InMemoryRoutingLogger {
  private logs: RoutingDecisionLog[] = [];

  async writeLog(log: RoutingDecisionLog): Promise<void> {
    this.logs.push(log);
  }

  async getLogs(limit: number = 100): Promise<RoutingDecisionLog[]> {
    return this.logs.slice(-limit);
  }

  async getLogsByQueryHash(queryHash: string): Promise<RoutingDecisionLog[]> {
    return this.logs.filter((log) => log.queryHash === queryHash);
  }

  async getLogsBySession(sessionId: string): Promise<RoutingDecisionLog[]> {
    return this.logs.filter((log) => log.context.sessionId === sessionId);
  }

  async clear(): Promise<void> {
    this.logs = [];
  }

  async size(): Promise<number> {
    return this.logs.length;
  }
}

// ─── Database Logger ────────────────────────────────────────────────────────

/**
 * 数据库日志写入器（需要 Prisma）
 * 使用方式：在 server 中注入 PrismaClient
 */
export class DatabaseRoutingLogger {
  private writeLogFn: (log: RoutingDecisionLog) => Promise<void>;

  constructor(
    writeLogFn: (log: RoutingDecisionLog) => Promise<void>
  ) {
    this.writeLogFn = writeLogFn;
  }

  async writeLog(log: RoutingDecisionLog): Promise<void> {
    await this.writeLogFn(log);
  }
}

// ─── Routing Decision Logger ────────────────────────────────────────────────

/**
 * 路由决策日志记录器
 * 封装日志的构建和写入
 */
export class RoutingDecisionLogger {
  private logger: RoutingLoggerInterface;
  private enabled: boolean;

  constructor(config: RoutingLoggerConfig) {
    this.enabled = config.enabled ?? true;
    this.logger = config.writeLog
      ? new DatabaseRoutingLogger(config.writeLog)
      : new InMemoryRoutingLogger();
  }

  /**
   * 构建并写入路由决策日志
   */
  async log(
    request: { query: string; context?: RoutingContext },
    response: RoutingResponse | null,
    processingTimeMs: number
  ): Promise<RoutingDecisionLog> {
    const log: RoutingDecisionLog = {
      id: response?.decisionId ?? generateLogId(),
      query: request.query,
      queryHash: hashString(request.query),
      sceneId: response?.sceneId ?? null,
      confidence: response?.confidence ?? 0,
      layer: response?.layer ?? 0,
      fallback: response?.fallback ?? true,
      reasoning: response?.reasoning ?? 'No response generated',
      clarificationSuggestion: response?.clarificationSuggestion,
      layerScores: response?.layerScores ?? [],
      context: request.context ?? {},
      processingTimeMs,
      createdAt: new Date(),
    };

    if (this.enabled) {
      await this.logger.writeLog(log);
    }

    return log;
  }

  /**
   * 查询最近的日志
   */
  async getRecentLogs(limit: number = 100): Promise<RoutingDecisionLog[]> {
    if (!this.enabled) return [];
    if (this.logger instanceof InMemoryRoutingLogger) {
      return this.logger.getLogs(limit);
    }
    return [];
  }

  /**
   * 按 query hash 查询日志
   */
  async getLogsByQuery(query: string): Promise<RoutingDecisionLog[]> {
    if (!this.enabled) return [];
    const hash = hashString(query);
    if (this.logger instanceof InMemoryRoutingLogger) {
      return this.logger.getLogsByQueryHash(hash);
    }
    return [];
  }

  /**
   * 按 sessionId 查询日志
   */
  async getLogsBySession(sessionId: string): Promise<RoutingDecisionLog[]> {
    if (!this.enabled) return [];
    if (this.logger instanceof InMemoryRoutingLogger) {
      return this.logger.getLogsBySession(sessionId);
    }
    return [];
  }

  /**
   * 写入路由日志（PostgreSQL routing_logs 表专用）
   * 异步写入，不阻塞路由主流程
   *
   * @param decision - 路由日志条目，包含 executionId、inputQuery、matchedSceneId、confidence、layer、routingTimeMs
   */
  async logDecision(decision: RouteDecisionLog): Promise<void> {
    if (!this.enabled) return;

    const fullLog: RoutingDecisionLog = {
      id: generateLogId(),
      query: decision.inputQuery,
      queryHash: hashString(decision.inputQuery),
      sceneId: decision.matchedSceneId,
      confidence: decision.confidence,
      layer: decision.layer as 0 | 1 | 2 | 3,
      fallback: decision.matchedSceneId === null,
      reasoning: `Logged via logDecision (layer ${decision.layer}, conf ${decision.confidence.toFixed(2)})`,
      clarificationSuggestion: undefined,
      layerScores: [],
      context: {},
      processingTimeMs: decision.routingTimeMs,
      createdAt: new Date(),
    };

    // 异步写入，不阻塞路由主流程
    this.logger.writeLog(fullLog).catch((err) => {
      console.error('[RoutingDecisionLogger] logDecision failed:', err);
    });
  }
}

// ─── 接口定义 ───────────────────────────────────────────────────────────────

interface RoutingLoggerInterface {
  writeLog(log: RoutingDecisionLog): Promise<void>;
}

// ─── 辅助函数 ───────────────────────────────────────────────────────────────

/**
 * 生成简单的日志 ID
 */
function generateLogId(): string {
  return `rlog_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 对字符串进行简单哈希（用于 query 检索）
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

// ─── Log Entry Builder（用于手动构建日志条目）──────────────────────────────

export interface LogEntryBuilder {
  query: string;
  context?: RoutingContext;
  response?: RoutingResponse | null;
  startTime?: number;
  endTime?: number;
}

export function buildLogEntry(builder: LogEntryBuilder): RoutingDecisionLog {
  const now = Date.now();
  const startTime = builder.startTime ?? now;
  const endTime = builder.endTime ?? now;
  const processingTimeMs = endTime - startTime;

  return {
    id: builder.response?.decisionId ?? generateLogId(),
    query: builder.query,
    queryHash: hashString(builder.query),
    sceneId: builder.response?.sceneId ?? null,
    confidence: builder.response?.confidence ?? 0,
    layer: builder.response?.layer ?? 0,
    fallback: builder.response?.fallback ?? true,
    reasoning: builder.response?.reasoning ?? 'No response generated',
    clarificationSuggestion: builder.response?.clarificationSuggestion,
    layerScores: builder.response?.layerScores ?? [],
    context: builder.context ?? {},
    processingTimeMs,
    createdAt: new Date(endTime),
  };
}
