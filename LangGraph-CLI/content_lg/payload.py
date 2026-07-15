"""按 workflow type 组装 / 校验 payload。"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from content_lg.config import WORKFLOW_TYPES
from content_lg.utils.errors import UsageError


def _read_text(path: str) -> str:
    if path == "-":
        return sys.stdin.read()
    p = Path(path)
    if not p.is_file():
        raise UsageError(f"文件不存在: {path}")
    return p.read_text(encoding="utf-8")


def _read_json(path: str) -> Any:
    raw = _read_text(path)
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise UsageError(f"JSON 解析失败 ({path}): {exc}") from exc


def load_payload_file(path: str | None) -> dict[str, Any] | None:
    if not path:
        return None
    data = _read_json(path)
    if not isinstance(data, dict):
        raise UsageError("--payload-file 必须是 JSON object")
    return data


def demo_payload(workflow_type: str) -> dict[str, Any]:
    """离线验收用内置 payload。"""
    if workflow_type == "content":
        return {
            "title": "Demo: GEO 内容写作",
            "prompt": "请用中文写一段关于生成式引擎优化（GEO）的简介。",
            "user_request": "Demo: GEO 内容写作",
            "evidence": [{"id": "K1", "content": "GEO 关注 AI 回答中的品牌可见性。"}],
        }
    if workflow_type == "content_pipeline":
        return {
            "title": "Demo: Pipeline 快稿",
            "prompt": "撰写一篇技术品牌 GEO 短文。",
            "user_request": "Demo: Pipeline 快稿",
            "pipeline_mode": "fast",
            "research_pack": [{"id": "R1", "content": "用户通过 AI 助手发现品牌。"}],
            "brand_pack": [{"id": "B1", "content": "品牌语气：专业、简洁。"}],
            "evidence": [{"id": "K1", "content": "证据片段"}],
        }
    if workflow_type == "url_import":
        return {
            "url": "inline://demo",
            "target": "knowledge",
            "page_json": {
                "title": "Demo 导入页",
                "text": "生成式引擎优化帮助品牌进入 AI 回答。关键词包括可见性、引用、权威来源。",
            },
        }
    if workflow_type == "semantic_chunk":
        return {
            "content": (
                "# Demo 知识正文\n\n"
                "第一段讨论 GEO 的定义与目标。\n\n"
                "第二段说明内容生产与评估门禁如何协作。\n\n"
                "第三段给出知识库切片的实践建议。"
            )
        }
    raise UsageError(f"未知 workflow type: {workflow_type}")


def build_payload(
    workflow_type: str,
    *,
    payload_file: str | None = None,
    demo: bool = False,
    title: str | None = None,
    prompt: str | None = None,
    prompt_file: str | None = None,
    evidence_file: str | None = None,
    pipeline_mode: str | None = None,
    url: str | None = None,
    text: str | None = None,
    page_file: str | None = None,
    target: str | None = None,
    content_file: str | None = None,
    max_chars: int | None = None,
) -> dict[str, Any]:
    if workflow_type not in WORKFLOW_TYPES:
        raise UsageError(
            f"未知 workflow type: {workflow_type}；可选: {', '.join(sorted(WORKFLOW_TYPES))}"
        )

    file_payload = load_payload_file(payload_file)
    if file_payload is not None:
        payload = dict(file_payload)
    elif demo:
        payload = demo_payload(workflow_type)
    else:
        payload = {}

    if prompt_file:
        prompt = _read_text(prompt_file)
    if evidence_file:
        evidence = _read_json(evidence_file)
        if not isinstance(evidence, list):
            raise UsageError("--evidence-file 必须是 JSON 数组")
        payload["evidence"] = evidence

    if title is not None:
        payload["title"] = title
        payload.setdefault("user_request", title)
    if prompt is not None:
        payload["prompt"] = prompt
    if pipeline_mode is not None:
        payload["pipeline_mode"] = pipeline_mode

    if workflow_type == "url_import":
        if url is not None:
            payload["url"] = url
        if target is not None:
            payload["target"] = target
        page = payload.get("page_json") if isinstance(payload.get("page_json"), dict) else {}
        if page_file:
            loaded = _read_json(page_file)
            if not isinstance(loaded, dict):
                raise UsageError("--page-file 必须是 JSON object")
            page = loaded
        if title is not None:
            page["title"] = title
        if text is not None:
            page["text"] = text
        if page:
            payload["page_json"] = page

    if workflow_type == "semantic_chunk":
        if content_file:
            content = _read_text(content_file)
            if max_chars and max_chars > 0:
                content = content[:max_chars]
            payload["content"] = content
        elif text is not None:
            content = text
            if max_chars and max_chars > 0:
                content = content[:max_chars]
            payload["content"] = content

    validate_payload(workflow_type, payload)
    return payload


def validate_payload(workflow_type: str, payload: dict[str, Any]) -> None:
    if workflow_type in {"content", "content_pipeline"}:
        if not (payload.get("prompt") or payload.get("title") or payload.get("user_request")):
            raise UsageError(
                f"{workflow_type} 需要 --title/--prompt/--prompt-file，或 --payload-file，或 --demo"
            )
        return

    if workflow_type == "url_import":
        page = payload.get("page_json") if isinstance(payload.get("page_json"), dict) else {}
        has_body = bool(page.get("text") or page.get("title") or payload.get("url"))
        if not has_body:
            raise UsageError(
                "url_import 需要 --url/--title/--text，或 --page-file，或 --payload-file，或 --demo"
            )
        return

    if workflow_type == "semantic_chunk":
        if not str(payload.get("content") or "").strip():
            raise UsageError(
                "semantic_chunk 需要 --file/--text，或 --payload-file，或 --demo"
            )
        return
