# 与 GEOFlow 契约对照（外挂，零运行时耦合）

> GEOFlow **独立闭环**；本仓为 workflow 离线试跑 / YAML 门禁外挂。  
> 生产仍走内嵌 `run_workflow_sync`。配置真源：`geoflow-v3/backend/app/ai/config/workflows.yml`。

## Workflow 类型白名单

`content` | `content_pipeline` | `url_import` | `semantic_chunk`

## 明确不做

- subprocess / pip 替换内嵌引擎
- CLI 充当生产 Sidecar
- `--task-id` 读 GEOFlow DB
- 将 mock 结果写入 TaskRun / Article
