#!/usr/bin/env bash
# 一键验证：Prisma schema、后端编译、前端构建
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "[verify] 错误: 未找到 pnpm，请先安装 https://pnpm.io/installation" >&2
  exit 1
fi

echo "[verify] prisma validate"
(cd "$ROOT/backend" && pnpm exec prisma validate)

echo "[verify] backend build"
(cd "$ROOT/backend" && pnpm run build)

echo "[verify] frontend build"
(cd "$ROOT/frontend" && pnpm run build)

echo "[verify] 全部通过"
