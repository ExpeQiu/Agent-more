"""统一 workflow 运行入口。"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any

from content_lg.config import WORKFLOW_TYPES, get_workflow
from content_lg.engine.mock import run_linear_mock
from content_lg.utils.errors import EngineError, UsageError
from content_lg.utils.logger import get_logger

logger = get_logger("content_lg.runner")


def run_workflow(
    workflow_type: str,
    payload: dict[str, Any],
    *,
    mock: bool = True,
) -> dict[str, Any]:
    if workflow_type not in WORKFLOW_TYPES:
        raise UsageError(
            f"未知 workflow type: {workflow_type}；可选: {', '.join(sorted(WORKFLOW_TYPES))}"
        )
    try:
        get_workflow(workflow_type)
    except KeyError as exc:
        raise UsageError(f"workflows.yml 中未定义: {workflow_type}") from exc

    started = time.monotonic()
    logger.info("workflow_start type=%s mock=%s", workflow_type, mock)

    # 第一期：真 LLM / langgraph extras 未接入前一律走 linear mock；
    # 保留 mock 开关以便日后接引擎时行为一致。
    if not mock:
        logger.warning("live_engine_not_ready fallback_mock type=%s", workflow_type)

    try:
        result = run_linear_mock(workflow_type, payload)
    except Exception as exc:  # noqa: BLE001
        logger.exception("workflow_failed type=%s", workflow_type)
        raise EngineError(str(exc)) from exc

    duration_ms = int((time.monotonic() - started) * 1000)
    logger.info(
        "workflow_done type=%s engine=%s duration_ms=%s",
        workflow_type,
        result.get("engine"),
        duration_ms,
    )
    return result


def wrap_envelope(
    workflow_type: str,
    result: dict[str, Any],
    *,
    data_source: str,
    version: str,
) -> dict[str, Any]:
    """CLI JSON 外层契约（对齐 15CLI 标准）。"""
    return {
        "module": f"workflow-{workflow_type}",
        "version": version,
        "data_source": data_source,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "workflow_type": workflow_type,
        "result": result,
    }
