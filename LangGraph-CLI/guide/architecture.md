# 架构说明

## 目标

在独立仓库验证「直跑 4 种内容 workflow」的 CLI UX、JSON 契约与离线 Mock 路径。**不修改 GEOFlow。**

## 组件

```
content-lg CLI (Click)
    │
    ├─ payload.py     组装 / 校验
    ├─ runner.py      统一 run + JSON envelope
    └─ engine/mock.py 读 workflows.yml 走图 + mock 结果
            │
            └─ config/workflows.yml  (自 GEOFlow 拷贝对齐)
```

## 执行模式（第一期）

| 模式 | 行为 |
|------|------|
| `--demo` / `--mock` | linear walk + mock 输出（默认可离线） |
| `--no-mock` | 日志告警后仍回落 mock（真 LLM 引擎未就绪） |

真 LangGraph + LLM 可作为 extras 后续接入，不阻塞验收。

## 输出约定

- **stdout**：JSON / table 业务结果（可管道）
- **stderr**：日志与进度
- Exit：`0` 成功；`2` 用法/未知 type；`1` 引擎或其他错误

## 与 GEOFlow 边界

本仓只覆盖 **workflow 引擎试跑**，不包含 TaskRun、Article 落库、Celery、RAG hydrate、频道分发。
