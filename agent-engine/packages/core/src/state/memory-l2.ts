/**
 * P1-M2: Layer2 记忆（Redis 持久层）
 * 
 * 特性：
 * - 执行完成后 L1 数据写入 Redis
 * - 跨执行会话的数据持久化
 * - 支持分布式环境
 */

import type { TechPackagingState, SharedDataField } from './state-schema';
import type { L1MemoryEntry } from './memory-l1';

// ============================================================================
// L2 Memory 配置
// ============================================================================

export interface L2MemoryConfig {
  /** Redis 连接 URL */
  redisUrl: string;
  /** Key 前缀 */
  keyPrefix: string;
  /** 默认 TTL（秒） */
  defaultTTL: number;
  /** 连接池大小 */
  poolSize: number;
  /** 连接超时（毫秒） */
  connectTimeout: number;
  /** 命令超时（毫秒） */
  commandTimeout: number;
  /** 是否启用压缩 */
  enableCompression: boolean;
  /** 压缩阈值（字节） */
  compressionThreshold: number;
}

// ============================================================================
// Redis 客户端接口（宿主应用需实现）
// ============================================================================

export interface IRedisClient {
  /** 获取值 */
  get(key: string): Promise<string | null>;
  /** 设置值 */
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  /** 删除键 */
  del(key: string): Promise<number>;
  /** 设置 Hash */
  hset(key: string, field: string, value: string): Promise<number>;
  /** 获取 Hash 字段 */
  hget(key: string, field: string): Promise<string | null>;
  /** 获取整个 Hash */
  hgetall(key: string): Promise<Record<string, string>>;
  /** 设置整个 Hash */
  hmset(key: string, data: Record<string, string>): Promise<void>;
  /** 删除 Hash 字段 */
  hdel(key: string, field: string): Promise<number>;
  /** 设置过期时间 */
  expire(key: string, seconds: number): Promise<number>;
  /** 获取过期时间 */
  ttl(key: string): Promise<number>;
  /** 批量获取 */
  mget(keys: string[]): Promise<Array<string | null>>;
  /** 批量设置 */
  mset(entries: Array<{ key: string; value: string; ttlSeconds?: number }>): Promise<void>;
  /** 扫描 Keys */
  scan(pattern: string, count: number): Promise<string[]>;
  /** 执行事务 */
  multi(): RedisTransaction;
}

export interface RedisTransaction {
  set(key: string, value: string, ttlSeconds?: number): RedisTransaction;
  del(key: string): RedisTransaction;
  exec(): Promise<Array<unknown>>;
}

// ============================================================================
// L2 Memory 类
// ============================================================================

export class L2Memory {
  private config: L2MemoryConfig;
  private redis: IRedisClient | null = null;
  private connected: boolean = false;

  constructor(config: L2MemoryConfig) {
    this.config = config;
  }

  /**
   * 连接到 Redis
   */
  async connect(redisClient: IRedisClient): Promise<void> {
    this.redis = redisClient;
    this.connected = true;
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    this.redis = null;
    this.connected = false;
  }

  /**
   * 检查连接状态
   */
  isConnected(): boolean {
    return this.connected && this.redis !== null;
  }

  // ============================================================================
  // Execution 会话管理
  // ============================================================================

  /**
   * 保存执行会话数据
   */
  async saveExecutionSession(
    executionId: string,
    state: TechPackagingState,
    l1Entries: Map<string, L1MemoryEntry>
  ): Promise<void> {
    if (!this.redis) throw new Error('Redis not connected');

    const key = this.getExecutionKey(executionId);
    const sessionData = {
      executionId,
      status: state.status,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
      startedAt: state.startedAt || 0,
      endedAt: state.endedAt || 0,
      input: JSON.stringify(state.input),
      output: state.output ? JSON.stringify(state.output) : '',
      error: state.error || '',
      completedNodeIds: JSON.stringify(state.completedNodeIds),
      failedNodeIds: JSON.stringify(state.failedNodeIds),
      l1EntryCount: l1Entries.size.toString(),
    };

    await this.redis.hmset(key, sessionData);
    await this.redis.expire(key, this.config.defaultTTL);

    // 保存 L1 数据到 Hash
    const l1Key = this.getL1DataKey(executionId);
    const l1Data: Record<string, string> = {};

    for (const [entryKey, entry] of l1Entries.entries()) {
      l1Data[entryKey] = JSON.stringify({
        value: entry.value,
        metadata: entry.metadata,
        createdAt: entry.createdAt,
        lastAccessedAt: entry.lastAccessedAt,
        accessCount: entry.accessCount,
      });
    }

    if (Object.keys(l1Data).length > 0) {
      await this.redis.hmset(l1Key, l1Data);
      await this.redis.expire(l1Key, this.config.defaultTTL);
    }
  }

  /**
   * 加载执行会话数据
   */
  async loadExecutionSession(executionId: string): Promise<{
    state: Partial<TechPackagingState>;
    l1Entries: Map<string, L1MemoryEntry>;
  } | null> {
    if (!this.redis) throw new Error('Redis not connected');

    const key = this.getExecutionKey(executionId);
    const data = await this.redis.hgetall(key);

    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    const state: Partial<TechPackagingState> = {
      executionId: data.executionId,
      status: data.status as any,
      createdAt: parseInt(data.createdAt, 10),
      updatedAt: parseInt(data.updatedAt, 10),
      startedAt: parseInt(data.startedAt, 10) || undefined,
      endedAt: parseInt(data.endedAt, 10) || undefined,
      input: JSON.parse(data.input || '{}'),
      output: data.output ? JSON.parse(data.output) : undefined,
      error: data.error || undefined,
      completedNodeIds: JSON.parse(data.completedNodeIds || '[]'),
      failedNodeIds: JSON.parse(data.failedNodeIds || '[]'),
    };

    // 加载 L1 数据
    const l1Entries = new Map<string, L1MemoryEntry>();
    const l1Key = this.getL1DataKey(executionId);
    const l1Data = await this.redis.hgetall(l1Key);

    for (const [entryKey, entryJson] of Object.entries(l1Data)) {
      try {
        const parsed = JSON.parse(entryJson);
        l1Entries.set(entryKey, {
          key: entryKey,
          value: parsed.value,
          accessCount: parsed.accessCount || 0,
          createdAt: parsed.createdAt,
          lastAccessedAt: parsed.lastAccessedAt,
          expiresAt: 0,
          sizeBytes: JSON.stringify(parsed.value).length,
          metadata: parsed.metadata,
        });
      } catch (e) {
        console.error(`Failed to parse L1 entry ${entryKey}:`, e);
      }
    }

    return { state, l1Entries };
  }

  /**
   * 删除执行会话数据
   */
  async deleteExecutionSession(executionId: string): Promise<void> {
    if (!this.redis) throw new Error('Redis not connected');

    await this.redis.del(this.getExecutionKey(executionId));
    await this.redis.del(this.getL1DataKey(executionId));
  }

  // ============================================================================
  // SharedData 管理
  // ============================================================================

  /**
   * 保存 SharedData 到 Redis
   */
  async saveSharedData(
    executionId: string,
    sharedData: Record<string, SharedDataField>
  ): Promise<void> {
    if (!this.redis) throw new Error('Redis not connected');

    const key = this.getSharedDataKey(executionId);
    const data: Record<string, string> = {};

    for (const [fieldKey, field] of Object.entries(sharedData)) {
      data[fieldKey] = JSON.stringify(field);
    }

    if (Object.keys(data).length > 0) {
      await this.redis.hmset(key, data);
      await this.redis.expire(key, this.config.defaultTTL);
    }
  }

  /**
   * 加载 SharedData
   */
  async loadSharedData(
    executionId: string
  ): Promise<Record<string, SharedDataField> | null> {
    if (!this.redis) throw new Error('Redis not connected');

    const key = this.getSharedDataKey(executionId);
    const data = await this.redis.hgetall(key);

    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    const result: Record<string, SharedDataField> = {};

    for (const [fieldKey, fieldJson] of Object.entries(data)) {
      try {
        result[fieldKey] = JSON.parse(fieldJson);
      } catch (e) {
        console.error(`Failed to parse shared data field ${fieldKey}:`, e);
      }
    }

    return result;
  }

  /**
   * 更新单个 SharedData 字段
   */
  async updateSharedDataField(
    executionId: string,
    fieldKey: string,
    field: SharedDataField
  ): Promise<void> {
    if (!this.redis) throw new Error('Redis not connected');

    const key = this.getSharedDataKey(executionId);
    await this.redis.hset(key, fieldKey, JSON.stringify(field));
  }

  /**
   * 删除 SharedData 字段
   */
  async deleteSharedDataField(
    executionId: string,
    fieldKey: string
  ): Promise<void> {
    if (!this.redis) throw new Error('Redis not connected');

    const key = this.getSharedDataKey(executionId);
    await this.redis.hdel(key, fieldKey);
  }

  // ============================================================================
  // 节点执行结果管理
  // ============================================================================

  /**
   * 保存节点执行结果
   */
  async saveNodeExecution(
    executionId: string,
    nodeId: string,
    result: Record<string, unknown>
  ): Promise<void> {
    if (!this.redis) throw new Error('Redis not connected');

    const key = this.getNodeExecutionKey(executionId, nodeId);
    await this.redis.set(key, JSON.stringify(result), this.config.defaultTTL);
  }

  /**
   * 加载节点执行结果
   */
  async loadNodeExecution(
    executionId: string,
    nodeId: string
  ): Promise<Record<string, unknown> | null> {
    if (!this.redis) throw new Error('Redis not connected');

    const key = this.getNodeExecutionKey(executionId, nodeId);
    const data = await this.redis.get(key);

    if (!data) return null;

    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  /**
   * 批量加载节点执行结果
   */
  async loadNodeExecutions(
    executionId: string,
    nodeIds: string[]
  ): Promise<Map<string, Record<string, unknown>>> {
    if (!this.redis) throw new Error('Redis not connected');

    const keys = nodeIds.map(id => this.getNodeExecutionKey(executionId, id));
    const results = await this.redis.mget(keys);
    const map = new Map<string, Record<string, unknown>>();

    for (let i = 0; i < nodeIds.length; i++) {
      const data = results[i];
      if (data) {
        try {
          map.set(nodeIds[i], JSON.parse(data));
        } catch (e) {
          console.error(`Failed to parse node execution ${nodeIds[i]}:`, e);
        }
      }
    }

    return map;
  }

  // ============================================================================
  // 历史记录查询
  // ============================================================================

  /**
   * 获取执行历史
   */
  async getExecutionHistory(
    limit: number = 10,
    offset: number = 0
  ): Promise<Array<{ executionId: string; status: string; createdAt: number }>> {
    if (!this.redis) throw new Error('Redis not connected');

    const pattern = `${this.config.keyPrefix}:execution:*`;
    const keys = await this.redis.scan(pattern, 100);
    
    // 排序并分页
    const sortedKeys = keys
      .map(key => {
        const match = key.match(/:execution:([^:]+)$/);
        return match ? match[1] : null;
      })
      .filter(Boolean)
      .slice(offset, offset + limit);

    const results: Array<{ executionId: string; status: string; createdAt: number }> = [];

    for (const executionId of sortedKeys) {
      const data = await this.loadExecutionSession(executionId!);
      if (data?.state) {
        results.push({
          executionId: executionId!,
          status: data.state.status || 'unknown',
          createdAt: data.state.createdAt || 0,
        });
      }
    }

    return results.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * 搜索包含特定数据的执行
   */
  async searchExecutions(
    predicate: (state: Partial<TechPackagingState>) => boolean,
    limit: number = 10
  ): Promise<string[]> {
    if (!this.redis) throw new Error('Redis not connected');

    const pattern = `${this.config.keyPrefix}:execution:*`;
    const keys = await this.redis.scan(pattern, 100);
    const results: string[] = [];

    for (const key of keys) {
      const match = key.match(/:execution:([^:]+)$/);
      if (!match) continue;

      const executionId = match[1];
      const data = await this.loadExecutionSession(executionId);
      
      if (data?.state && predicate(data.state)) {
        results.push(executionId);
        if (results.length >= limit) break;
      }
    }

    return results;
  }

  // ============================================================================
  // Key 生成辅助
  // ============================================================================

  private getExecutionKey(executionId: string): string {
    return `${this.config.keyPrefix}:execution:${executionId}`;
  }

  private getL1DataKey(executionId: string): string {
    return `${this.config.keyPrefix}:l1:${executionId}`;
  }

  private getSharedDataKey(executionId: string): string {
    return `${this.config.keyPrefix}:shared:${executionId}`;
  }

  private getNodeExecutionKey(executionId: string, nodeId: string): string {
    return `${this.config.keyPrefix}:node:${executionId}:${nodeId}`;
  }

  // ============================================================================
  // 配置更新
  // ============================================================================

  getConfig(): L2MemoryConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<L2MemoryConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 创建 L2Memory 实例（需要宿主应用传入 Redis 客户端）
 */
export function createL2Memory(config: L2MemoryConfig): L2Memory {
  return new L2Memory(config);
}
