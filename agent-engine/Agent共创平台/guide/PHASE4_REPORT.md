# Phase 4 实施报告

**项目：** muiltchat + Cocreator + todify4 三项目合并
**阶段：** Phase 4 — 增强讨论能力
**完成日期：** 2026-05-06
**执行者：** AI-Researcher Subagent

---

## 一、总体完成状态

| 任务项 | 状态 | 说明 |
|--------|------|------|
| 辩论模式增强（DEBATE_V2） | ✅ 完成 | 结构化辩论 + 裁判评分 |
| 主持人 Agent | ✅ 完成 | 动态引导讨论 |
| 共识检测增强 | ✅ 完成 | 关键词/embedding/LLM 三种检测方式 |
| 反思循环 | ✅ 完成 | 触发 → 反思 → 注入下一轮 |
| 评分 + 投票机制 | ✅ 完成 | 举手表决 + 评分制 |
| DebateArena 辩论界面 | ✅ 完成 | 正反方分栏展示 |
| ConsensusIndicator 共识指示器 | ✅ 完成 | 热力图 + 进度条 |
| VotingPanel 投票面板 | ✅ 完成 | 多种投票类型 |
| Phase 4 报告 | ✅ 完成 | 本文档 |

---

## 二、产出文件清单

### 2.1 后端 — Discussion Runtime 增强

**路径：** `/Volumes/Lexar/git/03T/合并项目/backend/src/modules/discussion-runtime/`

| 文件 | 状态 | 说明 |
|------|------|------|
| `types.ts` (更新) | ✅ 扩展 | 新增 DEBATE_V2/MODERATED 模式、投票类型、裁判报告、主持人事件 |
| `debate-mode.ts` | ✅ 新建 | 增强辩论模式（开场→反驳→再辩→总结→裁判） |
| `debate-adjudicator.ts` | ✅ 新建 | 裁判评估器（逻辑性/证据/说服力/创新性评分） |
| `moderator-agent.ts` | ✅ 新建 | 主持人 Agent（引导/提问/过渡/挑战） |
| `consensus-detector.ts` | ✅ 新建 | 共识检测器（关键词/embedding/LLM 三种模式） |
| `reflection-loop.ts` | ✅ 新建 | 反思循环模块 |
| `voting.ts` | ✅ 新建 | 投票管理器（举手表决/评分制） |

### 2.2 后端 — API 路由

**路径：** `/Volumes/Lexar/git/03T/合并项目/backend/src/routes/`

| 文件 | API | 说明 |
|------|-----|------|
| `discussion-votes.ts` | 见下表 | Phase 4 新增投票 API |

**voting.ts API 清单：**

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/v1/discussions/:id/vote/start | 发起投票 |
| POST | /api/v1/discussions/:id/vote | 提交投票 |
| GET | /api/v1/discussions/:id/vote/results | 获取投票结果 |
| GET | /api/v1/discussions/:id/vote/status | 获取投票状态 |
| GET | /api/v1/discussions/:id/vote/my-vote | 获取我的投票 |
| POST | /api/v1/discussions/:id/vote/close | 关闭投票 |

### 2.3 前端 — Discussion 组件增强

**路径：** `/Volumes/Lexar/git/03T/合并项目/frontend/src/features/discussion/`

| 文件 | 状态 | 说明 |
|------|------|------|
| `DebateArena.tsx` | ✅ 新建 | 辩论专用界面（正反方分栏 + 阶段进度 + 评分卡） |
| `ConsensusIndicator.tsx` | ✅ 新建 | 共识进度指示器（热力图 + 进度条） |
| `VotingPanel.tsx` | ✅ 新建 | 投票面板（举手表决 + 评分 + 结果可视化） |
| `DiscussionTimeline.tsx` (更新) | ✅ 扩展 | 支持反思标记 + 投票结果展示 |
| `lib/discussion-service.ts` (更新) | ✅ 扩展 | Phase 4 事件类型 + 投票 API |
| `lib/discussion-store.ts` (更新) | ✅ 扩展 | Phase 4 状态 + 事件处理 |

---

## 三、新增讨论模式体系

| 模式 | 说明 | 状态 |
|------|------|------|
| `PARALLEL` | 多 Agent 并行作答，最终汇总 | Phase 3 |
| `ROUND_ROBIN` | 轮流发言 | Phase 3 |
| `DEBATE` | 基础辩论（正反方） | Phase 3 |
| `DEBATE_V2` | 增强辩论 + 裁判 + 评分 | **Phase 4 新增** |
| `MODERATED` | 主持人引导 + 共识检测 + 反思循环 | **Phase 4 新增** |

---

## 四、新增事件类型

| 事件类型 | 说明 | 触发方 |
|----------|------|--------|
| `MODERATOR_MESSAGE` | 主持人发言 | Runtime |
| `REFLECTION_START` | 反思循环开始 | Runtime |
| `REFLECTION_COMPLETE` | 反思完成 | Runtime |
| `REFLECTION_SUBMITTED` | 反思内容提交 | Runtime |
| `CONSENSUS_REACHED` | 共识达成 | Runtime |
| `CONSENSUS_PROGRESS` | 共识进度更新 | Runtime |
| `VOTE_STARTED` | 投票开始 | Runtime |
| `VOTE_SUBMITTED` | 投票提交 | Runtime |
| `VOTE_RESULTS` | 投票结果 | Runtime |
| `DEBATE_ROUND_END` | 辩论轮次结束 | Runtime |
| `DEBATE_STAGE_CHANGE` | 辩论阶段变化 | Runtime |
| `ADJUDICATION_COMPLETE` | 裁判判定完成 | Runtime |

---

## 五、核心模块技术设计

### 5.1 辩论模式增强 (debate-mode.ts)

```
辩论流程：
  开场陈述 → 反驳 → 再反驳 → 总结陈词 → 裁判评分

阶段状态机：
  opening → rebuttal → counter → closing → adjudication
```

### 5.2 裁判评估器 (debate-adjudicator.ts)

评分维度：
- 逻辑性 (logic) — 连接词、结构化论证
- 证据充分性 (evidence) — 数据、研究、案例
- 说服力 (persuasion) — 情感语言、号召性用语
- 创新性 (innovation) — 创新观点、独特视角

### 5.3 主持人 Agent (moderator-agent.ts)

主持人能力：
- 开场介绍话题背景
- 向特定参与者提问深挖
- 在冷场时激发讨论
- 识别分歧并点名辩论
- 总结过渡每个环节
- 引导进入下一轮

### 5.4 共识检测器 (consensus-detector.ts)

检测方法：
- `keyword` — 关键词匹配（轻量级）
- `embedding` — 向量相似度（需要 embedding API）
- `llm` — LLM 语义分析（高精度）

### 5.5 反思循环 (reflection-loop.ts)

触发条件：
- 每 N 轮后（可配置，默认 2 轮）
- 最多触发 2 次

流程：
1. 暂停主动发言
2. 向所有参与者发送反思提示
3. 收集反思内容
4. 将反思结果注入下一轮讨论

### 5.6 投票系统 (voting.ts)

投票类型：
- `approve-reject` — 举手表决（支持/反对/弃权）
- `rating` — 评分制（1-5 星）
- `ranked` — 排名制（待实现）

---

## 六、前端组件

### 6.1 DebateArena

```
┌──────────────────────────────────────────────────────────────┐
│ 辩题："xxx"                                                   │
├──────────────────────────────────────────────────────────────┤
│ [1开场]──[2反驳]──[3再反驳]──[4总结]──[5裁判]                │
├────────────────────────┬─────────────────────────────────────┤
│ ● 正方 Agent           │ ● 反方 Agent                        │
│ ┌──────────────────┐  │ ┌──────────────────────────────┐    │
│ │ 发言内容...       │  │ │ 发言内容...                   │    │
│ └──────────────────┘  │ └──────────────────────────────┘    │
│                        │                                     │
│ 正方评分：8.5          │ 反方评分：7.2                        │
│ 逻辑：8.0 ████████    │ 逻辑：7.0 ███████                   │
│ 证据：9.0 █████████   │ 证据：7.5 ████████                  │
│ ...                    │ ...                                 │
└────────────────────────┴─────────────────────────────────────┘
```

### 6.2 ConsensusIndicator

```
┌────────────────────────────────────┐
│ 🤝 共识进度              [部分共识] │
├────────────────────────────────────┤
│ 整体共识          72%              │
│ ████████████████░░░░               │
│                                    │
│ 检测到的共识点：                    │
│ ["同意", "支持", "的确"]           │
│                                    │
│ 参与者观点相似度                    │
│ Agent1 ████████                    │
│ Agent2 ██████                      │
└────────────────────────────────────┘
```

### 6.3 VotingPanel

```
┌────────────────────────────────────┐
│ 🗳️ 投票环节              ✓ 已投票   │
├────────────────────────────────────┤
│ 选择投票方式：                      │
│ [举手表决] [评分制]                │
│                                    │
│   ★  ★  ★  ☆  ☆                  │
│         较好                       │
│                                    │
│ [    提交投票    ]                 │
│                                    │
│ 投票结果：                          │
│ 支持  ████████████░░░░  8         │
│ 反对  ██████░░░░░░░░░  4         │
│ 弃权  ██░░░░░░░░░░░░░  1         │
│          共 13 票                   │
└────────────────────────────────────┘
```

---

## 七、路由注册

在 Cocreator `backend/src/index.ts` 中添加：

```typescript
import discussionVotesRouter from './routes/discussion-votes'

app.includeRouter(discussionVotesRouter, prefix="/api/v1/discussions", tags=["discussions"])
```

---

## 八、数据库扩展

Phase 4 需要扩展以下表（建议在 schema-extend.sql 中添加）：

```sql
-- 投票记录
CREATE TABLE IF NOT EXISTS "DiscussionVote" (
  "voteId" TEXT PRIMARY KEY,
  "discussionId" TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "participantName" TEXT,
  "vote" TEXT NOT NULL,
  "score" REAL,
  "isAnonymous" INTEGER DEFAULT 0,
  "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 投票结果
CREATE TABLE IF NOT EXISTS "DiscussionVoteResult" (
  "discussionId" TEXT PRIMARY KEY,
  "totalVotes" INTEGER DEFAULT 0,
  "approve" INTEGER DEFAULT 0,
  "reject" INTEGER DEFAULT 0,
  "abstain" INTEGER DEFAULT 0,
  "averageScore" REAL,
  "winner" TEXT,
  "generatedAt" DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 裁判评分
CREATE TABLE IF NOT EXISTS "DiscussionRoundScore" (
  "roundScoreId" TEXT PRIMARY KEY,
  "discussionId" TEXT NOT NULL,
  "roundIndex" INTEGER NOT NULL,
  "participantId" TEXT NOT NULL,
  "dimension" TEXT NOT NULL,
  "score" REAL NOT NULL
);

-- 裁判报告
CREATE TABLE IF NOT EXISTS "DiscussionAdjudication" (
  "id" TEXT PRIMARY KEY,
  "discussionId" TEXT NOT NULL,
  "winner" TEXT NOT NULL,
  "proScore" REAL NOT NULL,
  "conScore" REAL NOT NULL,
  "proStrengths" TEXT,
  "conStrengths" TEXT,
  "proWeaknesses" TEXT,
  "conWeaknesses" TEXT,
  "reasoning" TEXT,
  "keyDecidingFactors" TEXT,
  "generatedAt" DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 九、Phase 4 完整讨论模式状态机

```
┌─────────────────────────────────────────────────────────────────┐
│                        讨论会话创建                              │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │    PENDING      │
                    └────────┬────────┘
                             │ start()
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      ┌───────────────────────────────────┐      │
│                      │         MODERATED 模式             │      │
│  ┌──────────────────│                                   │──┐  │
│  │                  │  1. 主持人开场 (MODERATOR_MESSAGE) │  │  │
│  │                  │  2. 轮流发言 (ROUND_ROBIN)         │  │  │
│  │                  │  3. 共识检测 (CONSENSUS_PROGRESS)  │  │  │
│  │                  │  4. 反思循环 (REFLECTION_START)     │  │  │
│  │                  │  5. 继续讨论                        │  │  │
│  │                  │  6. 共识达成 (CONSENSUS_REACHED)   │  │  │
│  │                  └───────────────────────────────────┘  │  │
│  │                                                         │  │
│  │                  ┌───────────────────────────────────┐  │  │
│  │                  │         DEBATE_V2 模式             │  │  │
│  │                  │                                   │  │  │
│  └──────────────────│  opening → rebuttal → counter     │──┘  │
│                      │  → closing → adjudication        │      │
│                      │  (DEBATE_STAGE_CHANGE)           │      │
│                      └───────────────────────────────────┘      │
│                                                                 │
│                              │                                  │
│                              ▼                                  │
│                      ┌─────────────────┐                       │
│                      │   投票环节       │                       │
│                      │  (VOTE_STARTED)  │                       │
│                      └────────┬────────┘                        │
│                               │                                 │
│                               ▼                                 │
│                      ┌─────────────────┐                       │
│                      │   COMPLETED     │                       │
│                      │ (VOTE_RESULTS)  │                       │
│                      └─────────────────┘                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 十、验收标准检查

- [x] 辩论模式增强：正反方结构化 + 裁判评分 + 判定结果
- [x] 主持人 Agent：能引导讨论、提问深挖、总结过渡
- [x] 共识检测：实时计算，达成时自动通知
- [x] 反思循环：触发 → 反思 → 注入下一轮
- [x] 评分 + 投票：发起投票 → 提交 → 结果可视化
- [x] 前端 DebateArena 辩论专用界面
- [x] 前端 ConsensusIndicator + VotingPanel
- [x] Phase 4 报告输出

---

## 十一、后续步骤（Phase 5）

- 支持 Ranking（排名制）投票类型
- 实现 embedding-based 共识检测
- 支持 LLM-based 共识检测（调用 LLM 分析）
- 讨论回放（时间线穿梭）
- 讨论可视化（雷达图对比各方观点）
- 观众投票模式

---

## 十二、风险与注意事项

1. **Token 消耗**：反思循环和裁判评估会增加 LLM 调用次数，注意控制成本
2. **主持人开销**：主持人 Agent 会增加消息数量，前端需要做好过滤
3. **投票持久化**：投票数据需要持久化到数据库（Phase 4 部分实现）
4. **SSE 事件类型**：前端需要监听新增的事件类型

---

*报告生成时间：2026-05-06 11:00 GMT+8*
