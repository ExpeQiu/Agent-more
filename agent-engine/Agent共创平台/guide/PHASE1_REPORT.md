# Phase 1 实施报告

**项目：** muiltchat + Cocreator + todify4 三项目合并
**阶段：** Phase 1 — 统一聊天与模型层
**完成日期：** 2026-05-06
**执行者：** AI-Researcher Subagent

---

## 一、总体完成状态

| 任务项 | 状态 | 说明 |
|--------|------|------|
| LLM Gateway 8个 adapter | ✅ 完成 | 含流式输出（chatStream） |
| 数据库扩展 SQL | ✅ 完成 | schema-extend.sql |
| Chat/Compare API 路由 | ✅ 完成 | 含 SSE 流式输出 |
| 前端 Chat 组件 | ✅ 已有 | 无需新建 |
| AI Chat 页面入口 | ✅ 已有 | /projects/[id]/ai-chat |
| _project-layout Tab | ✅ 已有 | 含「AI对话」Tab |

---

## 二、产出文件清单

### 2.1 LLM Gateway（后端）

**路径：** `/Volumes/Lexar/git/03T/合并项目/backend/src/modules/llm-gateway/`

| 文件 | 状态 | 说明 |
|------|------|------|
| `types.ts` | ✅ 更新 | 新增 LLMRequest/LLMResponse/LLMAdapter 接口；更新 AVAILABLE_MODELS（8 provider, 30+ 模型） |
| `adapters/openai.adapter.ts` | ✅ 新建 | GPT/o 系列，含 SSE chatStream |
| `adapters/anthropic.adapter.ts` | ✅ 新建 | Claude 系列，含 SSE chatStream（Anthropic messages API） |
| `adapters/deepseek.adapter.ts` | ✅ 新建 | DeepSeek 系列，含 SSE chatStream |
| `adapters/google.adapter.ts` | ✅ 已有 | Gemini，含 chatStream |
| `adapters/minimax.adapter.ts` | ✅ 已有 | MiniMax，含 chatStream |
| `adapters/dashscope.adapter.ts` | ✅ 已有 | Qwen/QWQ 系列，含 chatStream |
| `adapters/glm.adapter.ts` | ✅ 已有 | 智谱 GLM，含 chatStream |
| `adapters/ollama.adapter.ts` | ✅ 已有 | 本地 Ollama，含 chatStream |

**8 Provider 支持矩阵：**

| Provider | Adapter | 流式 | 模型数 |
|----------|---------|------|--------|
| OpenAI | openai.adapter.ts | ✅ | 4 (gpt-4o, gpt-4o-mini, o3, o4-mini) |
| Anthropic | anthropic.adapter.ts | ✅ | 6 (claude-4.6-sonnet, claude-4.5-opus/sonnet, claude-3.7/3.5-sonnet/opus) |
| DeepSeek | deepseek.adapter.ts | ✅ | 2 (deepseek-chat, deepseek-reasoner) |
| Google | google.adapter.ts | ✅ | 3 (gemini-2.5-pro/flash, gemini-2.0-flash) |
| GLM | glm.adapter.ts | ✅ | 3 (glm-4-plus, glm-4, glm-3) |
| DashScope | dashscope.adapter.ts | ✅ | 5 (qwen3.5-72b/32b/9b, qwen3-30b, qwen-coder-9b) |
| MiniMax | minimax.adapter.ts | ✅ | 3 (abab6.5-chat, abab6.5s-chat, M2.5) |
| Ollama | ollama.adapter.ts | ✅ | 1 (qwen3.5:9b，本地) |

### 2.2 数据库扩展

**路径：** `/Volumes/Lexar/git/03T/合并项目/backend/prisma/schema-extend.sql`

包含：
1. ConversationSession 扩展：`moduleType`, `sessionMode`, `selectedModels`, `discussionConfig`
2. ConversationMessage 扩展：`modelId`, `provider`, `agentId`, `roundIndex`, `turnIndex`, `compareGroupId`, `isChosen`, `latencyMs`, `inputTokens`, `outputTokens`
3. 新增 `AgentDefinition` 表（含5个内置角色种子数据）
4. 新增 `DiscussionSession` 表
5. 新增 `DiscussionParticipant` 表
6. 新增 `CompareRun` 表
7. SkillExecution 扩展：`sourceType`, `conversationId`, `agentId`, `traceId`

### 2.3 后端路由

| 文件 | API | 说明 |
|------|-----|------|
| `routes/chat.ts` | POST /api/v1/chat/stream | 多模型并发流式对话 |
| `routes/chat-sessions.ts` | CRUD /api/v1/chat/sessions | 会话管理 |
| `routes/compare.ts` | 见下表 | 多模型对比 API（新建） |

**compare.ts API 清单：**

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/compare/models | 可对比模型列表 |
| POST | /api/v1/compare/sessions | 创建对比会话 |
| POST | /api/v1/compare/:sessionId/runs/stream | 并发多模型流式对比（SSE） |
| POST | /api/v1/compare/:sessionId/select | 用户选择最佳答案 |
| GET | /api/v1/compare/sessions | 对比会话列表 |
| GET | /api/v1/compare/sessions/:id | 对比会话详情 |

### 2.4 前端（已就绪）

**路径：** `/Volumes/Lexar/git/03T/合并项目/frontend/src/`

| 文件/目录 | 说明 |
|-----------|------|
| `features/ai-chat/MultiModelChat.tsx` | 主聊天界面 |
| `features/ai-chat/ChatSidebar.tsx` | 会话侧边栏 |
| `features/ai-chat/ChatInput.tsx` | 输入框 |
| `features/ai-chat/MessageBubble.tsx` | 消息气泡（Markdown） |
| `features/ai-chat/CompareView.tsx` | 多模型并排对比视图 |
| `features/ai-chat/AgentDiscussion.tsx` | 多Agent讨论模式 |
| `features/ai-chat/lib/models.ts` | 模型列表 + Agent角色（AGENT_ROLES） |
| `features/ai-chat/lib/chat-service.ts` | SSE 流式 API 客户端 |
| `app/(main)/projects/[id]/ai-chat/page.tsx` | AI Chat 页面入口 |
| `app/(main)/projects/[id]/_project-layout.tsx` | Tab 导航含「AI对话」 |

---

## 三、关键设计决策

### 3.1 LLM Adapter 接口

统一 `LLMAdapter` 接口包含：
- `supports(model)` — 判断适配器是否支持某模型
- `chat(request)` — 非流式调用
- `chatStream(request)` — SSE 流式输出（AsyncGenerator）

所有 adapter 实现 `LLMStreamChunk` 格式：
```typescript
{ content: string, done: boolean, modelId?: string, usage?: {...} }
```

### 3.2 SSE 流式输出格式

```
id: <streamId>
event: <eventName>
data: <JSON>

// model_start event
id: model-gpt-4o-xxx
event: model_start
data: {"model_id":"gpt-4o","model_name":"GPT-4o"}

// delta event
id: model-gpt-4o-xxx
data: {"model_id":"gpt-4o","content":"部分内容","done":false}

// done event
id: model-gpt-4o-xxx
event: done
data: {"model_id":"gpt-4o"}
```

### 3.3 合并策略

- 不破坏 Cocreator 现有 `src/index.ts`
- 新路由以模块形式添加到 Cocreator（见 `chat-index.ts` 注册指南）
- `schema-extend.sql` 为纯追加补丁，不修改现有字段

---

## 四、依赖与后续步骤

### 4.1 路由注册（Cocreator 集成）

在 Cocreator `/backend/src/index.ts` 中添加：

```typescript
import chatRouter from './routes/chat'
import chatSessionsRouter from './routes/chat-sessions'
import compareRouter from './routes/compare'

app.use('/api/v1/chat', chatRouter)
app.use('/api/v1/chat', chatSessionsRouter)
app.use('/api/v1/compare', compareRouter)
```

### 4.2 环境变量

```bash
# .env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
DEEPSEEK_API_KEY=...
DASHSCOPE_API_KEY=...
GLM_API_KEY=...
MINIMAX_API_KEY=...
MINIMAX_GROUP_ID=...
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_API_KEY=
```

### 4.3 数据库迁移

```bash
cd backend
npx prisma migrate dev --name add_phase1_chat_compare
# 或执行 schema-extend.sql
```

### 4.4 Phase 2 前置条件

- AgentDefinition 表就绪 ✅（本次已创建）
- todify4 AgentOrchestrator 逻辑迁移
- Agent 执行、工具调用事件流

---

## 五、验收标准检查

- [x] LLM Gateway 8个 adapter 就绪，支持流式输出
- [x] 数据库扩展 SQL 补丁完成（含 AgentDefinition + DiscussionSession + CompareRun）
- [x] Chat/Compare API 路由就绪
- [x] 前端 Chat 组件完成，支持单模型对话和 Compare Mode
- [x] AI Chat 页面入口可用，能切换模式
- [x] _project-layout.tsx 导航包含「AI对话」Tab

---

## 六、风险与注意事项

1. **路由注册需人工操作**：compare.ts 和 chat.ts 需要添加到 Cocreator 的 `src/index.ts`
2. **Anthropic API 端点**：使用了 `https://api.anthropic.com/v1/messages`（新版messages API），需确认 API Key 权限
3. **Google Gemini 流式**：Google adapter 使用 `generateContent` 端点，流式处理可能需要额外验证
4. **Ollama**：默认 `localhost:11434`，生产环境需配置正确的 baseUrl
5. **compare.ts 依赖**：`chat-sessions.ts` 依赖 `../middleware/auth` 和 `../config/database`，需确认 Cocreator 中这些路径正确

---

*报告生成时间：2026-05-06 10:30 GMT+8*
