#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

mkdir -p data logs .run

if [[ ! -d node_modules ]]; then
  echo "==> npm install"
  npm install
fi

echo "==> build"
npm run build

PORT="${PORT:-8790}"
CONFIG="${ONEAGENT_CONFIG:-${ROOT}/oneagent.config.yaml}"

echo "==> start oneagent serve (port=${PORT})"
nohup node dist/src/cli/index.js serve --port "${PORT}" --config "${CONFIG}" \
  > logs/server.log 2>&1 &
echo $! > .run/oneagent.pid

echo "OneAgent started pid=$(cat .run/oneagent.pid)"
echo "health: curl http://127.0.0.1:${PORT}/healthz"
