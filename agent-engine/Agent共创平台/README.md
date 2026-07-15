# Multi Chat Studio

> 独立版多模型对话、Compare、Agent 控制台与多 Agent 讨论项目

## 当前定位

- 该目录现在作为独立新项目使用，不再依赖 `Cocreator` 主仓。
- 前端采用 `Next.js App Router`，后端采用 `Express + Prisma + SQLite`。
- 现有业务代码已保留，工程脚手架已补齐为可独立继续开发的形态。

## 目录结构

```
合并项目/
├── package.json
├── pnpm-workspace.yaml
├── README.md
├── 架构设计文档.md
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── prisma/schema.prisma
│   └── src/
│       ├── index.ts
│       ├── config/database.ts
│       ├── middleware/auth.ts
│       ├── modules/llm-gateway/
│       │   ├── types.ts
│       │   └── adapters/
│       │       ├── google.adapter.ts
│       │       ├── minimax.adapter.ts
│       │       ├── dashscope.adapter.ts
│       │       ├── glm.adapter.ts
│       │       └── ollama.adapter.ts
│       └── routes/
│           ├── chat.ts
│           ├── compare.ts
│           ├── agents.ts
│           ├── discussions.ts
│           └── ...
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── app/
│       │   ├── layout.tsx
│       │   ├── page.tsx
│       │   └── (main)/projects/[id]/
│       │       ├── layout.tsx
│       │       ├── page.tsx
│       │       ├── ai-chat/page.tsx
│       │       ├── agent-console/page.tsx
│       │       └── discussion/page.tsx
│       ├── lib/
│       │   ├── api/client.ts
│       │   ├── runtime-config.ts
│       │   └── utils.ts
│       ├── stores/projectStore.ts
│       ├── components/ui/
│       └── features/
│           ├── ai-chat/
│           ├── agent-console/
│           └── discussion/
└── backend/prisma/schema-patch.sql
```

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

复制后端环境变量模板：

```bash
cp backend/.env.example backend/.env
```

至少确认以下字段：

```env
DATABASE_URL="file:./dev.db"
PORT=3001
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
```

### 3. 初始化数据库

```bash
cd backend
pnpm prisma:generate
pnpm prisma:push
```

### 4. 启动服务

```bash
pnpm dev:backend
pnpm dev:frontend
```

或使用脚本（日志在 `.logs/`）：

```bash
bash scripts/start.sh
bash scripts/stop.sh
```

若出现 `/_next/static/...` 404、页面高度异常：多为端口上残留旧 `next dev`。先执行 `bash scripts/stop.sh`，再 `rm -rf frontend/.next` 后重新 `bash scripts/start.sh`（或根目录 `./stop.sh` / `./start.sh`）。

一键验证（Prisma + 前后端 build）：

```bash
pnpm verify
# 或
bash scripts/verify.sh
```

前端 API 基址可参考 `frontend/.env.example` 复制为 `frontend/.env.local`。

默认访问：

- 前端：`http://localhost:3000`
- 后端：`http://localhost:3001`
- 示例项目页：`http://localhost:3000/projects/demo/ai-chat`

## 核心能力

### 1. 单模型对话（Single Mode）
- 选择一个模型进行对话
- 经典聊天界面

### 2. 模型对比（Compare Mode）
- 选择 2 个模型并行回答
- 左右并排展示各模型回复
- 来自 muiltchat 的核心能力

### 3. Agent 讨论（Agent Discussion Mode）
- 用户手动选择 2-5 个 Agent 角色
- 每个 Agent 以其角色身份作答
- 内置角色：技术专家、产品经理、竞品分析师、质疑者、综合分析师
- 支持追加讨论

## 关键接口

- `GET /health`
- `GET /api/v1/projects/:id`
- `GET /api/v1/chat/models`
- `POST /api/v1/chat/stream`
- `POST /api/v1/compare/:sessionId/runs/stream`
- `POST /api/v1/agents/execute`
- `POST /api/v1/discussions`

## 当前边界

- 依赖与构建请以 `pnpm verify` 本地结果为准；仓库仅使用 `pnpm-lock.yaml`（勿提交 `package-lock.json`）。
- 讨论模块历史上存在 SQLite 与其它方言混用，路由层已以 Prisma 为主；若仍有裸 SQL 需逐步收敛。
- 交付前建议流程：`pnpm install` → `backend` 下 `pnpm prisma:push` → `pnpm verify` → 联调。
