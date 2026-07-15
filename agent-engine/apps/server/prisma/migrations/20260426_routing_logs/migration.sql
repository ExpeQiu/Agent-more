-- Migration: 20260426_routing_logs
-- P1-T55: 路由日志 PostgreSQL 持久化
-- 创建 routing_logs 表

-- 创建 routing_logs 表
CREATE TABLE IF NOT EXISTS "routing_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "executionId" TEXT,
    "inputQuery" TEXT NOT NULL,
    "matchedSceneId" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "layer" INTEGER NOT NULL,
    "routingTimeMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "routing_logs_pkey" PRIMARY KEY ("id")
);

-- 创建索引
CREATE INDEX IF NOT EXISTS "routing_logs_executionId_idx" ON "routing_logs"("executionId");
CREATE INDEX IF NOT EXISTS "routing_logs_matchedSceneId_idx" ON "routing_logs"("matchedSceneId");
CREATE INDEX IF NOT EXISTS "routing_logs_createdAt_idx" ON "routing_logs"("createdAt");

-- 添加注释
COMMENT ON TABLE "routing_logs" IS 'Scene Router 路由决策日志表 — P1-T55';
COMMENT ON COLUMN "routing_logs"."id" IS 'UUID 主键';
COMMENT ON COLUMN "routing_logs"."executionId" IS '执行 ID，对应 RoutingResponse.decisionId';
COMMENT ON COLUMN "routing_logs"."inputQuery" IS '原始输入查询';
COMMENT ON COLUMN "routing_logs"."matchedSceneId" IS '命中的场景 ID，null 表示降级';
COMMENT ON COLUMN "routing_logs"."confidence" IS '置信度 0.0-1.0';
COMMENT ON COLUMN "routing_logs"."layer" IS '命中层级 0/1/2/3';
COMMENT ON COLUMN "routing_logs"."routingTimeMs" IS '路由耗时（毫秒）';
COMMENT ON COLUMN "routing_logs"."createdAt" IS '记录创建时间';
