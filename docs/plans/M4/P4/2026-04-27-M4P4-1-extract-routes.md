# P4-1 — Extract `server/routes.js`

**Prerequisite:** P3 complete (audio decomposition closed)
**Trace:** Milestone 4 Phase 4 — Server decomposition + state merger
**Companion:** [M4 razor-refactor proposal](../2026-04-27-M4-razor-refactor-proposal.md) §8

## Context

`server/index.js` currently mixes three responsibilities in 516 lines: HTTP route handlers, the WebSocket handler, and the boot sequence (express setup + bind + load CSV + WS bridge). P4-1 lifts the HTTP routes into a sibling module so the boot file shrinks and routes become inspectable in isolation.

Three routes move:

- `GET /health` (lines 234-240) — uses `dataLoaded`
- `GET /api/config` (lines 242-248) — uses `GRID_SIZE`, `LANDCOVER_META`
- `POST /api/viewport` (lines 250-280) — uses `dataLoaded`, `getHttpClientKey`, `getHttpDeltaClientKey`, `getHttpModeState`, `getHttpDeltaState`, `parseViewportBounds`, `processViewport`, `_statsCounter`, `saveHttpModeState`, `saveHttpDeltaState`

The middleware setup (CORS, compression, JSON body, static `/tiles`, `/data`, frontend dir) stays in `index.js` — it's express plumbing, not routes.

`parseViewportBounds` is shared between this stage's routes and P4-2's WS handler. For P4-1 we keep it in `index.js` and pass it to `attachRoutes` as a dep. P4-2 will re-evaluate (likely move it next to its second consumer or to a small shared util — either way the choice is local to that stage, not P4-1).

## API

```js
// server/routes.js
const { attachRoutes } = require('./routes');

attachRoutes(app, {
    getDataLoaded: () => dataLoaded,         // boolean read at request time
    incrementStats: (elapsedMs) => {         // closure over the let-bound _statsCounter
        _statsCounter.viewports++;            // (counter is reassigned every 30s by
        _statsCounter.totalMs += elapsedMs;   // the log timer, so a direct ref would
    },                                        // go stale — the closure stays current)
    parseViewportBounds,                      // shared helper, see context note
});
```

The factory mutates `app` (registers handlers) and returns nothing. Dep names are explicit so the routes module never reaches into `require('./index')` — that direction would be circular.

## Engine integration

| Old (in `index.js`) | New |
|---|---|
| 47 lines of inline `app.get('/health' …)`, `app.get('/api/config' …)`, `app.post('/api/viewport' …)` | one line: `attachRoutes(app, { getDataLoaded: () => dataLoaded, statsCounter: _statsCounter, parseViewportBounds });` |
| Imports of `LANDCOVER_META`, `getHttpModeState`, `saveHttpModeState`, `getHttpClientKey`, `getHttpDeltaState`, `saveHttpDeltaState`, `getHttpDeltaClientKey`, `processViewport`, `GRID_SIZE` (which are read by routes) | _moved into `routes.js`_ |

`index.js` keeps imports of `HTTP_PORT`, `ALLOWED_ORIGINS`, `BROADCAST_STATS` (used by middleware / WS bridge / startup), the loaders, the spatial module, and the WS handler infrastructure. The `_statsCounter` aggregator and its 30-second log timer stay in `index.js` (the timer is boot-time setup, not route logic).

## Definition of Done

- `server/routes.js` exists; exports `attachRoutes(app, deps)`.
- `server/index.js` no longer contains any `app.get('/health' …)`, `app.get('/api/config' …)`, or `app.post('/api/viewport' …)`. The routes-related imports (`LANDCOVER_META`, the mode/delta HTTP-state helpers, `processViewport`, `GRID_SIZE`) move with them.
- `server/index.js` invokes `attachRoutes(app, { getDataLoaded: () => dataLoaded, statsCounter: _statsCounter, parseViewportBounds })` once after middleware setup.
- `wc -l server/index.js` drops from 516 to roughly ≤ 480 lines (proposal §8 expects -80 across P4-1+P4-2; P4-1 contributes the routes-only delta, on the order of -30 to -45 lines).
- All `module.exports` of `index.js` continue to expose `app`, `parseViewportBounds`, `startHttpServer`, `attachWsServer`, `startServer`, `gracefulShutdown`, `attachWsHandler`, `_setDataLoaded` (test consumers in `index.startup.test.js` keep working).
- `npm test` — 15 jest suites / 160 tests pass.
- `npm run lint` / `npm run format:check` — clean.
- `npm run smoke:wire-format` — 3 routes / 3 WS types / 45 fields ok (response shapes preserved).
- Preview verification: `curl /health` returns `{ ok: true, dataLoaded: true }`; `curl /api/config` returns the grid size + landcover meta; `curl -X POST /api/viewport` with a valid bounds payload returns the 17-field stats. Behavior identical to the pre-stage call.
- Devlog `docs/devlog/M4/2026-04-27-M4-extract-server-routes.md` + DEVLOG.md index entry.

## Risks and rollback

- **Risk**: a route handler reads a closure-captured value from `index.js` that the dep object doesn't pass through. **Mitigation**: enumerated dep list above; jest's golden-baseline test exercises the routes through the smoke path.
- **Risk**: `attachRoutes` is invoked before middleware (CORS / compression / `express.json`) is registered, breaking the JSON body parser on `/api/viewport`. **Mitigation**: the call site goes after the existing middleware block; preview `curl -X POST` verifies.
- **Risk**: `_statsCounter` is mutated by reference from inside `routes.js`; if a future consumer reassigns the variable in `index.js`, the routes' reference goes stale. **Mitigation**: in `index.js`, `_statsCounter` is a `let` but never reassigned today (only its fields are mutated). We keep `let` to preserve the pre-existing pattern; if a future stage reassigns, the dep needs a getter.
- **Rollback**: revert this commit. P4-2 not yet started; no downstream cascade.
