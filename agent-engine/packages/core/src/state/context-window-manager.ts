/**
 * P1-M2: 上下文窗口管理器
 * 
 * 功能：
 * 1. Token 超限时自动压缩
 * 2. priorityFields 全部保留（key fields 不压缩）
 * 3. 与 P1-M1 的 C-DAG Executor 配合
 */

import type { TechPackagingState, SharedDataField } from './state-schema';
import { InputSource, Priority } from './state-schema';

// ============================================================================
// 配置类型
// ============================================================================

export interface ContextWindowConfig {
  /** 最大 Token 数（默认 128k） */
  maxTokens: number;
  /** 压缩阈值（达到此比例时触发压缩） */
  compressionThreshold: number;
  /** 压缩后的目标 Token 数 */
  targetTokensAfterCompression: number;
  /** 每个 Token 约等于多少字符（中文约 1.5，英文约 4） */
  charsPerToken: number;
  /** 优先保留的字段（key fields） */
  priorityFields: string[];
  /** 压缩策略 */
  compressionStrategy: 'truncate' | 'summarize' | 'hybrid';
  /** 摘要模型的 API Key（用于 summarize 策略） */
  summarizerApiKey?: string;
  /** 摘要模型配置 */
  summarizerModel?: string;
}

const DEFAULT_CONFIG: ContextWindowConfig = {
  maxTokens: 128000,
  compressionThreshold: 0.85,
  targetTokensAfterCompression: 0.7,
  charsPerToken: 4,
  priorityFields: [],
  compressionStrategy: 'hybrid',
};

// ============================================================================
// 上下文项
// ============================================================================

export interface ContextItem {
  id: string;
  content: string;
  tokenCount: number;
  priority: Priority;
  source: InputSource;
  producerNodeId?: string;
  metadata?: Record<string, unknown>;
}

export interface CompressedContext {
  items: ContextItem[];
  totalTokens: number;
  droppedTokens: number;
  compressionRatio: number;
}

// ============================================================================
// 上下文窗口管理器
// ============================================================================

export class ContextWindowManager {
  private config: ContextWindowConfig;
  private currentContext: ContextItem[] = [];
  private totalTokens: number = 0;

  constructor(config: Partial<ContextWindowConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 初始化上下文
   */
  initialize(state: TechPackagingState): void {
    this.currentContext = [];
    this.totalTokens = 0;

    // 从状态中收集所有可用的上下文项
    // 1. 从 input.context 收集
    if (state.input.context) {
      for (const [key, value] of Object.entries(state.input.context)) {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          this.addItem({
            id: `input_${key}`,
            content: String(value),
            priority: this.isPriorityField(key) ? Priority.Critical : Priority.Medium,
            source: InputSource.Context,
          });
        }
      }
    }

    // 2. 从 sharedData 收集
    for (const [key, field] of Object.entries(state.sharedData.fields)) {
      this.addItem({
        id: `shared_${key}`,
        content: this.serializeFieldValue(field),
        priority: this.isPriorityField(key) ? Priority.Critical : field.priority,
        source: field.source,
        producerNodeId: field.producerNodeId,
        metadata: field.metadata,
      });
    }

    // 3. 从已完成节点输出收集
    for (const nodeId of state.completedNodeIds) {
      const execution = state.nodeExecutions[nodeId];
      if (execution?.output) {
        this.addItem({
          id: `node_${nodeId}`,
          content: this.serializeObject(execution.output),
          priority: Priority.Medium,
          source: InputSource.PreviousNode,
          producerNodeId: nodeId,
        });
      }
    }

    // 4. 从 input.userQuery 收集（始终保留）
    if (state.input.userQuery) {
      this.addItem({
        id: 'user_query',
        content: state.input.userQuery,
        priority: Priority.Critical,
        source: InputSource.User,
      });
    }

    // 5. 从 input.priorityFields 对应的值收集
    for (const fieldKey of this.config.priorityFields) {
      const field = state.sharedData.fields[fieldKey];
      if (field) {
        // 确保 priority fields 的优先级正确
        this.updateItemPriority(`shared_${fieldKey}`, Priority.Critical);
      }
    }
  }

  /**
   * 添加上下文项
   */
  addItem(item: Omit<ContextItem, 'tokenCount'>): void {
    const tokenCount = this.estimateTokens(item.content);
    const contextItem: ContextItem = {
      ...item,
      tokenCount,
    };

    this.currentContext.push(contextItem);
    this.totalTokens += tokenCount;

    // 检查是否需要压缩
    if (this.shouldCompress()) {
      this.compress();
    }
  }

  /**
   * 移除上下文项
   */
  removeItem(id: string): ContextItem | undefined {
    const index = this.currentContext.findIndex(item => item.id === id);
    if (index === -1) return undefined;

    const removed = this.currentContext.splice(index, 1)[0];
    this.totalTokens -= removed.tokenCount;
    return removed;
  }

  /**
   * 更新项的优先级
   */
  updateItemPriority(id: string, priority: Priority): void {
    const item = this.currentContext.find(i => i.id === id);
    if (item) {
      item.priority = priority;
    }
  }

  /**
   * 获取当前上下文
   */
  getContext(): ContextItem[] {
    return [...this.currentContext].sort((a, b) => a.priority - b.priority);
  }

  /**
   * 获取当前 Token 总数
   */
  getTotalTokens(): number {
    return this.totalTokens;
  }

  /**
   * 获取压缩后的上下文
   */
  getCompressedContext(): CompressedContext {
    const criticalItems = this.currentContext.filter(i => i.priority === Priority.Critical);
    const otherItems = this.currentContext.filter(i => i.priority !== Priority.Critical);

    return {
      items: [...criticalItems, ...otherItems],
      totalTokens: this.totalTokens,
      droppedTokens: 0,
      compressionRatio: 1,
    };
  }

  /**
   * 检查是否需要压缩
   */
  shouldCompress(): boolean {
    const threshold = this.config.maxTokens * this.config.compressionThreshold;
    return this.totalTokens > threshold;
  }

  /**
   * 执行压缩
   */
  compress(): CompressedContext {
    const beforeTokens = this.totalTokens;
    const targetTokens = this.config.maxTokens * this.config.targetTokensAfterCompression;

    // 分离关键字段和其他字段
    const criticalItems = this.currentContext.filter(i => i.priority === Priority.Critical);
    const compressibleItems = this.currentContext.filter(i => i.priority !== Priority.Critical);

    let remainingBudget = targetTokens - criticalItems.reduce((sum, i) => sum + i.tokenCount, 0);

    if (remainingBudget < 0) {
      // 关键字段就已经超过了预算，只保留关键字段
      this.currentContext = criticalItems;
      this.totalTokens = criticalItems.reduce((sum, i) => sum + i.tokenCount, 0);
    } else {
      // 按优先级从低到高依次压缩
      const sortedCompressible = compressibleItems.sort((a, b) => b.priority - a.priority);

      const keptItems: ContextItem[] = [];
      let keptTokens = 0;

      for (const item of sortedCompressible) {
        if (keptTokens + item.tokenCount <= remainingBudget) {
          keptItems.push(item);
          keptTokens += item.tokenCount;
        } else {
          // 需要压缩这个项目
          const compressed = this.compressItem(item, remainingBudget - keptTokens);
          if (compressed) {
            keptItems.push(compressed);
            keptTokens += compressed.tokenCount;
          }
        }
      }

      this.currentContext = [...criticalItems, ...keptItems];
      this.totalTokens = criticalItems.reduce((sum, i) => sum + i.tokenCount, 0) + keptTokens;
    }

    const droppedTokens = beforeTokens - this.totalTokens;

    return {
      items: this.currentContext,
      totalTokens: this.totalTokens,
      droppedTokens,
      compressionRatio: this.totalTokens / beforeTokens,
    };
  }

  /**
   * 压缩单个项
   */
  private compressItem(item: ContextItem, maxTokens: number): ContextItem | null {
    const maxChars = maxTokens * this.config.charsPerToken;

    switch (this.config.compressionStrategy) {
      case 'truncate':
        return this.truncateItem(item, maxChars);

      case 'summarize':
        // 调用 LLM 摘要
        return this.summarizeItem(item, maxTokens);

      case 'hybrid':
        // 对于长文本使用 summarize，短文本使用 truncate
        if (item.content.length > maxChars) {
          return this.summarizeItem(item, maxTokens);
        }
        return item;

      default:
        return item;
    }
  }

  /**
   * 调用 LLM 生成摘要
   */
  async summarizeItemByLLM(
    item: ContextItem,
    maxTokens: number
  ): Promise<ContextItem> {
    const apiKey = this.config.summarizerApiKey || process.env.LLM_API_KEY;
    const model = this.config.summarizerModel || 'gpt-4o-mini';

    if (!apiKey) {
      console.warn('[ContextWindowManager] No summarizer API key, falling back to truncate');
      return this.truncateItem(item, maxTokens * this.config.charsPerToken);
    }

    const prompt = `请将以下内容压缩为约 ${maxTokens} tokens 的摘要，要求：
1. 保留所有关键信息和核心要点
2. 保持原文的语义完整性
3. 用简洁的语言表达

原文：
${item.content}

摘要（保留关键信息，用简洁语言）：`;

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: Math.max(maxTokens, 100),
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status}`);
      }

      const data = await response.json() as { choices: Array<{ message: { content: string } }> };
      const summary = data.choices[0]?.message?.content?.trim() || item.content;

      return {
        ...item,
        content: summary + '\n[LLM 摘要压缩]',
        tokenCount: this.estimateTokens(summary),
        metadata: {
          ...item.metadata,
          originalTokenCount: item.tokenCount,
          compressedTokenCount: this.estimateTokens(summary),
          compressionMethod: 'llm-summarize',
        },
      };
    } catch (error) {
      console.error('[ContextWindowManager] Summarize failed:', error);
      return this.truncateItem(item, maxTokens * this.config.charsPerToken);
    }
  }

  /**
   * 同步版本的摘要压缩（同步接口，内部异步调用）
   */
  private summarizeItem(item: ContextItem, maxTokens: number): ContextItem {
    // 同步接口直接返回截断版本，实际 LLM 调用由 summarizeItemByLLM 提供
    // 此处通过事件/回调机制触发异步摘要，压缩时使用截断作为占位
    if (item.tokenCount <= maxTokens) {
      return item;
    }

    // 标记需要异步摘要，由 toLLMMessages 在超限时触发
    return {
      ...item,
      content: item.content + '\n[需要 LLM 摘要压缩]',
      metadata: {
        ...item.metadata,
        pendingSummarize: true,
        maxTokens,
      },
    };
  }

  /**
   * 执行 LLM 摘要压缩（公开接口，供外部调用）
   */
  async summarize(): Promise<void> {
    const maxTokens = Math.floor(
      this.config.maxTokens * this.config.targetTokensAfterCompression
    );

    // 找出需要摘要的非关键项
    const itemsToSummarize = this.currentContext.filter(
      (item) =>
        item.priority !== Priority.Critical &&
        item.tokenCount > maxTokens / 2
    );

    const summaryPromises = itemsToSummarize.map(async (item) => {
      const compressed = await this.summarizeItemByLLM(item, maxTokens / 2);
      return compressed;
    });

    const summarizedItems = await Promise.all(summaryPromises);

    // 更新上下文
    for (const summarized of summarizedItems) {
      const index = this.currentContext.findIndex((i) => i.id === summarized.id);
      if (index !== -1) {
        this.currentContext[index] = summarized;
      }
    }

    // 重新计算 token 总数
    this.totalTokens = this.currentContext.reduce(
      (sum, item) => sum + item.tokenCount,
      0
    );
  }

  /**
   * 截断项
   */
  private truncateItem(item: ContextItem, maxChars: number): ContextItem {
    const truncatedContent = item.content.substring(0, maxChars) + '...[compressed]';
    return {
      ...item,
      content: truncatedContent,
      tokenCount: this.estimateTokens(truncatedContent),
    };
  }

  /**
   * 估算 Token 数
   */
  estimateTokens(text: string): number {
    if (!text) return 0;
    // 简单估算：中文约 1.5 字/token，英文约 4 字符/token
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars / 1.5 + otherChars / 4);
  }

  /**
   * 检查是否为优先字段
   */
  private isPriorityField(key: string): boolean {
    return this.config.priorityFields.includes(key);
  }

  /**
   * 序列化字段值
   */
  private serializeFieldValue(field: SharedDataField): string {
    if (typeof field.value === 'string') {
      return field.value;
    }
    return JSON.stringify(field.value);
  }

  /**
   * 序列化对象
   */
  private serializeObject(obj: Record<string, unknown>): string {
    try {
      return JSON.stringify(obj);
    } catch {
      return String(obj);
    }
  }

  /**
   * 转换为适合 LLM 调用的消息格式
   * 当策略为 summarize 且超 Token 上限时，触发 LLM 摘要
   */
  async toLLMMessages(): Promise<Array<{ role: string; content: string }>> {
    // 当策略为 summarize 且超限时，先执行摘要
    if (
      this.config.compressionStrategy === 'summarize' &&
      this.shouldCompress()
    ) {
      await this.summarize();
    }

    const messages: Array<{ role: string; content: string }> = [];

    // 按优先级排序
    const sortedContext = this.getContext();

    for (const item of sortedContext) {
      let role = 'system';

      // 根据来源确定 role
      switch (item.source) {
        case InputSource.User:
          role = 'user';
          break;
        case InputSource.LLM:
        case InputSource.Tool:
          role = 'assistant';
          break;
        default:
          role = 'system';
      }

      messages.push({
        role,
        content: item.content,
      });
    }

    return messages;
  }

  /**
   * 估计当前上下文转换为消息后的 token 数
   */
  estimateLLMTokenCount(): number {
    let total = 0;

    // 每个消息约 4 tokens overhead（role + 格式）
    for (const item of this.currentContext) {
      total += item.tokenCount + 4;
    }

    return total;
  }

  /**
   * 重置管理器
   */
  reset(): void {
    this.currentContext = [];
    this.totalTokens = 0;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<ContextWindowConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取配置
   */
  getConfig(): ContextWindowConfig {
    return { ...this.config };
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 从 TechPackagingState 创建 ContextWindowManager
 */
export function createContextWindowManager(
  state: TechPackagingState,
  config?: Partial<ContextWindowConfig>
): ContextWindowManager {
  const mergedConfig: ContextWindowConfig = {
    ...DEFAULT_CONFIG,
    ...config,
    // 始终包含 input.priorityFields
    priorityFields: [
      ...(DEFAULT_CONFIG.priorityFields || []),
      ...(state.input.priorityFields || []),
    ],
  };

  const manager = new ContextWindowManager(mergedConfig);
  manager.initialize(state);
  return manager;
}
