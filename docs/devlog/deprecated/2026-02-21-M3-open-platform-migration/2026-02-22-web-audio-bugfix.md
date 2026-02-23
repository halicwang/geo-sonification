# 2026-02-22 — Fix: Web Audio & WebSocket Bug Fixes (3 rounds)

> **Deprecated (2026-02-23):** M3 Open Platform milestone was abandoned. Tooling, tests, and bugfixes introduced during this period are retained; the Open Platform feature set was not pursued.

Three rounds of bug fixes following the Web Audio migration, covering `audio-engine.js`, `websocket.js`, `server/config.js`, and two Max JS scripts.

## Round 1 — Code audit (5 bugs)

- **`server/config.js`**: Replaced unsafe `parseFloat()||fallback` with `parseNonNegativeFloat()` for `PROXIMITY_ZOOM_LOW`/`HIGH`. The `||` pattern silently swallowed `0` (a valid value) and returned the fallback instead.
- **`server/config.js`**: Removed dead `parsePositiveInt` function (lint warning).
- **`frontend/audio-engine.js`**: Reset `loadingStarted` on `stop()` so failed WAV samples can be retried on the next `start()` without a page reload.
- **`frontend/audio-engine.js`**: Clear no-data timers on `visibilitychange` hidden, restart on visible. Previously, the 3-second no-data timer kept running while the tab was hidden, causing audio to snap to silence on return.
- **`frontend/websocket.js`**: Removed duplicate `onDisconnect` call from `onerror` handler — `onclose` always fires after `onerror` per the WebSocket spec, so the callback was invoked twice.

## Round 2 — Auto-suspend resume (1 bug)

- **`frontend/audio-engine.js`**: The no-data timeout (10s idle) called `audioCtx.suspend()` but never set the `suspended` flag (reserved for explicit user stop). When new data arrived, `update()` ran but the context stayed suspended — audio was permanently silent until a visibility toggle or manual stop/start. Fixed by checking `audioCtx.state` in `update()` and calling `resume()` when data flows again.

## Round 3 — Audio system audit (7 bugs)

- **`frontend/audio-engine.js`**: Zero all EMA state (`busSmoothed`, `busTargets`, `oceanTarget`, `oceanSmoothed`) on `start()` to prevent an audible pop from stale values after a stop → navigate → start cycle.
- **`frontend/audio-engine.js`**: Skip buses with `status === 'loading'` in `loadSample()` to prevent duplicate parallel fetches when stop/start is called mid-load.
- **`frontend/audio-engine.js`**: rAF no-data fade now explicitly smooths toward 0 instead of relying on `busTargets` being zeroed by a `setTimeout`. The macrotask timer could fire after rAF, leaving a 1–2 frame gap where smoothing moved toward stale non-zero targets.
- **`frontend/websocket.js`**: Store reconnect timer ID and cancel on re-entry to prevent duplicate connections accumulating during network flapping.
- **`frontend/websocket.js`**: Close previous WebSocket before creating a new one (connection leak).
- **`frontend/websocket.js`**: Wrap `onOpen` callback in try/catch so `refreshServerConfig()` failure doesn't silently skip connection status update and initial viewport send.
- **`sonification/loop_clock.js`**: Clear `bufLengths` array and reset `triggerMs` on `stop()` to prevent unbounded growth across start/stop cycles.
- **`sonification/granulator.js`**: Clamp grain duration to `startRange` so `play~` never reads past the buffer boundary when `durMax` exceeds available range.

## Files changed

- `server/config.js` — safe env parsing for zero-value floats (modified)
- `frontend/audio-engine.js` — EMA reset, load guard, rAF fade, auto-resume, visibility timers (modified)
- `frontend/websocket.js` — reconnect guard, connection leak, onOpen error handling, duplicate callback (modified)
- `sonification/loop_clock.js` — state reset on stop (modified)
- `sonification/granulator.js` — grain duration clamping (modified)
