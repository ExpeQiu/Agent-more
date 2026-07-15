# 合并项目部署验证检查清单

> 对应 Cocreator 后端 Phase 1-4 合并部署
> 执行日期：2026-05-06

---

## 一、路由注册验证

### 后端 API 路由
```bash
cd /Volumes/Lexar/git/01\ idea/Cocreator/backend

# 启动后端（如未启动）
npm run dev

# 验证路由注册
curl http://localhost:3001/api/v1/chat/sessions
# 期望：200 OK 或 [] 空数组

curl http://localhost:3001/api/v1/chat
# 期望：200 OK

curl http://localhost:3001/api/v1/compare
# 期望：200 OK

curl http://localhost:3001/api/v1/agents
# 期望：200 OK 或 [] 空数组

curl http://localhost:3001/api/v1/agent-sessions
# 期望：200 OK

curl http://localhost:3001/api/v1/discussions
# 期望：200 OK

curl http://localhost:3001/api/v1/discussions/participants
# 期望：200 OK

curl http://localhost:3001/api/v1/discussions/votes
# 期望：200 OK

curl http://localhost:3001/api/v1/health
# 期望：{"status":"ok","version":"0.2.0",...}
```

### 路由注册检查
```bash
# 确认 index.ts 已注册以下路由
grep -n "chat/sessions\|chat\|compare\|agents\|agent-sessions\|discussions" \
  /Volumes/Lexar/git/01\ idea/Cocreator/backend/src/index.ts
```

---

## 二、数据库迁移验证

### 2.1 Prisma Schema 验证
```bash
cd /Volumes/Lexar/git/01\ idea/Cocreator/backend

# 验证 schema 语法正确
npx prisma validate

# 生成 Prisma Client
npx prisma generate
```

### 2.2 数据库迁移
```bash
# 开发环境（会创建迁移历史）
npx prisma migrate dev --name add_phase1_chat_compare

# 生产环境
npx prisma migrate deploy
```

### 2.3 如 Prisma 有冲突，强制同步
```bash
# ⚠️ 警告：会丢失数据，仅开发环境使用
npx prisma db push --accept-data-loss
```

### 2.4 验证新表是否创建
```bash
# 打开数据库编辑器
npx prisma studio

# 手动检查以下表是否存在：
# - AgentDefinition
# - DiscussionSession
# - DiscussionParticipant
# - DiscussionVote
# - DiscussionRoundScore
# - CompareRun
# - ConversationSession 新增字段（moduleType, sessionMode, selectedModels, discussionConfig）
# - ConversationMessage 新增字段（modelId, provider, agentId, roundIndex, turnIndex, ...）
# - SkillExecution 新增字段（sourceType, conversationId, agentId, traceId, ...）
```

---

## 三、环境变量验证

### 3.1 必需变量检查
```bash
grep -E "OPENAI_API_KEY|DEEPSEEK_API_KEY|ANTHROPIC_API_KEY|DASHSCOPE_API_KEY|MINIMAX_API_KEY|GLM_API_KEY|GOOGLE_API_KEY" \
  /Volumes/Lexar/git/01\ idea/Cocreator/backend/.env
```

### 3.2 LLM Provider 适配器验证
```bash
# 检查适配器文件是否存在
ls /Volumes/Lexar/git/01\ idea/Cocreator/backend/src/modules/llm-gateway/adapters/
# 期望看到：openai.adapter.ts, anthropic.adapter.ts, deepseek.adapter.ts, 
#          google.adapter.ts, dashscope.adapter.ts, minimax.adapter.ts, 
#          glm.adapter.ts, ollama.adapter.ts
```

---

## 四、前端导航验证

### 4.1 页面文件检查
```bash
# 检查前端路由文件
ls /Volumes/Lexar/git/01\ idea/Cocreator/frontend/src/app/\(main\)/projects/\[id\]/ai-chat/ 2>/dev/null && echo "✅ ai-chat 页面存在"
ls /Volumes/Lexar/git/01\ idea/Cocreator/frontend/src/app/\(main\)/projects/\[id\]/agent-console/ 2>/dev/null && echo "✅ agent-console 页面存在"
ls /Volumes/Lexar/git/01\ idea/Cocreator/frontend/src/app/\(main\)/projects/\[id\]/discussion/ 2>/dev/null && echo "✅ discussion 页面存在"
```

### 4.2 布局 Tab 检查
```bash
# 检查 _project-layout.tsx 或 ProjectLayoutShell.example.tsx 是否包含关键入口
grep -n "AI对话\|手动Agent\|多Agent讨论\|ProjectLayoutShell" \
  /Volumes/Lexar/git/01\ idea/Cocreator/frontend/ 2>/dev/null
```

---

## 五、LLM Gateway 集成验证

### 5.1 单模型对话测试
```bash
curl -X POST http://localhost:3001/api/v1/chat/stream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -d '{
    "projectId": "<PROJECT_ID>",
    "modelId": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
# 期望：SSE 流响应
```

### 5.2 多模型对比测试
```bash
curl -X POST http://localhost:3001/api/v1/compare/sessions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -d '{
    "projectId": "<PROJECT_ID>",
    "modelIds": ["gpt-4o", "claude-4.6-sonnet"],
    "prompt": "解释量子计算"
  }'
# 期望：并发返回两个模型的 SSE 流
```

### 5.3 Discussion 创建测试
```bash
curl -X POST http://localhost:3001/api/v1/discussions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -d '{
    "projectId": "<PROJECT_ID>",
    "topic": "测试讨论主题",
    "mode": "round-robin",
    "maxRounds": 3,
    "participantAgentIds": ["agent-tech-expert", "agent-pm"]
  }'
# 期望：201 Created，返回 DiscussionSession
```

---

## 六、冲突排查流程

| 问题 | 排查步骤 |
|------|---------|
| 路由 404 | 确认 index.ts 已 import 并 app.use() 注册路由 |
| 数据库报错 | 确认 migration 已执行，npx prisma migrate deploy |
| Import 报错 | 确认文件路径正确，TS config paths 正确 |
| 前端页面空白 | 检查 Next.js 路由文件是否存在，ProjectLayoutShell 是否已正确接入 |
| API 调用失败 | 检查 .env 中 API Key 是否配置 |
| 模型无法调用 | 确认对应适配器的 API Key 已填入 .env |
| SSE 无响应 | 检查 authMiddleware 是否正确传递 request |

---

## 七、快速部署命令汇总

```bash
# 1. 路由注册（已完成后检查）
grep -n "chat/sessions\|chat\|compare\|agents" \
  /Volumes/Lexar/git/01\ idea/Cocreator/backend/src/index.ts

# 2. 数据库迁移
cd /Volumes/Lexar/git/01\ idea/Cocreator/backend
npx prisma migrate dev --name add_phase1_chat_compare

# 3. 重启后端
npm run dev

# 4. 健康检查
curl http://localhost:3001/api/v1/health

# 5. Prisma Studio（如需手动检查数据）
npx prisma studio
```
