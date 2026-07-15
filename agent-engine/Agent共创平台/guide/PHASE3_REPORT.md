# Phase 3 实施报告

**项目：** muiltchat + Cocreator + todify4 三项目合并
**阶段：** Phase 3 — 多 Agent 讨论模块
**完成日期：** 2026-05-06
**执行者：** AI-Researcher Subagent

---

## 一、总体完成状态

| 任务项 | 状态 | 说明 |
|--------|------|------|
| Discussion Runtime 引擎 | ✅ 完成 | 支持 parallel + round-robin + debate |
| Discussion API 路由 | ✅ 完成 | CRUD + start/stop/pause/messages/status/summary |
| Participants API 路由 | ✅ 完成 | CRUD 参与者管理 |
| 前端 Discussion 页面 | ✅ 完成 | 全套 UI 组件 |
| SSE 实时事件流 | ✅ 完成 | 讨论进度实时推送 |
| 讨论总结生成 | ✅ 完成 | 结构化总结 + 最终结论 |
| 路由注册指南 | ✅ 完成 | chat-index.ts 补充说明 |
| Phase 3 报告 | ✅ 完成 | 本文档 |

---

## 二、产出文件清单

### 2.1 后端 — Discussion Runtime

**路径：** `/Volumes/Lexar/git/03T/合并项目/backend/src/modules/discussion-runtime/`

| 文件 | 状态 | 说明 |
|------|------|------|
| `types.ts` | ✅ 新建 | 完整的类型定义（Session/Message/Participant/Config/SSE事件） |
| `discussion-runtime.ts` | ✅ 新建 | 讨论引擎核心（并行/轮流/辩论三种模式） |
| `participant-manager.ts` | ✅ 新建 | 参与者加载、发言顺序、系统提示构建 |
| `summarizer.ts` | ✅ 新建 | 讨论总结生成器 |

### 2.2 后端 — API 路由

**路径：** `/Volumes/Lexar/git/03T/合并项目/backend/src/routes/`

| 文件 | API | 说明 |
|------|-----|------|
| `discussions.ts` | 见下表 | 讨论 CRUD + 运行时控制 |
| `discussion-participants.ts` | 见下表 | 参与者 CRUD |

**discussions.ts API 清单：**

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/v1/discussions | 创建讨论会话 |
| GET | /api/v1/discussions/:id | 获取讨论详情 |
| GET | /api/v1/discussions?projectId=xxx | 列出项目讨论 |
| PUT | /api/v1/discussions/:id | 更新讨论配置 |
| DELETE | /api/v1/discussions/:id | 删除讨论 |
| POST | /api/v1/discussions/:id/start | 启动讨论（SSE 流） |
| POST | /api/v1/discussions/:id/stop | 停止讨论 |
| POST | /api/v1/discussions/:id/pause | 暂停讨论 |
| GET | /api/v1/discussions/:id/messages | 获取消息列表 |
| POST | /api/v1/discussions/:id/messages | 手动添加消息 |
| GET | /api/v1/discussions/:id/status | 获取运行状态 |
| GET | /api/v1/discussions/:id/summary | 获取总结 |

**discussion-participants.ts API 清单：**

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/v1/discussions/:id/participants | 添加参与者 |
| GET | /api/v1/discussions/:id/participants | 列出参与者 |
| PUT | /api/v1/discussions/:id/participants/:pid | 更新参与者 |
| DELETE | /api/v1/discussions/:id/participants/:pid | 移除参与者 |

### 2.3 前端 — Discussion 组件

**路径：** `/Volumes/Lexar/git/03T/合并项目/frontend/src/features/discussion/`

| 文件 | 状态 | 说明 |
|------|------|------|
| `DiscussionPage.tsx` | ✅ 新建 | 讨论管理主页（侧边栏 + 主区域） |
| `DiscussionArena.tsx` | ✅ 新建 | 讨论主舞台（控制栏 + 时间线） |
| `DiscussionConfig.tsx` | ✅ 新建 | 创建/编辑讨论配置弹窗 |
| `DiscussionTimeline.tsx` | ✅ 新建 | 消息时间线（按轮次分组） |
| `DiscussionSummary.tsx` | ✅ 新建 | 讨论总结展示 + 导出 |
| `lib/discussion-service.ts` | ✅ 新建 | API 客户端 + SSE EventSource 封装 |
| `lib/discussion-store.ts` | ✅ 新建 | Zustand 状态管理（运行时 + 消息） |

**路由入口：**
- `frontend/src/app/(main)/projects/[id]/discussion/page.tsx` — ✅ 新建

**Tab 注册：**
- `_project-layout.tsx` — ✅ 更新，添加「多Agent讨论」Tab（路由：discussion）

---

## 三、三种讨论模式技术设计

### Parallel 模式
```
输入话题
    ↓
[Agent1] ──┐
[Agent2] ──┼── 并发执行 → 各自输出 → 汇总展示
[Agent3] ──┘
    ↓
生成综合总结
```

### Round-Robin 模式
```
话题
  ↓ Round 1
Agent1 发言 → Agent2 发言 → Agent3 发言
  ↓ Round 2（可选）
Agent1 回应 → Agent2 回应 → Agent3 回应
  ↓ ...
最终总结
```

### Debate 模式
```
话题（声明）
    ↓
正方Agent1: 论述 → 反方Agent2: 反驳
    ↓
Agent1: 再辩 → Agent2: 再驳
    ↓
最终结论
```

---

## 四、SSE 事件流设计

讨论运行时通过 SSE 推送以下事件（前端按 type 监听）：

| 事件类型 | 触发时机 | 关键字段 |
|---------|---------|---------|
| `discussion_start` | 讨论开始 | discussionId |
| `round_start` | 每轮开始 | roundIndex |
| `turn_start` | 每位发言开始 | roundIndex, turnIndex, agentName |
| `message_start` | 发言块开始 | participantId, agentName |
| `message_delta` | 流式内容片段 | content (增量) |
| `message_done` | 发言块完成 | content (完整), latencyMs |
| `turn_done` | 轮次完成 | roundIndex, turnIndex |
| `round_done` | 轮次完成 | roundIndex |
| `consensus_detected` | 检测到共识 | summary |
| `discussion_done` | 讨论结束 | decision, summary |
| `discussion_paused` | 手动暂停 | - |
| `discussion_error` | 错误 | error |

---

## 五、路由注册（Cocreator 集成）

在 Cocreator `backend/src/index.ts` 中添加：

```typescript
import discussionsRouter from './routes/discussions'
import discussionParticipantsRouter from './routes/discussion-participants'

app.use('/api/v1/discussions', discussionsRouter)
app.use('/api/v1/discussions', discussionParticipantsRouter)
```

---

## 六、数据库依赖

所有数据表已在 Phase 1 `schema-extend.sql` 中创建：

- `DiscussionSession` ✅
- `DiscussionParticipant` ✅
- `AgentDefinition` ✅（含5个内置角色种子数据）

无需新增迁移。

---

## 七、前端路由

```
/projects/[id]/discussion   — 多 Agent 讨论主页（Phase 3 新增）
```

---

## 八、验收标准检查

- [x] Discussion Runtime 引擎就绪（支持 parallel + round-robin + debate）
- [x] Discussions API 路由就绪（CRUD + start/stop/messages/events）
- [x] 前端 Discussion 页面可用
- [x] 实时 SSE 事件流（讨论进度实时推送）
- [x] 讨论总结生成
- [x] Phase 3 报告输出

---

## 九、后续步骤（Phase 4）

- 支持主持人/裁判角色的结构化发言模板
- 共识检测增强（关键词匹配 → LLM 语义分析）
- 反思循环（LLM 自我反思后提出新问题）
- 讨论可视化（雷达图对比各方观点）
- 投票机制（debate 模式观众投票）
- 讨论回放（时间线穿梭）

---

## 十、风险与注意事项

1. **EventSource 鉴权**：EventSource 不支持自定义 Header，生产环境需通过 query param 传递 token 或使用 cookie
2. **SSE 重连**：前端断开后需手动重连，暂未实现自动重连逻辑
3. **长文本截断**：讨论发言 maxTokens=2048，较长发言可能被截断
4. **并发限制**：同一 discussionId 同时只能有一个 SSE 连接，需防止重复启动

---

*报告生成时间：2026-05-06 10:45 GMT+8*
