# 2026-02-08 — Feature: OSC Pipeline Extensions: `/grid/lc`, `/mode`, `/grid/pos`

Three new OSC message types added to complete the per-grid data pipeline. Design principle: **extend with independent addresses, never modify existing message formats**.

## 1. `/grid/lc` — Per-cell landcover distribution (11 floats)

**Problem**: Per-grid mode only sent the dominant landcover class as an integer. Cells with mixed land use (e.g., 60% forest + 30% cropland) lost their distribution detail.

**Solution**: New `/grid/lc` message per cell — 11 floats in the same class order as aggregated `/lc/*` (classes 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100). Each float is a 0-1 fraction. Fallback: if `lc_pct_*` columns are missing, synthesizes 100% from the discrete `landcover_class`.

**Files**: `server/osc.js` (`sendGridsToMax`), `server/landcover.js` (new `getCellLcDistribution()` helper)

## 2. `/mode` — Mode transition notification

**Problem**: MaxMSP had no way to know when the server switched between aggregated and per-grid modes. Needed for crossfade transitions and routing.

**Solution**: `/mode` message (string: `"aggregated"` or `"per-grid"`) sent **before** any data messages on every viewport update. Max can use this to trigger crossfades or route switches.

**Files**: `server/osc.js` (new `sendModeToMax()`), `server/index.js` (`processViewport()` calls it before data send)

## 3. `/grid/pos` — Viewport-relative normalized position (2 floats)

**Problem**: Max received absolute lon/lat per cell but needed viewport-relative coordinates for spatial audio panning. Max would have had to compute `(lon - west) / (east - west)` itself using `/viewport` bounds.

**Solution**: Server pre-computes and sends `/grid/pos` with `xNorm` (0=west, 1=east) and `yNorm` (0=south, 1=north). Max can directly map these to stereo panning or spatial placement.

**Implementation details**:

- Uses **cell center** (lon + GRID_SIZE/2, lat + GRID_SIZE/2), not bottom-left corner — otherwise all cells are offset by half a grid cell
- Date-line crossing (west > east → negative xRange) falls through to 0.5 default — acceptable for current data coverage
- Computed once per viewport update (xRange/yRange outside the per-cell loop)

**Files**: `server/osc.js` (`sendGridsToMax`), imported `GRID_SIZE` from config

## Updated Per-Grid OSC Sequence

```
/mode        "per-grid"                        ← mode notification (always first)
/grid/count  N                                 ← number of cells
/viewport    west south east north             ← viewport bounds
  × N cells:
    /grid      lon lat lc nl pop forest        ← cell data (6 args, unchanged)
    /grid/pos  xNorm yNorm                     ← viewport-relative position
    /grid/lc   f10 f20 f30 f40 f50 f60 f70 f80 f90 f95 f100  ← landcover distribution
```

Aggregated mode unchanged (15 messages: 4 stats + 11 `/lc/*`).

## Max Patch Updates

Updated route from `route /grid/count /grid /viewport` to:

```
route /grid/count /grid/pos /grid/lc /grid /viewport
```

**Defensive ordering**: More specific paths (`/grid/pos`, `/grid/lc`) before shorter `/grid` to prevent prefix-matching issues. 5 routes → 6 outlets (including remainder).

New objects: `unpack f f` for `/grid/pos`, `unpack f f f f f f f f f f f` for `/grid/lc`, corresponding `print` objects for verification.

## Bug Fixes

1. **Max `route` numinlets** — Was incorrectly set to 6 (matching numoutlets); Max `route` always has exactly 1 inlet. Fixed to 1.
2. **Cell center offset** — lon/lat from CSV are bottom-left corners of 0.5° cells. Normalizing with corner values offsets all positions by ~0.25°. Fixed by computing `centerLon = lon + GRID_SIZE / 2`.
3. **Max patch layout** — Several boxes had overlapping/truncated text. Adjusted `patching_rect` coordinates for `grid_data_route`, `print_viewport`, `print_grid_lc`.

## `/forest` vs `/lc/10` — Clarification

Two "forest" values exist in the OSC stream with different semantics:

| Message                                        | Denominator    | Meaning                                           |
| ---------------------------------------------- | -------------- | ------------------------------------------------- |
| `/forest` (aggregated) / `/grid` forest arg    | land area only | forest_area ÷ land_area (excludes water)          |
| `/lc/10` (aggregated) / `/grid/lc` first float | total area     | tree_cover_pixels ÷ total_pixels (includes water) |

For a coastal cell that's 50% water + 50% forest: `/forest` = 1.0, `/lc/10` ≈ 0.5.

**Sonification recommendation**: Use `/lc/*` (or `/grid/lc`) as the primary 11-channel landcover mapping. `/forest` is redundant but available as a convenience if a simpler forest-only control is needed.
