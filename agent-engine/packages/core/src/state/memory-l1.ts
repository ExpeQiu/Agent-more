/**
 * P1-M2: Layer1 记忆（内存层）
 * 
 * 特性：
 * - 单次执行内的内存存储
 * - 进程内读写，访问速度极快
 * - 执行完成后数据写入 L2（Redis）
 */

import type { TechPackagingState, SharedDataField } from './state-schema';

// ============================================================================
// L1 Memory 配置
// ============================================================================

export interface L1MemoryConfig {
  /** 最大条目数 */
  maxEntries: number;
  /** 最大内存占用（字节） */
  maxMemoryBytes: number;
  /** TTL（毫秒），超时后自动清理 */
  ttlMs: number;
  /** 是否启用自动清理 */
  autoCleanup: boolean;
  /** 清理触发阈值 */
  cleanupThreshold: number;
}

const DEFAULT_L1_CONFIG: L1MemoryConfig = {
  maxEntries: 1000,
  maxMemoryBytes: 50 * 1024 * 1024, // 50MB
  ttlMs: 60 * 60 * 1000, // 1小时
  autoCleanup: true,
  cleanupThreshold: 0.8, // 80% 时触发清理
};

// ============================================================================
// L1 Memory 条目
// ============================================================================

export interface L1MemoryEntry<T = unknown> {
  key: string;
  value: T;
  /** 访问计数 */
  accessCount: number;
  /** 创建时间 */
  createdAt: number;
  /** 最后访问时间 */
  lastAccessedAt: number;
  /** 过期时间 */
  expiresAt: number;
  /** 内存占用（字节） */
  sizeBytes: number;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// L1 Memory 类
// ============================================================================

export class L1Memory {
  private config: L1MemoryConfig;
  private storage: Map<string, L1MemoryEntry> = new Map();
  private totalSizeBytes: number = 0;
  private currentExecutionId: string | null = null;

  constructor(config: Partial<L1MemoryConfig> = {}) {
    this.config = { ...DEFAULT_L1_CONFIG, ...config };
  }

  /**
   * 开始新的执行会话
   */
  beginSession(executionId: string): void {
    this.currentExecutionId = executionId;
    this.storage.clear();
    this.totalSizeBytes = 0;
  }

  /**
   * 结束执行会话
   */
  endSession(): Map<string, L1MemoryEntry> {
    const entries = new Map(this.storage);
    // 注意：不清空存储，保留到写入 L2 或显式清理
    return entries;
  }

  /**
   * 设置值
   */
  set<T>(key: string, value: T, metadata?: Record<string, unknown>): void {
    // 检查是否需要清理
    if (this.config.autoCleanup && this.shouldCleanup()) {
      this.cleanup();
    }

    const now = Date.now();
    const sizeBytes = this.estimateSize(value);

    // 如果条目已存在，先移除旧值
    const existing = this.storage.get(key);
    if (existing) {
      this.totalSizeBytes -= existing.sizeBytes;
    }

    // 检查是否超过最大条目数
    if (!existing && this.storage.size >= this.config.maxEntries) {
      this.evictLeastRecentlyUsed();
    }

    const entry: L1MemoryEntry<T> = {
      key,
      value,
      accessCount: 1,
      createdAt: now,
      lastAccessedAt: now,
      expiresAt: now + this.config.ttlMs,
      sizeBytes,
      metadata,
    };

    this.storage.set(key, entry as L1MemoryEntry);
    this.totalSizeBytes += sizeBytes;
  }

  /**
   * 获取值
   */
  get<T>(key: string): T | undefined {
    const entry = this.storage.get(key);
    
    if (!entry) {
      return undefined;
    }

    // 检查是否过期
    if (Date.now() > entry.expiresAt) {
      this.delete(key);
      return undefined;
    }

    // 更新访问信息
    entry.accessCount++;
    entry.lastAccessedAt = Date.now();

    return entry.value as T;
  }

  /**
   * 检查键是否存在
   */
  has(key: string): boolean {
    const entry = this.storage.get(key);
    if (!entry) return false;
    
    if (Date.now() > entry.expiresAt) {
      this.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * 删除键
   */
  delete(key: string): boolean {
    const entry = this.storage.get(key);
    if (!entry) return false;

    this.totalSizeBytes -= entry.sizeBytes;
    return this.storage.delete(key);
  }

  /**
   * 清空所有数据
   */
  clear(): void {
    this.storage.clear();
    this.totalSizeBytes = 0;
  }

  /**
   * 获取所有键
   */
  keys(): string[] {
    this.cleanupExpired();
    return Array.from(this.storage.keys());
  }

  /**
   * 获取所有条目
   */
  entries<T = unknown>(): Array<[string, L1MemoryEntry<T>]> {
    this.cleanupExpired();
    return Array.from(this.storage.entries()) as Array<[string, L1MemoryEntry<T>]>;
  }

  /**
   * 获取条目光
   */
  size(): number {
    return this.storage.size;
  }

  /**
   * 获取总内存占用
   */
  getTotalSizeBytes(): number {
    return this.totalSizeBytes;
  }

  /**
   * 批量设置
   */
  setMany<T>(items: Array<{ key: string; value: T; metadata?: Record<string, unknown> }>): void {
    for (const item of items) {
      this.set(item.key, item.value, item.metadata);
    }
  }

  /**
   * 批量获取
   */
  getMany<T>(keys: string[]): Map<string, T | undefined> {
    const result = new Map<string, T | undefined>();
    for (const key of keys) {
      result.set(key, this.get<T>(key));
    }
    return result;
  }

  /**
   * 获取最近的 N 条记录
   */
  getRecent<T>(n: number = 10): L1MemoryEntry<T>[] {
    this.cleanupExpired();
    
    return Array.from(this.storage.values())
      .sort((a, b) => b.lastAccessedAt - a.lastAccessedAt)
      .slice(0, n) as L1MemoryEntry<T>[];
  }

  /**
   * 获取访问频率最高的 N 条记录
   */
  getMostAccessed<T>(n: number = 10): L1MemoryEntry<T>[] {
    this.cleanupExpired();
    
    return Array.from(this.storage.values())
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, n) as L1MemoryEntry<T>[];
  }

  /**
   * 搜索键（支持前缀匹配）
   */
  searchKeys(pattern: string): string[] {
    this.cleanupExpired();
    return Array.from(this.storage.keys()).filter(key => key.startsWith(pattern));
  }

  /**
   * 从 TechPackagingState 导入数据
   */
  importFromState(state: TechPackagingState): void {
    // 导入 sharedData
    for (const [key, field] of Object.entries(state.sharedData.fields)) {
      this.set(`shared_${key}`, field.value, {
        producerNodeId: field.producerNodeId,
        source: field.source,
        priority: field.priority,
        type: field.type,
      });
    }

    // 导入节点执行结果
    for (const [nodeId, execution] of Object.entries(state.nodeExecutions)) {
      if (execution.output) {
        this.set(`node_${nodeId}_output`, execution.output, {
          nodeId,
          status: execution.status,
          startTime: execution.startTime,
          endTime: execution.endTime,
        });
      }
    }

    // 导入输入信息
    this.set('input', state.input, {
      executionId: state.executionId,
      taskType: state.input.taskType,
      subjectName: state.input.subjectName,
    });
  }

  /**
   * 导出为 State 可用的格式
   */
  exportToSharedData(): Record<string, SharedDataField> {
    const result: Record<string, SharedDataField> = {};
    const now = Date.now();

    for (const [key, entry] of this.storage.entries()) {
      // 只导出 shared_ 前缀的条目
      if (key.startsWith('shared_')) {
        const fieldKey = key.substring(7); // 去掉 'shared_' 前缀
        result[fieldKey] = {
          key: fieldKey,
          value: entry.value,
          type: inferType(entry.value),
          producerNodeId: entry.metadata?.producerNodeId as string | undefined,
          priority: (entry.metadata?.priority as number) ?? 3,
          source: (entry.metadata?.source as any) ?? 'llm',
          metadata: entry.metadata,
          createdAt: entry.createdAt,
          updatedAt: entry.lastAccessedAt,
        };
      }
    }

    return result;
  }

  /**
   * 清理过期条目
   */
  private cleanupExpired(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.storage.entries()) {
      if (now > entry.expiresAt) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      const entry = this.storage.get(key);
      if (entry) {
        this.totalSizeBytes -= entry.sizeBytes;
        this.storage.delete(key);
      }
    }
  }

  /**
   * 检查是否需要清理
   */
  private shouldCleanup(): boolean {
    const entryRatio = this.storage.size / this.config.maxEntries;
    const sizeRatio = this.totalSizeBytes / this.config.maxMemoryBytes;
    return entryRatio > this.config.cleanupThreshold || sizeRatio > this.config.cleanupThreshold;
  }

  /**
   * 清理最久未使用的条目
   */
  private evictLeastRecentlyUsed(): void {
    let oldest: L1MemoryEntry | null = null;
    let oldestKey: string | null = null;

    for (const [key, entry] of this.storage.entries()) {
      if (!oldest || entry.lastAccessedAt < oldest.lastAccessedAt) {
        oldest = entry;
        oldestKey = key;
      }
    }

    if (oldestKey && oldest) {
      this.totalSizeBytes -= oldest.sizeBytes;
      this.storage.delete(oldestKey);
    }
  }

  /**
   * 执行清理
   */
  cleanup(): void {
    // 先清理过期条目
    this.cleanupExpired();

    // 如果仍然超过阈值，继续清理 LRU
    while (
      (this.storage.size > this.config.maxEntries * this.config.cleanupThreshold) ||
      (this.totalSizeBytes > this.config.maxMemoryBytes * this.config.cleanupThreshold)
    ) {
      if (this.storage.size === 0) break;
      this.evictLeastRecentlyUsed();
    }
  }

  /**
   * 估算值的内存占用
   */
  private estimateSize(value: unknown): number {
    try {
      return JSON.stringify(value).length * 2; // 估算：UTF-16
    } catch {
      return 100; // 默认大小
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    size: number;
    totalSizeBytes: number;
    maxEntries: number;
    maxMemoryBytes: number;
    usageRatio: number;
    oldestEntry: number | null;
    newestEntry: number | null;
  } {
    const entries = Array.from(this.storage.values());
    return {
      size: this.storage.size,
      totalSizeBytes: this.totalSizeBytes,
      maxEntries: this.config.maxEntries,
      maxMemoryBytes: this.config.maxMemoryBytes,
      usageRatio: this.storage.size / this.config.maxEntries,
      oldestEntry: entries.length > 0 
        ? Math.min(...entries.map(e => e.createdAt))
        : null,
      newestEntry: entries.length > 0
        ? Math.max(...entries.map(e => e.createdAt))
        : null,
    };
  }
}

// ============================================================================
// 辅助函数
// ============================================================================

function inferType(value: unknown): import('./state-schema').SharedDataType {
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object' && value !== null) return 'object';
  return 'string';
}

// ============================================================================
// 单例实例（用于全局访问）
// ============================================================================

let globalL1Instance: L1Memory | null = null;

export function getGlobalL1Memory(): L1Memory {
  if (!globalL1Instance) {
    globalL1Instance = new L1Memory();
  }
  return globalL1Instance;
}

export function resetGlobalL1Memory(): void {
  if (globalL1Instance) {
    globalL1Instance.clear();
  }
  globalL1Instance = null;
}
