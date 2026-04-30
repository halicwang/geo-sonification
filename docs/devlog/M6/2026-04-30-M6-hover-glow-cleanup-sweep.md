# 2026-04-30 — Refactor: Hover-glow Cleanup Sweep

After the M6 P0/P1/P2 ship and the two follow-up fixes (sync tick +
spatial bucket + drag-pause), an Occam-style sweep over the
hover-glow surface to remove defensive code that the iteration
history justified at the time but the final code shape no longer
needs. Three high-confidence cuts plus a profile-gated decision
that ruled out two micro-optimisations.

## F1 — Consolidate `'grid-source'` / `'grids'` into `frontend/config.js`

The PMTiles source id and source-layer name were hardcoded in two
places:

- `frontend/map.js` declared the source/layer (`addSource`,
  `addLayer`).
- `frontend/hover-glow.js` wrote feature-state against the same pair
  via local `FEATURE_STATE_SOURCE` / `FEATURE_STATE_SOURCE_LAYER`
  constants.

If the pair drifts between the two files, `setFeatureState` silently
targets a non-existent layer — no runtime error, glow just stops
working. Real threat, not theoretical: the source id and layer name
are pure conventions with no contract enforced anywhere.

**Fix**: lifted to `frontend/config.js` as `GRID_FEATURE_STATE_SOURCE`
and `GRID_FEATURE_STATE_SOURCE_LAYER`, imported in both consumers.
Local constants in `hover-glow.js` deleted; the three
`setFeatureState` call sites now reference the imported names
directly (no local alias indirection).

```diff
-const FEATURE_STATE_SOURCE = 'grid-source';
-const FEATURE_STATE_SOURCE_LAYER = 'grids';
```

## F2 — Drop `!gridIndex.spatialIndex` redundant guard in `tick()`

`grep "gridIndex ="` showed only three assignments:

- L99 (initial `null`)
- L631 (init success: `gridIndex = await fetchGridIndex()`)
- L641 (init failure: `gridIndex = null`)

The only writer of `gridIndex.spatialIndex` is L632, immediately
after init success. There is no code path that nulls or replaces it
while `gridIndex` itself is non-null. The `!gridIndex.spatialIndex`
check on the `tick()` early-return guard was dead defense.

```diff
-if (!cursor || !gridIndex || !gridIndex.spatialIndex || !mapRef) return;
+if (!cursor || !gridIndex || !mapRef) return;
```

The other guards stay:

- `!cursor` — really nullable (mouseleave / window blur).
- `!gridIndex` — really nullable (init failure).
- `!mapRef` — module-private, theoretically never null; kept as
  belt-and-braces final assert at zero perf cost.
- `isStyleLoaded()` and `getLayer('grid-dots')` — load-bearing during
  Mapbox style swaps (`globe ↔ mercator`), where the layer is briefly
  absent until `addGridLayer` re-runs.

## F3 — Remove unreachable `return` statements in `borderFactor` / `rByZoom`

Both functions have two early-returns covering `dKm <= table[0][0]`
and `dKm >= table[last][0]` (resp. zoom), then iterate over adjacent
breakpoint pairs. Inside the loop the test is
`if (dKm >= x0 && dKm < x1)`. Because the table is monotonically
increasing in x and the early-returns clamp both ends, every input
not caught by the early-returns lies strictly inside `(x0_first,
x_last)` and the loop *must* hit some pair. The trailing `return`
after the loop is unreachable.

`borderFactor` had `return 0; // unreachable` — comment and value
were inconsistent (if it really is unreachable, the value is
arbitrary). `rByZoom` had `return table[table.length - 1][1];` with
no comment. Both deleted; the function naturally falls off the end
(would return `undefined`, but the proof above shows the path is
genuinely unreachable).

## Profile gate — F4 / F5 ruled out by measurement

Two further micro-optimisations were on the candidate list (inline
`bucketKey` in the hot loop, and `quickselect` instead of full sort
when `candidates.length > maxGlowing`). Both were profile-gated
rather than done blind.

Measurement (Chrome via Claude Preview, `__hg.forceTick()` 200×
warm-up + 200× timed at zoom 5 over Franco-German border, default
tunables):

| Metric | Value |
| --- | --- |
| `tick()` avg | 0.108 ms |
| `tick()` p50 | 0.100 ms |
| `tick()` p95 | 0.300 ms |
| `tick()` p99 | 0.400 ms |
| `tick()` max | 0.400 ms |
| Glowing count | 192 |

Threshold for **F4 (inline `bucketKey`)** was ≥ 2 ms p95. Actual is
0.300 ms — **skipped**. V8 already inlines the trivial multiply;
attempting to "help" it adds source noise for measurable nothing.

Sampling for **F5 (`quickselect` vs full sort)** across six probes
(z3 atlantic / europe / east-asia / north-america, z5 europe, z7
europe), reading `__hg.getGlowingFids().size` after each:

| Probe | Glowing size | Capped? |
| --- | --- | --- |
| z3 atlantic | 34 | no |
| z3 europe | 450 | no |
| z3 east-asia | 110 | no |
| z3 north-america | 0 | no |
| z5 europe | 230 | no |
| z7 europe | 118 | no |

Threshold was P95 > 5000 for `candidates.length`. The cap (1500)
was never hit; max observed was 450. **Skipped**. Sort is at most
sorting ~450 items — well under V8's microsecond-level fast path.

## Verification

- `npm run test:frontend` (vitest): 107 passing.
- `npm test` (server jest): 194 passing.
- `npm run lint`: clean.
- `npm run format:check`: clean (after `prettier --write` reflowed
  one import group in `hover-glow.js`).
- Browser smoke (Claude Preview, `__hg.forceTick()`-driven):
  - Normal hover (z5, 10°E 50°N): cursor set, 192 cells glowing,
    no console errors.
  - Drag pause: `map.fire('movestart')` → `forceTick()` → glow
    unchanged (192). Cursor moved 50px → still 192. `moveend` →
    catchup tick → 194 (cursor's new position picks up two more
    cells). Drag-gate verified.
  - Mouseleave: cursor cleared to `null`, glowing set drops to 0.
  - `__hg.tune({ maxGlowing: 50 })`: next tick caps at exactly 50
    cells. Live override verified.

## Out-of-scope follow-ups

- `lonBucketIdx`'s `while` loop (init-only, not hot — clarity tweak,
  not worth a touch).
- `borderFactor` linear scan over a 4-entry table (binary search has
  no measurable win at N=4).
- `borderFactor` monotonicity test tolerance `1e-9` is loose vs.
  Hermite blend's true floating-point monotonicity. Test-quality
  micro-improvement.
- `clearAllGlow` and tick's stale-cleanup loop share an 8-line
  `setFeatureState({glow: 0})` shape. Extracting a helper trades
  duplication for indirection; not worth it.

## Files changed

- `frontend/config.js` — MODIFY (add `GRID_FEATURE_STATE_SOURCE` and
  `GRID_FEATURE_STATE_SOURCE_LAYER` constants).
- `frontend/map.js` — MODIFY (import the two new constants, replace
  the two string literals at `addSource` and `addLayer`).
- `frontend/hover-glow.js` — MODIFY (import the two new constants,
  delete the local `FEATURE_STATE_SOURCE` / `_LAYER` aliases,
  rewrite the three `setFeatureState` call sites to use the imported
  names; drop the `!gridIndex.spatialIndex` guard; drop two
  unreachable `return` statements; prettier reflow of the import
  block).
- `docs/DEVLOG.md` — MODIFY (index this entry).
- `docs/devlog/M6/2026-04-30-M6-hover-glow-cleanup-sweep.md` — NEW.
