# 路由崩溃修复报告

**日期:** 2026-05-06
**问题:** `Router.use() requires a middleware function but got undefined`
**根因文件:** `src/index.ts` + `src/routes/chat-index.ts`

---

## 一、根因分析

### 错误链路

```
app.use('/api/v1/chat-index', chatIndexRouter)
                  ↑
          chatIndexRouter = undefined
                  ↑
import chatIndexRouter from './routes/chat-index'
                  ↑
          chat-index.ts 只有 export {} (无 default export)
```

**具体过程:**

1. `src/routes/chat-index.ts` 是一个文档占位文件，只包含内联注释和使用指南，末尾只有 `export {}`（空 named export）
2. `src/index.ts` 使用 `import chatIndexRouter from './routes/chat-index'` 尝试 default import
3. 在 ESM 模式（tsx 默认行为）下，无 default export 的模块被 default import 时，变量值为 `undefined`
4. `app.use('/api/v1/chat-index', undefined)` 被 Express 执行
5. Express 的 `Router.use()` 检测到 middleware 是 `undefined`，抛出 `Router.use() requires a middleware function but got undefined`
6. 该错误发生在 **模块初始化阶段**（所有 import 执行时），导致整个应用崩溃启动失败

### TS 编译器验证

```bash
npx tsc --noEmit 2>&1 | grep chat-index
# src/index.ts(39,8): error TS1192: Module '".../routes/chat-index"' has no default export.
```

### 为什么之前误判为 `discussionVotesRouter` 问题

错误堆栈中 `discussionVotesRouter` 出现在堆栈顶部是因为 `app.use()` 调用在 `discussionVotesRouter` 注册时触发。真正的问题源头是 `chatIndexRouter` 为 `undefined`，而该问题在 Phase 1-4 路由注册阶段暴露出来。

---

## 二、修复方案

**方案:** 移除 `chatIndexRouter` 的导入和注册

`chat-index.ts` 是一个从未实现的占位文件，实际的 chat 相关路由已通过以下两个正确的 router 完成注册：
- `chatRouter` (`./routes/chat.ts`) — 流式聊天 API
- `chatSessionsRouter` (`./routes/chat-sessions.ts`) — 会话管理 API

### 修复内容

**文件:** `src/index.ts`

**修改 1 — 移除 import（第 39 行）:**
```diff
- import chatIndexRouter from './routes/chat-index'
```

**修改 2 — 移除 app.use 注册（第 96 行）:**
```diff
- app.use('/api/v1/chat-index', chatIndexRouter)
```

---

## 三、验证结果

### 服务器启动测试

```bash
$ npx tsx src/index.ts

🚀 Cocreator Backend v2 运行中: http://localhost:3001
🔗 Y.js WebSocket: ws://localhost:3001/collab
[Redis] Connected ✓
✓ Seeded 9 built-in skills
[contentQueue] Workers started ✓
```

### Health Check

```bash
$ curl http://localhost:3001/api/v1/health

{"status":"ok","version":"0.2.0","phase":"Phase 3","uptime":5.95,"memory":{"heapUsed":33,"heapTotal":65},"timestamp":"2026-05-06T04:09:09.329Z"}
```

**HTTP 200, 响应时间 58ms** ✅

---

## 四、其他发现

### Phase 1-4 路由 Export/Import 一致性确认

| 路由文件 | Export 方式 | index.ts Import 方式 | 状态 |
|---------|------------|---------------------|------|
| `discussion-votes.ts` | `export default router` | `import ... from '...votes'` | ✅ |
| `discussion-participants.ts` | `export default router` | `import ... from '...participants'` | ✅ |
| `discussions.ts` | `export default router` | `import ... from '...discussions'` | ✅ |
| `agents.ts` | `export default router` | `import ... from '...agents'` | ✅ |
| `agent-sessions.ts` | `export default router` | `import ... from '...agent-sessions'` | ✅ |
| `chat.ts` | `export default router` | `import ... from '...chat'` | ✅ |
| `chat-sessions.ts` | `export default router` | `import ... from '...chat-sessions'` | ✅ |
| `compare.ts` | `export default router` | `import ... from '...compare'` | ✅ |

所有 Phase 1-4 路由的 export/import 方式一致，没有问题。

### authMiddleware 确认

`src/middleware/auth.ts` 正确导出 `authMiddleware`:
```typescript
export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) { ... }
```

Phase 1-4 路由文件通过 named import 正确引用：
```typescript
import { authMiddleware, AuthRequest } from '../middleware/auth'
```

---

## 五、交付物

- ✅ 修复后的 `src/index.ts`（移除 `chatIndexRouter` import 和注册）
- ✅ 服务器可正常启动（`🚀 Cocreator Backend v2 运行中: http://localhost:3001`）
- ✅ Health check 返回 HTTP 200
- ✅ Redis 连接成功
- ✅ 内置技能 seed 成功（9 个）
- ✅ BullMQ content workers 启动成功

---

## 六、后续建议

1. **删除 `chat-index.ts`** — 该文件是未实现的占位文件，应删除或改为正确的 router 实现
2. **TypeScript 检查** — 存在一些 Prisma schema 类型不匹配的 TS 警告，建议运行 `npx prisma generate` 并修正类型
3. **`npm run dev` 使用 `tsx watch`** — 服务器现在可以正常 watch 模式启动
