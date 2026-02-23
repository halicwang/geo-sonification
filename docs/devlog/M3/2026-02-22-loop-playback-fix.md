# 2026-02-22 — Fix: Frontend Loop Playback Stability

Fixed a false-positive idle behavior in the Web Audio engine that made loop playback appear to "stop" when the map was stationary. The previous no-data timeout treated "no new `update()` calls" as disconnect, but stationary viewports naturally pause updates. The engine now keeps the last targets continuously until user stop or tab hide.

## Changes

- **`frontend/audio-engine.js`**: Removed no-data auto-fade/auto-suspend logic (3s/10s timers). rAF now continuously applies current smoothed targets without idle zeroing.
- **`frontend/audio-engine.js`**: Updated resume comment in `update()` to match current lifecycle behavior.
- **`frontend/map.js`**: HTTP fallback path now forwards `stats.audioParams` to `engine.update()`, so audio parameters still update when WebSocket is unavailable.
- **`README.md`**: Updated audio lifecycle section to document idle-hold behavior and HTTP fallback audio updates.
- **`ARCHITECTURE.md`**: Replaced "No-Data Timeout" section with "Idle Behavior"; removed no-data timer constants from timing table.

## Files changed

- `frontend/audio-engine.js` — remove idle no-data timers and fade-to-zero path (modified)
- `frontend/map.js` — HTTP fallback updates audio engine (modified)
- `README.md` — audio lifecycle docs synced to current behavior (modified)
- `ARCHITECTURE.md` — architecture docs synced to current behavior (modified)
