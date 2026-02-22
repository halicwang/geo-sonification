# 2026-02-20 — Fix: Switch Proximity from Grid-Count to Zoom-Level Mapping

## Problem

The original proximity signal was computed from the number of visible grid cells: `gridCount ≤ 50 → proximity = 1`, `gridCount ≥ 800 → proximity = 0`, linear interpolation between. This hit 0 too early at moderate zoom levels — e.g., zooming into a continent still showed hundreds of cells, pushing proximity to 0 even though the user was clearly looking at a specific region.

## Solution

Replace grid-count mapping with zoom-level mapping. The frontend now sends `zoom` alongside viewport bounds. The server computes proximity as a linear ramp between two configurable thresholds:

- `zoom ≤ PROXIMITY_ZOOM_LOW (default 4)` → proximity = 0 (distant/ocean)
- `zoom ≥ PROXIMITY_ZOOM_HIGH (default 6)` → proximity = 1 (zoomed in)
- Linear interpolation between

This provides a more intuitive mapping: the user's zoom gesture directly controls how "close" the soundscape feels, independent of how many grid cells happen to be visible (which varies wildly by region density and land/ocean ratio).

## New config knobs

- `PROXIMITY_ZOOM_LOW` (default 4) — replaces `PROXIMITY_LOWER`
- `PROXIMITY_ZOOM_HIGH` (default 6) — replaces `PROXIMITY_UPPER`

## Files changed

- **Modified**: `frontend/app.js` — send `zoom` in WebSocket viewport messages
- **Modified**: `server/config.js` — new `PROXIMITY_ZOOM_LOW`/`PROXIMITY_ZOOM_HIGH` env vars (replaced `PROXIMITY_LOWER`/`PROXIMITY_UPPER`)
- **Modified**: `server/index.js` — call `computeProximityFromZoom()` instead of `computeProximityFromGridCount()`
- **Modified**: `server/osc-metrics.js` — add `computeProximityFromZoom()` function
- **Modified**: `server/__tests__/osc-metrics.test.js` — add tests for zoom-based proximity
