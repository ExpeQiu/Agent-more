"""配置加载：CLI 参数 > 环境变量 > 本地文件 > 默认。"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

import yaml

ENV_PREFIX = "MULTI_AGENT_"
USER_CONFIG = Path.home() / ".multi-agent" / "config.yaml"
PROJECT_CONFIG = Path("config.yaml")


@dataclass
class Settings:
    mock_mode: bool = False
    api_key: str = ""
    api_base: str = ""
    model: str = "gpt-4o-mini"
    runs_dir: str = "runs"
    default_pack: str = "nev-tech"
    max_parallel: int = 5
    knowledge_base: str = "none"
    extra: dict[str, Any] = field(default_factory=dict)

    @property
    def data_source(self) -> str:
        """对外契约：绑定的知识库 id（无绑定为 none）。"""
        kid = (self.knowledge_base or "none").strip() or "none"
        return kid

    @property
    def llm_mode(self) -> str:
        return "demo" if self.mock_mode else "live"


def _load_yaml(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    with path.open("r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    return data if isinstance(data, dict) else {}


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def load_settings(
    *,
    demo: Optional[bool] = None,
    runs_dir: Optional[str] = None,
    pack: Optional[str] = None,
    max_parallel: Optional[int] = None,
    knowledge_base: Optional[str] = None,
) -> Settings:
    merged: dict[str, Any] = {
        "mock_mode": False,
        "api_key": "",
        "api_base": "",
        "model": "gpt-4o-mini",
        "runs_dir": "runs",
        "default_pack": "nev-tech",
        "max_parallel": 5,
        "knowledge_base": "none",
    }

    for path in (USER_CONFIG, PROJECT_CONFIG):
        file_cfg = _load_yaml(path)
        for key in merged:
            if key in file_cfg:
                merged[key] = file_cfg[key]
        if "extra" in file_cfg and isinstance(file_cfg["extra"], dict):
            merged.setdefault("extra", {}).update(file_cfg["extra"])

    if _env_bool(f"{ENV_PREFIX}MOCK_MODE"):
        merged["mock_mode"] = True
    if os.environ.get(f"{ENV_PREFIX}API_KEY"):
        merged["api_key"] = os.environ[f"{ENV_PREFIX}API_KEY"]
    if os.environ.get(f"{ENV_PREFIX}API_BASE"):
        merged["api_base"] = os.environ[f"{ENV_PREFIX}API_BASE"]
    if os.environ.get(f"{ENV_PREFIX}MODEL"):
        merged["model"] = os.environ[f"{ENV_PREFIX}MODEL"]
    if os.environ.get(f"{ENV_PREFIX}RUNS_DIR"):
        merged["runs_dir"] = os.environ[f"{ENV_PREFIX}RUNS_DIR"]
    if os.environ.get(f"{ENV_PREFIX}DEFAULT_PACK"):
        merged["default_pack"] = os.environ[f"{ENV_PREFIX}DEFAULT_PACK"]
    if os.environ.get(f"{ENV_PREFIX}MAX_PARALLEL"):
        merged["max_parallel"] = int(os.environ[f"{ENV_PREFIX}MAX_PARALLEL"])
    if os.environ.get(f"{ENV_PREFIX}KNOWLEDGE_BASE"):
        merged["knowledge_base"] = os.environ[f"{ENV_PREFIX}KNOWLEDGE_BASE"]

    if demo is not None:
        merged["mock_mode"] = demo
    if runs_dir is not None:
        merged["runs_dir"] = runs_dir
    if pack is not None:
        merged["default_pack"] = pack
    if max_parallel is not None:
        merged["max_parallel"] = max_parallel
    if knowledge_base is not None:
        merged["knowledge_base"] = knowledge_base

    return Settings(
        mock_mode=bool(merged["mock_mode"]),
        api_key=str(merged.get("api_key") or ""),
        api_base=str(merged.get("api_base") or ""),
        model=str(merged.get("model") or "gpt-4o-mini"),
        runs_dir=str(merged.get("runs_dir") or "runs"),
        default_pack=str(merged.get("default_pack") or "nev-tech"),
        max_parallel=int(merged.get("max_parallel") or 5),
        knowledge_base=str(merged.get("knowledge_base") or "none"),
        extra=dict(merged.get("extra") or {}),
    )


def ensure_user_config() -> Path:
    USER_CONFIG.parent.mkdir(parents=True, exist_ok=True)
    if not USER_CONFIG.exists():
        USER_CONFIG.write_text(
            "mock_mode: false\n"
            "model: gpt-4o-mini\n"
            "runs_dir: runs\n"
            "default_pack: nev-tech\n"
            "max_parallel: 5\n"
            "knowledge_base: none\n",
            encoding="utf-8",
        )
    return USER_CONFIG


def redact_settings(settings: Settings) -> dict[str, Any]:
    return {
        "mock_mode": settings.mock_mode,
        "api_key": "***" if settings.api_key else "",
        "api_base": settings.api_base,
        "model": settings.model,
        "runs_dir": settings.runs_dir,
        "default_pack": settings.default_pack,
        "max_parallel": settings.max_parallel,
        "knowledge_base": settings.knowledge_base,
        "data_source": settings.data_source,
        "llm_mode": settings.llm_mode,
    }
