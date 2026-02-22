# 2026-02-20 — Refactor: Frontend Module Split: app.js → 6 ES Modules

## Problem

`frontend/app.js` was a 624-line monolith mixing configuration, Mapbox initialization, WebSocket management, UI rendering, and state management. Hard to navigate and maintain.

## Solution

Split into 6 native ES modules using `<script type="module">`. No bundler — browsers handle the import graph natively.

| Module         | Lines | Responsibility                                                                     |
| -------------- | ----- | ---------------------------------------------------------------------------------- |
| `config.js`    | 131   | Shared state (grouped), constants, server config, client ID                        |
| `landcover.js` | 57    | Pure lookup utilities (name, color, XSS escape)                                    |
| `ui.js`        | 115   | `updateUI`, `updateConnectionStatus`, `showToast`                                  |
| `map.js`       | 257   | Mapbox init, grid overlay, viewport debounce, HTTP fallback, `refreshServerConfig` |
| `websocket.js` | 68    | WS connection + reconnect (callback-based, no map/ui dependency)                   |
| `main.js`      | 67    | Entry point — caches DOM refs, wires WS callbacks                                  |

## Key design decisions

1. **ES modules over IIFE**: `<script type="module">` gives real `import`/`export`, file-level scope, automatic strict mode. Only `main.js` needs a `<script>` tag; the import graph handles load order. `config.local.js` stays a classic script (sets `window.MAPBOX_TOKEN`).

2. **Grouped state**: Flat state bag replaced with `state.config` (server-provided values), `state.runtime` (ws/map/timers), `state.els` (cached DOM refs).

3. **Callback-based WebSocket decoupling**: `websocket.js` accepts `{ onOpen, onStats, onError, onDisconnect }` callbacks — zero dependency on map.js or ui.js. `main.js` wires the concrete behavior.

4. **`landcover.js` as 6th module**: Both `map.js` (grid popup) and `ui.js` (breakdown panel) need the same lookup utilities. Extracting them avoids circular import.

## Import graph

```
main.js → config, ui, map, websocket
map.js → config, landcover, ui
websocket.js → config (only)
ui.js → config, landcover
landcover.js → config
```

No circular dependencies.

## Files changed

- **New**: `frontend/config.js`, `frontend/landcover.js`, `frontend/ui.js`, `frontend/map.js`, `frontend/websocket.js`, `frontend/main.js`
- **Modified**: `frontend/index.html` — replaced `<script src="app.js">` with `<script type="module" src="main.js">`
- **Modified**: `eslint.config.js` — frontend `sourceType: 'script'` → `'module'`, separate config for `config.local.js`
- **Deleted**: `frontend/app.js`
