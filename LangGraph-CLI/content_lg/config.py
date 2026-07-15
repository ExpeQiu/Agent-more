"""配置加载 — workflows.yml / agents.yml。"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

WORKFLOW_TYPES = frozenset({"content", "content_pipeline", "url_import", "semantic_chunk"})


def repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


def default_config_dir() -> Path:
    env = os.environ.get("CONTENT_LG_CONFIG_DIR", "").strip()
    if env:
        return Path(env).expanduser().resolve()
    return repo_root() / "config"


@lru_cache(maxsize=4)
def load_workflows(config_dir: str | None = None) -> dict[str, Any]:
    base = Path(config_dir) if config_dir else default_config_dir()
    path = base / "workflows.yml"
    if not path.is_file():
        raise FileNotFoundError(f"workflows.yml not found: {path}")
    with path.open(encoding="utf-8") as fh:
        data = yaml.safe_load(fh) or {}
    workflows = data.get("workflows") if isinstance(data, dict) else None
    if not isinstance(workflows, dict):
        raise ValueError("workflows.yml missing workflows map")
    return workflows


@lru_cache(maxsize=4)
def load_agents(config_dir: str | None = None) -> dict[str, Any]:
    base = Path(config_dir) if config_dir else default_config_dir()
    path = base / "agents.yml"
    if not path.is_file():
        return {}
    with path.open(encoding="utf-8") as fh:
        data = yaml.safe_load(fh) or {}
    agents = data.get("agents") if isinstance(data, dict) else None
    return agents if isinstance(agents, dict) else {}


def get_workflow(workflow_type: str, config_dir: str | None = None) -> dict[str, Any]:
    workflows = load_workflows(config_dir)
    wf = workflows.get(workflow_type)
    if not isinstance(wf, dict):
        raise KeyError(workflow_type)
    return wf


def list_workflows(config_dir: str | None = None) -> list[dict[str, str]]:
    workflows = load_workflows(config_dir)
    items: list[dict[str, str]] = []
    for name, meta in workflows.items():
        if not isinstance(meta, dict):
            continue
        items.append(
            {
                "type": str(name),
                "description": str(meta.get("description") or ""),
            }
        )
    return items
