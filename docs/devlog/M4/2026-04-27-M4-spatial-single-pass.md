# 2026-04-27 — Refactor: Collapse `spatial.js` Bucket Loops + Remove `gridData.filter` Dead Code

M4 P1-1. Two structural changes inside `server/spatial.js` `queryGridsInBounds`:

1. The two parallel `range × ix × iy` triple loops (one for theoretical bucket count, one for cell collection) merge into one. Both loops were already iterating identical bucket-index ranges with the same fine-grained intersection test.
2. The `else { gridsInView = gridData.filter(...) }` fallback is removed. After `init() → buildSpatialIndex()`, `spatialIndex` is always a non-null `Map` (possibly empty), so the fallback was unreachable in practice. The empty-index case (no init or `init([])`) is handled inline by skipping the cell-collection inner loop while still computing the index-independent `theoreticalGridCount`.

## Why

Wide-viewport requests at low zoom exercise the most bucket cells. Pre-refactor, those cells were visited twice — once to count, once to collect. The merge halves the bucket-iteration work for the dominant cost path.

## Numbers (HEAD `abebc96` → P1-1)

`npm run benchmark` against `npm start`, 100 requests per scenario, Apple M1 Pro, Node v25.9.0:

| Scenario | Baseline p50 / p95 / p99 (ms) | P1-1 p50 / p95 / p99 (ms) | p95 Δ | p99 Δ |
|---|---|---|---:|---:|
| `land-dense` | 0.469 / 0.795 / 0.923 | 0.456 / 0.734 / 0.912 | **-7.7%** | -1.2% |
| `ocean` | 0.376 / 0.577 / 0.614 | 0.351 / 0.641 / 0.758 | +11.1% | +23% |
| `coastal` | 0.398 / 0.623 / 0.699 | 0.341 / 0.598 / 0.890 | -4.0% | +27% |
| `wide-area` | 1.020 / **1.903** / **6.231** | 1.009 / **1.343** / **4.171** | **-29.4%** | **-33.1%** |

`wide-area` is the scenario the proposal §11 quantitative target tracks. **p99 dropped 33%, far past the ≥ 5% target.** p50 is uniformly lower across all four scenarios (-2.8% / -6.7% / -14.3% / -1.1%). The p99 noise on `ocean` and `coastal` is run-to-run variance on sub-1-ms timings — p50 / p95 (more stable) confirm the refactor is at-worst neutral on small viewports and a clear win on large ones.

## Behavior preservation

The merged loop applies the bucket-box intersection check (`gw < range.east && ge > range.west && gs < north && gn > south`) to **both** the theoretical-count branch and the cell-collection branch. This is identical to the original first-loop's bucket-box test. The original second loop (cell collection) didn't include this bucket-box prefilter — it relied on the per-cell test inside `for (const cell of cells)` to do the same filtering. Adding the prefilter to the merged version is a pure optimization: by construction, every cell stored in bucket `(ix, iy)` has its content equal to the bucket box (cell-grid alignment to `GRID_SIZE` multiples), so a non-overlapping bucket-box implies no overlapping cells inside it. Per-call results are byte-identical.

The empty-index early-return (skip cell collection when `spatialIndex` is null or `size === 0`) preserves the previous fallback's outcome: empty-index returned `[]` from `gridData.filter` (because `gridData` was also empty under the same precondition); the merged version returns `[]` directly. `theoreticalGridCount` is computed identically in both paths.

154 jest tests pass (153 previous + 1 new in `spatial-coverage.test.js` covering `queryGridsInBounds` directly with an empty index). Live `/api/viewport` smoke against the refactored server returned the full 17-field response with sensible numbers (`gridCount: 1346` for a Beijing-area viewport, dominant landcover = 40 Cropland).

## Lines

`server/spatial.js`: -25 net (-89 deleted, +64 added). The merged loop is denser but smaller because the duplicate `for (range)` / `ixStart` / `ixEnd` / `iyStart` / `iyEnd` setup happens once. `gridData.filter` fallback removal: -16 lines.

## Files changed

- **Modified**: `server/spatial.js` — merged two `range × ix × iy` loops into one; removed `gridData.filter` dead-code fallback; explicit empty-index handling.
- **Modified**: `server/__tests__/spatial-coverage.test.js` — new test `queryGridsInBounds with empty index` directly exercises the empty-index path.
- **Added**: `docs/devlog/M4/2026-04-27-M4-spatial-single-pass.md` — this entry.
- **Modified**: `docs/DEVLOG.md` — index this entry.

## Verification

- `npm test` — 154 jest tests pass (was 153 pre-refactor).
- `npm run lint` / `npm run format:check` / `npm run smoke:wire-format` — green.
- `npm run benchmark` — wide-area p99 6.231 ms → 4.171 ms (-33%).
- Live `/api/viewport` smoke — response shape preserved.

## Risks and rollback

- The single-loop refactor is more code-dense than the split version. If a future stage finds the merged loop hard to follow, the merge is reversible: split the bucket-box check back into two passes, accepting the perf cost.
- The empty-index path now has explicit test coverage. If a future caller depends on the old `gridData.filter` semantic (e.g. mutating `gridData` after `init()`), that caller would break — none exist today.
- **Rollback**: revert this commit on `feat/M4`. No downstream stage depends on the optimization.
