#!/usr/bin/env bash
# 停止 dev：PID 文件 + 释放 3000/3001 上本项目常见的 node（修复遗留 Next 导致 _next/static 404）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

kill_pid_if_running() {
  local pid="$1"
  local label="$2"
  [[ -z "$pid" ]] && return 0
  if kill -0 "$pid" 2>/dev/null; then
    echo "[stop] 结束 $label (pid=$pid)"
    kill "$pid" 2>/dev/null || true
    sleep 0.2
    kill -9 "$pid" 2>/dev/null || true
  fi
}

# 1) PID 文件（历史兼容；单独 kill 子 shell 往往杀不掉 node）
for name in backend frontend; do
  pidfile="$ROOT/.logs/${name}.pid"
  if [[ -f "$pidfile" ]]; then
    kill_pid_if_running "$(cat "$pidfile")" "$name(pidfile)"
    rm -f "$pidfile"
  fi
done

# 2) 按监听端口清理（macOS / Linux 需安装 lsof）
if ! command -v lsof >/dev/null 2>&1; then
  echo "[stop] 未安装 lsof，跳过按端口清理；若仍有 404 请手动结束占用 3000/3001 的 node" >&2
  echo "[stop] 完成"
  exit 0
}

free_port_dev() {
  local port="$1"
  local pattern="$2"
  local pids
  pids=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)
  [[ -z "$pids" ]] && return 0
  for pid in $pids; do
    local cmd
    cmd=$(ps -p "$pid" -o command= 2>/dev/null || true)
    if [[ "$cmd" == *"$pattern"* ]]; then
      echo "[stop] 释放端口 $port: pid=$pid"
      kill "$pid" 2>/dev/null || true
      sleep 0.2
      kill -9 "$pid" 2>/dev/null || true
    fi
  done
}

# 前端 dev 一般为 .../next/... 或 node ... next
free_port_dev 3000 "next"
# 后端：tsx / node 跑 backend
free_port_dev 3001 "tsx"
free_port_dev 3001 "backend"

echo "[stop] 完成"
