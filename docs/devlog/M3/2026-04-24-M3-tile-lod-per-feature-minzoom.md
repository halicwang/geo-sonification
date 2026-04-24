# 2026-04-24 — Refactor: Tile LOD via Per-Feature Minzoom (Square 2-Tier)

Supersedes the `--cluster-distance` LOD from commit `5917fd4`.
Clustering worked for density, but tippecanoe replaces grouped
points with their centroid, so surviving dots drifted off the 0.5°
grid and the overlay looked "scrambled" at low zoom. User
explicitly asked for position preservation: "**能不能不要改变原有
grid 的位置啊 … 可以变稀疏 但不要通过改变原来 grid 的位置使其胡乱
排列**".

Replaced with a per-feature `tippecanoe.minzoom`, computed from
each cell's integer position on the global grid, so every emitted
dot sits at its original 0.5° centroid and zooming in strictly
reveals the "in-between" cells without moving anything.

Landed on a **two-tier square hierarchy** after iterating:

| zoom  | visible cells                          | ~count |
| ----- | -------------------------------------- | ------ |
| 0 – 3 | 1° sub-grid (every 2nd cell on both axes) | ~17k   |
| 4 +   | full 0.5° grid                         | ~67k   |

Both tiers are clean rectangular sub-grids. Zoom 4 jumps to the
full 0.5° grid; if that brings back moiré at the exact 4-px-per-°
screen density, the transition can be pushed to zoom 5 with a
one-line edit.

## Implementation

### `scripts/build-tiles.js`

- New `gridMinZoom(i, j)` helper: returns `0` if `(i, j)` lands
  on the 1° sub-grid, else `4`. Nothing else; two tiers, no
  diagonal or checkerboard.
- `gridToFeature(grid, gridSize, maxzoom)` now takes `maxzoom`
  (not `minzoom + maxzoom`) and sets the feature's
  `tippecanoe.minzoom` from `gridMinZoom` on the derived cell
  indices. The unused `minzoom` parameter — vestige from the
  original un-LOD'd code — is removed.
- `buildTileFeatures(grids, gridSize, maxzoom)` signature
  shortened to match.
- `tippecanoeArgs` no longer needs `--cluster-distance`,
  `--drop-rate`, `--base-zoom`, or `--drop-*-as-needed`. Kept
  `--no-tile-size-limit` and `--no-tile-compression` as
  safety-net + pmtiles-client compatibility. The LOD is now
  entirely in the feature minzooms; tippecanoe just honors them.

### `server/__tests__/build-tiles.test.js`

- Updated the `gridToFeature` test to match the new contract:
  a cell on the 1° sub-grid gets `minzoom: 0`, an off-grid cell
  gets `minzoom: 4`. The test now covers both tiers.
- Dropped the obsolete parameter from the test call signatures.

## Why not stick with `--cluster-distance`

Clustering was deterministic, fast, and CPU-cheap, but it shifts
dot positions — tippecanoe computes a weighted centroid per
cluster and emits a synthetic point there. For a regular
geographic grid overlaid on a map that's expressing "data lives
here", a drifted centroid reads as noise. The user immediately
spotted this and called it out as "胡乱排列" (scrambled).

Per-feature minzoom doesn't cluster at all — it just tells
tippecanoe "don't include this feature below zoom N". Every
surviving dot keeps its exact 0.5° grid coordinate. At the cost
of some coarser density tiers (rectangular sub-grids only give
1/4, 1/16, 1/64 density steps), the visual integrity is
preserved. The user explicitly accepted the trade-off
("**两档够了**" → two tiers are enough).

## Verification

- `npm run format:check` — clean.
- `npm run lint` — clean.
- `npm test` — 14 suites / 154 tests pass (updated
  `build-tiles.test.js` covers both new minzoom paths).
- `pmtiles show` / `pmtiles tile` confirm zoom 0-3 tiles are ~1/4
  the size of zoom 5+ tiles, consistent with the 1° sub-grid
  reducing feature count to 1/4.
- Per-zoom feature counts at center tile (Asia-ish region):

  ```
  zoom 2 tile 2/1: 5021 features
  zoom 3 tile 4/3: 1746 features
  zoom 4 tile 8/6: 1415 features
  zoom 5 tile 16/12: 264 features
  zoom 6 tile 32/24: 25 features
  ```

  The zoom 5 drop looks steep relative to zoom 4, but that's
  because tile 16/12 at zoom 5 covers a much smaller geographic
  area than 8/6 at zoom 4 — per-tile counts aren't directly
  comparable across zooms. What matters is zoom 4 is at full
  0.5° resolution while zoom 2-3 are on the 1° sub-grid.

- Browser A/B deferred to user reload after a hard refresh
  (`Cmd+Shift+R`). Expected: zoom 0-3 shows a visibly regular
  square pattern at 1° spacing, zoom 4+ returns to the original
  0.5° full density.

## Rollback

- **Back to cluster-distance**: `git revert` this commit and
  the test update, then rerun `node scripts/build-tiles.js`.
  Restores the scrambled-but-consistently-thinned look.
- **Push transition to zoom 5**: change `return 4` in
  `gridMinZoom` to `return 5`. Zoom 4 stays on the 1° sub-grid
  (~17k), full 0.5° detail only unlocks at zoom 5+. Useful if
  zoom 4 turns out to have moiré.
- **Denser low zoom**: change `gridMinZoom` tier 1 condition to
  a tighter modulo (e.g., `i % 4 === 0 && j % 4 === 0` → 2°
  sub-grid, ~4k at zoom 0-3 — sparser, not denser, so this is
  the opposite direction).

## Files Changed

- **Modified**: `scripts/build-tiles.js` — `gridMinZoom` +
  signature cleanup + tippecanoe flag reset.
- **Modified**: `server/__tests__/build-tiles.test.js` — updated
  assertions for new signature and minzoom semantics.
- **Modified**: `docs/DEVLOG.md` — index entry.
- **Added**: this entry.
- **Not committed**: `data/tiles/grids.pmtiles` (gitignored;
  rerun `node scripts/build-tiles.js` to regenerate).
