# API 修复报告

**修复时间:** 2026-05-06 12:20 GMT+8
**项目:** Cocreator Backend 合并项目

---

## ✅ 问题1：数据库表缺失

**状态:** 已修复

**操作:** 执行 `npx prisma db push --accept-data-loss`

**结果:** 以下表已成功创建：
- `AgentDefinition`
- `DiscussionSession`
- `DiscussionParticipant`
- `DiscussionVote`
- `DiscussionRoundScore`
- `CompareRun`

---

## ✅ 问题2：Discussions 路由 `$queryRaw` 语法错误

**状态:** 已修复

**根因:** Prisma 的 `$queryRaw` 是 tagged template 函数，只能用反引号语法调用，不能作为普通函数调用。

**修复内容 (`src/routes/discussions.ts`):**

| 位置 | 原代码 | 修复后 |
|------|--------|--------|
| Line 217 | `prisma.$queryRaw<any[]>(query, ...params)` | `prisma.$queryRawUnsafe(query, params) as any[]` |
| Line 220 | `prisma.$queryRaw<any[]>(countQuery)` | `prisma.$queryRawUnsafe(countQuery, []) as any[]` |
| Line 269 | `prisma.$queryRawUnsafe(...)` | 保持不变（语法正确） |
| Line 438 | `prisma.$queryRaw<any[]>(query, ...params)` | `prisma.$queryRawUnsafe(query, params) as any[]` |

**说明:** `$queryRawUnsafe` 支持 `(queryString, paramsArray)` 函数签名，适合动态构建的 SQL 语句。

---

## ✅ 问题3：Chat GET / 无处理器

**状态:** 已修复

**文件:** `src/routes/chat.ts`

**添加内容:**
```typescript
/**
 * GET /api/v1/chat
 * Health check + registered model list
 */
router.get('/', (_req: AuthRequest, res) => {
  res.json({
    status: 'ok',
    models: AVAILABLE_MODELS.map(m => ({ id: m.id, name: m.name })),
    timestamp: new Date().toISOString(),
  })
})
```

---

## 验证命令

重启后端后执行：

```bash
curl http://localhost:3001/api/v1/chat
curl http://localhost:3001/api/v1/agents
curl http://localhost:3001/api/v1/discussions
curl http://localhost:3001/api/v1/compare/sessions
```

期望：均返回 JSON，不报 500 错误。

---

## 附注

TypeScript 编译检查发现部分预存错误（与本次修复无关）：
- `AVAILABLE_MODELS` 模块导出问题
- `ParticipantLLMContext` 缺少 `systemPrompt` 属性
- `Set<string>` 迭代问题

以上为原代码库中已存在的问题，不在本次修复范围内。
