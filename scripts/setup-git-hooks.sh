#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"
chmod +x .githooks/commit-msg
chmod +x .githooks/pre-commit
git config core.hooksPath .githooks

echo "Git hooks enabled: core.hooksPath=.githooks"
echo "pre-commit and commit-msg hooks are active."
echo "pre-commit auto-formats staged files with Prettier."
echo "Default mode: warn-only (does not block commits)."
echo "To enforce trailer check, commit with DEVLOG_REVIEWED_ENFORCE=1."
