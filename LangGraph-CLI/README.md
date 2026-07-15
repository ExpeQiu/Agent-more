# content-LangGraph-CLI

独立内容工作流引擎 CLI：直跑 `content` / `content_pipeline` / `url_import` / `semantic_chunk`。

> **不修改 GEOFlow**。本仓从 GEOFlow content-agent 配置契约抽出最小可验证子集，离线 Mock 验收后再评估接入。

## 安装

```bash
cd content-LangGraph-CLI
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
# 或直接：./verify.sh（会自动创建 .venv）
```

## 命令

```bash
content-lg --version
content-lg workflow list
content-lg workflow run content --demo
content-lg workflow run content_pipeline --demo --format table
content-lg workflow run url_import --demo
content-lg workflow run semantic_chunk --demo
```

便捷参数示例：

```bash
content-lg workflow run content --title "GEO 简介" --prompt "写 200 字"
content-lg workflow run semantic_chunk --file ./sample.md
content-lg workflow run url_import --url inline://x --title "页" --text "正文..."
```

结果默认 JSON 走 **stdout**；日志走 **stderr**。

## 验收

```bash
./verify.sh
```

无外网、无 GEOFlow、无 Redis/DB 即可通过。

## 配置

见 [.env.example](./.env.example)。工作流定义在 [config/workflows.yml](./config/workflows.yml)。

## 文档

- [guide/architecture.md](./guide/architecture.md)
- [guide/geoflow-contract.md](./guide/geoflow-contract.md) — 契约对照与接入评估
