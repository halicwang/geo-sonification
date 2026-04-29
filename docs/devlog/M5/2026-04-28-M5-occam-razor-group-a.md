# 2026-04-28 — Refactor: Occam's Razor Sweep (Group A)

Five low-risk subtractive cleanups applied in one pass after a fresh
Occam's Razor review of the codebase. Net ~70 lines removed, no
behavioral change. The aim was to delete code/comments that survived
purely as historical sediment from earlier milestones, not because they
serve readers today.

## Why now

Two prior M5 entries already trimmed bigger surfaces (see
[M5-prune-dead-code](2026-04-28-M5-prune-dead-code.md) and
[M5-quick-wins](2026-04-28-M5-quick-wins.md)). What remained were 22
audit-ID comment markers, three duplicated env-reading prologues, four
defensive `if (callbacks.X)` guards over a single, fully-populated
caller, two pieces of dead-path `??` fallback after an early return, and
a small ladder of redundant `truthy && Number.isFinite(x)` checks in
the frontend bootstrap. None individually warranted a refactor; sweeping
them together keeps the diff scannable and the rationale singular.

## Changes by group

### A1 — Strip milestone/audit IDs from source comments (22 references, 11 files)

Per the project rule that comments shouldn't reference the task that
introduced them (`CLAUDE.md`), removed every `M3 audit D.x`,
`M4 P0-2 rule 2.F`, `P3-1..P3-4`, `pre-P3-3`, `M5 stage 2 fix`-style
marker. In every case the surrounding sentence still carries the
technical reason — only the audit number is gone. Two paragraphs that
were *purely* task-tracking ("Pure code-move from frontend/map.js:340-394
(M4 P2-1). No behavior change.") were deleted outright.

Touched: `server/viewport-processor.js`, `server/data-loader.js`,
`server/index.js`, `server/client-state.js`, `server/routes.js`,
`frontend/main.js`, `frontend/popup.js`, `frontend/progress.js`,
`frontend/initial-viewport-push.js`, `frontend/audio/engine.js` (7
spots), `frontend/audio/raf-loop.js`.

Verification grep:
`grep -nE 'M[0-9] (audit|P[0-9]|stage|tech-debt)|audit [A-Z]\.|P[0-9]-[0-9]|pre-P[0-9]|pre-M[0-9]'`
across `server/*.js` and `frontend/**/*.js` (excluding `__tests__`)
returns zero matches.

### A2 — Consolidate env reading into a single helper (`server/config.js`)

`parsePort`, `parseNonNegativeFloat`, and `parseNonNegativeInt` each
opened with the same three-line `process.env[name]` + empty-string
short-circuit. Four IIFEs (`HTTP_PORT`, `GRID_SIZE`,
`PER_GRID_THRESHOLD_ENTER`, `PER_GRID_THRESHOLD_EXIT`) repeated the same
`!== undefined && !== ''` guard before delegating. Extracted one
module-private helper:

```js
function readEnv(name) {
    const v = process.env[name];
    return v === undefined || v === '' ? undefined : v;
}
```

All three parsers now call `readEnv(envVar)` and short-circuit on
`undefined`. The IIFEs collapsed from `(() => { … })()` to ternaries.
`readEnv` is **not** exported. Public API of `server/config.js` is
byte-for-byte identical (verified via `module.exports` diff).

### A3 — Simplify `loadServerConfig` field guards (`frontend/config.js`)

`/api/config` is a server-controlled endpoint that always returns
`gridSize`, `landcoverMeta`, `proximityZoomLow`, `proximityZoomHigh`
([server/routes.js:56-63](../../../server/routes.js)). The frontend
guard:

```js
if (config.gridSize && Number.isFinite(config.gridSize) && config.gridSize > 0)
```

stacked truthiness, type, and range checks. `Number.isFinite` already
excludes `undefined`/`null`/`NaN`, so the leading truthiness check was
redundant for numeric fields. Dropped it; kept the outer `try/catch`
and `response.ok` early-return — those still guard real boundary
failures (offline, proxy returning HTML, server schema drift).

### A4 — Drop callback-existence guards (`frontend/websocket.js`)

`connectWebSocket` is called from exactly one place
([frontend/main.js:110-124](../../../frontend/main.js)) which always
passes all four callbacks (`onOpen`, `onStats`, `onError`,
`onDisconnect`). The internal recursive reconnect at
[websocket.js:93](../../../frontend/websocket.js) forwards the same
object. The four `if (callbacks.X)` guards could never be false. Removed
them; `try/await/catch` around the async `onOpen` stays because a
rejected promise from a user handler still shouldn't crash the socket.
Updated the JSDoc to state that callbacks are required.

### A5 — Drop dead-path `??` fallbacks (`server/normalize.js`)

`calcPercentiles` early-returns on `positive.length === 0`, which means
the array is non-empty by the time the index access happens. The
`?? positive[0]` and `?? positive[positive.length - 1]` clauses were
unreachable. Removed both.

## Why each removal was safe

- **A1**: no test asserts on audit numbers (grep `__tests__` for
  audit/phase markers in test names or `expect` strings — zero hits).
- **A2**: `parsePort` / `parseNonNegativeFloat` / `parseNonNegativeInt`
  are not exported (verified `module.exports` block); only used inside
  `server/config.js`. `index.startup.test.js` and `load-env.test.js`
  exercise the parser paths and stay green.
- **A3**: server returns all four fields unconditionally; frontend has
  module-level defaults if the fetch fails.
- **A4**: only one caller in the project; no test mocks `callbacks`.
- **A5**: simple control-flow proof; `normalize.test.js` covers both
  the empty-array branch and several non-empty branches and stays
  green.

## Verification

- `npm run lint` — clean.
- `npm run format:check` — clean.
- `npm test` — 15 suites, 172 tests, all green (covers `normalize`,
  `index.startup`, `load-env`, `client-state`, `viewport-processor`).
- `npm run test:frontend` — 7 files, 79 tests, all green.
- `npm run smoke:wire-format` — 3 routes, 3 WS types, 45 fields verified.
- `npm run smoke` (against running server) — full pass.
- Manual browser check: page renders, `/api/config` consumed, WebSocket
  reconnects cleanly, audio plays after user-gesture start (validates
  A3, A4, A5 end-to-end).
- Audit-ID grep: zero matches across `server/*.js` and `frontend/**/*.js`.

## Files changed

- `server/config.js` — added `readEnv`, refactored three parsers and
  four IIFEs.
- `server/normalize.js` — dropped two `??` clauses in `calcPercentiles`.
- `server/viewport-processor.js` — rewrote one JSDoc paragraph.
- `server/data-loader.js`, `server/index.js`, `server/client-state.js`,
  `server/routes.js` — comment hygiene.
- `frontend/config.js` — simplified one numeric guard.
- `frontend/websocket.js` — removed four callback-existence guards;
  updated JSDoc.
- `frontend/main.js`, `frontend/popup.js`, `frontend/progress.js`,
  `frontend/initial-viewport-push.js` — comment hygiene.
- `frontend/audio/engine.js`, `frontend/audio/raf-loop.js` — comment
  hygiene.
- `docs/devlog/M5/2026-04-28-M5-occam-razor-group-a.md` — new (this
  entry).
- `docs/DEVLOG.md` — index row added.
