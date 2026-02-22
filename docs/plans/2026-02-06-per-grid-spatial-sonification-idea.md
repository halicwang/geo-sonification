# Per-Grid Spatial Sonification: Design Notes

Date: 2026-02-06

## Context

The current system aggregates all grid cells in the viewport into a single set of values (weighted averages) and sends one group of OSC messages to Max/MSP. This works well as a "regional summary" but loses spatial detail — the user hears one sound regardless of how many distinct zones are visible on screen.

This document captures an idea for an alternative mode: **per-grid sonification**, where individual grid cells send their own data to Max, enabling spatially distributed sound.

## Current Behavior (Aggregated Mode)

When the user pans/zooms, the server:

1. Finds all 0.5×0.5 degree grid cells within the viewport
2. Computes area-weighted averages across all cells
3. Sends **one** set of OSC messages:
    - `/landcover` (int, dominant class)
    - `/nightlight` (float, 0-1)
    - `/population` (float, 0-1)
    - `/forest` (float, 0-1)

Max receives a single snapshot describing the whole viewport. The sound represents a blended summary of the visible area.

## Proposed Behavior (Per-Grid Mode)

When the number of grid cells in the viewport falls below a configurable threshold, the server switches to sending data for each grid cell individually.

### Threshold-Based Mode Switching

```
grid_count > THRESHOLD  →  aggregated mode (current behavior, 1 message group)
grid_count <= THRESHOLD →  per-grid mode (N message groups, one per cell)
```

A reasonable starting threshold might be 50-100 cells. This needs experimentation — the upper limit depends on what Max can handle without audio glitches.

### Per-Grid OSC Message Format

Each grid cell sends a single multi-argument message:

```
/grid [lon] [lat] [landcover] [nightlight] [population] [forest]
```

The `lon`/`lat` pair identifies the cell and allows Max to compute spatial positioning (e.g., stereo panning based on the cell's relative position within the viewport).

## Server-Side Changes

Relatively small:

- **`spatial.js`**: Add a branch in the viewport handler. When `gridCount <= threshold`, normalize each cell individually instead of aggregating.
- **`osc.js`**: Add a loop to send `/grid` messages. Possibly send a `/grid/count N` message first so Max knows how many to expect.
- **`config.js`**: Add `PER_GRID_THRESHOLD` environment variable.

## Max-Side Challenges

This is where the main complexity lives:

1. **Dynamic polyphony** — Use `poly~` to manage N simultaneous sound instances, where N changes as the user pans/zooms. Each instance receives one grid cell's parameters.
2. **Voice allocation** — When a new grid enters the viewport, assign it to a free voice. When a grid leaves, release that voice. This requires tracking which grid (by lon/lat) maps to which `poly~` voice.
3. **Spatial positioning** — Map each cell's lon/lat to a panning position relative to the viewport bounds. Simplest approach: stereo L/R panning based on horizontal position. More advanced: quadraphonic or ambisonics if available.
4. **Smooth transitions** — Grids appearing/disappearing should fade in/out rather than pop. Use envelope generators (`line~`, `adsr~`) on each voice.
5. **Mode switching** — Transitioning between aggregated and per-grid mode (when zooming in/out past the threshold) needs to be smooth. Possible approach: crossfade between the two modes over ~500ms.

## Open Questions

- What is the right threshold value? Needs testing with actual Max patch performance.
- Should the per-grid sound be a quieter version of the aggregated sound, or a fundamentally different texture?
- Is stereo panning enough, or does the spatial effect need multichannel output to be meaningful?
- How to handle the transition at the threshold boundary without audible artifacts?
- Does the added complexity justify the perceptual benefit for the project's goals?

## Conclusion

The server-side work is straightforward. The Max-side work is moderate — primarily `poly~` voice management and spatial panning. The key question is whether per-grid spatial sound adds enough to the listening experience to justify the implementation effort. It may be worth prototyping with a simple `poly~` patch and a small number of grids before committing to a full implementation.
