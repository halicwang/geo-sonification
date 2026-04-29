# 2026-04-28 — Refactor: Prune Dead Code and Over-Modularization

Continuing the M5 Occam pivot. Removed four small artifacts that earned their keep on paper but not in practice: the `parse-bounds.js` shim (M4 extraction; in retrospect the indirection layer was larger than the single `Array.isArray` shape check it wrapped), an inner `try-catch` around `Server.close()` calls that never throw synchronously, a `_setDataLoaded` test hook that no test ever called, and a unit test asserting `Object.freeze` works.

No behavioral change. Net ~50 lines removed. All HTTP / WS error strings preserved byte-for-byte.

## Course-correction note on `parse-bounds.js`

The shim was extracted in [2026-04-27-M4-extract-ws-handler.md](2026-04-27-M4-extract-ws-handler.md#L65) so neither `routes.js` nor `ws-handler.js` would have to reach into `index.js` for the shape check. After living with it for a day, the extraction looks like over-decomposition: the function body was four lines, the call sites were three lines each, and the module added a `require` line per consumer. Inlining the check trims the dependency graph without losing readability.

## Changes

- `server/parse-bounds.js` — deleted.
- `server/routes.js` — dropped the `require('./parse-bounds')`; inlined the shape check at the `/api/viewport` handler. Downstream now passes `body.bounds` directly to `processViewport`.
- `server/ws-handler.js` — dropped the `require('./parse-bounds')`; inlined the shape check inside the `viewport` message branch. Downstream now passes `data.bounds` directly to `processViewport`.
- `server/index.js` — removed the inner `try-catch` blocks around `wssServer.close()` and `httpServer.close()` in the `startServer` failure-cleanup path; deleted the `_setDataLoaded` function and its `module.exports` entry.
- `server/__tests__/audio-metrics-bus.test.js` — removed the `is frozen` assertion; the language behaviour belongs to V8, not to this project. The "7 entries in correct order" invariant remains.

## Verification

- `npm run lint` — clean.
- `npm run format:check` — clean.
- `npm test` — 15 suites, 172 tests, all green (covers `index.startup.test.js`, `audio-metrics-bus.test.js`, and the bounds-validation paths).
- `npm run test:frontend` — 7 files, 79 tests, all green.
- `npm run smoke:wire-format` — 3 routes, 3 WS types, 45 field names verified.
- `npm run smoke` (against running server) — 10/10 pass, including the WebSocket viewport exchange.
- Manual `curl` against `/api/viewport`:
    - `{"bounds":"bad"}` → HTTP 400, body `"HTTP bounds must be an array: [west, south, east, north]"`.
    - `{"bounds":[1,2,3]}` → HTTP 400, same message.
    - `{"bounds":[-180,-90,180,90],"zoom":5}` → HTTP 200 with full stats payload.
- Browser preview (`npm start` + Mapbox client): page renders, dataLoaded `true`, zero console errors. Inline WS test (`new WebSocket → send {type:'viewport', bounds:'bad'}`) returns frame `{"type":"error","error":"WebSocket bounds must be an array: [west, south, east, north]"}` — byte-for-byte match.

## Files changed

- `server/parse-bounds.js` — deleted.
- `server/routes.js` — modified.
- `server/ws-handler.js` — modified.
- `server/index.js` — modified.
- `server/__tests__/audio-metrics-bus.test.js` — modified.
- `docs/devlog/M5/2026-04-28-M5-prune-dead-code.md` — new (this entry).
- `docs/DEVLOG.md` — index row added.
