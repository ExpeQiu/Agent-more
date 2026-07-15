#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="${ROOT}/.run/oneagent.pid"

if [[ ! -f "${PID_FILE}" ]]; then
  echo "No pid file: ${PID_FILE}"
  exit 0
fi

PID="$(cat "${PID_FILE}")"
if kill -0 "${PID}" 2>/dev/null; then
  echo "Stopping OneAgent pid=${PID}"
  kill "${PID}"
else
  echo "Process not running: ${PID}"
fi

rm -f "${PID_FILE}"
