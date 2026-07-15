/**
 * Agent Engine Server — Entry Point
 * P1-T06: Prisma client singleton
 * P1-T07: Redis integration
 */

import { PrismaClient } from '@prisma/client';
import {
  getRedisClient,
  redisPing,
  closeRedisConnections,
  sessionGet,
  sessionSet,
  publish,
  subscribe,
  CHANNELS,
} from './lib/redis.js';

// ─── Prisma Singleton ──────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
}

// ─── Health Check ───────────────────────────────────────────────────────────

export async function healthCheck(): Promise<{
  ok: boolean;
  redis: boolean;
  database: boolean;
}> {
  const [redis, database] = await Promise.all([
    redisPing().catch(() => false),
    prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
  ]);

  return {
    ok: redis && database,
    redis,
    database,
  };
}

// ─── Server Bootstrap ──────────────────────────────────────────────────────

export async function bootstrap(): Promise<void> {
  console.log('🚀 Starting Agent Engine Server...');

  // Initialize Redis
  const redisOk = await redisPing();
  if (!redisOk) {
    console.warn('⚠️  Redis not connected — caching disabled');
  } else {
    console.log('✅ Redis connected');
    // Subscribe to agent events
    subscribe(CHANNELS.AGENT_EVENT, (msg) => {
      console.log(`[Redis:sub] ${CHANNELS.AGENT_EVENT}`, msg);
    });
  }

  // Initialize Database
  try {
    await prisma.$connect();
    console.log('✅ PostgreSQL connected');
  } catch (err) {
    console.error('❌ PostgreSQL connection failed:', err);
    throw err;
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received — shutting down...`);
    await closeRedisConnections();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// ─── Re-export for convenience ─────────────────────────────────────────────

export { sessionGet, sessionSet, publish, subscribe, CHANNELS };
export { redisPing, closeRedisConnections };
