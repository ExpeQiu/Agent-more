"""content-lg CLI 入口（Click）。"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import click

from content_lg import __version__
from content_lg.config import list_workflows
from content_lg.payload import build_payload
from content_lg.runner import run_workflow, wrap_envelope
from content_lg.utils.errors import EXIT_ERROR, EXIT_OK, EXIT_USAGE, EngineError, UsageError
from content_lg.utils.logger import get_logger, setup_logging

logger = get_logger("content_lg.cli")


def _emit(data: Any, *, fmt: str, output: str | None) -> None:
    if fmt == "json":
        text = json.dumps(data, ensure_ascii=False, indent=2)
    else:
        text = _format_table(data)
    if output:
        Path(output).write_text(text + "\n", encoding="utf-8")
        click.echo(f"已写入 {output}", err=True)
    else:
        click.echo(text)


def _format_table(data: Any) -> str:
    if isinstance(data, dict) and "items" in data and isinstance(data["items"], list):
        lines = [f"{'TYPE':<20} DESCRIPTION", "-" * 60]
        for item in data["items"]:
            if isinstance(item, dict):
                lines.append(f"{str(item.get('type', '')):<20} {item.get('description', '')}")
        return "\n".join(lines)
    if isinstance(data, dict) and "result" in data:
        result = data["result"] if isinstance(data["result"], dict) else {}
        lines = [
            f"module: {data.get('module')}",
            f"workflow: {data.get('workflow_type')}",
            f"data_source: {data.get('data_source')}",
            f"engine: {result.get('engine')}",
        ]
        if "content" in result:
            preview = str(result["content"])[:200].replace("\n", " ")
            lines.append(f"content_preview: {preview}")
        if "chunks" in result:
            lines.append(f"chunks: {len(result.get('chunks') or [])}")
        if "keywords" in result:
            lines.append(f"keywords: {', '.join(str(k) for k in (result.get('keywords') or [])[:8])}")
        if isinstance(result.get("trace"), dict):
            steps = result["trace"].get("steps") or []
            lines.append(f"trace: {' -> '.join(str(s) for s in steps)}")
        return "\n".join(lines)
    return json.dumps(data, ensure_ascii=False, indent=2)


@click.group()
@click.version_option(__version__, prog_name="content-lg")
@click.option("-v", "--verbose", is_flag=True, help="DEBUG 日志")
@click.option("-q", "--quiet", is_flag=True, help="仅 WARNING+")
@click.pass_context
def cli(ctx: click.Context, verbose: bool, quiet: bool) -> None:
    """content-LangGraph-CLI — 直跑内容工作流引擎。"""
    setup_logging(verbose=verbose, quiet=quiet)
    ctx.ensure_object(dict)
    ctx.obj["verbose"] = verbose


@cli.group()
def workflow() -> None:
    """工作流 list / run。"""


@workflow.command("list")
@click.option("--format", "fmt", type=click.Choice(["table", "json"]), default="table")
@click.option("-o", "--output", "output_path", default=None, help="写入文件")
def workflow_list(fmt: str, output_path: str | None) -> None:
    """列出 workflows.yml 中的类型。"""
    items = list_workflows()
    payload = {
        "module": "workflow-list",
        "version": __version__,
        "data_source": "config",
        "count": len(items),
        "items": items,
    }
    _emit(payload, fmt=fmt, output=output_path)


@workflow.command("run")
@click.argument("workflow_type")
@click.option("--demo", is_flag=True, help="使用内置示例 payload，不访问外网")
@click.option("--mock/--no-mock", default=True, show_default=True, help="Mock 引擎（第一期默认开）")
@click.option("--payload-file", type=str, default=None, help="JSON payload 文件，- 表示 stdin")
@click.option("--title", type=str, default=None)
@click.option("--prompt", type=str, default=None)
@click.option("--prompt-file", type=str, default=None)
@click.option("--evidence-file", type=str, default=None, help="证据 JSON 数组文件")
@click.option("--pipeline-mode", type=click.Choice(["fast", "deep", "standard"]), default=None)
@click.option("--url", type=str, default=None)
@click.option("--text", type=str, default=None, help="url_import 正文 / semantic_chunk 正文")
@click.option("--page-file", type=str, default=None, help="url_import page_json 文件")
@click.option("--target", type=str, default=None, help="url_import target")
@click.option("--file", "content_file", type=str, default=None, help="semantic_chunk 正文文件")
@click.option("--max-chars", type=int, default=None)
@click.option("--format", "fmt", type=click.Choice(["json", "table"]), default="json")
@click.option("-o", "--output", "output_path", default=None)
def workflow_run(
    workflow_type: str,
    demo: bool,
    mock: bool,
    payload_file: str | None,
    title: str | None,
    prompt: str | None,
    prompt_file: str | None,
    evidence_file: str | None,
    pipeline_mode: str | None,
    url: str | None,
    text: str | None,
    page_file: str | None,
    target: str | None,
    content_file: str | None,
    max_chars: int | None,
    fmt: str,
    output_path: str | None,
) -> None:
    """直跑指定 workflow type，结果 JSON 输出到 stdout。"""
    try:
        payload = build_payload(
            workflow_type,
            payload_file=payload_file,
            demo=demo,
            title=title,
            prompt=prompt,
            prompt_file=prompt_file,
            evidence_file=evidence_file,
            pipeline_mode=pipeline_mode,
            url=url,
            text=text,
            page_file=page_file,
            target=target,
            content_file=content_file,
            max_chars=max_chars,
        )
        use_mock = mock or demo
        result = run_workflow(workflow_type, payload, mock=use_mock)
        data_source = "demo" if demo else ("mock" if use_mock else "live")
        envelope = wrap_envelope(
            workflow_type,
            result,
            data_source=data_source,
            version=__version__,
        )
        _emit(envelope, fmt=fmt, output=output_path)
    except UsageError as exc:
        click.echo(f"用法错误: {exc}", err=True)
        raise SystemExit(EXIT_USAGE) from exc
    except EngineError as exc:
        click.echo(f"引擎错误: {exc}", err=True)
        raise SystemExit(EXIT_ERROR) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("unhandled_error")
        click.echo(f"错误: {exc}", err=True)
        raise SystemExit(EXIT_ERROR) from exc


def main() -> None:
    try:
        cli(obj={})
    except SystemExit as exc:
        code = exc.code if isinstance(exc.code, int) else EXIT_ERROR
        sys.exit(code)
    sys.exit(EXIT_OK)


if __name__ == "__main__":
    main()
