# Agent编排引擎 — 系统架构文档

> Version: 0.1.0  
> Last Updated: 2026-04-25

---

## 1. 系统概览

Agent编排引擎是一个多Agent协同编排系统，支持分层路由、智能体编排、持久化会话和LLM调用管理。

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Layer                             │
│  (Feishu Bot / Web UI / API Client / MCP Client)                │
└─────────────────────────┬───────────────────────────────────────┘
                          │ HTTP / WebSocket
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API Gateway Layer                            │
│  (tRPC / REST Middleware / Auth / Rate Limiting)                 │
└─────────────────────────┬───────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
│   Router     │  │  Orchestrator │  │  Tool Executor   │
│  (Scene)     │  │   (CDAG)      │  │                  │
└──────┬───────┘  └──────┬───────┘  └────────┬─────────┘
       │                  │                    │
       └──────────────────┼────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    LLM Adapter Layer                             │
│  OpenAI Adapter │ Anthropic Adapter │ Dify Adapter              │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Infrastructure Layer                          │
│  PostgreSQL (Prisma)  │  Redis (Session/Cache/PubSub)            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. 核心模块

### 2.1 Scene Router（分层路由）

位于 `packages/scene-router/src/`

```
用户 Query
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  Layer 0: Keyword Match (同步, <1ms)                │
│  → 命中关键词 → 返回 scene + confidence             │
└──────────────────────┬──────────────────────────────┘
                       │ 未命中
                       ▼
┌─────────────────────────────────────────────────────┐
│  Layer 1: LLM Intent Classification (50-200ms)     │
│  → Claude/GPT-4 判断意图 → 返回 scene + confidence  │
└──────────────────────┬──────────────────────────────┘
                       │ 未命中或低置信度
                       ▼
┌─────────────────────────────────────────────────────┐
│  Layer 2: Vector Similarity (Qdrant, 10-50ms)      │
│  → embedding 匹配 → 返回 scene + similarity score  │
└──────────────────────┬──────────────────────────────┘
                       │ 未命中
                       ▼
┌─────────────────────────────────────────────────────┐
│  Layer 3: Fallback Agent (PM)                       │
│  → 兜底处理 → 人工转接或通用回复                      │
└─────────────────────────────────────────────────────┘
```

**关键类：**
- `HierarchicalSceneRouter` — 分层路由入口
- `LLMIntentRouter` — LLM意图分类
- `HybridMatch` — 混合匹配策略
- `RoutingLogger` — 路由决策日志

### 2.2 CDAG Orchestrator（任务编排引擎）

位于 `packages/core/src/cdag/`

CDAG = Context-aware Directed Acyclic Graph（上下文感知有向无环图）

```
Task
  │
  ▼
┌──────────────────────────────────────────────────────┐
│  CDAGExecutor                                          │
│  ├── LoopGuard ──→ 检测循环依赖，防止死循环           │
│  ├── ParallelNode ──→ 并行执行多个节点                 │
│  ├── RetryNode ──→ 失败重试（指数退避）               │
│  ├── ReflectNode ──→ 自我反思节点                     │
│  └── QualityScorer ──→ 输出质量评分                  │
└────────────────────────┬─────────────────────────────┘
                         ▼
                    Task Result
```

**关键类：**
- `CDAGExecutor` — CDAG 执行引擎
- `LoopGuard` — 循环检测
- `QualityScorer` — 质量评分（用于 MVP 验收评分）
- `RetryNode` — 重试策略

### 2.3 State Manager（状态管理）

位于 `packages/core/src/state/`

三级内存架构：

```
L1: Memory-L1 (内存 / Redis)
    └── 热点数据、活跃 session 上下文

L2: Memory-L2 (PostgreSQL)
    └── 历史会话、长期记忆

ContextWindowManager
    └── 控制 context window 大小，防止 token 溢出
    └── 动态压缩策略
```

### 2.4 LLM Adapter Layer（模型适配层）

位于 `packages/llm-adapters/src/`

```
┌─────────────────────────────────────┐
│         LLMProviderFactory          │
│   根据模型名称路由到对应 Adapter     │
└──────────┬──────────────────────────┘
           │
    ┌──────┼──────────────┐
    ▼      ▼              ▼
OpenAI  Anthropic      Dify
Adapter Adapter      Adapter
```

### 2.5 Expert Agents（专家智能体）

位于 `packages/expert-packages/`

| Agent        | 职责                  | 触发场景              |
|-------------|---------------------|---------------------|
| tech-analyst | 技术问题分析          | 服务器、代码、部署相关   |
| market-analyst | 市场数据分析        | 市场趋势、竞品分析      |
| scene-analyst | 场景分析和拆解        | 复杂任务分解           |
| content-director | 内容策略制定         | 营销、内容相关          |

---

## 3. 数据模型（Prisma Schema）

```
Agent
  └── Session (1:N)
        └── Execution (1:N)
        └── Message (1:N)
  └── Execution (1:N)

LLMCall ← 可选关联 Session

Workflow
  └── WorkflowStep (1:N)

RoutingDecision ← 路由决策日志（高性能写入表）

AuditLog ← 审计日志（只追加）
```

---

## 4. Redis 使用

| Key Pattern              | 类型   | TTL     | 用途                        |
|------------------------|--------|--------|---------------------------|
| `session:{id}`          | Hash   | 24h    | 活跃 session 数据            |
| `context:{sessionId}`    | String | 1h     | 实时上下文（conversation）    |
| `ratelimit:{key}`       | String | 1min   | 限流计数                    |
| `pubsub:agent_events`   | PubSub | —      | Agent 事件广播              |

---

## 5. API 架构

tRPC + REST 混合模式：

```
/health          → GET  (无鉴权)
/api/agents      → REST (CRUD)
/api/sessions    → REST (CRUD)
/api/executions  → REST (CRUD + cancel)
/api/route       → POST (路由决策)
/api/workflows   → REST (CRUD)
/api/llm-calls   → REST (只读查询)
/api/audit-logs  → REST (只读查询)
```

---

## 6. 部署架构

```
                    ┌─────────────────┐
                    │   CDN / WAF      │
                    │  (Cloudflare)    │
                    └────────┬────────┘
                             ▼
                    ┌─────────────────┐
                    │  Load Balancer   │
                    │   (Nginx/LB)     │
                    └────────┬────────┘
                             │
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
   │  Server #1  │    │  Server #2  │    │  Server #3  │
   │ (agent-eng) │    │ (agent-eng) │    │ (agent-eng) │
   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘
          │                  │                  │
          └──────────────────┼──────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
   │ PostgreSQL  │    │    Redis    │    │  Qdrant     │
   │  Primary    │    │   Cluster   │    │  (Vector)   │
   │  + Replica  │    │             │    │             │
   └─────────────┘    └─────────────┘    └─────────────┘
```

---

## 7. 关键设计决策

### 7.1 为什么用 CDAG 而不是简单 Chain？

- **循环检测**：Chain 无法检测循环依赖，CDAG 有 LoopGuard
- **并行优化**：CDAG 支持 ParallelNode，同时执行独立节点
- **质量评分**：CDAG 集成 QualityScorer，支持重试和反思

### 7.2 为什么三层路由？

- Layer 0（关键词）：同步 <1ms，覆盖20%简单查询
- Layer 1（LLM）：50-200ms，覆盖60%意图明确的查询
- Layer 2（向量）：10-50ms，覆盖15%复杂/模糊查询
- Layer 3（兜底）：人工/PM处理剩余5%

### 7.3 为什么 Prisma + Redis？

- Prisma：强类型 ORM，迁移友好，生态成熟
- Redis：L1 缓存 + PubSub + Session 存储，高性能

---

## 8. 性能指标目标

| 指标               | 目标值    | 说明                  |
|------------------|---------|---------------------|
| API P50 延迟       | <50ms   | 纯 API 响应          |
| API P99 延迟       | <500ms  | 含数据库查询          |
| 路由决策 P99 延迟   | <200ms  | 含 LLM 调用          |
| PostgreSQL 查询    | <100ms  | 100并发下            |
| 容器启动时间        | <30s    | healthcheck 通过     |
| 镜像大小            | <500MB  | Dockerfile.prod     |
| 测试覆盖率          | ≥60%    | CI/CD 要求           |
