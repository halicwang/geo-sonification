# 2026-02-22 — Fix: Pre-Commit Prettier Guard

> **Deprecated (2026-02-23):** M3 Open Platform milestone was abandoned. Tooling, tests, and bugfixes introduced during this period are retained; the Open Platform feature set was not pursued.

Added a local `pre-commit` hook to format staged files before commit creation. This closes the gap where formatting issues were only caught in CI after the commit was already pushed.

## Details

- Added `.githooks/pre-commit` to run Prettier on staged files and re-stage them automatically.
- Updated hook setup script so both `pre-commit` and `commit-msg` are enabled together.
- Kept the existing `commit-msg` behavior unchanged (`DEVLOG-REVIEWED` remains warn-only by default).

## Files changed

- `.githooks/pre-commit` — new hook to auto-format staged files with Prettier.
- `scripts/setup-git-hooks.sh` — now marks `pre-commit` executable and documents the new behavior.
- `docs/devlog/M3/2026-02-22-M3-pre-commit-prettier-guard.md` — this entry.
- `docs/DEVLOG.md` — added index link.
