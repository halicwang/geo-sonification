# 2026-02-22 — Design: P0 Close-Out & Planning Hierarchy Convention

Completed P0-1 production code changes (the only runtime modification in P0) and P0-5 final verification. During close-out review, discovered that AI agents had not consulted the stage plan files (`docs/plans/M3/P0/`) during P0 execution because no upstream documentation referenced them. Added the Milestone → Phase → Stage planning hierarchy definition to `CLAUDE.md` and `AGENTS.md`, and added stage plan references to all three M3 lighthouse documents.

## P0-1: Production Code Changes

Two surgical changes to `server/index.js` — pure code motion with no behavioral change:

- **`attachWsHandler(wss)`** — extracted the `wss.on('connection', ...)` handler from `startServer()` into a standalone function with an idempotency guard (`_handlerAttached`). Enables test suites to attach WS handling to a mock server without calling `startServer()`.
- **`_setDataLoaded(value)`** — test-only setter for the `dataLoaded` flag. Allows golden baseline tests to bypass the data-loading phase.

Both are exported from `module.exports`.

## P0-5: Final Verification

All checks passed:

- `npm run lint` — clean
- `npm run format:check` — clean
- `npm test` — 12 suites, all green
- `npm run smoke` — all checks passed against running server
- CI enforcement — `golden-baseline.test.js` and `benchmark-gate.test.js` confirmed in Jest discovery path

## Planning Hierarchy Convention

Added a three-level terminology definition to prevent agents from missing stage-level execution plans:

| Level | ID Pattern | Example |
|-------|-----------|---------|
| Milestone | `M3` | M3 = Open Platform |
| Phase | `P0` – `P5` | P0 = Compatibility Guardrails |
| Stage | `1`, `2`, `3` … | P0-1 = production code changes |

Key rules added:

- `CLAUDE.md § Planning Hierarchy` — canonical definition with naming convention and directory mapping.
- `AGENTS.md` check #3 — agents must read all stage plans in `docs/plans/M*/P<n>/` before **planning or executing** phase work. If the folder is empty or absent, proceed but note the gap.
- All three M3 lighthouse docs — added references to `P*/` folders and back-references to `CLAUDE.md § Planning Hierarchy`.
- Document precedence chain updated: `SPEC > MIGRATION-PLAN > IMPLEMENTATION-GUIDE > Stage Plans (P*/)`.

## Files changed

- MOD: `server/index.js` — extracted `attachWsHandler(wss)` + added `_setDataLoaded(value)`, both exported
- MOD: `CLAUDE.md` — added `## Planning Hierarchy` section and `docs/plans/M*/P*/` to Directory Conventions
- MOD: `AGENTS.md` — added Planning Hierarchy reference, broadened check #3 to cover planning + execution, added empty-folder guidance, changed absolute paths to relative
- MOD: `docs/plans/M3/2026-02-21-M3-open-platform-spec.md` — added stage plan references in Companion Detailed Docs and §0.1
- MOD: `docs/plans/M3/2026-02-21-M3-migration-plan.md` — added stage plan references in Companion Detailed Docs and §0.1
- MOD: `docs/plans/M3/2026-02-22-M3-implementation-guide.md` — added `Stage plans (P*/)` row to Three-Document Protocol table
- MOD: `docs/devlog/M3/2026-02-22-M3-golden-baseline-harness.md` — added `server/index.js` to Files changed for P0-1
