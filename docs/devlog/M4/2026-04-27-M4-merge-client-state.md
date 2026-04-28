# 2026-04-27 — Refactor: Merge `mode-manager.js` + `delta-state.js` into `client-state.js`

M4 P4-3 (final stage of P4). Collapse the two parallel per-client state modules — `server/mode-manager.js` (hysteresis mode + per-IP HTTP map + 5 min TTL timer) and `server/delta-state.js` (delta snapshot + per-IP HTTP map + 5 min TTL timer) — into a single `server/client-state.js` with one shared TTL timer and one entry per HTTP client. Per-client state shape post-merge: `{ currentMode, previousSnapshot }`. Resolves M3 audit items D.3 ("delta-state TTL expiry has no test") and D.5 ("mode/delta TTL timers diverge").

## What moved

- `server/mode-manager.js` (169 LOC) **deleted** — every export migrates into `client-state.js`.
- `server/delta-state.js` (126 LOC) **deleted** — every export migrates into `client-state.js`.
- `server/__tests__/mode-manager.test.js` (87 LOC) **deleted** — assertions transcribed into the new `client-state.test.js`.
- `server/__tests__/delta-state.test.js` (56 LOC) **deleted** — assertions transcribed into the new `client-state.test.js`.

## API

```js
// server/client-state.js
const {
    createClientState,                        // → { currentMode: 'aggregated', previousSnapshot: null }
    applyHysteresis,                           // mutates state.currentMode
    getHttpClientState,                        // → { state, previousMode }
    saveHttpClientState,                       // persist + bump lastSeen + ensure timer
    getHttpClientKey,                          // unified key (body → header → IP)
    PER_GRID_THRESHOLD_ENTER,
    PER_GRID_THRESHOLD_EXIT,
    _runCleanupNow, _resetMap,                 // test-only seam
} = require('./client-state');
```

The single `Map<clientKey, { currentMode, snapshot, lastSeen }>` replaces the two former per-state maps. Both are restored via `getHttpClientState(key)` → `{ currentMode, previousSnapshot }` and re-persisted via `saveHttpClientState(key, state)` in one round-trip.

## Behavior changes

The merger is intentional but does shift one byte of behavior — both worth documenting:

1. **HTTP delta state now shares the unified key with mode state.** Pre-stage, mode used `getHttpClientKey` (`body.clientId` → `x-client-id` header → IP) while delta used `getHttpDeltaClientKey` (`body.clientId` → IP, **no header check**). Post-stage, a request that sets only `x-client-id` (no body clientId) gets `header-client:${id}` for both mode and delta — previously delta would have keyed on IP. Net effect: clients setting the header for cross-request stickiness now have **consistent** mode + delta state across HTTP requests instead of split state.
2. **`normalizeClientId` for the unified key now array-handles** (the mode-manager variant). The old delta `normalizeClientId` rejected non-strings; the new unified version recurses into arrays (e.g. repeated headers). Impact: more clients get consistent state across edge-cases involving repeated headers. No regression.

The wire-format `mode` field on HTTP and WS responses is **byte-identical** because the same request stream maps to the same key (now uniformly), so the persisted `currentMode` is identical to what the pre-stage code would have computed. Smoke-tested via preview: HTTP `/api/viewport` with `x-client-id: p4-3-test` and small bounds returns `mode: per-grid` consistently across two repeat requests (header-keyed state preserved).

## API ripple

| File | Change |
|---|---|
| `server/viewport-processor.js` | `processViewport(bounds, modeState, deltaState, zoom)` → `processViewport(bounds, clientState, zoom)` |
| `server/routes.js` | One key derivation, one `getHttpClientState`, one `saveHttpClientState` (down from two each) |
| `server/ws-handler.js` | `const clientState = createClientState();` (replaces `createModeState() + createDeltaState()`) |
| `server/__tests__/viewport-processor.test.js` | Calls updated to new signature |
| `server/__tests__/benchmark-gate.test.js` | Calls updated to new signature |
| `server/__tests__/golden-baseline.test.js` | Calls updated to new signature |

## Tests added

`server/__tests__/client-state.test.js` — 21 cases:

- **`createClientState`** (1) — initial state shape `{ currentMode: 'aggregated', previousSnapshot: null }`.
- **`applyHysteresis`** (9) — transcribed from the deleted mode-manager.test.js: aggregated/per-grid transitions at the ENTER and EXIT thresholds, hysteresis-band stickiness, full cycle.
- **`getHttpClientKey`** (6) — body.clientId, x-client-id header, x-forwarded-for, req.ip fallback, array-handling normalize, length-128 reject. The header-key case is **new coverage** (delta lacked it pre-stage).
- **HTTP state persist/restore** (3) — both fields persist together in one entry; default returns when key unseen; mutating returned snapshot does not bleed into stored entry (deep-clone invariant).
- **TTL cleanup** (2 — audit D.3 fix) — entries older than 5 min evicted via `_runCleanupNow()` after stubbing `Date.now`; entries within TTL survive a sweep.

Total server tests: 160 → **167** (deleted 13: 9 mode-manager + 4 delta-state; added 21 in client-state).

## File-size impact

- `server/mode-manager.js` (169) + `server/delta-state.js` (126) = **295 LOC removed**.
- `server/client-state.js` = **233 LOC added**.
- Net per-state-module: **-62 LOC**.
- Server-wide post-stage: 3279 (M3 baseline) → **3355** total. The growth across M4 (+76 vs baseline) comes from the P4-1 and P4-2 splits adding JSDoc and module headers; the P4-3 merger itself contracts. §11 target ≤ 3000 is not reached; P5-3 will document the residual against M5 candidates.

## Verification

- `npm run lint` / `format:check` — clean.
- `npm test` — 14 jest suites / **167 tests pass** (was 15 / 160; deleted 2 suites + added 1 → net -1 suite, +7 tests).
- `npm run smoke:wire-format` — 3 routes / 3 WS types / 45 fields ok. **`mode` field name + values byte-identical.**
- **Preview verification** on `npm run dev`:
    - `curl -X POST /api/viewport` with `x-client-id: p4-3-test`, bounds `[-100.5, 40, -100.0, 40.5]`, zoom 7 → `mode: per-grid`, `gridCount: 1`, 17-field stats. Repeat call with same header → `mode: per-grid` (state persisted by `header-client:` key — the new behavior).
    - WS round-trip via DevTools eval — fresh `WebSocket(...)`, sent `{type:'viewport', bounds:[-100, 30, -80, 45], zoom:5}`, received 18 fields (`type` + 17 stats), `mode: aggregated`, `gridCount: 1174`. WS code path unchanged from P4-2 (single `clientState` per connection).

## Risks and rollback

- **Risk**: the unified key derivation lands a behavior change for clients that previously sent `x-client-id`. **Mitigation**: change is intentional (audit D.5 fix). Documented in this entry. Wire format `mode` byte-identical; smoke + preview confirm.
- **Risk**: `_runCleanupNow()` test seam diverges from the timer-driven sweep at runtime. **Mitigation**: both call the same `runCleanupSweep()` private function; the test seam is just a synchronous invocation of that exact code path.
- **Risk**: `processViewport`'s new signature breaks an undiscovered consumer. **Mitigation**: cross-repo grep confirmed 5 call sites (routes, ws-handler, 3 test files), all updated.
- **Rollback**: `git revert` this commit. Phase 4 returns to its post-P4-2 state with the two parallel files restored. P5 not yet started.

## Files changed

- **Added**: `server/client-state.js` — 233 lines, the merged module.
- **Added**: `server/__tests__/client-state.test.js` — 21 tests including the audit D.3 TTL coverage.
- **Added**: `docs/plans/M4/P4/2026-04-27-M4P4-3-merge-client-state.md` — stage plan.
- **Added**: `docs/devlog/M4/2026-04-27-M4-merge-client-state.md` — this entry.
- **Deleted**: `server/mode-manager.js`, `server/delta-state.js`, `server/__tests__/mode-manager.test.js`, `server/__tests__/delta-state.test.js`.
- **Modified**: `server/viewport-processor.js` — `processViewport` signature collapses 2 state args into 1; import path updates from `./mode-manager` to `./client-state`.
- **Modified**: `server/routes.js` — single key derivation + single state get/save; import updated.
- **Modified**: `server/ws-handler.js` — `createClientState()` replaces two-state init; import updated.
- **Modified**: `server/__tests__/viewport-processor.test.js`, `server/__tests__/benchmark-gate.test.js`, `server/__tests__/golden-baseline.test.js` — calls updated to new `processViewport` signature; imports updated.
- **Modified**: `docs/DEVLOG.md` — index this entry.
