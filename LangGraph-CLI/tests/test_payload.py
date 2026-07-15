"""payload 组装 / 校验测试。"""

from __future__ import annotations

import pytest

from content_lg.payload import build_payload, demo_payload, validate_payload
from content_lg.runner import run_workflow, wrap_envelope
from content_lg.utils.errors import UsageError


@pytest.mark.parametrize(
    "wf",
    ["content", "content_pipeline", "url_import", "semantic_chunk"],
)
def test_demo_payload_valid(wf: str) -> None:
    payload = demo_payload(wf)
    validate_payload(wf, payload)


def test_unknown_type() -> None:
    with pytest.raises(UsageError):
        build_payload("nope", demo=True)


def test_content_requires_fields() -> None:
    with pytest.raises(UsageError):
        validate_payload("content", {})


def test_semantic_chunk_file(tmp_path) -> None:
    f = tmp_path / "a.md"
    f.write_text("hello GEO 可见性", encoding="utf-8")
    payload = build_payload("semantic_chunk", content_file=str(f))
    assert "hello" in payload["content"]


@pytest.mark.parametrize(
    "wf,key",
    [
        ("content", "content"),
        ("content_pipeline", "content"),
        ("url_import", "keywords"),
        ("semantic_chunk", "chunks"),
    ],
)
def test_run_mock(wf: str, key: str) -> None:
    payload = demo_payload(wf)
    result = run_workflow(wf, payload, mock=True)
    assert result.get("engine") == "mock"
    assert key in result
    assert result.get("trace", {}).get("steps")


def test_envelope() -> None:
    result = run_workflow("content", demo_payload("content"), mock=True)
    env = wrap_envelope("content", result, data_source="demo", version="0.1.0")
    assert env["module"] == "workflow-content"
    assert env["data_source"] == "demo"
    assert "result" in env
