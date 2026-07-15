# Agent Profile 规范

Agent Profile 是 OneAgent 的**角色配置单元**，YAML 声明 Persona、Skills、能力约束与执行层级。

---

## 基本结构

```yaml
apiVersion: oneagent.io/v1
kind: AgentProfile
metadata:
  id: copilot              # 唯一 ID，CLI/API/HTTP 路径引用
  name: 显示名称
  version: "1.0.0"
  description: 可选描述
spec:
  persona: { ... }
  execution: { ... }         # 双轨执行配置
  capabilities: { ... }
  constraints: { ... }
  skills: { ... }
  context: { ... }
```

文件位置：`agents/<id>.yaml`

---

## spec.persona — 角色注入

```yaml
spec:
  persona:
    system: |
      你是 {{tenant.name}} 的助手，风格 {{style.tone}}。
      输出须简洁、结构化。
    variables:
      tenant.name:
        type: string
        default: default
      style.tone:
        type: enum
        default: 严谨
        enum: [严谨, 友好]
```

| 字段 | 说明 |
|------|------|
| `system` | System prompt 模板，支持 `{{variable}}` 占位符 |
| `variables` | 变量定义，`default` 为默认值 |

**运行时覆盖**：请求中传 `task.metadata.personaOverrides`：

```json
{
  "metadata": {
    "personaOverrides": { "style.tone": "友好" }
  }
}
```

---

## spec.execution — 双轨执行

控制任务走 **standalone**（OneAgent 自身）还是 **kernel**（SpAgent 内核）。

```yaml
spec:
  execution:
    defaultTier: standalone    # standalone | kernel | auto
    escalateToKernelWhen:
      hasContextRefs: true     # 有 contextRefs 时升级 kernel
      requiresTools: false     # 有 allowedCapabilities 时升级 kernel
```

| defaultTier | 行为 |
|-------------|------|
| `standalone` | Persona + Skills + 单轮 LLM，无工具循环 |
| `kernel` | 完整 SpAgent 推理循环 |
| `auto` | 按 escalate 规则 + 启发式自动选择 |

**路由优先级**（高 → 低）：

1. 请求 `tier` / `options.tier`
2. `task.metadata.executionTier`
3. `escalateToKernelWhen` 升级规则
4. Profile `defaultTier`
5. 全局 `defaults.executionTier`（`oneagent.config.yaml`）

详见 [双轨执行架构](./双轨执行架构.md)。

---

## spec.capabilities — 能力过滤

仅 **kernel tier** 生效（standalone 不暴露工具）。

```yaml
spec:
  capabilities:
    allow:
      - knowledge_lookup
      - skill_activate
      - skillforge.*          # 通配符
    deny:
      - http_fetch
    requireApproval:
      - host_action_proxy
```

| 字段 | 映射 |
|------|------|
| `allow` | `AgentTask.allowedCapabilities`（支持 `*` 通配） |
| `deny` | 从 allow 结果排除 |
| `requireApproval` | `AgentTask.constraints.requireApprovalFor` |

---

## spec.constraints — 执行约束

仅 **kernel tier** 生效。

```yaml
spec:
  constraints:
    maxIterations: 8
    maxToolCalls: 12
    timeoutMs: 60000
```

---

## spec.skills — Skills 绑定

```yaml
spec:
  skills:
    autoLoad:
      - review-checklist
      - style-guide
    remote:                    # 预留，联邦 SkillForge
      - skillforge:doc-lint
```

| 模式 | 机制 |
|------|------|
| **Eager** | `autoLoad` 全文注入 system（受 `skills.maxInjectChars` 限制） |
| **Lazy** | 模型调用 `skill_activate` 按需加载 |
| **Remote** | kernel tier + SkillForge 联邦（需 federation 配置） |

本地 Skill 文件：`skills/<name>/SKILL.md`

```markdown
---
id: review-checklist
name: 文档审阅检查清单
roles: [reviewer]       # 空数组 = 所有 Agent 可见
priority: 10
---

# 正文内容...
```

---

## spec.context — 上下文注入规则

声明式标记，由 `PersonaContextPipeline` 消费：

```yaml
spec:
  context:
    injectRules:
      - session-summary
      - memory
      - host-context
```

| 规则 | 来源 |
|------|------|
| `session-summary` | SessionStore 摘要 |
| `memory` | MemoryManager（kernel tier + 联邦） |
| `host-context` | `HostBridge.resolveContext(contextRefs)` |

---

## task.metadata 约定

| Key | 类型 | 说明 |
|-----|------|------|
| `agentId` | string | Agent Profile ID |
| `personaOverrides` | object | 覆盖 persona 变量 |
| `executionTier` | string | `standalone` / `kernel` / `auto` |
| `forceKernel` | boolean | auto 模式下强制 kernel |
| `delegatedFrom` | string | 委派来源 Agent ID（子任务） |
| `parentTaskId` | string | 父任务 ID |

---

## spec.delegation — Subagent 委派

```yaml
spec:
  delegation:
    allow: [planner, reviewer]
    defaultTier: auto
  capabilities:
    allow: [delegate_agent, ...]
```

配置 `delegation.allow` 后，enrichment 自动加入 `delegate_agent` 能力（kernel tier 下模型可调用）。

---

## 内置 Profile 参考

| id | defaultTier | 特点 |
|----|-------------|------|
| `copilot` | standalone | 通用辅助，可委派 planner/reviewer |
| `reviewer` | standalone + escalate | 审阅检查清单 Skills，有 contextRefs 升级 kernel |
| `planner` | kernel | 任务拆解，默认走 SpAgent |

---

## 校验

```bash
npx oneagent agents validate
npx oneagent agents show reviewer
npx oneagent agents list
```

CI 可将 `agents validate` 纳入 `verify.sh` 流程。
