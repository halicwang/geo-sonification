# 2026-03-16 — Feature: Split Tree Bus into Forest/Shrub/Grass (5→7 Buses)

The single "tree" audio bus previously folded 6 LC classes (Tree/Forest, Shrubland, Grassland, Wetland, Mangroves, Moss/Lichen) into one channel. In green-dominant viewports, gain stayed near 0.85–1.0 with negligible variation — the user could not hear any meaningful change when panning across different vegetation types. Forest and Grassland shared the same `tree.wav`, making them indistinguishable.

## Changes

Split the tree bus into 3 distinct buses, bringing the total from 5 to 7:

| Bus    | LC Classes                              |
|--------|-----------------------------------------|
| Forest | 10 (Tree/Forest), 95 (Mangrove)        |
| Shrub  | 20 (Shrubland)                          |
| Grass  | 30 (Grassland)                          |
| Crop   | 40 (Cropland)                           |
| Urban  | 50 (Urban)                              |
| Bare   | 60 (Bare), 100 (Moss/Lichen)           |
| Water  | 70 (Snow/Ice), 80 (Water), 90 (Wetland)|

Regrouping rationale:
- **Wetland → Water**: wetlands have a distinctly wet soundscape character, better suited to the water bus than the forest bus.
- **Moss/Lichen → Bare**: typical habitats (polar tundra, high-altitude rock, glacier retreat zones) are acoustically similar to bare ground — wind, openness, silence.

## Gain Power Curve

Added a non-linear power curve (`exponent = 0.6`) applied to smoothed bus values before gain assignment. This stretches mid-high range differences for better perceptual contrast (e.g., `0.85 → 0.908`, `0.50 → 0.660`, `0.20 → 0.381`).

## Files Changed

- `server/audio-metrics.js` — Updated `BUS_NAMES`, `BUS_LC_INDICES`, JSDoc
- `server/__tests__/audio-metrics-bus.test.js` — Rewrote all bus mapping tests for 7 buses
- `server/__tests__/golden-baseline.test.js` — Updated destructuring, length checks, bus name assertions
- `server/__tests__/fixtures/golden-viewport-{land,ocean,coastal,urban}.json` — Updated `busTargets` and `busNames`
- `frontend/audio-engine.js` — Updated `NUM_BUSES`, `BUS_NAMES`, `WATER_BUS_INDEX`, loading priority, added `GAIN_CURVE_EXPONENT` and power curve in RAF loop
- `frontend/main.js` — Updated `BUS_LABELS`
- `docs/ARCHITECTURE.md` — Updated bus mapping section and WAV loading description
- `README.md` — Updated bus count and mapping description
- `docs/DEVLOG.md` — Added this entry
