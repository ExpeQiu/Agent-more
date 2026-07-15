-- Agent编排引擎 — Production Performance Migration
-- P1-T72: PostgreSQL 生产配置迁移
-- 验收: 100并发下查询<100ms
--
-- Created: 2026-04-25

-- ─── Session & Execution Indexes ───────────────────────────────────────────
-- 加速按agentId查询sessions的场景
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_agent_id
  ON "Session"("agentId");

-- 加速execution列表查询
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_executions_session_id
  ON "Execution"("sessionId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_executions_agent_id
  ON "Execution"("agentId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_executions_status
  ON "Execution"("status")
  WHERE "status" IN ('running', 'pending');

-- 加速message历史查询
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_session_id
  ON "Message"("sessionId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_created_at
  ON "Message"("createdAt");

-- 加速LLM调用日志查询
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_llm_calls_session_id
  ON "LLMCall"("sessionId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_llm_calls_created_at
  ON "LLMCall"("createdAt");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_llm_calls_provider_model
  ON "LLMCall"("provider", "model");

-- ─── Workflow Indexes ───────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workflows_is_active
  ON "Workflow"("isActive")
  WHERE "isActive" = true;

-- ─── Audit Log Indexes ─────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_log_actor
  ON "AuditLog"("actor");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_log_created_at
  ON "AuditLog"("createdAt");

-- ─── Analyze Table Statistics ─────────────────────────────────────────────
ANALYZE "Session";
ANALYZE "Execution";
ANALYZE "Message";
ANALYZE "LLMCall";
ANALYZE "AuditLog";
ANALYZE "Workflow";
ANALYZE "RoutingDecision";
