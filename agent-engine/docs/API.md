# Agent编排引擎 — API Reference

> Version: 0.1.0  
> Base URL: `http://localhost:3000` (local)  
> Production: `https://api.agent-engine.internal`

---

## Table of Contents

- [Authentication](#authentication)
- [Health](#health)
- [Agents](#agents)
- [Sessions](#sessions)
- [Executions](#executions)
- [Messages](#messages)
- [LLM Calls](#llm-calls)
- [Workflows](#workflows)
- [Routing](#routing)
- [Audit Logs](#audit-logs)

---

## Authentication

> All API endpoints require an `X-API-Key` header.
> Obtain your API key from the dashboard or via `POST /auth/token`.

```
X-API-Key: <your-api-key>
```

---

## Health

### GET /health

Health check endpoint for load balancers and orchestration.

**Response `200 OK`**

```json
{
  "ok": true,
  "redis": true,
  "database": true,
  "version": "0.1.0",
  "uptime": 3600
}
```

---

## Agents

### POST /api/agents

Create a new agent.

**Request Body**

```json
{
  "name": "coding-agent-01",
  "type": "coder",
  "config": {
    "model": "claude-sonnet-4-20250514",
    "maxTokens": 8192,
    "temperature": 0.7
  }
}
```

**Response `201 Created`**

```json
{
  "id": "clxkj2w3i000008f0abc1234",
  "name": "coding-agent-01",
  "type": "coder",
  "config": { ... },
  "createdAt": "2026-04-25T00:00:00.000Z",
  "updatedAt": "2026-04-25T00:00:00.000Z"
}
```

### GET /api/agents

List all agents.

**Query Parameters**

| Parameter | Type    | Default | Description           |
|-----------|---------|---------|-----------------------|
| `type`    | string  | —       | Filter by agent type  |
| `limit`   | integer | 50      | Max results (1-100)   |
| `offset`  | integer | 0       | Pagination offset     |

### GET /api/agents/:id

Get agent by ID.

### PATCH /api/agents/:id

Update agent configuration.

### DELETE /api/agents/:id

Soft-delete an agent (marks as inactive).

---

## Sessions

### POST /api/sessions

Create a new agent session.

**Request Body**

```json
{
  "agentId": "clxkj2w3i000008f0abc1234",
  "parentId": null,
  "metadata": {
    "userId": "u_abc123",
    "channel": "feishu"
  }
}
```

**Response `201 Created`**

```json
{
  "id": "clxkj2w3i000008f0abc5678",
  "agentId": "clxkj2w3i000008f0abc1234",
  "parentId": null,
  "metadata": { ... },
  "createdAt": "2026-04-25T00:01:00.000Z",
  "endedAt": null
}
```

### GET /api/sessions/:id

Get session details including executions and messages.

### GET /api/sessions/:id/messages

Get all messages in a session.

**Query Parameters**

| Parameter | Type    | Default | Description               |
|-----------|---------|---------|---------------------------|
| `role`    | string  | —       | Filter by role            |
| `limit`   | integer | 50      | Max results (1-200)       |
| `before`  | string  | —       | Cursor (message ID)       |

### POST /api/sessions/:id/end

End a session.

**Request Body**

```json
{
  "reason": "task_completed"
}
```

---

## Executions

### POST /api/executions

Create and start a new execution.

**Request Body**

```json
{
  "sessionId": "clxkj2w3i000008f0abc5678",
  "agentId": "clxkj2w3i000008f0abc1234",
  "task": "帮我写一个用户登录的API接口"
}
```

**Response `201 Created`**

```json
{
  "id": "clxkj2w3i000008f0def9999",
  "sessionId": "clxkj2w3i000008f0abc5678",
  "agentId": "clxkj2w3i000008f0abc1234",
  "task": "帮我写一个用户登录的API接口",
  "status": "running",
  "startedAt": "2026-04-25T00:02:00.000Z",
  "endedAt": null,
  "durationMs": null,
  "result": null
}
```

### GET /api/executions/:id

Get execution status and result.

### GET /api/executions

List executions with filters.

**Query Parameters**

| Parameter   | Type    | Default | Description                    |
|-------------|---------|---------|--------------------------------|
| `sessionId` | string  | —       | Filter by session              |
| `agentId`   | string  | —       | Filter by agent                |
| `status`    | string  | —       | `pending`\|`running`\|`completed`\|`failed` |
| `limit`     | integer | 50      | Max results                     |
| `offset`    | integer | 0       | Pagination offset               |

### POST /api/executions/:id/cancel

Cancel a running execution.

---

## Messages

### POST /api/messages

Send a message in a session.

**Request Body**

```json
{
  "sessionId": "clxkj2w3i000008f0abc5678",
  "role": "user",
  "content": "帮我分析一下这个代码的性能问题"
}
```

### GET /api/messages/:id

Get message details including metadata.

---

## LLM Calls

### GET /api/llm-calls

Query LLM call logs.

**Query Parameters**

| Parameter   | Type    | Default | Description                    |
|------------|---------|---------|--------------------------------|
| `sessionId` | string  | —       | Filter by session              |
| `provider`  | string  | —       | `openai`\|`anthropic`\|`dify`   |
| `model`     | string  | —       | Model name                      |
| `status`    | string  | —       | `success`\|`error`\|`rate_limit` |
| `from`      | string  | —       | ISO datetime start              |
| `to`        | string  | —       | ISO datetime end                |
| `limit`     | integer | 50      | Max results                     |

### GET /api/llm-calls/stats

Get aggregated LLM usage statistics.

```json
{
  "totalCalls": 1234,
  "totalTokens": 567890,
  "avgLatencyMs": 342,
  "byProvider": {
    "anthropic": { "calls": 800, "tokens": 400000, "avgLatencyMs": 520 },
    "openai": { "calls": 434, "tokens": 167890, "avgLatencyMs": 180 }
  }
}
```

---

## Workflows

### POST /api/workflows

Create a workflow definition.

**Request Body**

```json
{
  "name": "用户问题处理流程",
  "description": "自动路由并处理用户技术问题",
  "definition": {
    "nodes": [
      { "id": "n1", "type": "router", "config": { "strategy": "hierarchical" } },
      { "id": "n2", "type": "agent", "config": { "agentType": "coder" } },
      { "id": "n3", "type": "agent", "config": { "agentType": "pm" } }
    ],
    "edges": [
      { "from": "n1", "to": "n2", "condition": "scene=coding" },
      { "from": "n1", "to": "n3", "condition": "scene=pm" }
    ]
  }
}
```

### GET /api/workflows

List all workflows.

### GET /api/workflows/:id

Get workflow details with steps.

### PATCH /api/workflows/:id

Update workflow definition.

### POST /api/workflows/:id/activate

Activate a workflow.

### POST /api/workflows/:id/deactivate

Deactivate a workflow.

---

## Routing

### POST /api/route

Route a user query to the appropriate scene/agent.

**Request Body**

```json
{
  "query": "我的服务器CPU占用很高怎么办",
  "context": {
    "sessionId": "clxkj2w3i000008f0abc5678",
    "userId": "u_abc123"
  }
}
```

**Response `200 OK`**

```json
{
  "sceneId": "scene_tech_analyst",
  "sceneName": "tech-analyst",
  "confidence": 0.92,
  "layer": 2,
  "reasoning": "Query contains technical keywords (CPU, server)...",
  "layerScores": {
    "keyword": 0.85,
    "llm_intent": 0.92,
    "vector": 0.88
  },
  "processingTimeMs": 45
}
```

### GET /api/routing/decisions

Query routing decision history.

**Query Parameters**

| Parameter    | Type    | Default | Description           |
|-------------|---------|---------|-----------------------|
| `sceneId`    | string  | —       | Filter by scene       |
| `sessionId`  | string  | —       | Filter by session     |
| `from`       | string  | —       | ISO datetime start    |
| `to`         | string  | —       | ISO datetime end       |
| `limit`      | integer | 50      | Max results            |

---

## Audit Logs

### GET /api/audit-logs

Query audit logs.

**Query Parameters**

| Parameter   | Type    | Default | Description           |
|------------|---------|---------|-----------------------|
| `actor`     | string  | —       | `agent`\|`user`\|`system` |
| `action`    | string  | —       | Action type           |
| `resource`  | string  | —       | Resource type         |
| `from`      | string  | —       | ISO datetime start    |
| `to`        | string  | —       | ISO datetime end       |
| `limit`     | integer | 50      | Max results            |

---

## Error Responses

All errors follow this format:

```json
{
  "error": {
    "code": "AGENT_NOT_FOUND",
    "message": "Agent with ID 'abc' not found",
    "details": {}
  }
}
```

### Common Error Codes

| HTTP Status | Code                    | Description                          |
|-------------|-------------------------|--------------------------------------|
| 400         | `VALIDATION_ERROR`      | Request body validation failed       |
| 401         | `UNAUTHORIZED`          | Missing or invalid API key            |
| 403         | `FORBIDDEN`             | Insufficient permissions              |
| 404         | `NOT_FOUND`             | Resource not found                    |
| 409         | `CONFLICT`              | Resource already exists               |
| 429         | `RATE_LIMITED`          | Too many requests                     |
| 500         | `INTERNAL_ERROR`        | Unexpected server error               |
| 503         | `SERVICE_UNAVAILABLE`   | Redis or PostgreSQL unreachable       |

---

## Rate Limits

| Tier  | Requests/min | Burst |
|-------|-------------|-------|
| Free  | 60          | 10    |
| Pro   | 600         | 50    |
| Enterprise | unlimited | —   |

Rate limit headers are included in all responses:

```
X-RateLimit-Limit: 600
X-RateLimit-Remaining: 599
X-RateLimit-Reset: 1713987600
```
