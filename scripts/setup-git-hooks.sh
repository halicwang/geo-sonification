#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"
chmod +x .githooks/commit-msg
git config core.hooksPath .githooks

echo "Git hooks enabled: core.hooksPath=.githooks"
echo "commit-msg hook is active."
echo "Default mode: warn-only (does not block commits)."
echo "To enforce trailer check, commit with DEVLOG_REVIEWED_ENFORCE=1."
