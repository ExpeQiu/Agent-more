/**
 * Retry 节点实现
 * 支持 LLM 调用超时、速率限制、服务器错误的自动重试
 */

import type {
  RetryNodeConfig,
  NodeExecutionResult,
  NodeExecutionContext,
  RetryState,
  NodeStatus,
} from './types/cdag';
import { NodeType } from './types/cdag';

export interface RetryOptions {
  /** 最大重试次数，默认 3 */
  maxRetries?: number;
  /** 重试延迟（毫秒），默认 1000 */
  baseDelayMs?: number;
  /** 是否使用指数退避 */
  exponentialBackoff?: boolean;
  /** 最大退避延迟（毫秒），默认 30000 */
  maxDelayMs?: number;
  /** 可重试的错误类型关键词 */
  retryableErrorPatterns?: string[];
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelayMs: 1000,
  exponentialBackoff: true,
  maxDelayMs: 30000,
  retryableErrorPatterns: [
    'timeout',
    'ETIMEDOUT',
    'ECONNRESET',
    'rate limit',
    'rate_limit',
    '429',
    '503',
    '502',
    '504',
    'too many requests',
    'request limit',
    'ENOTFOUND',
    'ECONNREFUSED',
    'network error',
    'socket hang up',
  ],
};

export interface RetryDecision {
  shouldRetry: boolean;
  reason?: string;
  retryableError?: string;
}

/**
 * 判断错误是否可重试
 */
export function isRetryableError(
  error: string | Error | unknown,
  patterns: string[] = DEFAULT_OPTIONS.retryableErrorPatterns
): RetryDecision {
  const errorStr = error instanceof Error ? error.message : String(error);

  for (const pattern of patterns) {
    if (errorStr.toLowerCase().includes(pattern.toLowerCase())) {
      return {
        shouldRetry: true,
        reason: `匹配到可重试错误模式: "${pattern}"`,
        retryableError: pattern,
      };
    }
  }

  return {
    shouldRetry: false,
    reason: `未匹配到任何可重试错误模式`,
  };
}

/**
 * 计算重试延迟（支持指数退避 + 抖动）
 */
export function calculateRetryDelay(
  attemptIndex: number,
  baseDelayMs: number,
  exponentialBackoff: boolean,
  maxDelayMs: number
): number {
  let delay = baseDelayMs;

  if (exponentialBackoff) {
    delay = baseDelayMs * Math.pow(2, attemptIndex);
  }

  // 添加 jitter（±25%）
  const jitter = delay * 0.25 * (Math.random() * 2 - 1);
  delay = Math.floor(delay + jitter);

  return Math.min(delay, maxDelayMs);
}

/**
 * RetryNode 执行器
 * 封装子节点的执行，提供自动重试能力
 */
export class RetryNodeExecutor {
  private options: Required<RetryOptions>;

  constructor(options: RetryOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * 执行带重试的节点
   * @param config Retry 节点配置
   * @param childExecutor 执行子节点的函数
   * @param context 执行上下文
   */
  async execute(
    config: RetryNodeConfig,
    childExecutor: (nodeId: string) => Promise<NodeExecutionResult>,
    context: NodeExecutionContext
  ): Promise<NodeExecutionResult> {
    const maxRetries = config.maxRetries ?? this.options.maxRetries;
    const startTime = Date.now();

    let state: RetryState = {
      attemptCount: 0,
      maxRetries,
      retryHistory: [],
    };

    let lastResult: NodeExecutionResult | null = null;

    context.logger.info(`[RetryNode] 开始执行子节点 ${config.childNodeId}，最大重试 ${maxRetries} 次`);

    while (state.attemptCount <= maxRetries) {
      state.attemptCount++;
      context.logger.info(
        `[RetryNode] 第 ${state.attemptCount}/${maxRetries + 1} 次尝试执行子节点 ${config.childNodeId}`
      );

      try {
        const result = await this.executeWithTimeout(
          () => childExecutor(config.childNodeId),
          config.timeout ?? 300000, // 5 分钟默认超时
          context
        );

        lastResult = result;

        // 检查结果是否成功
        if (result.status === NodeStatus.COMPLETED) {
          context.logger.info(
            `[RetryNode] 子节点 ${config.childNodeId} 执行成功（第 ${state.attemptCount} 次）`
          );

          return {
            nodeId: config.id,
            nodeType: NodeType.RETRY,
            status: NodeStatus.COMPLETED,
            output: result.output,
            startTime,
            endTime: Date.now(),
            duration: Date.now() - startTime,
            retryCount: state.attemptCount - 1,
            logs: [],
          };
        }

        // 执行失败但不是错误（如条件分支跳过），不重试
        if (result.status === NodeStatus.SKIPPED) {
          context.logger.warn(`[RetryNode] 子节点 ${config.childNodeId} 跳过，不重试`);
          return {
            nodeId: config.id,
            nodeType: NodeType.RETRY,
            status: NodeStatus.SKIPPED,
            output: result.output,
            startTime,
            endTime: Date.now(),
            duration: Date.now() - startTime,
            retryCount: state.attemptCount - 1,
            logs: [],
          };
        }

        // 明确失败，检查是否可重试
        const errorStr = result.error ?? `节点执行失败: ${JSON.stringify(result.output)}`;
        const retryDecision = isRetryableError(errorStr, this.options.retryableErrorPatterns);

        if (!retryDecision.shouldRetry) {
          context.logger.warn(
            `[RetryNode] 错误不可重试: ${errorStr}，终止重试`
          );
          return {
            nodeId: config.id,
            nodeType: NodeType.RETRY,
            status: NodeStatus.FAILED,
            error: `重试耗尽，最后错误: ${errorStr}`,
            startTime,
            endTime: Date.now(),
            duration: Date.now() - startTime,
            retryCount: state.attemptCount - 1,
            logs: [],
          };
        }

        context.logger.warn(
          `[RetryNode] 检测到可重试错误: ${errorStr}，准备第 ${state.attemptCount + 1} 次重试`
        );
        state.retryHistory.push({
          attempt: state.attemptCount,
          error: errorStr,
          timestamp: Date.now(),
        });
        state.lastError = errorStr;

      } catch (err) {
        // 执行器本身抛出的异常（如超时）
        const errorStr = err instanceof Error ? err.message : String(err);
        const retryDecision = isRetryableError(errorStr, this.options.retryableErrorPatterns);

        context.logger.error(`[RetryNode] 执行异常: ${errorStr}`);

        if (!retryDecision.shouldRetry) {
          return {
            nodeId: config.id,
            nodeType: NodeType.RETRY,
            status: NodeStatus.FAILED,
            error: `重试耗尽（异常）: ${errorStr}`,
            startTime,
            endTime: Date.now(),
            duration: Date.now() - startTime,
            retryCount: state.attemptCount - 1,
            logs: [],
          };
        }

        state.retryHistory.push({
          attempt: state.attemptCount,
          error: errorStr,
          timestamp: Date.now(),
        });
        state.lastError = errorStr;
      }

      // 不是最后一次尝试，等待后重试
      if (state.attemptCount <= maxRetries) {
        const delay = calculateRetryDelay(
          state.attemptCount - 1,
          this.options.baseDelayMs,
          this.options.exponentialBackoff,
          this.options.maxDelayMs
        );
        context.logger.info(`[RetryNode] 等待 ${delay}ms 后重试...`);
        await this.sleep(delay);
      }
    }

    // 重试耗尽
    context.logger.error(
      `[RetryNode] 重试耗尽，共尝试 ${state.attemptCount} 次，最后错误: ${state.lastError}`
    );

    return {
      nodeId: config.id,
      nodeType: NodeType.RETRY,
      status: NodeStatus.FAILED,
      error: `重试耗尽 (${state.attemptCount - 1} 次重试)，最后错误: ${state.lastError}`,
      startTime,
      endTime: Date.now(),
      duration: Date.now() - startTime,
      retryCount: state.attemptCount - 1,
      logs: [],
    };
  }

  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    context: NodeExecutionContext
  ): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout>;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`执行超时 (${timeoutMs}ms)`));
      }, timeoutMs);
    });

    try {
      return await Promise.race([fn(), timeoutPromise]);
    } finally {
      clearTimeout(timeoutId!);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
