#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 18 이상이 필요합니다: https://nodejs.org/" >&2
  exit 1
fi
exec node server.mjs
