# 2026-04-24 — Refactor: Anti-Moiré via Sub-Pixel Low-Zoom Dot Radius

Supersedes the LOD-based moiré / stutter fixes from `5917fd4` and
`2e2a851`. Instead of thinning features at low zoom (which either
scrambled positions or produced a visible jump across the zoom-4
transition), keep the **full 67k 0.5° grid at every zoom** and
handle low-zoom density entirely in the frontend paint curve: shrink
each dot to sub-pixel width at low zoom so the regular grid
dissolves into a smooth antialiased gray instead of beating with
the screen pixel grid.

The user's insight was: "**就还是一档就行 … 但是 zoom out 之后点会
随着 zoom out 的距离越来越小**". One tier, all positions preserved
exactly, and the size curve carries the LOD instead of the data
pipeline.

## Why sub-pixel dots kill moiré

Moiré on a regular dot grid arises when dot size is comparable to
the grid's projected pixel spacing — the dots sample the pixel
grid at a beat frequency and show as interference bands. With the
previous radius curve (`zoom 2 = 1.1 px`) and a 0.5°-spaced grid
rendering at ~2 px per cell, dots were almost exactly one pixel
wide at the spacing of two pixels. Classic moiré condition.

Shrinking the radius to ~0.2-0.4 px at low zoom puts each dot well
below one pixel. Mapbox's antialiasing then treats each dot as a
fractional alpha contribution to the pixel it occupies. The dot
pattern has no coherent "on-pixel / off-pixel" alternation — every
screen pixel gets an averaged gray from the dots it partially
covers. No interference bands; the globe reads as a soft gray wash
with land-shaped outlines.

Past zoom ~4 each cell is several pixels wide on screen, dot
radius catches up to the previous curve, and individual dots
become resolvable. Zoom in smoothly reveals the full-resolution
dot matrix without any feature appearing, disappearing, or moving.

## Changes

### `scripts/build-tiles.js`

- Reverted `gridToFeature` to its original pre-LOD signature —
  takes `(grid, gridSize, minzoom, maxzoom)` and emits every
  feature at every zoom, with `tippecanoe.minzoom` coming from
  the function argument (passed through from `buildTileFeatures`'
  default of `0`). No more `gridMinZoom` helper, no per-feature
  tier property.
- `buildTileFeatures` regains its `minzoom` parameter, default
  `0` — every cell visible at every zoom.
- `--no-tile-size-limit` in the tippecanoe args carries through
  from the prior commit; with all 67k features at zoom 0, the
  single zoom-0 tile is ~8 MB, which tippecanoe would otherwise
  drop features to shrink. PMTiles serves via byte range, so
  the client only fetches that tile once.

### `frontend/map.js` — `addGridLayer`'s `circle-*` paint

- `circle-radius` curve extended into sub-pixel territory at low
  zoom:
    - zoom 0 → 0.2 px
    - zoom 2 → 0.4 px
    - zoom 4 → 1.2 px
    - zoom 5 → 2.2 px
    - zoom 8 → 4.9 px (unchanged from before)
    - zoom 12 → 8.2 px (unchanged)
- `circle-opacity` flattened to `1` (scalar, not interpolated).
  The old curve started at 0.92 at zoom 2 — at sub-pixel sizes
  that extra attenuation just made the wash too faint. At larger
  dot sizes the difference between 0.92 and 1 is not perceptible
  against the pure-black basemap.
- `circle-stroke-width` curve follows the radius: zero stroke
  below zoom 4 (a stroke would swamp a sub-pixel dot), then the
  original 0.35-0.9 curve from zoom 5 upward.

### `server/__tests__/build-tiles.test.js`

- Restored the original `gridToFeature` signature test
  (`(cell, 1, 2, 8)` → `{ minzoom: 2, maxzoom: 8 }`). The
  two-tier variant test from the previous commit is removed.

## Verification

- `npm run format:check` — clean.
- `npm run lint` — clean.
- `npm test` — 14 suites / 154 tests pass (the build-tiles tests
  now match the simple signature again).
- `node scripts/build-tiles.js` — 46 s, output 151 MB (all 67k
  features at every zoom, as intended).
- Browser A/B deferred to user reload after a hard refresh
  (`Cmd+Shift+R`). Expected:
    - Zoom 0-2: entire land looks like a fine gray wash, no
      moiré bands, no visible individual dots.
    - Zoom 3-5: dots progressively resolve from the wash — no
      pop, no tier transition, just a gradual size increase.
    - Zoom 6+: full 0.5° dot matrix at previous density.
    - Panning / zooming at low zoom should feel smoother too,
      because radius interpolation is all the GPU needs to
      update.

## Tradeoffs

- **Tile file size**: 151 MB (up from 120 MB with the two-tier
  LOD). The zoom 0 tile alone is ~8 MB. PMTiles serves byte
  ranges so clients fetch this once and cache it; subsequent
  tile reads at higher zooms are tiny. The 120 → 151 MB delta
  is ~26 %, acceptable for the visual continuity win.
- **GPU load at low zoom**: the circle layer is drawing all 67k
  dots per frame even at zoom 0. Each draw is cheap (one
  antialiased sub-pixel splat), and at 67k points the dot
  pipeline is still well under Mapbox's routine capacity. If
  frame rates drop on low-power devices, the fallback would be
  to reintroduce a `tippecanoe.minzoom` on a subset of features
  — same paint curve, just fewer features painted at zoom 0-2.
- **Click-to-popup**: unchanged from before-LOD behavior. Every
  cell has its original `landcover_class` property; popup works
  at every zoom. (The LOD commit that clustered features had
  lost this at low zoom.)

## Rollback

- **Back to the two-tier sub-grid**: `git revert` this commit +
  rebuild. Restores the `pop` at zoom 4 but shrinks the tile
  file.
- **Tune the curve**: edit the `circle-radius` interpolate stops
  in `frontend/map.js`. Bigger zoom 0-2 values make low zoom
  more visible at the cost of some moiré risk; smaller values
  push the gray wash even softer.

## Files Changed

- **Modified**: `scripts/build-tiles.js` — dropped `gridMinZoom`,
  restored simple `gridToFeature` / `buildTileFeatures`
  signatures.
- **Modified**: `frontend/map.js` — new `circle-radius`,
  `circle-opacity`, and `circle-stroke-width` paint expressions.
- **Modified**: `server/__tests__/build-tiles.test.js` — reverted
  the gridToFeature assertion.
- **Modified**: `docs/DEVLOG.md` — index entry.
- **Added**: this entry.
- **Not committed**: `data/tiles/grids.pmtiles` (gitignored;
  regenerate with `node scripts/build-tiles.js`).
