# 2026-04-02 — Fix: Startup, Audio, and Antimeridian Edge Cases

Fixed four production-facing bugs uncovered in the review pass: root CLI startup ignored `.env`, the audio engine lost its tab-visibility lifecycle after the first stop/start cycle, city announcements broke around the antimeridian, and PMTiles generation hard-coded `0.5°` geometry even when `GRID_SIZE` was configured differently.

The goal of this patch was to bring configuration, runtime behavior, and map geometry back into sync without adding dependencies or changing the core data model.

## What Changed

### Root `.env` loading

- Added a lightweight `server/load-env.js` parser/loader that reads the repo-root `.env` file without overriding already-exported environment variables.
- Wired it into `server/config.js` so `npm start`, server-side scripts, and any other `config.js` consumer now honor the same configuration source.

### Audio visibility lifecycle

- Moved `visibilitychange` listener attachment out of the first-run `AudioContext` branch in `frontend/audio-engine.js`.
- Explicit restarts now re-attach the handler after `stop()` removes it, restoring hidden-tab suspend/resume behavior across multiple play sessions.

### Antimeridian-safe city announcements

- Added continuous-longitude viewport normalization in `frontend/city-announcer.js`.
- Nearest-city lookup, center-circle flyby detection, and stereo pan calculation now project city longitudes into the active viewport span, so dateline-crossing viewports behave correctly.

### Configurable PMTiles geometry

- Replaced `0.5°` hard-coding in `scripts/build-tiles.js` with `GRID_SIZE`.
- Refactored the script so feature-building helpers are exported and testable without executing the full tile build.

## Verification

- Added Jest coverage for the new `.env` loader.
- Added Jest coverage for `build-tiles` helper geometry generation and default `GRID_SIZE` usage.
- Re-ran repository lint/test gates after the code changes.

## Files Changed

- **Added**: `server/load-env.js` — lightweight `.env` parser/loader with no new dependency
- **Modified**: `server/config.js` — load repo-root `.env` before reading configuration
- **Modified**: `frontend/audio-engine.js` — re-attach `visibilitychange` handler on every explicit start
- **Modified**: `frontend/city-announcer.js` — normalize antimeridian bounds for lookup and panning
- **Modified**: `scripts/build-tiles.js` — use `GRID_SIZE`, export helpers, avoid auto-run on require
- **Added**: `server/__tests__/load-env.test.js` — unit tests for `.env` parsing/loading behavior
- **Added**: `server/__tests__/build-tiles.test.js` — unit tests for tile geometry helper behavior
