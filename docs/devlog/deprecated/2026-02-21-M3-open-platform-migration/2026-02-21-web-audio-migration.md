# 2026-02-21 — Feature: Web Audio Migration (Phase W)

> **Deprecated (2026-02-23):** M3 Open Platform milestone was abandoned. Tooling, tests, and bugfixes introduced during this period are retained; the Open Platform feature set was not pursued.

Added browser-based audio playback using Web Audio API, enabling the sonification system to run without Max/MSP.

## Changes

- **ENABLE_OSC flag:** New `ENABLE_OSC` config variable (default `true`). When `false`, `osc.js` exports a null-object interface and never opens a UDP port. Added `parseBool` helper to `config.js`.
- **Server-side fold mapping:** `osc-metrics.js` gains `computeBusTargets()` (folds 11 LC classes into 5 bus values per the Max patch wiring) and `computeOceanLevel()` (three-level ocean detection per `water_bus.js` logic). `viewport-processor.js` attaches `audioParams` to every stats response.
- **Static audio route:** `/audio/ambience/` serves only the ambience subdirectory of `sonification/samples/`, not the entire samples tree.
- **Frontend audio engine:** New `frontend/audio-engine.js`. Progressive WAV loading with priority (tree/water first). EMA smoothing computed in `update()` using `performance.now()`, applied to GainNodes via `requestAnimationFrame`. Snap threshold set to 2000ms. AudioContext lifecycle: suspend/resume on `visibilitychange`, no-data fade (3s) and suspend (10s) timeout on WS disconnect.
- **Audio UI controls:** Play/stop button and per-bus loading progress bars in the info panel, between stats section and connection status.
- **Icon triggers dropped:** All icon sample folders contain only `.gitkeep`. No icon trigger code implemented (YAGNI).

## Files changed

- `server/config.js` — `parseBool`, `ENABLE_OSC` (modified)
- `server/osc.js` — ENABLE_OSC guard with null object (modified)
- `server/osc-metrics.js` — `computeBusTargets`, `computeOceanLevel`, `BUS_NAMES`, `BUS_LC_INDICES` (modified)
- `server/viewport-processor.js` — `audioParams` in stats (modified)
- `server/index.js` — `/audio/ambience/` route, `ENABLE_OSC` in banner (modified)
- `frontend/audio-engine.js` — Web Audio engine (new)
- `frontend/index.html` — audio controls HTML (modified)
- `frontend/style.css` — audio controls CSS (modified)
- `frontend/main.js` — engine import, update wiring, toggle handler (modified)
- `frontend/config.js` — `audioEnabled` state flag (modified)
- `.env.example` — `ENABLE_OSC` documentation (modified)
- `server/__tests__/osc-disabled.test.js` — ENABLE_OSC=false tests (new)
- `server/__tests__/osc-metrics-bus.test.js` — bus fold + ocean tests (new)
