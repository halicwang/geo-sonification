# 2026-03-26 — Feature: Granulation Layer

Added a density-driven granulation layer on top of the 7-bus ambience engine. Two independent voices (wildlife and human) overlay short audio grains whose density and read position are controlled by landcover data, creating a perceptually richer soundscape that differentiates natural and urban areas.

## Design

Based on professor's "sliding window" granulation technique:

- Source audio files have gradually increasing activity (sparse → dense over 60-120s)
- A short read window (150-400ms grains) is positioned based on density
- Higher density reads from later in the file (denser source material) and schedules grains more frequently

Two voices:
- **Wildlife**: density = `max(forest, shrub, grass)` smoothed bus values
- **Human**: density = `urban` smoothed bus value
- Both scaled by `landMix` (silent over ocean)

## Architecture

- `frontend/granulator.js`: standalone module with `init/start/stop/update/dispose` API
- Lookahead grain scheduler (`setInterval` 25ms, 100ms lookahead) independent of rAF loop
- Each grain: `AudioBufferSourceNode` + `GainNode` with Hann window envelope
- Exponential IOI mapping: 500ms (sparse) → 80ms (dense)
- Total grain cap: 20 across both voices
- Output connects to `masterGain`, sharing the LP filter chain

## Integration Points

Surgical additions to `audio-engine.js`:
- `start()`: `granulator.init(audioCtx, masterGain)`
- `rafLoop()`: compute densities from `busSmoothed`, call `granulator.update()`
- `stop()` / visibility hidden: `granulator.stop()`
- visibility visible: `granulator.start()`

No server changes required — density derived from existing `busTargets`.

## Files Changed

- `frontend/granulator.js` — **new**: core granulation module (~350 lines)
- `frontend/audio-engine.js` — **modified**: import + lifecycle wiring (~20 lines)
- `frontend/audio/grains/` — **new**: directory for grain source WAVs (gitignored)
- `.gitignore` — **modified**: added `frontend/audio/grains/*.wav`
- `docs/ARCHITECTURE.md` — **modified**: added granulation layer section + timing constants
