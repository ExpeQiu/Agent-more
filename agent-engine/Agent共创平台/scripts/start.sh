#!/usr/bin/env bash
# 后台启动前后端；启动前会先 stop，避免遗留 Next 占 3000 导致 _next/static 404
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p "$ROOT/.logs"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "[start] 错误: 未找到 pnpm" >&2
  exit 1
fi

if [[ "${START_NO_STOP:-}" != "1" ]]; then
  bash "$ROOT/scripts/stop.sh" || true
  sleep 0.5
fi

echo "[start] 启动 backend :3001 -> .logs/backend.log"
(cd "$ROOT/backend" && pnpm dev) >>"$ROOT/.logs/backend.log" 2>&1 &
echo $! >"$ROOT/.logs/backend.pid"

echo "[start] 启动 frontend :3000 (next dev -p 3000) -> .logs/frontend.log"
(cd "$ROOT/frontend" && pnpm exec next dev -p 3000 -H 0.0.0.0) >>"$ROOT/.logs/frontend.log" 2>&1 &
echo $! >"$ROOT/.logs/frontend.pid"

# 子 shell PID 不可靠：稍后把 PID 换成真正监听端口的进程，便于 stop 精准结束
(
  sleep 3
  if command -v lsof >/dev/null 2>&1; then
    fpid=$(lsof -nP -iTCP:3000 -sTCP:LISTEN -t 2>/dev/null | head -1 || true)
    [[ -n "${fpid:-}" ]] && echo "$fpid" >"$ROOT/.logs/frontend.pid"
    bpid=$(lsof -nP -iTCP:3001 -sTCP:LISTEN -t 2>/dev/null | head -1 || true)
    [[ -n "${bpid:-}" ]] && echo "$bpid" >"$ROOT/.logs/backend.pid"
  fi
) &

echo "[start] 已启动。日志: tail -f .logs/backend.log .logs/frontend.log"
echo "[start] 若静态资源 404：执行 ./stop.sh 后执行 rm -rf frontend/.next 再 ./start.sh"
