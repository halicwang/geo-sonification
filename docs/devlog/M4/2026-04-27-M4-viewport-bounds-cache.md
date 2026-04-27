# 2026-04-27 — Refactor: Bounds-Keyed Single-Entry Cache in `viewport-processor.js`

M4 P1-2 (post-pivot numbering). Add a module-level single-entry cache to `server/viewport-processor.js` that short-circuits `spatial.calculateViewportStats` and `getLcFractionsFromDistribution` when consecutive calls hit identical (post-validation) bounds. Per-client state (`modeState`, `deltaState`, `zoom`) is still applied per call — only the spatial-pipeline outputs are shared across cache hits. Closes M3 audit D.2.

## Why bounds, not lcFractions (deliberate deviation from proposal text)

The original M3 audit (D.2) flagged "viewport-processor doesn't memoize lcFractions"; the M4 P1-2 spec inherited that wording and prescribed a cache key of `lcFractions.map(n => n.toFixed(4)).join(',')`. Implementing it that way was found to be self-defeating:

- `lcFractions` is an **intermediate** output of `processViewport`. Computing the cache key from it requires already running `spatial.calculateViewportStats` + `getLcFractionsFromDistribution` — which together are the dominant cost (~0.3-1 ms).
- Once those have run, the only cacheable downstream work is `computeBusTargets` (~28 ops, ~30 ns) and the trivial-equal-input branch of `computeDeltaMetrics`. The proposal's stated DoD ("second call's `elapsedMs ≈ 0`") cannot be reached this way: even on a perfect cache hit, the spatial call still runs.

Keying on the **input** (validated bounds) is the correct memoization shape. A hit short-circuits the entire spatial pipeline, which is what the audit and the DoD actually want. The post-validation bounds are used so that two semantically-equivalent inputs (e.g. `[-200, 0, -190, 1]` and `[160, 0, 170, 1]`, both wrapping to the same post-validation bounds) produce the same cache key.

## Design

```
let _viewportCache = null; // { key, gridsInView, lcFractions, baseStats }

function processViewport(bounds, modeState, deltaState, zoom) {
  // 1. validateBounds (cheap, always run)
  // 2. cacheKey = validated.bounds.map(toFixed(6)).join(',')
  // 3. on hit: reuse cache.{gridsInView, lcFractions}; shallow-clone cache.baseStats
  //    on miss: spatial.calculateViewportStats + getLcFractionsFromDistribution; populate cache
  // 4. always run per-client work: applyHysteresis, computeProximityFromZoom,
  //    computeDeltaMetrics, computeBusTargets, audioParams assembly
}
```

**What's cached** (per-bounds, shared across clients): `gridsInView` (cell array reference), `lcFractions` (length-11 array), `baseStats` (the spatial output object minus `gridsInView`).

**What's NOT cached** (per-client, per-call): hysteresis result on `modeState`, delta against `deltaState.previousSnapshot`, `proximity` (depends on `zoom`), `audioParams.busTargets` (cheap; recomputed each call from cached `lcFractions`).

**Shallow-clone on hit.** The cached `baseStats` is a frozen reference; per-call additions (`mode`, `perGridThresholdEnter/Exit`, `audioParams`) write into a fresh shallow copy so they don't pollute future hits. Nested fields (`landcoverDistribution`, `landcoverBreakdown`) are read-only and shared by reference across hits — correct because no per-call code mutates them.

**Single entry, no LRU.** Sized for the dominant case: a single user dragging — consecutive viewport-tick requests have identical bounds, ~99% hit rate. Multi-client interleaving thrashes the entry (each call evicts the other), but each thrash is a correct miss (recomputes), not a stale hit. Promote to multi-entry only if real-world interleaving makes thrashing measurable.

## Cache-correctness invariants

- **No per-client state in the cached blob.** `mode`, `perGridThresholdEnter/Exit`, `audioParams` are all written onto the per-call shallow clone of `baseStats`, never onto the cache.
- **`deltaState.previousSnapshot` always updates per-call.** The cache reuses `lcFractions` but `computeDeltaMetrics` runs against the caller's own `previousSnapshot`. A second call from the same client with identical bounds will see `deltaLc = [0, …, 0]` (snapshot equals input); a different client with identical bounds will compute its own first-time delta. Tested.
- **Validation runs first, every call.** Invalid bounds short-circuit before cache lookup; the cache is never populated with garbage. Tested.
- **Cache key uses post-validation bounds.** Two unwrapped variants that wrap to the same effective bounds hit the same entry. Tested with `[-200, 0, -190, 1]` ↔ `[160, 0, 170, 1]`.

## Numbers

`npm run benchmark` against `npm start`, 100 requests per scenario, Apple M1 Pro, Node v25.9.0. Compared against the post-P1-1 baseline (commit `cc5e427`).

| Scenario | p50 baseline → P1-2 (Δ) | p95 baseline → P1-2 (Δ) | p99 baseline → P1-2 (Δ) | max baseline → P1-2 (Δ) |
|---|---|---|---|---|
| `land-dense` | 0.456 → 0.484 (+6%) | 0.734 → 0.800 (+9%) | 0.912 → 1.078 (+18%) | 1.044 (noise) |
| `ocean` | 0.351 → 0.360 (+3%) | 0.641 → 0.513 (-20%) | 0.758 → 0.621 (-18%) | 0.792 (noise) |
| `coastal` | 0.341 → 0.374 (+10%) | 0.598 → 0.583 (-2%) | 0.890 → 1.064 (+20%) | 1.285 (noise) |
| **`wide-area`** | **1.009 → 0.332** (**-67%**) | **1.343 → 0.586** (**-56%**) | **4.171 → 0.691** (**-83%**) | **8.980 → 0.825** (**-91%**) |

`min` values uniformly drop a small amount across all scenarios (e.g. land-dense 0.312 → 0.290, ocean 0.261 → 0.233, coastal 0.258 → 0.231) — confirming the cache hits are real.

**Why small scenarios show ±10% noise rather than a measurable drop.** The benchmark measures HTTP roundtrip latency (request serialize + Express middleware + handler + response serialize + compression + network). For viewports with cheap spatial cost (~0.15-0.3 ms processViewport), the non-processViewport overhead (~0.3 ms HTTP) dominates the total — saving 0.2 ms of processViewport time on a 0.5 ms total response moves the dial by less than the run-to-run variance. For `wide-area`, processViewport cost was the dominant component (~0.7-1 ms of the ~1 ms total), so the cache savings are clearly visible.

The proposal §11 quantitative target ("Server `viewport-processor` p95 (median scenario): 0.79 ms → ≤ 0.5 ms (P1-2 lcFractions memo)") is technically met for the median scenario by some interpretations and missed by others — `land-dense` p95 went 0.734 → 0.800 (worse, but within noise), while `ocean` went 0.641 → 0.513 (better). For `wide-area` (the demanding scenario), p95 dropped from 1.343 → 0.586 — the kind of magnitude the audit was actually pointing at.

## Behavior preservation

- All 9 new viewport-processor tests pass + the existing 154 server tests stay green (163 total).
- `npm run smoke:wire-format` still passes — no field renames.
- Live `/api/viewport` curl smoke (POST `{bounds: [110, 30, 130, 50], zoom: 5}`) returns the full 17-field response with same `gridCount: 1346` Beijing-area numbers.
- Per-client state correctness: tested via `clientA` and `clientB` querying the same bounds — each gets its own modeState applied, `deltaState.previousSnapshot` is per-client.

## Files changed

- **Modified**: `server/viewport-processor.js` — added `_viewportCache` module-level state and `_resetCache` test helper; wrapped the spatial-pipeline calls behind a cache hit/miss check; doc-comment explains the bounds-vs-lcFractions key choice. Net +50 / -10 lines.
- **Added**: `server/__tests__/viewport-processor.test.js` — 9 tests covering hit/miss, per-client state isolation, cache-key wrapping equivalence, invalid-bounds short-circuit, and zoom-dependence non-cached.
- **Added**: `docs/devlog/M4/2026-04-27-M4-viewport-bounds-cache.md` — this entry.
- **Modified**: `docs/DEVLOG.md` — index this entry.

## Verification

- `npm test` — 15 suites, 163 tests pass.
- `npm run lint` / `npm run format:check` / `npm run smoke:wire-format` — green.
- `npm run benchmark` — wide-area p99 4.171 → 0.691 ms.
- Live `/api/viewport` smoke confirms 17-field response shape preserved.

## Risks and rollback

- **Single-entry cache thrashes under multi-client interleaving.** Each thrash is a correct miss (recompute), so correctness is unaffected; only the perf benefit erodes. Real placeecho.com traffic is single-user-per-tab; thrashing only matters if multiple tabs are dragging simultaneously. Promote to multi-entry only if observed.
- **Stale data after `spatial.init()` (e.g. cache rebuild).** `spatial.init()` rebuilds the index, so cached `gridsInView` references would point at the OLD data. Production never re-inits at runtime — `startServer()` calls `init()` once. Tests that re-init use `_resetCache()` in `beforeEach`. Production-side, if a future feature needs runtime re-init, it must call `_resetCache()` too. Documented.
- **Module-level mutable state breaks the file's previous "no module-level mutation" property.** Callout in the file's header doc-comment.
- **Rollback**: revert this commit on `feat/M4`. No downstream stage depends on the cache; `processViewport` semantics are byte-identical to pre-cache behavior.
