#!/usr/bin/env bash
# Thin wrapper so `bash scripts/build-windows-msix.sh` matches the plan.
# The Node script refuses to run except on win32.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec node "${ROOT}/scripts/build-windows-msix.js" "$@"
