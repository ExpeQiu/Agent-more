# CLI 与标准对齐说明

对照 [`架构设计/CLI标准.md`](../../12%20highvalue/架构设计/CLI标准.md)（以本机绝对路径为准）。

| 标准章节 | 落地 |
|----------|------|
| §3 命名 | 命令 `multi-agent`；`<group> <action>` |
| §4 目录 | `pyproject.toml`、`verify.sh`、`guide/`、`SKILL.md`、`agent/manifest.json` |
| §5 选型 | Python + Click |
| §6 全局/输出选项 | `--version/-v/-q/--format/-o/--demo` |
| §6.4 stdout/stderr | 数据 stdout；日志 stderr |
| §7 Exit code | 0/1/2/3/130（2=无交付，3=执行失败） |
| §8 配置 | `MULTI_AGENT_*`、`~/.multi-agent/config.yaml` |
| §10 JSON | `module/data_source/run_id/delivery/...`；列表类 `module/items/count` |
| §12 verify.sh | 必须，离线 `--demo` + 资源 list/doctor |
| §15 Agent | SKILL.md + manifest.json |

## 命令面（对外）

| group | actions | agent_safe |
|-------|---------|------------|
| `run` | start / list / status / resume / trajectory / export | true |
| `mode` | roundtable / consult / swarm | true（swarm 长大任务 background） |
| `pack` | list / show / save | list·show=true；save=false |
| `role` | list / show / save / delete | list·show=true；写=false |
| `skill` | list / show / save / import / delete | list·show=true；写=false |
| `knowledge` | list | true |
| `doctor` | （顶层） | true |
| `config` | init / show | show=true；init=false |

特殊映射：采集类 `EXIT_SCRAPE_FAIL=3` → 本产品 `EXIT_EXEC_FAIL=3`（LLM/子任务失败）。
