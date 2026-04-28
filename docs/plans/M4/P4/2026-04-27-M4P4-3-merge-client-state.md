# P4-3 — Merge `mode-manager.js` + `delta-state.js` into `client-state.js`

**Prerequisite:** P4-2 (`server/ws-handler.js` extracted)
**Trace:** Milestone 4 Phase 4 — Server decomposition + state merger (final stage)
**Companion:** [M4 razor-refactor proposal](../2026-04-27-M4-razor-refactor-proposal.md) §8; resolves M3 audit items D.3 + D.5

## Context

`server/mode-manager.js` (169 LOC) and `server/delta-state.js` (126 LOC) parallel each other almost line-for-line:

- both maintain a `Map<clientKey, { …, lastSeen }>` of HTTP per-client entries
- both run a 5-minute TTL with 1-minute sweep timers (M3 audit D.5: "mode/delta TTL timers diverge")
- both ship a `normalizeClientId` helper and a `getHttp…ClientKey` derivation

The two key derivations differ subtly:

| Step | `getHttpClientKey` (mode) | `getHttpDeltaClientKey` (delta) |
|---|---|---|
| 1 | `body.clientId` → `client:${id}` | `body.clientId` → `client:${id}` |
| 2 | `x-client-id` header → `header-client:${id}` | _(skipped)_ |
| 3 | `x-forwarded-for` first IP → `ip:${ip}` | `x-forwarded-for` first IP → `ip:${ip}` |
| 4 | `req.ip` fallback | `req.ip` fallback |

Mode also handles **arrays** in `normalizeClientId` (for repeated headers); delta only accepts strings. The asymmetry is unintentional drift — both client identifiers should be the same per request.

P4-3 collapses both files into one `server/client-state.js` with:

- one `Map<clientKey, { currentMode, snapshot, lastSeen }>` per HTTP client
- one cleanup timer (5-minute TTL, 1-minute sweep) — fixes audit D.5
- one `getHttpClientKey` (the mode-manager variant — header-aware, array-aware)
- one `createClientState()` returning `{ currentMode: 'aggregated', previousSnapshot: null }`
- `applyHysteresis(clientState, gridCount)` unchanged (mutates `clientState.currentMode`)
- a TTL expiry test (fixes audit D.3) — uses `jest.useFakeTimers()` to advance past 5 min

## Behavior changes

The merger is intentional but does shift one byte of behavior:

- **HTTP delta state now keys on `header-client:` and `client:` consistently with mode state.** Previously a client sending `x-client-id` for one route family but not the other would get split state. After P4-3 their delta and mode share a single entry. This is the audit D.5 fix in spirit; the `mode` field on the wire is unchanged because the same request-stream maps to the same key (now uniformly).
- **`normalizeClientId` for the unified key now array-handles** (mode-manager's variant). A client sending a single-element repeated header used to be treated as IP; now they're treated as the array's first valid value. Practical effect: more clients get consistent state across requests. No regression.

`processViewport`'s signature changes from `(bounds, modeState, deltaState, zoom)` to `(bounds, clientState, zoom)` — the merge cascade. Inside the function `clientState.currentMode` and `clientState.previousSnapshot` replace the two former state objects' fields. Output stats (the wire-format `mode` field, `audioParams`, etc.) are byte-identical.

## API

```js
// server/client-state.js
const {
    createClientState,
    applyHysteresis,
    getHttpClientState,
    saveHttpClientState,
    getHttpClientKey,
    PER_GRID_THRESHOLD_ENTER,
    PER_GRID_THRESHOLD_EXIT,
} = require('./client-state');

createClientState()              // → { currentMode: 'aggregated', previousSnapshot: null }
applyHysteresis(state, gridCount) // mutates state.currentMode
getHttpClientState(clientKey)    // → { state, previousMode }
saveHttpClientState(clientKey, state)  // persist + bump lastSeen + ensure timer
getHttpClientKey(req)            // unified key derivation
```

Test-only seam:

```js
const { _runCleanupNow, _resetMap } = require('./client-state');
// _runCleanupNow() — invoke the sweep callback synchronously (skip jest.useFakeTimers latency)
// _resetMap() — clear the per-test Map
```

## Engine integration

| Old call site | New |
|---|---|
| `routes.js`: 2 keys + 2 get + 2 save | 1 key + 1 get + 1 save |
| `ws-handler.js`: `const modeState = createModeState(); const deltaState = createDeltaState();` | `const clientState = createClientState();` |
| `viewport-processor.js`: `processViewport(bounds, modeState, deltaState, zoom)` | `processViewport(bounds, clientState, zoom)` |
| `benchmark-gate.test.js` + `viewport-processor.test.js`: 2-state construction | 1-state construction |

## Tests

Merge `mode-manager.test.js` (87 LOC) + `delta-state.test.js` (56 LOC) into `client-state.test.js`. Cases:

1. `createClientState` initial: `{ currentMode: 'aggregated', previousSnapshot: null }`
2. **`applyHysteresis`** (8 cases, transcribed from mode-manager.test.js):
    - stays aggregated when `gridCount === 0`
    - enters per-grid at `gridCount > 0 && gridCount <= ENTER`
    - enters per-grid at exact ENTER threshold
    - stays aggregated when `gridCount > ENTER`
    - stays per-grid when `gridCount <= EXIT`
    - exits per-grid when `gridCount > EXIT`
    - exits per-grid when `gridCount === 0`
    - hysteresis cycle: aggregated → per-grid → aggregated
3. **`getHttpClientKey`** (4 cases, including header path that delta lacked):
    - body.clientId → `client:${id}`
    - x-client-id header → `header-client:${id}`
    - x-forwarded-for → `ip:${first-ip}`
    - req.ip fallback
4. **HTTP state persist/restore** (transcribed from delta-state.test.js):
    - save then get returns `{ state, previousMode }` with snapshot deep-cloned
    - mutating returned state's fields doesn't bleed into stored entry
    - mode and snapshot persist together (the merger)
5. **TTL expiry** (audit D.3 fix): with `jest.useFakeTimers()`, save an entry; advance 6 min; verify entry is evicted via `_runCleanupNow()` or wait for the scheduled tick.
6. **Cleanup timer self-stops when Map is empty** — preserves the existing eager-stop pattern.

Other tests:
- `viewport-processor.test.js`: signature update — `processViewport(bounds, clientState, zoom)`. Test cases that constructed `modeState` + `deltaState` separately now construct one `clientState`. No behavior assertions change.
- `benchmark-gate.test.js`: same signature update.

## Files affected

- **Added**: `server/client-state.js` (~150 LOC merged)
- **Added**: `server/__tests__/client-state.test.js` (~120 LOC merged + TTL test)
- **Deleted**: `server/mode-manager.js`, `server/delta-state.js`, `server/__tests__/mode-manager.test.js`, `server/__tests__/delta-state.test.js`
- **Modified**: `server/viewport-processor.js`, `server/routes.js`, `server/ws-handler.js`, `server/__tests__/viewport-processor.test.js`, `server/__tests__/benchmark-gate.test.js`

## Definition of Done

- `server/client-state.js` exists; exports the unified API.
- `server/mode-manager.js` and `server/delta-state.js` are deleted (no `require('./mode-manager')` or `require('./delta-state')` anywhere in `server/` or `scripts/`).
- `server/__tests__/client-state.test.js` covers all 14 cases (8 hysteresis + 4 keys + 2 persist/restore) plus 2 TTL cases.
- `server/index.js` continues to call `attachRoutes` / `attachWsHandler` unchanged (deps shape preserved).
- `wc -l server/index.js` drops to ≤ 250 — proposal §11 server-LOC target.
- `npm test` — 15 jest suites pass (2 deleted + 1 added → 14 total before, 15 after; let me re-check). 160 tests pass.
- `npm run lint` / `format:check` — clean.
- `npm run smoke:wire-format` — 3 routes / 3 WS types / 45 fields ok. **`mode` field byte-identical.**
- Preview verification: `curl -X POST /api/viewport` returns identical 17-field stats with the same `mode` value across requests; mode hysteresis still observable across two zoomed-in requests.
- Devlog `docs/devlog/M4/2026-04-27-M4-merge-client-state.md` indexed.

## Risks and rollback

- **Risk**: `processViewport`'s signature change breaks an undiscovered consumer. **Mitigation**: cross-repo grep confirms 5 call sites (routes, ws-handler, viewport-processor.test, benchmark-gate.test); all are updated in this stage. The smoke test exercises the route surface.
- **Risk**: the unified key derivation (header-aware) lands a behavior change for clients that previously sent `x-client-id` for delta state. **Mitigation**: the change is intentional (audit D.5). Devlog documents it. Wire-format `mode` field is unchanged because the only output value derived from the key is via the persisted state, which now consistently uses the same key — i.e., a fixed point.
- **Risk**: `jest.useFakeTimers()` interacts badly with the cleanup timer's `setInterval(...).unref()`. **Mitigation**: jest's modern fake timers (v30) support `unref`; we test by calling the cleanup callback synchronously via `_runCleanupNow()` rather than relying on timer firing, which is more deterministic.
- **Risk**: deleting `mode-manager.test.js` / `delta-state.test.js` loses an assertion the merged file forgets to retranscribe. **Mitigation**: case-by-case enumeration above; `wc -l` of merged file approximates the sum.
- **Rollback**: revert the commit. Phase 4 returns to its post-P4-2 state.
