# OneAgent

Copilot 式辅助 Agent 服务：角色注入、本地 Skills、CLI 与 HTTP API。推理内核复用 [SpAgent](../SpAgent)（`core-agent`）。

## 快速开始

```bash
cd OneAgent
npm install
npm run verify          # typecheck + test + smoke
./scripts/start.sh      # 启动 HTTP :8790
curl http://127.0.0.1:8790/healthz
```

## CLI

```bash
# 单次执行
ONEAGENT_MOCK_MODE=true npx oneagent run --agent reviewer --goal "审阅 README"

# 交互对话
ONEAGENT_MOCK_MODE=true npx oneagent chat --agent copilot

# 启动服务
npx oneagent serve --port 8790

# Profile / Skills 管理
npx oneagent agents list
npx oneagent skills list
npx oneagent config

# MCP Server（stdio）
ONEAGENT_MOCK_MODE=true npx oneagent mcp serve
```

## HTTP API

| 端点 | 说明 |
|------|------|
| `GET /healthz` | 健康检查 |
| `GET /v1/agents` | 列出 Agent Profile |
| `GET /v1/agents/:id` | Profile 详情 |
| `POST /v1/agents/:id/run` | 同步执行 |
| `POST /v1/agents/:id/stream` | SSE 流式 |
| `POST /v1/chat` | Copilot 多轮 |

Sidecar 模式下 `stream` 支持转发 SpAgent SSE（kernel tier）。

```bash
curl -X POST http://127.0.0.1:8790/v1/agents/reviewer/run \
  -H 'Content-Type: application/json' \
  -d '{"tier":"standalone","task":{"goal":"审阅文档","actor":{"userId":"u1"},"metadata":{"personaOverrides":{"style.tone":"严谨"}}}}'
```

请求体支持 `tier`：`standalone` | `kernel` | `auto`（可省略，按 Profile 规则路由）。

## 配置

默认读取 `./oneagent.config.yaml`，支持 `${ENV_VAR}` 替换。

- `OPENAI_API_KEY` — 真实模型推理
- `ONEAGENT_MOCK_MODE=true` — 无 Key 时 Mock 响应
- `ONEAGENT_TOKEN` — HTTP Bearer 鉴权
- `ONEAGENT_AUTO_APPROVE=true` — 开发环境自动审批

## 目录

```text
agents/     Agent Profile (YAML)
skills/     本地 SKILL.md
src/        源码
guide/      设计文档
scripts/    start / stop / verify
```

## 文档

- [guide/ 文档索引](./guide/README.md)
- [方案设计](./guide/方案设计.md)
- [双轨执行架构](./guide/双轨执行架构.md)
- [Agent Profile 规范](./guide/AgentProfile规范.md)
- [集成指南](./guide/集成指南.md)

## 双轨执行

| tier | 说明 |
|------|------|
| `standalone` | OneAgent 自身：Persona + Skills + 单轮 LLM |
| `kernel` | SpAgent 内核：工具循环、联邦、审批 |
| `auto` | 按 Profile 规则自动路由 |

```bash
# 简单场景
npx oneagent run --agent copilot --tier standalone --goal "解释 REST 和 GraphQL 区别"

# 复杂场景
npx oneagent run --agent planner --tier kernel --goal "拆解发布流程并检索知识库"
```
