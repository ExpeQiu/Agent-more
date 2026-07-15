-- Prisma Schema 扩展补丁
-- 对应 Cocreator backend/prisma/schema.prisma
--
-- 修改说明：
-- 1. 在 ConversationMessage 模型中添加 modelId 可选字段
-- 2. 在 ConversationSession 模型中扩展 variables JSON 以支持 modelIds
--
-- 执行：npx prisma migrate dev --name add_multi_chat_support

-- 修改 ConversationMessage 表（添加 modelId 字段）
-- ALTER TABLE "ConversationMessage" ADD COLUMN IF NOT EXISTS "modelId" TEXT;

-- 修改 ConversationSession 表（扩展 type 和 variables）
-- ALTER TABLE "ConversationSession" ADD COLUMN IF NOT EXISTS "type" TEXT DEFAULT 'single';

-- Prisma migration 示例
-- 位置：backend/prisma/migrations/YYYYMMDDHHMMSS_add_multi_chat_support/migration.sql

-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ALTER TABLE "ConversationMessage" 
-- ADD COLUMN "modelId" TEXT;

-- ALTER TABLE "ConversationSession" 
-- ADD COLUMN "type" TEXT NOT NULL DEFAULT 'single',
-- ADD COLUMN "modelIds" TEXT;

-- CREATE INDEX IF NOT EXISTS "ConversationMessage_modelId_idx" ON "ConversationMessage"("modelId");
-- CREATE INDEX IF NOT EXISTS "ConversationSession_type_idx" ON "ConversationSession"("type");
