-- ============================================================
-- Phase 1 数据库扩展补丁
-- 对应合并方案 §9 数据库最终方案
--
-- 适用范围：合并项目 Cocreator 后端 Prisma schema
-- 执行方式：
--   开发：npx prisma migrate dev --name add_phase1_chat_compare
--   生产：npx prisma migrate deploy
--
-- 如使用原始 SQL（无 Prisma）：直接执行以下 SQL 块
-- ============================================================

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. 扩展 ConversationSession
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- moduleType: CHAT | COMPARE | AGENT | DISCUSSION
-- sessionMode: single | multi-model | manual-agent | multi-agent
-- selectedModels: JSON array of model IDs
-- discussionConfig: JSON for discussion settings

ALTER TABLE "ConversationSession" ADD COLUMN IF NOT EXISTS "moduleType" TEXT NOT NULL DEFAULT 'CHAT';
ALTER TABLE "ConversationSession" ADD COLUMN IF NOT EXISTS "sessionMode" TEXT NOT NULL DEFAULT 'single';
ALTER TABLE "ConversationSession" ADD COLUMN IF NOT EXISTS "selectedModels" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "ConversationSession" ADD COLUMN IF NOT EXISTS "discussionConfig" TEXT NOT NULL DEFAULT '{}';

-- 旧表兼容性：modelIds → selectedModels（数据迁移）
-- UPDATE "ConversationSession" SET "selectedModels" = COALESCE("modelIds", '[]') WHERE "selectedModels" = '[]';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. 扩展 ConversationMessage
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE "ConversationMessage" ADD COLUMN IF NOT EXISTS "modelId" TEXT;
ALTER TABLE "ConversationMessage" ADD COLUMN IF NOT EXISTS "provider" TEXT;
ALTER TABLE "ConversationMessage" ADD COLUMN IF NOT EXISTS "agentId" TEXT;
ALTER TABLE "ConversationMessage" ADD COLUMN IF NOT EXISTS "roundIndex" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ConversationMessage" ADD COLUMN IF NOT EXISTS "turnIndex" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ConversationMessage" ADD COLUMN IF NOT EXISTS "compareGroupId" TEXT;
ALTER TABLE "ConversationMessage" ADD COLUMN IF NOT EXISTS "isChosen" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ConversationMessage" ADD COLUMN IF NOT EXISTS "latencyMs" INTEGER;
ALTER TABLE "ConversationMessage" ADD COLUMN IF NOT EXISTS "inputTokens" INTEGER;
ALTER TABLE "ConversationMessage" ADD COLUMN IF NOT EXISTS "outputTokens" INTEGER;
ALTER TABLE "ConversationMessage" ADD COLUMN IF NOT EXISTS "messageType" TEXT NOT NULL DEFAULT 'assistant';
ALTER TABLE "ConversationMessage" ADD COLUMN IF NOT EXISTS "parentMessageId" TEXT;

-- 索引
CREATE INDEX IF NOT EXISTS "ConversationMessage_modelId_idx" ON "ConversationMessage"("modelId");
CREATE INDEX IF NOT EXISTS "ConversationMessage_provider_idx" ON "ConversationMessage"("provider");
CREATE INDEX IF NOT EXISTS "ConversationMessage_compareGroupId_idx" ON "ConversationMessage"("compareGroupId");
CREATE INDEX IF NOT EXISTS "ConversationMessage_sessionId_idx" ON "ConversationMessage"("sessionId");
CREATE INDEX IF NOT EXISTS "ConversationSession_moduleType_idx" ON "ConversationSession"("moduleType");

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. 新增 AgentDefinition 表（Phase 2 种子数据可用）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS "AgentDefinition" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  "projectId" TEXT,
  "name" TEXT NOT NULL,
  "roleLabel" TEXT NOT NULL,
  "description" TEXT,
  "systemPrompt" TEXT NOT NULL,
  "defaultModel" TEXT,
  "avatar" TEXT,
  "color" TEXT,
  "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "config" TEXT NOT NULL DEFAULT '{}',
  "createdById" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT (datetime('now')),
  "updatedAt" DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "AgentDefinition_projectId_idx" ON "AgentDefinition"("projectId");
CREATE INDEX IF NOT EXISTS "AgentDefinition_isBuiltIn_idx" ON "AgentDefinition"("isBuiltIn");

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. 新增 DiscussionSession 表（Phase 3）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS "DiscussionSession" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  "projectId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'round-robin',
  -- mode: parallel | round-robin | debate
  "moderatorAgentId" TEXT,
  "maxRounds" INTEGER NOT NULL DEFAULT 3,
  "currentRound" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  -- status: PENDING | RUNNING | PAUSED | COMPLETED | CANCELLED
  "finalSummary" TEXT,
  "finalDecision" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT (datetime('now')),
  "updatedAt" DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "DiscussionSession_projectId_idx" ON "DiscussionSession"("projectId");
CREATE INDEX IF NOT EXISTS "DiscussionSession_conversationId_idx" ON "DiscussionSession"("conversationId");
CREATE INDEX IF NOT EXISTS "DiscussionSession_status_idx" ON "DiscussionSession"("status");

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 5. 新增 DiscussionParticipant 表（Phase 3）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS "DiscussionParticipant" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  "discussionId" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "stance" TEXT,
  "responsibility" TEXT,
  "speakOrder" INTEGER NOT NULL DEFAULT 1,
  "isModerator" BOOLEAN NOT NULL DEFAULT false,
  "config" TEXT NOT NULL DEFAULT '{}',
  "createdAt" DATETIME NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY ("discussionId") REFERENCES "DiscussionSession"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "DiscussionParticipant_discussionId_idx" ON "DiscussionParticipant"("discussionId");
CREATE INDEX IF NOT EXISTS "DiscussionParticipant_agentId_idx" ON "DiscussionParticipant"("agentId");

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 6. 新增 CompareRun 表（Phase 1 可选）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS "CompareRun" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  "conversationId" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "selectedModels" TEXT NOT NULL DEFAULT '[]',
  "chosenModel" TEXT,
  "chosenMessageId" TEXT,
  "summary" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "CompareRun_conversationId_idx" ON "CompareRun"("conversationId");

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 7. 扩展 SkillExecution（Agent 调用追踪）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE "SkillExecution" ADD COLUMN IF NOT EXISTS "sourceType" TEXT NOT NULL DEFAULT 'manual';
-- sourceType: manual | chain | compare | discussion | background
ALTER TABLE "SkillExecution" ADD COLUMN IF NOT EXISTS "conversationId" TEXT;
ALTER TABLE "SkillExecution" ADD COLUMN IF NOT EXISTS "agentId" TEXT;
ALTER TABLE "SkillExecution" ADD COLUMN IF NOT EXISTS "parentExecutionId" TEXT;
ALTER TABLE "SkillExecution" ADD COLUMN IF NOT EXISTS "traceId" TEXT;
ALTER TABLE "SkillExecution" ADD COLUMN IF NOT EXISTS "cancelledAt" DATETIME;

CREATE INDEX IF NOT EXISTS "SkillExecution_sourceType_idx" ON "SkillExecution"("sourceType");
CREATE INDEX IF NOT EXISTS "SkillExecution_traceId_idx" ON "SkillExecution"("traceId");

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 8. 种子数据：内置 Agent 角色（Phase 1 for Discussion）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT OR IGNORE INTO "AgentDefinition" ("id", "name", "roleLabel", "description", "systemPrompt", "defaultModel", "color", "isBuiltIn", "config") VALUES
(
  'agent-tech-expert',
  '技术专家',
  'tech-expert',
  '从技术角度分析问题，关注架构、性能、实现细节',
  '你是一位资深技术专家，擅长从技术角度深入分析问题。关注点：架构设计、性能优化、实现细节、技术风险、可行性评估。你的分析要专业、深入、有技术深度。',
  'gpt-4o',
  '#3b82f6',
  true,
  '{"icon": "🔬", "strengths": ["架构设计", "性能优化", "代码质量"]}'
),
(
  'agent-product-manager',
  '产品经理',
  'pm',
  '从市场和用户角度分析，关注需求、体验、商业价值',
  '你是一位经验丰富的产品经理，擅长从市场和用户角度分析问题。关注点：用户需求、产品体验、商业价值、市场竞争、优先级排序。你的分析要务实、以用户为中心。',
  'gpt-4o',
  '#8b5cf6',
  true,
  '{"icon": "📊", "strengths": ["需求分析", "用户体验", "商业分析"]}'
),
(
  'agent-skeptic',
  '质疑者',
  'skeptic',
  '蓝军视角，质疑假设、识别风险、找出漏洞',
  '你是一位质疑者（蓝军），擅长从批判性角度分析问题。关注点：假设漏洞、潜在风险、论证缺陷、忽略因素、反例。你的质疑要有建设性，目的是让讨论更加完善，而不是否定一切。',
  'claude-4.6-sonnet',
  '#ef4444',
  true,
  '{"icon": "🤔", "strengths": ["风险识别", "逻辑漏洞", "反例构造"]}'
),
(
  'agent-data-analyst',
  '数据分析师',
  'data-analyst',
  '用数据说话，关注指标、趋势、统计显著性',
  '你是一位数据分析师，擅长用数据来支持决策。关注点：关键指标、趋势变化、统计显著性、数据质量、相关性vs因果性。你的分析要有数据支撑，不要做没有依据的推断。',
  'gpt-4o',
  '#10b981',
  true,
  '{"icon": "📈", "strengths": ["统计分析", "趋势预测", "数据可视化"]}'
),
(
  'agent-creative',
  '创意师',
  'creative',
  '发散思维，提出创新想法和替代方案',
  '你是一位富有创意的头脑风暴专家，擅长跳出常规思维提出创新想法。关注点：创新机会、替代方案、跨界灵感、颠覆性想法。你的创意要有一定可行性，避免天马行空。',
  'gpt-4o',
  '#f59e0b',
  true,
  '{"icon": "💡", "strengths": ["创新思维", "跨界灵感", "替代方案"]}'
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 9. 注释说明
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--
-- Prisma schema 更新建议（backend/prisma/schema.prisma）：
--
-- 1. 在 ConversationSession 模型中添加：
--    moduleType        String @default("CHAT")
--    sessionMode       String @default("single")
--    selectedModels    String @default("[]")
--    discussionConfig  String @default("{}")
--
-- 2. 在 ConversationMessage 模型中添加：
--    modelId         String?
--    provider        String?
--    agentId         String?
--    roundIndex      Int    @default(1)
--    turnIndex       Int    @default(1)
--    compareGroupId  String?
--    isChosen        Boolean @default(false)
--    latencyMs       Int?
--    inputTokens     Int?
--    outputTokens    Int?
--    messageType     String @default("assistant")
--    parentMessageId String?
--
-- 3. 新增 AgentDefinition 模型
-- 4. 新增 DiscussionSession 模型
-- 5. 新增 DiscussionParticipant 模型
-- 6. 新增 CompareRun 模型
-- 7. 在 SkillExecution 模型中添加 sourceType 等字段
--
-- 执行 npx prisma generate 后重启服务
