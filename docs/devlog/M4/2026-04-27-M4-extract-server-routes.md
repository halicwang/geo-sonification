# 2026-04-27 — Refactor: Extract `server/routes.js` (HTTP Route Handlers)

M4 P4-1. Lift the three HTTP route handlers (`GET /health`, `GET /api/config`, `POST /api/viewport`) out of `server/index.js` into a sibling module under `server/routes.js`. The factory `attachRoutes(app, deps)` mutates the express app and returns nothing; deps that read mutable state in `index.js` (the `dataLoaded` flag, the rolling `_statsCounter`) are passed in as closures so the routes module never needs to `require('./index')`.

## What moved

From `server/index.js` into `server/routes.js`:

- `app.get('/health', …)` — 6 lines
- `app.get('/api/config', …)` — 6 lines
- `app.post('/api/viewport', …)` — 28 lines
- imports of `GRID_SIZE`, `LANDCOVER_META`, `getHttpClientKey`, `getHttpDeltaClientKey`, `getHttpModeState`, `getHttpDeltaState`, `saveHttpModeState`, `saveHttpDeltaState`, `processViewport` (9 imports — 6 of them were grouped into multi-line `require` blocks that fully drop out)

What stays in `index.js`: middleware setup (CORS, compression, JSON body, `/tiles` static, `/data` static, frontend dir static), the WS server bridge, the boot sequence, the `_statsCounter` declaration + the 30-second log timer, the `parseViewportBounds` helper (still needed by P4-2's WS handler), and the test-only exports (`startHttpServer`, `attachWsServer`, `_setDataLoaded`, etc.).

## API

```js
const { attachRoutes } = require('./routes');

attachRoutes(app, {
    getDataLoaded: () => dataLoaded,         // closure over let-bound flag
    incrementStats: (elapsedMs) => {         // closure over the let-bound counter
        _statsCounter.viewports++;            // (the timer callback REASSIGNS
        _statsCounter.totalMs += elapsedMs;   // _statsCounter every 30s, so a
    },                                        // direct ref would go stale; the
    parseViewportBounds,                      // closure stays current.)
});
```

## Why a closure for `incrementStats` instead of passing the counter object

`server/index.js` declares `_statsCounter` with `let` and reassigns it in the 30-second log timer:

```js
let _statsCounter = { viewports: 0, totalMs: 0 };
const _statsTimer = setInterval(() => {
    if (_statsCounter.viewports > 0) {
        // … log avg …
        _statsCounter = { viewports: 0, totalMs: 0 };  // <-- new object reference
    }
}, 30_000);
```

If the routes module captured the `_statsCounter` reference by passing it as a `deps.statsCounter` field, mutations after the first 30-second reset would write to the OLD object — and the timer would log zero. The `incrementStats` closure resolves the lexical binding at call time, so reassignments inside `index.js` are visible.

This is a one-method dep, but it's the right shape: routes don't need to know the counter exists, just how to bump it.

## Engine integration

| Old (in `index.js`) | New |
|---|---|
| 3 inline `app.get` / `app.post` blocks (~50 lines) | one call: `attachRoutes(app, { getDataLoaded, incrementStats, parseViewportBounds })` (10 lines including the deps object) |
| 9 imports for route-only consumers | _moved into `routes.js`_ |

`index.js` keeps:
- `parseViewportBounds` — still used by the WS handler (P4-2 will revisit).
- `createDeltaState`, `createModeState` — still used by the WS handler's per-connection state init.
- `_statsCounter` + `_statsTimer` — boot-time setup, not route logic.

## File-size impact

- `server/index.js`: **516 → 471 lines** (-45).
- New `server/routes.js`: **100 lines** (factory + 3 routes + JSDoc).
- Net repo: +55 lines, but the routes are now in a single-purpose module that imports nothing from `index.js`.

Per proposal §8 the P4-1+P4-2 combined target is `index.js -80 lines`; P4-1 contributes -45 lines, P4-2 will pick up the rest when the WS handler moves out.

## Verification

- `npm run lint` / `format:check` — clean.
- `npm test` — 15 jest suites / 160 tests pass (golden-baseline + index-startup tests both exercise the routes via the same exports).
- `npm run smoke:wire-format` — 3 routes / 3 WS types / 45 fields ok (response shapes preserved).
- **Preview verification** with `curl` against `npm run dev`:
    - `GET /health` → `{"ok":true,"dataLoaded":true}` (byte-identical to pre-stage).
    - `GET /api/config` → `{"gridSize":0.5,"landcoverMeta":{…}}` (full landcover meta preserved).
    - `POST /api/viewport` with `{"bounds":[-180,-60,180,75],"zoom":3}` → 17-field stats payload (`dominantLandcover`, `nightlightNorm`, `populationNorm`, `forestNorm`, …, `audioParams`).

## Risks and rollback

- **Risk**: a route handler reads a closure-captured value from `index.js` that the dep object doesn't pass through. **Mitigation**: enumerated dep list in the stage plan; the smoke and golden-baseline tests exercise the routes through the public surface. The `curl` round-trip confirms response shapes are unchanged.
- **Risk**: `attachRoutes` is invoked before middleware (CORS / compression / `express.json`) is registered, breaking the JSON body parser on `/api/viewport`. **Mitigation**: the call site goes after the existing middleware block. `curl -X POST` confirms.
- **Risk**: the `incrementStats` closure captures `_statsCounter` by lexical binding, which is correct, but a future stage might inadvertently break the binding (e.g. by `module.exports` exposing the counter and a consumer reassigning at the export boundary). **Mitigation**: `_statsCounter` is not exported and stays private to `index.js`.
- **Rollback**: revert this commit. P4-2 not yet started; no downstream cascade.

## Files changed

- **Added**: `server/routes.js` — 100-line module exporting `attachRoutes`.
- **Added**: `docs/plans/M4/P4/2026-04-27-M4P4-1-extract-routes.md` — stage plan.
- **Added**: `docs/devlog/M4/2026-04-27-M4-extract-server-routes.md` — this entry.
- **Modified**: `server/index.js` — 516 → 471 lines. Removed 3 inline route handlers + 9 imports. Added `const { attachRoutes } = require('./routes');` and one `attachRoutes(app, …)` call.
- **Modified**: `docs/DEVLOG.md` — index this entry.
