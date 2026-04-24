# 2026-04-23 — Fix: Tile LOD Actually Applies (Switch to `--cluster-distance`)

Two earlier commits (`b09ee81`, `a4c58d3`) claimed to implement
tile-level LOD to kill the dot overlay's low-zoom moiré and
stutter. Both landed in git but both **failed to actually drop
features** — the output `data/tiles/grids.pmtiles` still carried
all 67,331 features at zoom 0 after each rebuild, which is why
the user saw no change in the globe view.

Root cause: `--base-zoom=N --drop-rate=R` as a pair, without any
of the `--drop-*-as-needed` triggers, is a **no-op** in
tippecanoe. Those two flags configure the rate used by the
`as-needed` dropping strategies; on their own they don't start
the drop. I misread the tippecanoe docs and neither empirically
verified the result.

Verified the bug after the second commit by installing
`brew install pmtiles`, fetching the zoom-0 tile with
`pmtiles tile data/tiles/grids.pmtiles 0 0 0`, and counting MVT
features with a small Python script. Result: **67,331 features
in the zoom-0 tile** — fully unfiltered. The LOD math in the
earlier devlogs was theoretical; the file on disk did not match
it.

This commit switches to `--cluster-distance=16`, which **does
actually drop features** at each zoom level. Measured per-tile
feature counts after the fix:

| zoom | center-tile features | before |
| ---- | -------------------- | ------ |
| 0    | 129                  | 67,331 |
| 2    | 282                  | ~4,200 (est.) |
| 3    | 300                  | ~4,200 (est.) |
| 4    | 253                  | ~2,600 (est.) |
| 5    | 127                  | ~1,000 (est.) |
| 6    | 25                   | ~260 |
| 8    | 3                    | ~16 |

File size: 151 MB → 103 MB (32 % smaller).

## How `--cluster-distance` works here

> Within each tile, look for points within this pixel distance,
> and retain only a single point for each cluster.

For the project's 0.5° grid:

- At zoom 0, one 256 px tile covers 360°. 0.5° ≈ 0.35 px. A
  16 px cluster radius covers ~22°, so dozens of grid cells
  merge into one cluster feature. This is how zoom 0 drops
  from 67k to 129.
- At zoom 4, 1 px ≈ 0.088°, so 16 px ≈ 1.4°. Cell spacing is
  0.5°, meaning clusters cover ~3 cells. Reduces per-tile count
  ~8× (from ~2k to ~250).
- At zoom 10, 1 px ≈ 0.0007°. 16 px = 0.011° << 0.5° cell
  spacing. No clustering happens. Full 0.5° resolution
  preserved.

The reduction is automatic per zoom and doesn't require
configuring a drop rate or base zoom.

## Tradeoff: popup data lost in clusters

`tippecanoe --cluster-distance` replaces grouped point features
with a single cluster centroid that carries a `point_count`
attribute, not the originals' properties. So at low zoom,
clicking a dot's popup reads `landcover_class = undefined` →
"Unknown". I tried `--accumulate-attribute=landcover_class:
first_not_null` to pick a representative class from the cluster
members, but tippecanoe 2.79 only accepts `sum | product | mean |
max | min | concat | comma | count` — none of which is
semantically right for a categorical class integer. Dropped the
flag; popup will say "Unknown" on clustered low-zoom dots.
Accepted as a mild regression because:

- At low zoom the dot covers many cells; picking one class to
  show would be misleading anyway.
- At zoom ≥ 10 (where the user actually interrogates specific
  cells) no clustering happens and the popup works fully.

## Changes

### `scripts/build-tiles.js`

- Removed: `--base-zoom=10`, `--drop-rate=2`,
  `--drop-fraction-as-needed`, `--no-tile-size-limit`.
- Added: `--cluster-distance=16`.
- Rewrote the preamble comment to reflect the actual working
  strategy, including an explicit note on the prior-attempts
  failure mode so future readers don't re-introduce the same
  no-op combo.

## Verification

- `npm run format:check` — clean.
- `npm run lint` — clean.
- `npm test` — 14 suites / 154 tests pass.
- `pmtiles show data/tiles/grids.pmtiles` reports the expected
  cluster-distance flag.
- `pmtiles tile ...` + MVT decode confirmed per-zoom feature
  counts in the table above.
- Served file: `curl -sI http://localhost:3000/tiles/grids.pmtiles`
  returns the new 103 MB file with a fresh `Last-Modified`.

User still needs to bust browser cache (PMTiles library caches
the archive header on page load). Recommended:
`Cmd + Shift + R`, or DevTools Network → Disable cache → reload.

## Rollback

- **Back to pre-LOD**: `git revert` this commit + re-run
  `node scripts/build-tiles.js`. ~45 s. The result is the
  original densely-packed overlay.
- **Tune density**: edit `--cluster-distance=16` in the script.
  Higher (32, 64) = sparser low-zoom dots, with a quadratic
  relationship because cluster area scales with distance². No
  effect at zoom ≥ 10 (distance stays << cell spacing).

## Files Changed

- **Modified**: `scripts/build-tiles.js` — flag swap + comment.
- **Modified**: `docs/DEVLOG.md` — index entry.
- **Added**: this entry.
- **Not committed**: `data/tiles/grids.pmtiles` (regenerated,
  gitignored).
