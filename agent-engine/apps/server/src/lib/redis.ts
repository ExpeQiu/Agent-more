/**
 * Redis Configuration — P1-T07
 * 缓存读写 + Pub/Sub 发布订阅验证
 */

import Redis from 'ioredis';
import { createClient } from 'redis';

// ─── Config ────────────────────────────────────────────────────────────────

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
}

export const DEFAULT_REDIS_CONFIG: RedisConfig = {
  host: process.env.REDIS_HOST ?? '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB ?? '0', 10),
  keyPrefix: process.env.REDIS_KEY_PREFIX ?? 'agent-engine:',
};

// ─── Singleton Clients ──────────────────────────────────────────────────────

let _redisClient: Redis | null = null;
let _subClient: Redis | null = null;
let _pubClient: Redis | null = null;
let _httpClient: ReturnType<typeof createClient> | null = null;

export function getRedisClient(): Redis {
  if (!_redisClient) {
    _redisClient = new Redis({
      host: DEFAULT_REDIS_CONFIG.host,
      port: DEFAULT_REDIS_CONFIG.port,
      password: DEFAULT_REDIS_CONFIG.password,
      db: DEFAULT_REDIS_CONFIG.db,
      keyPrefix: DEFAULT_REDIS_CONFIG.keyPrefix,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      maxRetriesPerRequest: 3,
    });

    _redisClient.on('error', (err) => {
      console.error('[Redis Client Error]', err.message);
    });

    _redisClient.on('connect', () => {
      console.log('[Redis] Client connected');
    });
  }
  return _redisClient;
}

// Pub/Sub clients (separate connections required)
export function getPubClient(): Redis {
  if (!_pubClient) {
    _pubClient = new Redis({
      host: DEFAULT_REDIS_CONFIG.host,
      port: DEFAULT_REDIS_CONFIG.port,
      password: DEFAULT_REDIS_CONFIG.password,
      db: DEFAULT_REDIS_CONFIG.db,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });
  }
  return _pubClient;
}

export function getSubClient(): Redis {
  if (!_subClient) {
    _subClient = new Redis({
      host: DEFAULT_REDIS_CONFIG.host,
      port: DEFAULT_REDIS_CONFIG.port,
      password: DEFAULT_REDIS_CONFIG.password,
      db: DEFAULT_REDIS_CONFIG.db,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });
  }
  return _subClient;
}

// ─── HTTP Client (for Redis Cluster / Stream operations) ──────────────────

export async function getRedisHTTPClient() {
  if (!_httpClient) {
    _httpClient = createClient({
      url: `redis://${DEFAULT_REDIS_CONFIG.host}:${DEFAULT_REDIS_CONFIG.port}`,
      password: DEFAULT_REDIS_CONFIG.password,
    });
    _httpClient.on('error', (err) => console.error('[Redis HTTP Client Error]', err.message));
    await _httpClient.connect();
  }
  return _httpClient;
}

// ─── Cache Helpers ─────────────────────────────────────────────────────────

export async function cacheGet<T = unknown>(key: string): Promise<T | null> {
  const client = getRedisClient();
  const val = await client.get(key);
  if (!val) return null;
  try {
    return JSON.parse(val) as T;
  } catch {
    return val as unknown as T;
  }
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds?: number
): Promise<void> {
  const client = getRedisClient();
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  if (ttlSeconds) {
    await client.setex(key, ttlSeconds, serialized);
  } else {
    await client.set(key, serialized);
  }
}

export async function cacheDel(key: string): Promise<void> {
  await getRedisClient().del(key);
}

// ─── Session Store ──────────────────────────────────────────────────────────

export interface SessionData {
  id: string;
  agentId: string;
  messages: Array<{ role: string; content: string; timestamp: number }>;
  context: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

const SESSION_TTL = 3600 * 24; // 24 hours

export async function sessionGet(sessionId: string): Promise<SessionData | null> {
  return cacheGet<SessionData>(`session:${sessionId}`);
}

export async function sessionSet(sessionId: string, data: SessionData): Promise<void> {
  await cacheSet(`session:${sessionId}`, data, SESSION_TTL);
}

export async function sessionDel(sessionId: string): Promise<void> {
  await cacheDel(`session:${sessionId}`);
}

// ─── Pub/Sub ───────────────────────────────────────────────────────────────

export const CHANNELS = {
  AGENT_EVENT: 'agent:events',
  AGENT_LOG: 'agent:logs',
  WORKFLOW_UPDATE: 'workflow:updates',
} as const;

export async function publish(channel: string, message: unknown): Promise<void> {
  const client = getPubClient();
  const serialized = typeof message === 'string' ? message : JSON.stringify(message);
  await client.publish(channel, serialized);
}

export function subscribe(
  channel: string,
  handler: (message: string) => void
): void {
  const client = getSubClient();
  client.subscribe(channel);
  client.on('message', (ch, msg) => {
    if (ch === channel) handler(msg);
  });
}

// ─── Health Check ──────────────────────────────────────────────────────────

export async function redisPing(): Promise<boolean> {
  try {
    const result = await getRedisClient().ping();
    return result === 'PONG';
  } catch {
    return false;
  }
}

// ─── Shutdown ──────────────────────────────────────────────────────────────

export async function closeRedisConnections(): Promise<void> {
  const clients = [_redisClient, _pubClient, _subClient, _httpClient as any];
  await Promise.allSettled(
    clients.map((c) => {
      if (c && 'disconnect' in c) c.disconnect();
    })
  );
  _redisClient = null;
  _pubClient = null;
  _subClient = null;
  _httpClient = null;
}
