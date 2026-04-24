# 2026-04-23 — Design: M3 Tech Debt Audit

Full-repo survey of M3-era code, plans, and docs to enumerate remaining
optimization opportunities after the Open Platform plan was deprecated
(2026-02-23) and the milestone was re-scoped to UX / audio iteration on
branch `feat/M3-ui-ux-overhaul`. Catalogued to avoid re-running the same
investigation in the future; items acted on in the follow-up hardening
commit are cross-linked from that entry.

Status legend per finding:

- `[此次处理]` — addressed in the companion hardening commit
- `[已在代码中处理]` — original suspicion turned out to be a non-issue
  after direct code inspection
- `[剔除]` — intentionally not worth pursuing
- `[待办 • 高|中|低]` — real but deferred, with severity

## A. Frontend Test Coverage

- **A.1 `[待办 • 高]`** `frontend/__tests__/` does not exist. Server has
  14 suites / 154 tests; frontend has zero. High regression risk for the
  city announcer, audio engine timer logic, and viewport debouncing.
  Introducing `vitest` + `happy-dom` (or equivalent) requires explicit
  dependency approval per `CLAUDE.md`.

## B. Frontend Lifecycle and State

- **B.1 `[已在代码中处理]`** `audio-engine.scheduleGlobalSwap()` was
  suspected of double-firing; `frontend/audio-engine.js:459` already
  calls `clearGlobalSwapTimer()` on entry, so re-entry is safe.
- **B.2 `[已在代码中处理]`** `announcer.setEnabled(false)` was suspected
  of leaving the dwell timer pending; the audio-toggle handler at
  `frontend/main.js:149` already calls `announcer.reset()` right after,
  which clears `dwellTimer` and `currentSource`.
- **B.3 `[此次处理]`** `loadCities()` at `frontend/city-announcer.js:70`
  is fired once at module init (line 86); a transient failure leaves
  `citiesLoaded = false` forever with no retry.
- **B.4 `[此次处理]`** `setEnabled(false)` relies on external callers to
  follow up with `reset()`. Moving the cleanup inside `setEnabled` makes
  future callers forgiving.
- **B.5 `[剔除]`** `bufferCache` comment at
  `frontend/city-announcer.js:217` says "LRU eviction" but the
  `bufferCache.keys().next().value` call is insertion-order (FIFO). City
  buffers are write-once and rarely re-accessed, so FIFO is fine; only
  the comment is fixed in the hardening commit.
- **B.6 `[剔除]`** `rafLoop()` runs every frame even when all bus
  targets have converged. Not a correctness issue; the math is a few
  multiply-adds and the cost is dwarfed by Web Audio scheduling.
- **B.7 `[剔除]`** DOM event listeners in
  `frontend/main.js` are not removed. The page never tears down its
  `DOMContentLoaded` scope, so the listeners outlive nothing.

## C. User-Visible Silent Failures

- **C.1 `[此次处理]`** When every ambience WAV fails to load,
  `renderLoadingUI()` still settles on `Playing (7 failed)`
  (`frontend/main.js:199-207`), which misleads the user — nothing is
  playing. Should render an explicit init-failure message plus a toast.
- **C.2 `[此次处理]`** PMTiles unreachable at
  `frontend/map.js:283-288` only produces a `console.warn`; the user
  sees an empty globe with no indication of cause.
- **C.3 `[合并至 B.3]`** `cities.json` load failure is the same class
  of bug as B.3 — retry solves both.
- **C.4 `[待办 • 低]`** Startup asset warnings (added in the
  2026-04-23 review follow-up commit) only go to server stdout. A
  browser-side channel (for example, pushing a warning over WebSocket
  on connect) would surface them to the actual user. Not critical while
  operator workflow is a single developer.

## D. Server

- **D.1 `[待办 • 低]`** `_statsTimer` in `server/index.js` logs every
  30 s even while `dataLoaded = false` during boot.
- **D.2 `[待办 • 低]`** `server/viewport-processor.js` recomputes audio
  parameters on every viewport tick; landcover distribution is often
  unchanged between frames and could be memoised against the last
  input hash.
- **D.3 `[待办 • 中]`** `server/delta-state.js` has tests for HTTP
  client-key derivation and snapshot round-trip, but no coverage for
  TTL expiry or the periodic cleanup path; `server/mode-manager.js`
  exercises both.
- **D.4 `[待办 • 低]`** `CACHE_SCHEMA_VERSION` in `server/data-loader.js`
  has an inline comment about the current version bump but no
  migration changelog.
- **D.5 `[待办 • 低]`** `mode-manager` and `delta-state` each maintain
  their own per-client map with different TTLs. Merging them would
  avoid eviction skew.

## E. Docs and Structure

- **E.1 `[剔除]`** Suspected that the Planning Hierarchy description
  still framed M3 as "Open Platform" and pointed readers at a
  non-existent `docs/plans/M3/`. On closer inspection, `CLAUDE.md` and
  `AGENTS.md` were removed and git-ignored in commit 9b5af86 as
  local-only AI agent config; they are no longer the project's source
  of truth. The actual project documentation (`README.md`,
  `docs/ARCHITECTURE.md`, and `docs/DEVLOG.md`) already reflects the
  M3 scope pivot — no repo-tracked doc needs updating for this item.
- **E.2 `[待办 • 低]`** `data/cities.json` has no schema file, source
  attribution, or update timestamp. With ~555 records and a clear
  shape already documented in `docs/ARCHITECTURE.md`, a lightweight
  schema file would help future data refreshes.
- **E.3 `[剔除]`** Branch name `feat/M3-ui-ux-overhaul` reads as a
  rename suggestion but would churn PR history for no benefit.

## Files Changed

- **Added**: `docs/devlog/M3/2026-04-23-M3-tech-debt-audit.md` — this
  entry
- **Modified**: `docs/DEVLOG.md` — add this devlog entry to the index
