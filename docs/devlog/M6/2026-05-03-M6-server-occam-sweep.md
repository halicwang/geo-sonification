# 2026-05-03 — Refactor: Server Occam Sweep — Drop Dead Grid-Count Proximity, Simplify Defensive Guards

A targeted Occam pass over `server/` triggered by the post-audit code-review request. Four sub-items, all bundled into one commit per the repo's "one commit per Occam group" rule:

1. Removed `computeProximityFromGridCount()` (and its 4 test blocks) — dead in production since the M5 commit `Drive Proximity Locally from Live Zoom` switched the proximity computation to `computeProximityFromZoom`. Tests were the only callers left.
2. Inlined the single-use 1-line helper `createZeroDelta()` and dropped it from `module.exports`.
3. Removed `queryGridsInBounds` from `spatial.js` `module.exports` — the function stays (it has one internal caller at `spatial.js:472`), but it's no longer exposed as a public API surface that nobody outside the module ever imported.
4. Collapsed the redundant `typeof snapshot !== 'object'` guard in `normalizeSnapshot()` — the next-line `Array.isArray(snapshot.lcFractions)` already rejects every non-object input via the property-on-non-object → undefined → false fall-through.

## Why

Each cut earned its grep evidence before being made:

- `computeProximityFromGridCount`: zero production callers (`grep -rn` across `server/`, `frontend/`, `scripts/` returned only the definition, the export, and 6 test references in one file). The frontend's mirrored proximity helper at `frontend/audio/engine.js:588` only mirrors the zoom-based version. The function and its tests were a fossil from before M5 P-something.
- `createZeroDelta`: one internal caller (`audio-metrics.js:140`, spread). Body is `LC_CLASS_ORDER.map(() => 0)` — half the body of the function declaration itself. Helper extraction was carrying its own weight in negative.
- `queryGridsInBounds` export: one internal caller (`spatial.js:472`). External imports across the whole tree: zero. The export was an accidental API surface from when the function was first added.
- `normalizeSnapshot` `typeof` guard: the only way `snapshot` reaches that line as a non-null/non-undefined non-object is a programmer error in a unit test. Even then, `Array.isArray(<string>.lcFractions)` is `false` and the guard returns `null` correctly. The extra branch is defending against an impossible-to-hit case (and adding a line of misdirection for any reader trying to follow the validation logic).

The two borderline candidates were intentionally left untouched after grep:

- `computeOceanLevel(_proximity, ...)` — the underscore-prefixed unused parameter is documented as "unused in current rule" and is preserved deliberately as a "this used to matter and might again" signpost. Removing it is a signature-narrowing change with no real benefit.
- `getValidLandcover()` in `spatial.js` — single internal caller, but the helper extracts a cleanly named concept ("get the cell's valid landcover or null") inside an already-complex aggregation loop. Inlining would worsen readability.

The audit also explicitly rejected three suggestions from an exploratory pass that didn't survive scrutiny: adding `try/catch` around `JSON.stringify` in `ws-handler.js` (violates "don't error-handle scenarios that can't happen" — `result.stats` is server-built, no circular refs or BigInt risk); replacing the `Array.sort` in `normalize.calcPercentiles` with quickselect (saves ~0.5 ms once at startup, costs perpetual code complexity); and standardizing `??` vs `||` across the codebase (no observed bug, pure churn).

## What changed

### `server/audio-metrics.js`

- Deleted `computeProximityFromGridCount()` (function + JSDoc, ~26 lines).
- Deleted `createZeroDelta()` (function + JSDoc, ~7 lines); replaced its single use site (`...createZeroDelta(),` inside `computeDeltaMetrics`) with the inline expression `deltaLc: LC_CLASS_ORDER.map(() => 0),`.
- Collapsed two-line guard in `normalizeSnapshot()` to one: `if (!snapshot || !Array.isArray(snapshot.lcFractions)) return null;`.
- Removed `computeProximityFromGridCount` and `createZeroDelta` from `module.exports`.

### `server/spatial.js`

- Removed `queryGridsInBounds` from `module.exports`. Function definition and its single internal caller in `calculateViewportStats()` are unchanged.

### `server/__tests__/audio-metrics.test.js`

- Removed the `describe('computeProximityFromGridCount', ...)` block (4 test cases) and dropped the symbol from the `require()` destructure.

## Verification

- `npm test` → 189 passed (was 193 — drop of 4 = the deleted `computeProximityFromGridCount` test blocks). All 17 suites green.
- `npm run lint` clean.
- `npm run format:check` clean.
- `grep -rn "computeProximityFromGridCount\|createZeroDelta" --include="*.js"` returns nothing — both symbols fully gone from source and tests.
- `grep -rn "queryGridsInBounds" --include="*.js"` returns the definition + the single internal caller + the test-file comment — all expected.

## Files changed

- **Modified** `server/audio-metrics.js` — deletions + guard collapse + exports trim (~38 LOC removed, 1 inlined).
- **Modified** `server/spatial.js` — `module.exports` trim (1 LOC removed).
- **Modified** `server/__tests__/audio-metrics.test.js` — describe block + import removed (~22 LOC).
- **Added** `docs/devlog/M6/2026-05-03-M6-server-occam-sweep.md` — this entry.
- **Modified** `docs/DEVLOG.md` — index this entry at the top of `## Entries`.
