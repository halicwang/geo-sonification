# 2026-04-28 — Refactor: Drive Proximity Locally from Live Zoom

The low-pass filter cutoff (proximity) used to be computed by the server
from the viewport message's `zoom` field, returned in `audioParams.proximity`,
and written to `ema.proximityTarget` by the WS `onStats` handler. That
chain layered three sources of latency on top of the EMA smoothing
(`PROXIMITY_SMOOTHING_MS = 120`):

- Mapbox's own zoom animation (~300 ms ease).
- `onViewportChange` debounce — at most one viewport per 120 ms.
- WebSocket round-trip to Fly.io (~50–200 ms in production).

End-to-end the filter "lit up" ~1 s after a zoom — well past the visual
zoom completion, so the audio felt detached from the gesture.

This change drives proximity locally: every Mapbox `move` event calls
`engine.updateProximity(map.getZoom())`, which writes `ema.proximityTarget`
synchronously. EMA smoothing in `rafLoop()` continues to shape the cutoff
transition (preserving the anti-zipper softness that the original 120 ms τ
was tuned for). The server still returns `audioParams.proximity` for HTTP
clients that prefer the canonical mapping, but the WS handler in `engine.update()`
now ignores the field — otherwise a stale-zoom server frame arriving after
a fresher local update would briefly drag the EMA target backwards mid-animation.

## What changed

- **Server** — `/api/config` now returns `proximityZoomLow` and `proximityZoomHigh`
  alongside `gridSize` and `landcoverMeta`. Sourced from the same `server/config.js`
  constants the WS path already uses, so the frontend can mirror the env-overridable
  thresholds instead of hardcoding `4` / `6`. Hardcoded defaults remain in the
  frontend as a safety fallback.
- **Frontend audio engine** —
  - `engine.setProximityThresholds(low, high)` configures the module-level
    zoom→proximity mapping; called from `main.js` after `loadServerConfig()`
    and from `map.js` after `refreshServerConfig()`.
  - `engine.updateProximity(zoom)` mirrors `server/audio-metrics.js`'s
    `computeProximityFromZoom`, writes `ema.proximityTarget`, and wakes
    the rAF loop the same way `updateMotion()` does.
  - `engine.update()` no longer reads `audioParams.proximity` — comment
    in place explaining why.
- **Frontend map** — `map.on('move')` now reads `map.getZoom()` once and
  calls `engine.updateProximity(zoom)` before the existing
  `onViewportChange()` debounce step.
- **Frontend config** — `state.config.proximityZoomLow` / `proximityZoomHigh`
  populated by `loadServerConfig()` and `refreshServerConfig()`.

## Why proximity, not all `audioParams`

Bus targets (`busTargets[]`) and `coverage` depend on landcover counts and
grid intersection — data that lives only on the server. Proximity is the
one field whose entire input (zoom) is already on the client, so it pays
the WS round-trip for no informational reason. `velocity` already takes
the same shortcut (`engine.updateMotion`, M3-era).

## Verification

- `npm test` passed: 173/173. Zero suite changes — the existing
  `audio-metrics.test.js` still covers the server-side `computeProximityFromZoom`
  fallback path used by HTTP clients.
- `npm run lint` and `npm run format:check` clean.
- Browser smoke (preview server on :3000):
  - `GET /api/config` returns `proximityZoomLow: 4`, `proximityZoomHigh: 6`.
  - `state.config` populated correctly after `loadServerConfig()`.
  - `engine.updateProximity` and `engine.setProximityThresholds` exposed
    on the engine API surface.
  - Spy-instrumented `updateProximity`: `map.easeTo({ zoom: 5, duration: 400 })`
    fired the function 51 times with monotonically increasing zoom values
    (4.0 → 4.8 mid-animation → 5.0). Filter cutoff now tracks the live
    animation curve instead of waiting for the trailing WS stats frame.

## Files changed

- **modified** `server/routes.js` — expose `proximityZoomLow/High` on `/api/config`.
- **modified** `frontend/audio/engine.js` — add `updateProximity`,
  `setProximityThresholds`; stop reading `audioParams.proximity` in `update()`.
- **modified** `frontend/map.js` — call `engine.updateProximity(zoom)` from
  the `move` handler; sync thresholds in `refreshServerConfig`.
- **modified** `frontend/main.js` — push initial thresholds to engine
  immediately after `loadServerConfig()`.
- **modified** `frontend/config.js` — defaults + `loadServerConfig` reads
  the two new fields.
- **modified** `README.md` — `/api/config` description includes proximity
  zoom thresholds.
