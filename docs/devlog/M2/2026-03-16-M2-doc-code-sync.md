# 2026-03-16 — Refactor: Sync ARCHITECTURE.md and Code Comments with Implementation

ARCHITECTURE.md and audio-engine.js comments had fallen behind the actual implementation after multiple M2 iterations. This entry documents the synchronization pass and dead-code removal.

## Discrepancies Fixed

### ARCHITECTURE.md

- **Ocean detection**: replaced the stale "Three-Level Ocean Detection" section (proximity-based thresholds) with "Coverage-Linear Ocean Detection" (simple `1 - coverage / 0.4` ramp). The three-level system was removed in 2026-02-23.
- **Data flow diagram**: updated to reflect current signal routing — 4 parallel EMA signals, 3-stage LP filter chain, velocity Q modulation, and client-side motion path (`engine.updateMotion()`).
- **Missing features**: added sections for Low-Pass Filter Chain, Client-Side Motion Signals, and Loop Progress and Seeking.
- **EMA Smoothing**: expanded from a single-formula note to a table covering all four EMA signals (bus gains, coverage, proximity, velocity) with their respective time constants.
- **Timing constants table**: expanded from 2 entries to 12, covering all constants defined in `audio-engine.js`.
- **Visibility handling**: added velocity snap-to-zero and swap timer restart details.
- **WAV loading**: added soft-limiter normalization note.

### audio-engine.js

- **File header comment (line 7)**: "Five-bus" -> "Seven-bus", "three-level" -> "coverage-linear". The 5-bus description dated from before the shrub/grass split.
- **`update()` JSDoc (line 678)**: "5 floats [tree, crop, urban, bare, water]" -> "7 floats [forest, shrub, grass, crop, urban, bare, water]".

### viewport-processor.js — dead `oceanLevel` removal

- Removed `computeOceanLevel` import and `oceanLevel` field from `audioParams`. The frontend computes ocean mix from `coverage` directly in its rAF loop and never reads `audioParams.oceanLevel`. Keeping it sent a misleading signal that the server controlled ocean detection.
- Updated 4 golden fixture files and removed the `oceanLevel` assertion from `golden-baseline.test.js`.

## Files Changed

- **Modified**: `docs/ARCHITECTURE.md` — full rewrite to match current implementation
- **Modified**: `frontend/audio-engine.js` — fixed header comment and `update()` JSDoc
- **Modified**: `server/viewport-processor.js` — removed `computeOceanLevel` import and `oceanLevel` field
- **Modified**: `server/__tests__/golden-baseline.test.js` — removed `oceanLevel` test case
- **Modified**: `server/__tests__/fixtures/golden-viewport-ocean.json` — removed `oceanLevel` field
- **Modified**: `server/__tests__/fixtures/golden-viewport-land.json` — removed `oceanLevel` field
- **Modified**: `server/__tests__/fixtures/golden-viewport-coastal.json` — removed `oceanLevel` field
- **Modified**: `server/__tests__/fixtures/golden-viewport-urban.json` — removed `oceanLevel` field
