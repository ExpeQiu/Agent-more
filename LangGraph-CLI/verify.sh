#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

PASS=0
FAIL=0

log()  { echo "[verify] $*"; }
ok()   { log "✓ $*"; PASS=$((PASS + 1)); }
fail() { log "✗ $*"; FAIL=$((FAIL + 1)); }

log "准备虚拟环境..."
if [[ ! -x "$ROOT/.venv/bin/python" ]]; then
  python3 -m venv "$ROOT/.venv"
fi
PYTHON="$ROOT/.venv/bin/python"
PIP="$ROOT/.venv/bin/pip"

run_cli() {
  if [[ -x "$ROOT/.venv/bin/content-lg" ]]; then
    "$ROOT/.venv/bin/content-lg" "$@"
  else
    env PYTHONPATH="$ROOT${PYTHONPATH:+:$PYTHONPATH}" "$PYTHON" -m content_lg.cli "$@"
  fi
}

log "安装依赖..."
if "$PIP" install -q -e ".[dev]"; then
  ok "pip install -e . (venv)"
else
  fail "pip install -e ."
fi

if run_cli --version >/dev/null 2>&1; then
  ok "content-lg --version"
else
  fail "content-lg --version"
fi

if run_cli --help >/dev/null 2>&1; then
  ok "content-lg --help"
else
  fail "content-lg --help"
fi

if run_cli workflow list --format json 2>/dev/null | $PYTHON -c "
import sys, json
d = json.load(sys.stdin)
assert d.get('module') == 'workflow-list'
assert d.get('count', 0) >= 4
types = {i['type'] for i in d['items']}
assert types >= {'content', 'content_pipeline', 'url_import', 'semantic_chunk'}
"; then
  ok "workflow list 契约"
else
  fail "workflow list 契约"
fi

check_run() {
  local type="$1"
  local expect_key="$2"
  if run_cli workflow run "$type" --demo --format json 2>/dev/null | $PYTHON -c "
import sys, json
d = json.load(sys.stdin)
assert d.get('module') == 'workflow-$type'
assert d.get('data_source') == 'demo'
assert d.get('workflow_type') == '$type'
r = d.get('result') or {}
assert r.get('engine') == 'mock'
assert '$expect_key' in r
assert isinstance(r.get('trace'), dict) and r['trace'].get('steps')
"; then
    ok "workflow run $type --demo"
  else
    fail "workflow run $type --demo"
  fi
}

check_run content content
check_run content_pipeline content
check_run url_import keywords
check_run semantic_chunk chunks

if run_cli workflow run unknown --demo >/dev/null 2>&1; then
  fail "未知 type 应非 0"
else
  code=$?
  if [[ "$code" -eq 2 ]]; then
    ok "未知 type exit 2"
  else
    fail "未知 type exit=$code 期望 2"
  fi
fi

if $PYTHON -m pytest -q "$ROOT/tests" >/dev/null 2>&1; then
  ok "pytest"
else
  fail "pytest"
fi

log "结果: PASS=$PASS FAIL=$FAIL"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
exit 0
