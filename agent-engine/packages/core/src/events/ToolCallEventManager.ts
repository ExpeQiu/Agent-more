/**
 * 工具调用事件类型
 */
export enum ToolCallEventType {
  TOOL_START = 'tool_start',
  TOOL_PROGRESS = 'tool_progress',
  TOOL_COMPLETE = 'tool_complete',
  TOOL_ERROR = 'tool_error'
}

/**
 * 工具调用事件数据
 */
export interface ToolCallEvent {
  type: ToolCallEventType;
  conversationId: string;
  toolName: string;
  toolId?: string;
  data?: any;
  error?: string;
  timestamp: number;
}

/**
 * 工具调用事件管理器
 * 用于在工具调用过程中发送事件，支持 SSE 推送
 */
export class ToolCallEventManager {
  private static instance: ToolCallEventManager;
  private eventSubscribers: Map<string, Set<(event: ToolCallEvent) => void>> = new Map();
  // Use a plain event target map instead of Node's EventEmitter for browser compatibility
  private globalListeners: Set<(event: ToolCallEvent) => void> = new Set();

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): ToolCallEventManager {
    if (!ToolCallEventManager.instance) {
      ToolCallEventManager.instance = new ToolCallEventManager();
    }
    return ToolCallEventManager.instance;
  }

  /**
   * 订阅对话的工具调用事件
   */
  subscribe(conversationId: string, callback: (event: ToolCallEvent) => void): () => void {
    if (!this.eventSubscribers.has(conversationId)) {
      this.eventSubscribers.set(conversationId, new Set());
    }
    const subscribers = this.eventSubscribers.get(conversationId)!;
    subscribers.add(callback);

    return () => {
      subscribers.delete(callback);
      if (subscribers.size === 0) {
        this.eventSubscribers.delete(conversationId);
      }
    };
  }

  /**
   * 发送工具调用事件
   */
  emitToolEvent(event: ToolCallEvent): void {
    const subscribers = this.eventSubscribers.get(event.conversationId);
    if (subscribers) {
      subscribers.forEach(callback => {
        try {
          callback(event);
        } catch (error) {
          console.error('工具调用事件回调失败:', error);
        }
      });
    }

    // 全局事件（用于调试）
    this.globalListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('全局工具调用事件监听失败:', error);
      }
    });
  }

  /**
   * 发送工具开始事件
   */
  emitToolStart(conversationId: string, toolName: string, toolId?: string, data?: any): void {
    this.emitToolEvent({
      type: ToolCallEventType.TOOL_START,
      conversationId,
      toolName,
      toolId,
      data,
      timestamp: Date.now()
    });
  }

  /**
   * 发送工具进度事件
   */
  emitToolProgress(conversationId: string, toolName: string, data: any): void {
    this.emitToolEvent({
      type: ToolCallEventType.TOOL_PROGRESS,
      conversationId,
      toolName,
      data,
      timestamp: Date.now()
    });
  }

  /**
   * 发送工具完成事件
   */
  emitToolComplete(conversationId: string, toolName: string, data: any): void {
    this.emitToolEvent({
      type: ToolCallEventType.TOOL_COMPLETE,
      conversationId,
      toolName,
      data,
      timestamp: Date.now()
    });
  }

  /**
   * 发送工具错误事件
   */
  emitToolError(conversationId: string, toolName: string, error: string): void {
    this.emitToolEvent({
      type: ToolCallEventType.TOOL_ERROR,
      conversationId,
      toolName,
      error,
      timestamp: Date.now()
    });
  }

  /**
   * 添加全局监听器
   */
  addGlobalListener(callback: (event: ToolCallEvent) => void): () => void {
    this.globalListeners.add(callback);
    return () => {
      this.globalListeners.delete(callback);
    };
  }

  /**
   * 清理对话的所有订阅
   */
  cleanup(conversationId: string): void {
    this.eventSubscribers.delete(conversationId);
  }
}

// 导出单例实例
export const toolCallEventManager = ToolCallEventManager.getInstance();
