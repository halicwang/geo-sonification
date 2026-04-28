# 2026-04-27 — Refactor: Extract `server/ws-handler.js` and `server/parse-bounds.js`

M4 P4-2. Lift the WebSocket viewport-message handler (~130 lines, was the largest single block in `server/index.js`) into a sibling module under `server/ws-handler.js`. Promote the shared `parseViewportBounds` validator (used by both the HTTP route and the WS handler) into its own one-purpose util `server/parse-bounds.js` so neither factory has to take it as a dep. After the move, `server/index.js` is purely a boot file — every request handler it owned has left.

## What moved

### Into `server/parse-bounds.js`

The 8-line `parseViewportBounds(bounds, clientLabel)` validator. New file: 29 lines including SPDX, JSDoc, and `module.exports`.

### Into `server/ws-handler.js`

- The full `attachWsHandler(wss, deps)` body — per-client mode/delta state init, ping/pong keepalive timer, `'message'` parser with the `data.type === 'viewport'` branch, `processViewport` invocation, unicast vs broadcast routing (with `mode` strip + `bufferedAmount` backpressure check), error path shielded by `readyState === OPEN`, close handler.
- `WS_PING_INTERVAL_MS` (30 s) and `WS_MAX_BUFFERED` (64 KB) constants — only consumed here.
- Imports of `BROADCAST_STATS`, `processViewport`, `createModeState`, `createDeltaState`, plus `ws` for the `WebSocket.OPEN` constant.

### Stays in `server/index.js`

Middleware setup (CORS, compression, JSON body), static dirs (`/tiles`, `/data`, frontend), `startHttpServer` / `attachWsServer` boot helpers, the `dataLoaded` flag + `_setDataLoaded`, the `_statsCounter` + 30 s log timer, `loadGridData` + spatial-index init, the WSS construction (`new WebSocketServer({ noServer: true })`), the SIGTERM/SIGINT graceful shutdown, and the `startServer()` orchestrator. After this stage, `index.js` is purely a boot file.

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

The deps shape mirrors `attachRoutes`: just the two closures over `index.js`-owned mutable state. Everything else is a direct module import.

## Engine integration

```js
// server/index.js inside startServer():
attachWsHandler(wss, {
    getDataLoaded: () => dataLoaded,
    incrementStats: (elapsedMs) => {
        _statsCounter.viewports++;
        _statsCounter.totalMs += elapsedMs;
    },
});
```

`server/routes.js` updated to import `parseViewportBounds` directly from the new util instead of receiving it via `deps`. `attachRoutes`'s deps signature loses the `parseViewportBounds` field; `index.js` no longer passes it.

## File-size impact

- `server/index.js`: **471 → 310 lines** (-161 in P4-2). Cumulative P4 progress (P4-1 + P4-2): **516 → 310** (-206 lines, -40%).
- New `server/ws-handler.js`: **187 lines**.
- New `server/parse-bounds.js`: **29 lines**.

Per proposal §8 the P4-1 + P4-2 combined target was `index.js -80 lines`. We're at -206, exceeding by 126 lines. §11 target `index.js ≤ 250`: we're at 310, P4-3 (state merger) will close the remaining gap.

## Module-export cleanup

`grep -rn` across `frontend/`, `scripts/`, `docs/`, `server/__tests__/` found zero external references to `attachWsHandler` or `parseViewportBounds`. Both drop from `index.js` `module.exports`. Post-stage, `index.js` exports `{ app, startHttpServer, attachWsServer, startServer, gracefulShutdown, _setDataLoaded }` — the boot/test surface only.

## Verification

- `npm run lint` / `format:check` — clean.
- `npm test` — 15 jest suites / 160 tests pass (golden-baseline + index-startup + spatial + delta-state + mode-manager all exercise the routes and WS surface through the same exports).
- `npm run smoke:wire-format` — 3 routes / 3 WS types / 45 fields ok.
- **Preview verification** on `npm run dev`:
    - `curl /health` → `{"ok":true,"dataLoaded":true}` (P4-1 routes still functional).
    - `curl -X POST /api/viewport` with `{"bounds":[-100,30,-80,45],"zoom":4}` → 17-field stats (P4-1 routes still functional).
    - **WS round-trip** via DevTools eval — opened a fresh `WebSocket(ws://${location.host})`, sent `{type:'viewport', bounds:[-100,30,-80,45], zoom:5}`, received a `type:'stats'` payload with 18 fields (`type` + 17 stats), `mode: 'aggregated'`, `gridCount: 1174`, `dominantLandcover: 10`. End-to-end through the new ws-handler module.

## Risks and rollback

- **Risk**: a closure-captured value inside the WS handler reads `index.js` module-level state that the deps object doesn't pass through. **Mitigation**: enumerated dep list — only `dataLoaded` and `_statsCounter` are mutable; both surfaced as closures. Preview WS round-trip exercised the full code path including `processViewport` → unicast send.
- **Risk**: `parseViewportBounds`'s clientLabel arg used to default to `'request'`; both call sites override (`'HTTP'` from routes, `'WebSocket'` from ws-handler). The util preserves the default — behavior is identical.
- **Risk**: `attachWsHandler`'s `wss._handlerAttached` idempotency guard travels through the module boundary. **Mitigation**: it's a property on the wss instance which is the same object across modules; set + read happens only inside the handler factory.
- **Risk**: removing `attachWsHandler` and `parseViewportBounds` from `module.exports` breaks an unknown consumer. **Mitigation**: cross-repo grep confirmed zero external references.
- **Rollback**: revert this commit. P4-3 not yet started; no downstream cascade.

## Files changed

- **Added**: `server/ws-handler.js` — 187 lines, exports `attachWsHandler(wss, deps)`.
- **Added**: `server/parse-bounds.js` — 29 lines, exports `parseViewportBounds(bounds, clientLabel?)`.
- **Added**: `docs/plans/M4/P4/2026-04-27-M4P4-2-extract-ws-handler.md` — stage plan.
- **Added**: `docs/devlog/M4/2026-04-27-M4-extract-ws-handler.md` — this entry.
- **Modified**: `server/index.js` — 471 → 310 lines (-161). Removed `attachWsHandler` body, `parseViewportBounds` function, `WS_PING_INTERVAL_MS` / `WS_MAX_BUFFERED` constants, imports of `processViewport` / `createModeState` / `createDeltaState` / `BROADCAST_STATS`. Switched `const WebSocket = require('ws'); const { WebSocketServer } = WebSocket;` to a direct `const { WebSocketServer } = require('ws');`. Wired `attachWsHandler` via `require('./ws-handler')`. Updated `module.exports` to drop the now-private `attachWsHandler` and `parseViewportBounds`.
- **Modified**: `server/routes.js` — added direct `require('./parse-bounds')`, dropped `parseViewportBounds` from `attachRoutes` deps signature.
- **Modified**: `docs/DEVLOG.md` — index this entry.
