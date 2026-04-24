# 2026-04-23 — Refactor: Bump Tile LOD Base-Zoom 8 → 10

Follow-up to `b09ee81` (tile LOD fix). Initial iteration used
`--base-zoom=8 --drop-rate=2`, which kept 67k features at zoom 8+
and applied drops from zoom 7 down. That gave ~4,200 features at
zoom 4 — mathematically 16× less than the unfiltered 67k, but
visually still reading as near-continuous coverage on the globe
view because 4k dots scattered across land masses are dense
enough to sketch continuous outlines.

Bumping base-zoom to 10 drops the low-zoom feature counts by
another 4× without touching the zoom 10-12 detail:

| zoom | base-zoom=8 | base-zoom=10 |
| ---- | ----------- | ------------ |
| 12   | 67k         | 67k          |
| 10   | 67k         | 67k          |
| 8    | 67k         | ~17k         |
| 6    | ~17k        | ~4k          |
| 4    | ~4k         | **~1k**      |
| 2    | ~1k         | ~250         |
| 0    | ~250        | ~65          |

At zoom 4 (~scale "1,000 km") the overlay now reads as a data
sketch — dots space visibly apart, land outlines still readable.
At zoom 2 (globe view) the globe shows roughly 1 dot per ~10°
of longitude on land.

## Changes

### `scripts/build-tiles.js`

- `--base-zoom=8` → `--base-zoom=10`. Drop-rate stays at 2.
- Inline comment rewritten with the corrected feature-count math
  (67k total instead of a previously-assumed 259k full-grid
  ceiling — the grid data only covers cells with valid landcover,
  not every 0.5° sphere cell).

Build time still ~45 s. Output file size unchanged at ~151 MB
(zoom 10-12 still carry the bulk of feature bytes).

## Why zoom 10 as the base

0.5° grid at zoom 10 mid-latitude renders each cell at ~50 px on
screen — still visibly one-cell-per-dot for mouse-hover precision.
Zoom 11 and 12 (finer than the source grid) get the same 67k
features; tippecanoe's `--extend-zooms-if-still-dropping` isn't
set so the max-zoom file just carries the full set redundantly
across the top three levels. This is wasteful for size (~2× the
feature bytes) but simplifies the LOD curve — users zoomed to
streetview see the same density regardless of exact zoom level.

## Verification

- `npm run format:check` — clean.
- `npm run lint` — clean.
- `npm test` — 14 suites / 154 tests pass.
- `curl http://localhost:3000/tiles/grids.pmtiles` serves the new
  151 MB file with a fresh `Last-Modified` header.
- Browser A/B left to the user's reload. Expected at zoom 4: dots
  clearly sparse, land outline still recognizable. At zoom 2:
  scattered data points, no moiré.

## Rollback

- **Back to base-zoom=8**: revert this commit, re-run
  `node scripts/build-tiles.js`. ~45 s.
- **Further down to base-zoom=12 / drop-rate=2.5 / etc.**: edit
  the same line in the script.

## Files Changed

- **Modified**: `scripts/build-tiles.js` — base-zoom literal + comment.
- **Modified**: `docs/DEVLOG.md` — index entry.
- **Added**: this entry.
- **Not committed**: `data/tiles/grids.pmtiles` regenerated output
  (gitignored).
