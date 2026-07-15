/**
 * AgentMessageBus 类型定义
 * 来自 TD-B10：引入 AgentMessageBus 多 Agent 消息总线
 * 生成时间：2026-04-26
 */

export interface AgentMessage {
  /** 全局唯一消息 ID */
  id: string;
  /** 消息类型 */
  type: 'request' | 'response' | 'broadcast';
  /** 频道名称，如 "tech-question"、"scene-analysis" */
  channel: string;
  /** 发送方 Agent ID */
  from: string;
  /** 可选，指定接收方 Agent ID；undefined = 广播 */
  to?: string;
  /** 消息载荷 */
  payload: object;
  /** Unix 时间戳（ms） */
  timestamp: number;
  /** 可选，消息过期时间（ms），默认永不过期 */
  ttl?: number;
}

/** 订阅者句柄，用于取消订阅 */
export type UnsubscribeFn = () => void;

/**
 * 消息总线接口
 * 支持内存实现（Phase 1）和 Redis 实现（Phase 2）
 */
export interface IAgentMessageBus {
  /**
   * 发布消息到指定频道
   * @param channel 频道名
   * @param message 消息体（不含 channel，channel 单独传）
   */
  publish(channel: string, message: AgentMessage): Promise<void>;

  /**
   * 订阅指定频道
   * @param channel 频道名
   * @param handler 消息处理函数
   * @returns 取消订阅函数
   */
  subscribe(channel: string, handler: (msg: AgentMessage) => void): UnsubscribeFn;

  /**
   * 取消订阅（别名，兼容不同命名风格）
   */
  unsubscribe(channel: string): void;

  /**
   * 发布请求并等待响应（便捷封装）
   * @param channel 频道名
   * @param message 消息体
   * @param timeoutMs 超时时间
   */
  request<T = unknown>(channel: string, message: AgentMessage, timeoutMs?: number): Promise<T>;
}

export type MessageHandler = (msg: AgentMessage) => void;
