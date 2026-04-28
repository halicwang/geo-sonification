# P4-2 — Extract `server/ws-handler.js` + `server/parse-bounds.js`

**Prerequisite:** P4-1 (`server/routes.js` extracted)
**Trace:** Milestone 4 Phase 4 — Server decomposition + state merger
**Companion:** [M4 razor-refactor proposal](../2026-04-27-M4-razor-refactor-proposal.md) §8

## Context

`server/index.js` (post-P4-1: 471 lines) still owns the WebSocket message handler — `attachWsHandler(wss)`, ~130 lines of viewport-message routing, broadcast logic, ping/pong keepalive, error handling. P4-2 lifts this into a sibling module.

The WS handler shares one helper with `routes.js`: `parseViewportBounds`. Pre-P4-1 both consumers were inside `index.js`; P4-1 left the helper there and passed it via `attachRoutes` deps. Now that `routes.js` is the only HTTP consumer and `ws-handler.js` will be the only WS consumer, the helper has zero callers in `index.js`. P4-2 promotes it to a shared util — `server/parse-bounds.js` — which both modules import directly. This drops the helper from both factories' dep lists.

## What moves

### Into `server/parse-bounds.js`

The 8-line `parseViewportBounds(bounds, clientLabel)` validator. New file: ~15 lines including SPDX + one-liner JSDoc + `module.exports`.

### Into `server/ws-handler.js`

- `attachWsHandler(wss, deps)` — the entire 130-line connection handler, including:
    - per-client `modeState` / `deltaState` init via `createModeState` / `createDeltaState`
    - ping/pong keepalive timer + termination on missed pong
    - `'message'` parser with `data.type === 'viewport'` branch
    - `processViewport` invocation
    - unicast vs `BROADCAST_STATS` broadcast routing (the `mode`-strip + `bufferedAmount` backpressure check)
    - error-path `ws.send` shielded by `readyState === OPEN`
    - close-handler that clears the ping timer
- the `WS_PING_INTERVAL_MS` and `WS_MAX_BUFFERED` constants (only used here post-stage)
- imports of `BROADCAST_STATS`, `processViewport`, `createModeState`, `createDeltaState`, plus the `ws` library for the `WebSocket.OPEN` constant
- imports of `parseViewportBounds` from the new shared util

### Stays in `server/index.js`

Middleware setup, the static dirs, the `startHttpServer` / `attachWsServer` boot helpers, the `dataLoaded` flag + `_setDataLoaded`, the `_statsCounter` + 30-second log timer, `loadGridData` + spatial-index init, the WSS construction (`new WebSocketServer({ noServer: true })`), the SIGTERM/SIGINT graceful shutdown, the `startServer()` function. After P4-2, `index.js` is purely a boot file — the request handlers it owned have all left.

## API

```js
// server/parse-bounds.js
function parseViewportBounds(bounds, clientLabel = 'request') { … }
module.exports = { parseViewportBounds };

// server/ws-handler.js
function attachWsHandler(wss, deps) {
    // deps: { getDataLoaded, incrementStats }
    if (wss._handlerAttached) throw new Error('attachWsHandler called twice on the same wss instance');
    wss._handlerAttached = true;
    wss.on('connection', (ws) => { … });
}
module.exports = { attachWsHandler };
```

The deps signature for `attachWsHandler` mirrors `attachRoutes`: just the two closures over `index.js`-owned mutable state. Everything else is a direct module import.

## Engine integration

```js
// In server/index.js, inside startServer():
const { attachWsHandler } = require('./ws-handler');
// …
attachWsHandler(wss, {
    getDataLoaded: () => dataLoaded,
    incrementStats: (elapsedMs) => {
        _statsCounter.viewports++;
        _statsCounter.totalMs += elapsedMs;
    },
});
```

Note: `incrementStats` is the same closure shape that `attachRoutes` already uses. We define it once at the file scope (or inline twice — current style). Inline is fine; the duplication is 4 lines and the intent is clear at each call site.

`routes.js` updates to import `parseViewportBounds` directly from the new util:

```js
// server/routes.js (top of file)
const { parseViewportBounds } = require('./parse-bounds');
```

…and `attachRoutes` drops the `parseViewportBounds` field from its deps signature. `index.js` no longer passes it.

## Definition of Done

- `server/ws-handler.js` exists; exports `attachWsHandler(wss, deps)`.
- `server/parse-bounds.js` exists; exports `parseViewportBounds(bounds, clientLabel?)`.
- `server/index.js` no longer contains the `attachWsHandler` body, `parseViewportBounds`, the `WS_PING_INTERVAL_MS` / `WS_MAX_BUFFERED` constants, or imports of `processViewport` / `createModeState` / `createDeltaState` / `BROADCAST_STATS`.
- `server/routes.js` imports `parseViewportBounds` from `./parse-bounds`; its `deps` signature drops the field.
- `wc -l server/index.js` drops from 471 to ≤ 350. Combined with P4-1 the cumulative reduction is ≥ 165 lines (proposal §8 P4-1+P4-2 combined target was -80; we'll exceed it).
- `module.exports` of `index.js` no longer includes `attachWsHandler` or `parseViewportBounds` (no external consumers, confirmed by `grep -rn`).
- `npm test` — 15 jest suites / 160 tests pass.
- `npm run lint` / `npm run format:check` — clean.
- `npm run smoke:wire-format` — 3 routes / 3 WS types / 45 fields ok.
- Preview verification: open `npm run dev`, click Start in the page, drag the map (triggers WS viewport messages), DevTools console verifies a `stats` message arrives back over WS with the same 17 fields. `curl /health` and `curl -X POST /api/viewport` continue to return identical responses (P4-1 routes still functional).
- Devlog `docs/devlog/M4/2026-04-27-M4-extract-ws-handler.md` + DEVLOG.md index entry.

## Risks and rollback

- **Risk**: a closure-captured value inside the WS handler reads `index.js` module-level state that the deps object doesn't pass through. **Mitigation**: enumerated dep list above; the only mutable values are `dataLoaded` and `_statsCounter`, both surfaced as closures. Preview WS round-trip exercises the full code path.
- **Risk**: `parseViewportBounds`'s clientLabel argument used to default to `'request'`; both call sites override (`'HTTP'` from routes, `'WebSocket'` from ws-handler). The util preserves the default. **Mitigation**: tests verify message text via the smoke path; the override behavior is identical to pre-stage.
- **Risk**: `attachWsHandler`'s `wss._handlerAttached` idempotency guard is a property mutation on the wss instance, which is shared between index.js's WSS construction and the handler module. **Mitigation**: `wss._handlerAttached` is private to `attachWsHandler` (set + read only there); the property travels with the wss object through the module boundary correctly.
- **Risk**: removing `attachWsHandler` and `parseViewportBounds` from `module.exports` breaks an unknown consumer. **Mitigation**: `grep -rn "attachWsHandler\|parseViewportBounds" frontend/ scripts/ docs/ server/__tests__/` returned zero matches outside the source files themselves.
- **Rollback**: revert this commit. P4-3 (state merger) not yet started; no downstream cascade.
