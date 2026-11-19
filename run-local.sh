#!/usr/bin/env bash
# Rabies Track Nepal — one-command local runner (macOS / Linux / Git Bash).
#   ./run-local.sh                 install → env → migrate → seed → API :5000 + web :3000
#   ./run-local.sh --keep-data     keep existing data (skip reseed if users exist)
#   ./run-local.sh --no-dev        prepare everything but don't start the server
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "✖ Node.js is not installed. Install Node 20.12+ (22 LTS recommended) from https://nodejs.org" >&2
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "✖ npm is not available on PATH (it ships with Node.js)." >&2
  exit 1
fi
echo "node $(node -v) · npm $(npm -v)"

exec node scripts/setup.mjs "$@"
