# 2026-02-22 — Refactor: Move Project Docs into docs/

> **Deprecated (2026-02-23):** M3 Open Platform milestone was abandoned. Tooling, tests, and bugfixes introduced during this period are retained; the Open Platform feature set was not pursued.

Moved `ARCHITECTURE.md` and `DEVLOG.md` from the repository root into `docs/` to keep the top-level focused on runtime/configuration entry points. `AGENTS.md` and `CLAUDE.md` remain at the root because they are tool configuration anchors.

## Changes

- Moved `ARCHITECTURE.md` to `docs/ARCHITECTURE.md`.
- Moved `DEVLOG.md` to `docs/DEVLOG.md`.
- Updated `docs/DEVLOG.md` index links from `docs/devlog/...` to `devlog/...` so links stay valid after relocation.
- Updated policy/reference paths in `AGENTS.md`, `CLAUDE.md`, and `README.md` to point at the new documentation locations.

## Files changed

- `docs/ARCHITECTURE.md` — moved from repository root
- `docs/DEVLOG.md` — moved from repository root, index links updated, new entry link added
- `docs/devlog/M3/2026-02-22-M3-docs-root-cleanup.md` — this entry (new)
- `AGENTS.md` — DEVLOG path references updated
- `CLAUDE.md` — architecture/devlog reference paths updated
- `README.md` — repository tree updated to reflect docs relocation
