# 2026-04-24 — Refactor: Roll Back Dot Rendering Experiments to Pre-LOD State

After iterating through six approaches to the "moiré + stutter at
low zoom" problem (per-feature minzoom / cluster-distance /
drop-fraction-as-needed / two-tier square / sub-pixel radius /
radius bump), the user decided the trade-offs weren't worth it and
asked to return to the original rendering. This commit restores
the three touched files to their state at `53e3929` (the last
commit before the dot-rendering exploration started) and rebuilds
the PMTiles archive with the original tippecanoe flags.

The individual experiment commits and their devlogs are left in
git history — they document what was tried and why it didn't
land, which is useful the next time someone looks at this problem.

## Files Restored

All three checked out from `53e3929`:

- **`scripts/build-tiles.js`** — `gridToFeature` and
  `buildTileFeatures` return to their original four- and
  three-argument signatures; `gridMinZoom` is gone; tippecanoe
  args revert to `--no-feature-limit --no-tile-size-limit
  --no-tile-compression` (all 67k features at every zoom).
- **`server/__tests__/build-tiles.test.js`** — restored to the
  pre-LOD assertion `{ minzoom: 2, maxzoom: 8 }`.
- **`frontend/map.js`** — `circle-radius` curve back to
  `2: 1.1, 5: 2.8, 8: 4.9, 12: 8.2`; `circle-opacity` back to the
  `0.92 → 1` zoom ramp; `circle-stroke-width` back to the
  `0.15 → 0.9` zoom ramp. The anti-moiré sub-pixel curve is gone.

## PMTiles Output

Rebuilt with the restored script; output is the original
~144 MB file with every cell present at every zoom. Moiré and
low-zoom stutter return to their pre-`b09ee81` baseline — this
is the acknowledged state of the rollback, not a regression.

## Experiments Left in Git History

For the record (in order they landed, all rolled back here):

1. `b09ee81` — `--base-zoom + --drop-rate` (no-op; flags
   require an `--as-needed` trigger).
2. `a4c58d3` — bumped base-zoom 8 → 10 (still a no-op).
3. `5917fd4` — switched to `--cluster-distance=16`, which
   actually thinned features but shifted their positions off
   the 0.5° grid.
4. `2e2a851` — per-feature `tippecanoe.minzoom` in a two-tier
   square hierarchy; fixed positions but caused a visible pop
   at the zoom-4 transition.
5. `e29ada8` — shelved the tier hierarchy, shrank dots to
   sub-pixel width at low zoom so anti-aliasing dissolved the
   grid into a gray wash. No pop, no cluster, but the wash
   was too faint.
6. `07e3673` — bumped the low-zoom radius 50 % to darken the
   wash. Still not right for the user.

Their devlog entries remain under `docs/devlog/M3/` for anyone
revisiting this problem.

## Verification

- `npm run format:check` — clean.
- `npm run lint` — clean.
- `npm test` — 14 suites / 154 tests pass (the restored
  `build-tiles.test.js` matches the restored function signature).
- `node scripts/build-tiles.js` ran end-to-end, writing ~144 MB
  to `data/tiles/grids.pmtiles`.
- Browser behavior deferred to user reload (`Cmd+Shift+R`).

## Files Changed

- **Modified**: `scripts/build-tiles.js`,
  `server/__tests__/build-tiles.test.js`, `frontend/map.js` —
  all three restored to their `53e3929` state.
- **Modified**: `docs/DEVLOG.md` — index entry for this
  rollback.
- **Added**: this entry.
- **Not committed**: `data/tiles/grids.pmtiles` (gitignored;
  rerun `node scripts/build-tiles.js` to regenerate at ~144 MB).
