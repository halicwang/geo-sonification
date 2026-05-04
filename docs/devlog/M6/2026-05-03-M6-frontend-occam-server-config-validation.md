# 2026-05-03 — Refactor: Frontend Server-Config Validation Dedup

`config.js:loadServerConfig` and `map.js:refreshServerConfig` both consumed `/api/config` JSON and wrote four fields onto `state.config` behind identical `Number.isFinite` guards. Extract the merge step into a single shared `applyServerConfig(parsed)` exported from `config.js` and call it from both places — the side effect that map.js needs after the refresh (`engine.setProximityThresholds`) stays at the call site since it isn't part of validation.

## Why

The two paths exist for legitimate reasons (boot-time vs. post-reconnect refresh), but the parsing logic was a verbatim copy. Any future tweak — say, clamping `proximityZoomHigh - proximityZoomLow` to a minimum band, or accepting a new server-driven field — would have to land in both places, and a drift between them would be silent (state.config writes are last-write-wins). The extraction is purely a dedup move with no behaviour change: both call sites already produced the same writes for the same inputs.

The leading `config.gridSize &&` guard that map.js had in front of `Number.isFinite(config.gridSize) && config.gridSize > 0` is dropped — falsy `gridSize` values (0, null, undefined, '') are already rejected by either `Number.isFinite` (rejects null/undefined/NaN) or `> 0` (rejects 0 and negatives). The combined check in `applyServerConfig` covers exactly the same set of inputs.

## What changed

### `frontend/config.js`

- Added exported `applyServerConfig(parsed)` — the four `Number.isFinite` / direct-pass writes, with a JSDoc that names both call sites so a reader chasing the function knows where it is shared from.
- `loadServerConfig()` now calls `applyServerConfig(await response.json())` instead of inlining the validation block.

### `frontend/map.js`

- Imported `applyServerConfig` alongside the existing `config.js` named imports.
- `refreshServerConfig()` now calls `applyServerConfig(await response.json())`. The `engine.setProximityThresholds(...)` call after it is unchanged — it's a map-side side effect, not validation.

## Verification

- `npm run test:frontend` → 91 passed (8 suites). No assertion changes; the refactor is interface-preserving.
- `npm run lint` clean.
- Manual diff inspection: the union of writes in the new `applyServerConfig` is exactly the union of writes that `loadServerConfig` and `refreshServerConfig` did before, for every reachable JSON shape.

## Files changed

- **Modified** `frontend/config.js` — added `applyServerConfig`; `loadServerConfig` delegates to it (~14 LOC net reduction with the dedup, +6 for the helper, −16 for the inlined block, +4 for the JSDoc).
- **Modified** `frontend/map.js` — `refreshServerConfig` delegates to `applyServerConfig`; new named import (~14 LOC net reduction).
- **Added** `docs/devlog/M6/2026-05-03-M6-frontend-occam-server-config-validation.md` — this entry.
- **Modified** `docs/DEVLOG.md` — index this entry at the top of `## Entries`.
