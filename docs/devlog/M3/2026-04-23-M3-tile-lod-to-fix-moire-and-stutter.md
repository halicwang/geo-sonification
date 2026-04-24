# 2026-04-23 — Refactor: Tile LOD to Fix Moiré and Stutter at Low Zoom

The grid-dot overlay showed two related rendering defects that the
user noticed while zoomed out:

1. **Moiré pattern** on the globe view — the regular 0.5° grid of
   dots beat with the screen pixel grid at ~2 pixels per degree,
   producing visible interference bands.
2. **Intermittent stutter** during pan / zoom at low zoom levels —
   the circle layer was drawing all 67k grid points every frame
   regardless of visibility density.

Both root-caused to the same thing: `scripts/build-tiles.js` was
telling `tippecanoe` to emit the full feature set at every zoom
level (0 through 12) via `--no-feature-limit --no-tile-size-limit`.
At zoom 2, a 1920-pixel viewport covers 360°, giving ~5 px per
degree and ~2.5 px per 0.5° cell. Circle radius at that zoom is
1.1 px (2.2 px diameter). Feature spacing and feature size both
sat near the Nyquist frequency of the display → regular aliasing
pattern.

Switched to a deterministic LOD strategy: `--base-zoom=8
--drop-rate=2`. Zoom 8 and higher keep the full 67k features;
each zoom level below drops by a factor of 2. At zoom 2 the
global feature count drops from 67,331 to ~1,000 — sparse enough
that the grid no longer beats with the pixel grid, and cheap
enough that the circle layer renders without frame drops.

## Why not `--drop-densest-as-needed`

First attempt used `--drop-densest-as-needed --extend-zooms-if-
still-dropping`. Conceptually correct (let tippecanoe work out
the right density) but the implementation is iterative — for
each tile that exceeds the tile-size budget, tippecanoe picks a
drop ratio, tries it, re-evaluates, retries with a smaller ratio,
and so on. On this data set that meant 30+ minutes of "Going to
try keeping the sparsest 55.77% … 38.48% … 15.07% …" before I
killed it. Explicit `-B -r` gives the same end result in ~44 s
with one pass.

## Changes

### `scripts/build-tiles.js`

- Removed: `--no-feature-limit`, `--no-tile-size-limit` (one of
  these stays below — see kept list).
- Added: `--base-zoom=8`, `--drop-rate=2`.
- Kept: `--no-tile-size-limit` (belt-and-suspenders: we want the
  deterministic LOD output even if a specific land-dense tile
  grows past 500 KB; without `--drop-densest-as-needed` tippecanoe
  can't drop further anyway, so this just silences the warning).
- Kept: `--no-tile-compression` (PMTiles serves these raw; clients
  get faster parse at the cost of larger file).
- Extended the inline comment on the `tippecanoeArgs` array with
  the rationale for base-zoom=8 and drop-rate=2 so a future reader
  doesn't undo it.

Build time: 30+ min (iterative) → 44 s (deterministic). Output
file size: 144 MB → 151 MB (essentially unchanged — zoom 8 through
12 still carry the bulk of the feature bytes; the size wasn't the
problem, the low-zoom feature density was).

## Verification

- `npm run format:check` — clean.
- `npm run lint` — clean.
- `npm test` — 14 suites / 154 tests pass (server-side; no server
  code changed).
- Manually reran `node scripts/build-tiles.js`: completes in 44 s,
  writes 151 MB to `data/tiles/grids.pmtiles`.
- Browser A/B left to the user's reload. Expected:
  - Zoom 2-4: dots now sparse enough that the regular grid
    isn't visible as a moiré band; pan should feel smooth.
  - Zoom 8+: unchanged — still full 0.5° resolution as before.
  - Zoom 5-7: intermediate density, roughly doubling each level
    (in feature count).

## Rollback

- **Undo the flag swap**: set `--base-zoom` to `12` (= full detail
  at max zoom only, drop-rate applies from there down) or restore
  the original `--no-feature-limit` pair. Either runs in ~45 s.
- **Git revert**: single commit. The `.pmtiles` binary itself is
  in `.gitignore` (`data/tiles/`), so nothing gets overwritten in
  the working tree except the build script; re-running the build
  restores the pre-commit tile output.

## Design Decisions

- **`--base-zoom=8`, not `12`.** The grid data is at 0.5°
  resolution, which at zoom 8 (~1 km/pixel mid-latitude) already
  renders each cell at ~50 px. Adding three more levels of
  "guaranteed full density" at zoom 9-10-11-12 is redundant for
  this resolution — duplicate features across tiles with no new
  information. Zoom 8 was picked as the first zoom where a 0.5°
  cell is clearly distinguishable on screen; drops only kick in
  below that.
- **`--drop-rate=2`, not `2.5`.** Halving per level (rather than
  tippecanoe's default 2.5x thinning) keeps more low-zoom detail
  than default behavior. At zoom 2 we get ~1,000 dots; at
  drop-rate=2.5 we'd get ~500. Eyeballed this based on "enough
  dots to hint at land outlines on a globe view" vs "few enough
  that the grid isn't visible."
- **Did not touch `frontend/map.js` paint expressions.** The
  `circle-radius` and `circle-opacity` interpolation tables are
  already sensible for the full-density case; with fewer features
  at low zoom they render less coverage but no moiré. If the
  result looks too sparse, follow-up by bumping `circle-radius`
  at low zoom or adding a mild `circle-blur`.

## Files Changed

- **Modified**: `scripts/build-tiles.js` — tippecanoe flag swap +
  inline rationale comment.
- **Modified**: `docs/DEVLOG.md` — index entry.
- **Added**: this entry.
- **Not committed**: `data/tiles/grids.pmtiles` (gitignored binary
  output of the script; regenerate locally with
  `node scripts/build-tiles.js`).
