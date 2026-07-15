# OneAgent 文档索引

| 文档 | 说明 |
|------|------|
| [方案设计](./方案设计.md) | 总体定位、架构边界、实施状态 |
| [双轨执行架构](./双轨执行架构.md) | standalone / kernel 路由与选型 |
| [Agent Profile 规范](./AgentProfile规范.md) | Profile YAML 字段说明 |
| [集成指南](./集成指南.md) | HTTP / SDK / CLI / MCP 接入 |

## 快速定位

- **只想嵌入简单 Copilot** → [集成指南 · SDK 嵌入](./集成指南.md#sdk-嵌入宿主) + `tier: standalone`
- **复杂任务走 SpAgent** → [双轨执行架构](./双轨执行架构.md) + `tier: kernel`
- **配置新 Agent 角色** → [Agent Profile 规范](./AgentProfile规范.md)
- **了解与 SpAgent 边界** → [方案设计 · 定位与边界](./方案设计.md#1-定位与边界)
