# Agent编排引擎 Frontend

Next.js 14 前端项目

## 项目结构

```
frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout
│   │   ├── page.tsx            # Root redirect to /scenes
│   │   ├── globals.css         # Tailwind CSS
│   │   ├── scenes/page.tsx    # P1-T61: 场景管理 UI
│   │   ├── execute/page.tsx   # P1-T62: Agent 执行测试界面
│   │   ├── results/
│   │   │   ├── page.tsx       # P1-T63: 执行记录列表
│   │   │   └── [executionId]/page.tsx  # P1-T63: 执行结果展示面板
│   │   └── health/page.tsx    # 系统健康检查
│   ├── components/
│   │   ├── nav-bar.tsx        # 导航栏
│   │   ├── scene-form.tsx      # 场景表单
│   │   ├── scene-list.tsx     # 场景列表
│   │   ├── use-toast.ts       # Toast 通知
│   │   └── ui/                # UI 基础组件
│   │       ├── button.tsx
│   │       ├── input.tsx
│   │       └── textarea.tsx
│   ├── trpc/
│   │   ├── server.ts          # P1-T64: tRPC Server Router
│   │   ├── client.tsx         # P1-T64: tRPC Client
│   │   └── provider.tsx       # P1-T64: React Query + tRPC Provider
│   ├── lib/
│   │   ├── api.ts             # REST API 客户端 (SSE 支持)
│   │   └── utils.ts           # 工具函数
│   └── types/
│       └── index.ts           # TypeScript 类型定义
├── package.json
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
└── postcss.config.js
```

## 安装

```bash
cd frontend
npm install --registry https://registry.npmjs.org
```

## 开发

```bash
npm run dev
# 访问 http://localhost:3000
```

## 依赖

- Next.js 14.2.29
- React 18.3.1
- tRPC 10.45.x + React Query v4
- Tailwind CSS
- Recharts (质量分雷达图)
- Lucide React (图标)

## API 路由

前端通过 Next.js rewrites 代理到后端:

- `/api/trpc/*` → `http://localhost:3001/api/trpc/*`
- `/api/*` → `http://localhost:3001/api/*`

## 页面说明

### /scenes (P1-T61)
场景管理 — CRUD 操作、表单验证、路由规则配置

### /execute (P1-T62)
Agent 执行测试 — 输入技术描述 → SSE 实时显示执行状态

### /results (P1-T63)
执行记录列表 + `/results/[executionId]` 详情页（4 个专家 Agent 输出、质量分雷达图、执行时间线）

### /health
系统健康检查 (Redis + PostgreSQL)
