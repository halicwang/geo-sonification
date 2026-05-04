# 2026-05-03 — Refactor: Inject UI Callbacks into map.js

`frontend/map.js` reached directly into `frontend/ui.js` with `import { updateUI, showToast }` and called both inside `sendViewportHTTP` (HTTP fallback path) and the PMTiles-load failure handler. That broke the otherwise-clean pattern set by `frontend/websocket.js`, where transport modules take callbacks and let `frontend/main.js` wire the concrete fan-out. This commit moves map.js onto the same pattern: `initMap({ onStats, onToast })`, ui import gone.

## Why

Two reasons:

1. **Coupling**: `ui.js` already imports `state` and `landcover.js`; `map.js` was importing `ui.js` and pushing stats into it. The pair formed an implicit cycle through `state.runtime.map` and `state.els`. Inverting the dependency so map.js publishes stats and main.js routes them to ui.js makes the data flow one-directional.
2. **Consistency**: the WebSocket path (`connectWebSocket.onStats: handleStats`) and the HTTP fallback path (`sendViewportHTTP` → previously inline `updateUI(stats); engine.update(stats.audioParams);`) duplicated the fan-out logic. Routing both through one `handleStats` in main.js eliminates the chance of the two transports diverging on what "process a stats payload" means.

## What changed

### `frontend/map.js`

- Removed `import { updateUI, showToast } from './ui.js';`.
- Added a module-level `mapCallbacks` slot with a `MapCallbacks` JSDoc typedef (two fields: `onStats(stats)` and `onToast(message, durationMs?)`).
- `initMap(callbacks)` now accepts the callbacks object and stores it.
- `sendViewportHTTP` (HTTP fallback path) replaces its `updateUI(stats); if (stats.audioParams) engine.update(stats.audioParams);` block with a single `mapCallbacks.onStats(await response.json())`. The engine fan-out now lives at the same place as the WebSocket path's: in main.js.
- The PMTiles-load failure path uses `mapCallbacks.onToast(...)` instead of `showToast(...)`.

### `frontend/main.js`

- Extracted the inline arrow that was `connectWebSocket.onStats` into a named `handleStats(data)` declared once before `initMap`. It calls `updateUI(data)` and `engine.update(data.audioParams)` if present — the existing two-line behaviour, now in one place.
- `initMap({ onStats: handleStats, onToast: showToast })` — same `handleStats` instance is reused for `connectWebSocket.onStats: handleStats` so the two transports share fan-out byte-for-byte.

## Verification

- `npm run test:frontend` → 91 passed (8 suites). Engine + helper tests unaffected.
- `npm run lint` clean.
- Browser smoke (`npm run dev`, headless preview):
    - Initial WS message populates the side panel (zoom 4.00, 1080/1080 grids, dominant Tree/Forest, proximity 0.00). ✓
    - Programmatic `map.jumpTo({ center: [25, 5], zoom: 6 })` over a WS connection: panel updates to 80/80 grids, proximity 1.00, zoom 6.00. ✓ (WS path → `connectWebSocket.onStats` → `handleStats` → `updateUI` + `engine.update`.)
    - Closed the WS (`state.runtime.ws.close(); state.runtime.ws = null`) and re-panned to (−5, 50) zoom 5: panel updated to 85/180 (47%) grids. ✓ (HTTP fallback path → `mapCallbacks.onStats` → `handleStats`. Confirms the new injection wires correctly under the only path that was actually rewired.)
    - No console errors during either path.

## Files changed

- **Modified** `frontend/map.js` — dropped ui.js import; added `MapCallbacks` typedef + module-level slot; `initMap(callbacks)` stores them; sendViewportHTTP and PMTiles error handler use callbacks (~22 LOC churn, net flat).
- **Modified** `frontend/main.js` — extracted `handleStats`; pass `{ onStats, onToast }` to `initMap`; reuse the same `handleStats` reference for `connectWebSocket.onStats` (~18 LOC churn).
- **Added** `docs/devlog/M6/2026-05-03-M6-frontend-map-ui-callback-injection.md` — this entry.
- **Modified** `docs/DEVLOG.md` — index this entry.
