#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

if [[ ! -d node_modules ]]; then
  npm install
fi

echo "==> typecheck"
npm run check

echo "==> test"
ONEAGENT_MOCK_MODE=true npm test

echo "==> build"
npm run build

echo "==> smoke: agents validate"
ONEAGENT_MOCK_MODE=true node dist/src/cli/index.js agents validate

echo "==> smoke: run"
ONEAGENT_MOCK_MODE=true node dist/src/cli/index.js run --agent reviewer --goal "审阅示例文档"

echo "All checks passed."
