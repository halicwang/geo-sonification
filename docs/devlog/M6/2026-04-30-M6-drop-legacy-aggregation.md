# 2026-04-30 — Refactor: Drop Legacy Aggregation Path (Cold-Code Cleanup)

A simplification, not a perf optimization: remove the unused
`USE_LEGACY_AGGREGATION` escape hatch and the `calculateLegacyStats`
function. v2 area-weighted aggregation becomes the only path.

## Why

Grep evidence the legacy path is cold:

- `.env.example:11` declares `USE_LEGACY_AGGREGATION=false` as the
  default, with no env / CI / deploy script anywhere setting it to
  `true`.
- No test under `server/__tests__/` exercises `calculateLegacyStats`
  (grep returns empty).
- `golden-baseline.test.js:75` actively *asserts*
  `USE_LEGACY_AGGREGATION === false`, treating any deviation as
  baseline drift.
- The two referencing docs are deprecated M3 P0 baseline-harness
  notes and an M5 group-c trace; neither indicates an active reason
  to keep the toggle.

A "preserve as escape hatch" argument exists in principle, but it
costs a 60-line dead function, a config flag, an env var, a cache key
dimension, a test, and one ternary in `calculateViewportStats` — all
of which a contributor has to read and reason about each time they
touch this area. v2 has been the production path since M3 and the
golden baseline locks it; if a future redesign needs A/B comparison,
it's cheaper to reintroduce a flag at that point than to maintain one
on standby.

## What's deleted

- **`server/spatial.js`** —
  `calculateLegacyStats(gridsInView)` (~60 lines: 4 separate
  `reduce`/`filter` over `gridsInView`, separate landcover-counts
  loop, then `buildStatsResult`). The `calculateViewportStats`
  ternary becomes a direct `calculateAreaWeightedStats(gridsInView)`
  call. Import of `USE_LEGACY_AGGREGATION` removed.
- **`server/config.js`** — `USE_LEGACY_AGGREGATION` env parse,
  `AGGREGATION_VERSION` const, the `USE_LEGACY_AGGREGATION ? ... : ...`
  ternary on `AGGREGATION_CONFIG`, both exports, and the
  `Switch with USE_LEGACY_AGGREGATION=1` comment. The startup log
  now prints just the v2 config object. `AGGREGATION_CONFIG` keeps
  its v2 shape (`weight_base`, `land_fraction_weight_mode`,
  `land_fraction_weight_exponent`, `min_land_area_km2`) — those four
  *are* still cache-key-relevant because `LAND_FRACTION_WEIGHT_MODE`
  etc. are tunable via env.
- **`server/data-loader.js`** — drop the `aggregationVersion` field
  on both `loadOrCalcNormalize` call sites; only `aggregationConfig`
  remains as the cache-mixing guard.
- **`server/normalize.js`** —
  `isValidNormalizeCache(cached, fingerprint, expectedConfig)` loses
  its `expectedAggregationVersion` parameter and the
  `cached.aggregation_version !== expectedAggregationVersion` check.
  New `params` no longer write the `aggregation_version` field. The
  `[Normalize] Loaded params (… matched) v=…` log line drops the `v=`
  suffix.
- **`server/types.js`** — `NormalizeParams.aggregation_version`
  removed from the typedef.
- **`server/__tests__/golden-baseline.test.js`** —
  `USE_LEGACY_AGGREGATION` import + the `expect(...).toBe(false)`
  test deleted. The baseline now relies on the absence of the flag
  to guarantee v2.
- **`.env.example:11`** — the `USE_LEGACY_AGGREGATION=false` line
  + its inline comment.

## Cache compatibility

Existing `data/cache/normalize.json` files carry an
`aggregation_version: 'v2_area_weighted'` field. After this change
the cache validator no longer reads that field, so old caches stay
valid (the field becomes a benign extra key). New caches written
post-deploy will simply lack it. No forced rebuild.

## Verification

- `npm test` (server, 17 suites / 194 tests) — must stay green; the
  removed `golden-baseline` assertion brings the count to 193.
- `npm run lint` — clean.
- `npm run test:frontend` (112 tests) — must stay green; no frontend
  contract touches the legacy path.

## Files changed

- `server/spatial.js` — DELETE `calculateLegacyStats`, simplify
  `calculateViewportStats`, drop `USE_LEGACY_AGGREGATION` import.
- `server/config.js` — DELETE `USE_LEGACY_AGGREGATION` parse +
  `AGGREGATION_VERSION` const, simplify `AGGREGATION_CONFIG`, update
  exports + log line + comment.
- `server/data-loader.js` — REMOVE `AGGREGATION_VERSION` import +
  pass-through.
- `server/normalize.js` — REMOVE `aggregation_version` parameter +
  cache field + log suffix.
- `server/types.js` — REMOVE field from NormalizeParams typedef.
- `server/__tests__/golden-baseline.test.js` — DELETE
  `USE_LEGACY_AGGREGATION` import + test.
- `.env.example` — DELETE `USE_LEGACY_AGGREGATION` line.
- `docs/DEVLOG.md` — INDEX entry.
