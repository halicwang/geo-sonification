# Architecture — Sound Engine

This document describes the browser-based Web Audio engine.

For the overall system architecture (Frontend → Server → Browser Audio), see `README.md`.
For the frontend module structure (7 ES modules: config, landcover, ui, map, websocket, audio-engine, main), see the DEVLOG entry "2026-02-20 — Frontend Module Split" and "2026-02-21 — Web Audio Migration".
For sound design rationale and task specs, see `sound_design_plan.md`.

---

## Data Flow

```
Frontend (Mapbox) ──WS──> Server (viewport bounds)
                           │
                           ├── spatial.js (aggregate stats)
                           ├── audio-metrics.js
                           │     ├── computeBusTargets() — fold 11 LC → 5 buses
                           │     └── computeOceanLevel() — three-level ocean detection
                           ├── viewport-processor.js — attach audioParams to stats
                           │
                      <──WS──  { type: 'stats', ..., audioParams }
                           │
Frontend: audio-engine.js
  ├── engine.update(audioParams) — EMA smoothing (performance.now() timing)
  ├── requestAnimationFrame loop — apply smoothed → GainNode.gain
  ├── AudioBufferSourceNode × 5 — looping ambience WAVs
  ├── Water bus: Math.max(busSmoothed[water], oceanSmoothed)
  └── visibilitychange — suspend/resume AudioContext
```

---

## Bus Fold-Mapping (11 LC Classes → 5 Audio Buses)

Eleven ESA WorldCover land cover classes are folded into five audio buses:

```
Tree bus  = LC 10 (Tree) + 20 (Shrub) + 30 (Grass) + 90 (Wetland) + 95 (Mangrove) + 100 (Moss)
Crop bus  = LC 40 (Cropland)
Urban bus = LC 50 (Urban)
Bare bus  = LC 60 (Bare)
Water bus = max( LC 70 (Snow/Ice) + 80 (Water),  ocean level )
```

The Water bus uses `Math.max(busValue, oceanLevel)` so that open-ocean areas (where no grid data exists) still produce water audio.

This fold-mapping is defined in `server/audio-metrics.js` (`BUS_LC_INDICES`, `computeBusTargets`).

---

## WAV Loading

Five ambience WAVs are fetched from `/audio/ambience/<name>.wav` with progress tracking via `ReadableStream`. Priority ordering: tree + water first (parallel), then crop + urban + bare (parallel). Each `AudioBufferSourceNode` is created after decoding and set to `loop = true`.

---

## EMA Smoothing

Formula: `alpha = 1 - exp(-dt / 500)`. Timing uses `performance.now()`, not rAF timestamps. If `dt > 2000ms` (snap threshold), values jump directly to target. The `requestAnimationFrame` loop reads smoothed values and writes them to `GainNode.gain`.

---

## Three-Level Ocean Detection

Produces a raw target level based on the absence of grid data (ocean has no grids, so `coverage ≈ 0`).

| Condition                              | Target | Meaning                           |
| -------------------------------------- | ------ | --------------------------------- |
| `proximity == 0`                       | 1.0    | Pure ocean — no grids at all      |
| `coverage < 0.1` AND `proximity > 0.7` | 0.7    | Coastal — mostly ocean, some land |
| Otherwise                              | 0.0    | Land — sufficient data coverage   |

The target is EMA-smoothed with the same formula (default 500 ms). The output is combined with the Water bus LC value via `Math.max()`.

---

## No-Data Timeout

When `update()` is not called for 3 seconds (WS disconnect or server down), the rAF loop begins smoothing all buses toward silence. After 10 seconds total, `AudioContext.suspend()` is called. When data arrives again, `update()` detects `audioCtx.state === 'suspended'` and calls `resume()` automatically — no user interaction required.

---

## Visibility Handling

On `document.hidden`: cancel rAF, clear no-data timers, suspend `AudioContext`. On visible (if user hasn't explicitly stopped): resume context, snap smoothed values to current targets (avoids jarring transition from stale values), restart rAF and no-data watchdog.

---

## Timing Constants

| Constant             | Value   | Location        | Purpose                          |
| -------------------- | ------- | --------------- | -------------------------------- |
| `SMOOTHING_TIME_MS`  | 500 ms  | audio-engine.js | EMA time constant                |
| `SNAP_THRESHOLD_MS`  | 2000 ms | audio-engine.js | Snap-to-target when dt too large |
| `NO_DATA_FADE_START` | 3000 ms | audio-engine.js | Begin fade to silence            |
| `NO_DATA_SUSPEND`    | 10000ms | audio-engine.js | Suspend AudioContext             |
