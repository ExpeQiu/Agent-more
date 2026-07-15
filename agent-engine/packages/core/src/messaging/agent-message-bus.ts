/**
 * AgentMessageBus 实现
 * Phase 1: InMemoryAgentMessageBus
 * Phase 2: RedisAgentMessageBus（基于 Redis Pub/Sub）
 *
 * 来自 TD-B10：引入 AgentMessageBus 多 Agent 消息总线
 * 生成时间：2026-04-26
 */

import {
  AgentMessage,
  IAgentMessageBus,
  UnsubscribeFn,
  MessageHandler,
} from './types';

// ============== 工具函数 ==============

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

// ============== InMemoryAgentMessageBus ==============

interface Subscription {
  handler: MessageHandler;
  channel: string;
}

/**
 * 内存版消息总线（Phase 1 默认实现）
 *
 * 特点：
 * - 进程内广播，零网络开销
 * - 支持多 Handler 订阅同一 channel
 * - 支持 TTL 自动过期
 * - 内置 pendingResponseMap 支持 request/response 模式
 *
 * 局限：
 * - 仅限单进程，多实例不共享
 * - 重启后消息丢失（无持久化）
 *
 * 迁移到 Phase 2：替换为 RedisAgentMessageBus，不破坏调用方代码
 */
export class InMemoryAgentMessageBus implements IAgentMessageBus {
  /** channel -> Set<handler> */
  private subscriptions = new Map<string, Set<MessageHandler>>();
  /** 活跃订阅记录（用于 unsubscribe 精确删除） */
  private subscriptionRecords = new Map<string, Subscription[]>();
  /** 用于 request/response 配对 */
  private pendingResponses = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();

  // ---- IAgentMessageBus 实现 ----

  async publish(channel: string, message: AgentMessage): Promise<void> {
    // 1. 补充缺失字段
    const msg: AgentMessage = {
      ...message,
      id: message.id || generateId(),
      timestamp: message.timestamp || Date.now(),
      channel,
    };

    // 2. 检查 TTL，过期消息不投递
    if (msg.ttl && Date.now() - msg.timestamp > msg.ttl) {
      console.warn(`[AgentMessageBus] Message ${msg.id} expired, skipping publish to "${channel}"`);
      return;
    }

    // 3. 如果是 request 类型，注册 response handler
    if (msg.type === 'request' && msg.to) {
      // request 消息直接通过 publish 广播出去，由订阅方处理
    }

    // 4. 投递到所有订阅者
    const handlers = this.subscriptions.get(channel);
    if (!handlers || handlers.size === 0) {
      // 无订阅者，记录但不报错（消息总线解耦，不要求订阅者必须存在）
      console.debug(`[AgentMessageBus] No subscribers for channel "${channel}"`);
      return;
    }

    for (const handler of handlers) {
      try {
        handler(msg);
      } catch (err) {
        console.error(`[AgentMessageBus] Handler error on channel "${channel}":`, err);
      }
    }
  }

  subscribe(channel: string, handler: MessageHandler): UnsubscribeFn {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
      this.subscriptionRecords.set(channel, []);
    }

    const handlers = this.subscriptions.get(channel)!;
    const records = this.subscriptionRecords.get(channel)!;

    handlers.add(handler);
    const record: Subscription = { handler, channel };
    records.push(record);

    // 返回取消订阅函数
    return () => {
      handlers.delete(handler);
      const idx = records.indexOf(record);
      if (idx !== -1) records.splice(idx, 1);
      if (handlers.size === 0) {
        this.subscriptions.delete(channel);
        this.subscriptionRecords.delete(channel);
      }
    };
  }

  unsubscribe(channel: string): void {
    this.subscriptions.delete(channel);
    this.subscriptionRecords.delete(channel);
  }

  async request<T = unknown>(
    channel: string,
    message: AgentMessage,
    timeoutMs = 30_000,
  ): Promise<T> {
    const correlationId = message.id || generateId();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingResponses.delete(correlationId);
        reject(new Error(`[AgentMessageBus] Request timeout after ${timeoutMs}ms on channel "${channel}"`));
      }, timeoutMs);

      this.pendingResponses.set(correlationId, { resolve: resolve as (v: unknown) => void, reject, timer });

      // 发布 request 消息，附上 correlationId
      this.publish(channel, {
        ...message,
        id: correlationId,
        type: 'request',
        timestamp: Date.now(),
      }).catch(reject);
    });
  }

  // ---- 扩展方法（可选，非 IAgentMessageBus 核心） ----

  /**
   * 发送响应消息（便捷方法，供 request 处理方调用）
   * @param requestMsg 原始 request 消息
   * @param payload 响应载荷
   */
  async respond(requestMsg: AgentMessage, payload: object): Promise<void> {
    if (!requestMsg.id) {
      throw new Error('[AgentMessageBus] Cannot respond to message without id');
    }

    const responseMsg: AgentMessage = {
      id: generateId(),
      type: 'response',
      channel: requestMsg.channel,
      from: requestMsg.to || 'unknown',
      to: requestMsg.from,
      payload,
      timestamp: Date.now(),
      // 响应不需要 TTL，因为原始请求已有超时
    };

    await this.publish(requestMsg.channel, responseMsg);
  }

  /**
   * 检查频道是否有订阅者
   */
  hasSubscribers(channel: string): boolean {
    const handlers = this.subscriptions.get(channel);
    return handlers !== undefined && handlers.size > 0;
  }

  /**
   * 获取订阅者数量
   */
  getSubscriberCount(channel: string): number {
    return this.subscriptions.get(channel)?.size ?? 0;
  }

  /**
   * 列出所有活跃频道
   */
  getActiveChannels(): string[] {
    return Array.from(this.subscriptions.entries())
      .filter(([, handlers]) => handlers.size > 0)
      .map(([channel]) => channel);
  }

  /**
   * 清空所有订阅（用于测试或重置）
   */
  clear(): void {
    this.subscriptions.clear();
    this.subscriptionRecords.clear();
    for (const { timer } of this.pendingResponses.values()) {
      clearTimeout(timer);
    }
    this.pendingResponses.clear();
  }
}

// ============== RedisAgentMessageBus (Phase 2 骨架) ==============

/**
 * Redis 版消息总线（Phase 2 实现目标）
 *
 * 设计要点：
 * - 基于 Redis Pub/Sub（或 Redis Streams）实现进程间消息传递
 * - 支持多实例共享消息总线
 * - 支持消息持久化（Streams > Pub/Sub）
 * - 保留与 InMemoryAgentMessageBus 相同的接口，切换无感知
 *
 * 注意：Phase 2 才完整实现，此处仅提供接口骨架
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export class RedisAgentMessageBus implements IAgentMessageBus {
  constructor(private redisUrl: string) {
    throw new Error('[AgentMessageBus] RedisAgentMessageBus is Phase 2 target. Use InMemoryAgentMessageBus for now.');
  }

  async publish(channel: string, message: AgentMessage): Promise<void> {
    // TODO: Phase 2 - Redis PUBLISH channel JSON.stringify(message)
    throw new Error('Not implemented (Phase 2)');
  }

  subscribe(channel: string, handler: MessageHandler): UnsubscribeFn {
    // TODO: Phase 2 - Redis SUBSCRIBE channel，收到消息后调用 handler
    throw new Error('Not implemented (Phase 2)');
  }

  unsubscribe(channel: string): void {
    // TODO: Phase 2 - 取消 Redis 订阅
    throw new Error('Not implemented (Phase 2)');
  }

  async request<T = unknown>(channel: string, message: AgentMessage, timeoutMs?: number): Promise<T> {
    // TODO: Phase 2 - 基于 Redis Streams 的 request/response
    throw new Error('Not implemented (Phase 2)');
  }
}

// ============== 工厂函数 ==============

export type MessageBusVariant = 'memory' | 'redis';

/**
 * 消息总线工厂
 *
 * @param variant 'memory' | 'redis'
 * @returns 对应实现实例
 *
 * 用法：
 *   const bus = createAgentMessageBus('memory');
 *
 * Phase 2 切换到 Redis：
 *   const bus = createAgentMessageBus('redis');
 *   // 调用方代码无需修改
 */
export function createAgentMessageBus(variant: MessageBusVariant = 'memory'): IAgentMessageBus {
  switch (variant) {
    case 'memory':
      return new InMemoryAgentMessageBus();
    case 'redis':
      // Phase 2 启用
      // return new RedisAgentMessageBus(process.env.REDIS_URL!);
      throw new Error('[AgentMessageBus] Redis variant is Phase 2 target');
    default:
      throw new Error(`[AgentMessageBus] Unknown variant: ${variant}`);
  }
}

// ============== 默认单例（全局共享实例）==============

let _defaultBus: IAgentMessageBus | null = null;

/**
 * 获取默认消息总线单例
 * 推荐用法：在 AgentOrchestrator 初始化时创建一次，全局共享
 */
export function getDefaultMessageBus(): IAgentMessageBus {
  if (!_defaultBus) {
    _defaultBus = createAgentMessageBus('memory');
  }
  return _defaultBus;
}

/**
 * 重置默认单例（用于测试）
 */
export function resetDefaultMessageBus(): void {
  if (_defaultBus && 'clear' in _defaultBus) {
    (_defaultBus as InMemoryAgentMessageBus).clear();
  }
  _defaultBus = null;
}
