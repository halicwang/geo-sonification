# 2026-04-25 — Refactor: Server Response Compression (gzip + WS perMessageDeflate)

Enable gzip on Express responses (>1 KB) and `perMessageDeflate` on the
`ws` server, both with conservative defaults. Cuts WS viewport-stats
frames from ~1.5 KB to ~0.5 KB and JS bundle delivery (`audio-engine.js`,
41 KB) by ~73 %, without touching application code.

## Why now

The user reported sluggish drag response on the grid overlay. Drag-stop
latency is the sum of debounce + RTT + server compute, where RTT is the
biggest swing factor on real networks and is directly proportional to
payload size on small messages. The viewport flow had no compression
anywhere — `compression` middleware was never installed, and `ws` kept
its default `perMessageDeflate: false`. This is the cheapest possible
RTT win on the perceived feedback loop.

## Server changes

**`server/index.js`:**
- Add `const compression = require('compression');` and
  `app.use(compression({ threshold: 1024 }))` immediately after the CORS
  middleware. The 1 KB threshold avoids per-frame zlib overhead for
  responses that wouldn't materially shrink anyway. Anything below 1 KB
  (`/api/config` at 522 B for example) is sent uncompressed.
- `attachWsServer` now returns `new WebSocketServer({ server, perMessageDeflate: { ... } })`
  with:
  - `zlibDeflateOptions: { level: 1 }` — the cheapest zlib level keeps
    server CPU effectively flat under load (1–2 ms per frame already, so
    we have generous headroom but no need to spend it).
  - `threshold: 256` — skip the per-frame allocation for tiny pings /
    error frames.
  - `serverNoContextTakeover: true`, `clientNoContextTakeover: true` —
    keeps memory bounded under many concurrent clients; the per-frame
    payload is small enough that context-takeover wouldn't help much.

**`server/package.json`:**
- New runtime dependency: `compression@^1.7.4` (~30 KB tree, transitive
  `negotiator` already pulled in via `cors`). Approved by the user during
  planning per CLAUDE.md's "no new deps without explicit approval".

## Verification (local)

`npm run lint`, `npm run format:check`, `npm test --prefix server`
(153/153 tests pass — the existing `attachWsServer` test in
`server/__tests__/index.startup.test.js` doesn't introspect the options
object, so it stays green).

`npm start` + `curl` against `http://localhost:3000`:

| Endpoint                       | Before          | After           |
| ------------------------------ | --------------- | --------------- |
| `POST /api/viewport`           | ~1.5 KB JSON    | 657 B gzipped   |
| `GET /audio-engine.js` (41 KB) | ~41 KB raw      | 11 KB gzipped   |
| `GET /api/config` (522 B)      | 522 B raw       | 522 B raw (under threshold, skipped) |
| `HEAD /tiles/grids.pmtiles`    | 200 OK, 185 MB  | unchanged       |
| `GET /tiles/...` `Range: bytes=0-1023` | 206, 1024 B | 206, 1024 B (no double-compression) |

Range requests on PMTiles still serve `206 Partial Content` correctly —
the `compression` middleware's default filter sees
`application/octet-stream` (non-compressible per `compressible`/`mime-db`)
and short-circuits, so PMTiles avoids the double-compression footgun.

## Trade-offs / risks

- `perMessageDeflate` has historical edge-case crash bugs on bursty
  traffic; the `level: 1 + threshold: 256 + noContextTakeover` combo
  above is the standard "safe-by-default" preset that the `ws` README
  recommends for WS servers in front of unbounded client counts.
- If a future endpoint legitimately needs to stream uncompressible data
  but isn't `application/octet-stream`, override with
  `res.set('Content-Encoding', 'identity')` per-route — none today.
- Rollback is one-liner per concern: drop the `app.use(compression(...))`
  line, drop the `perMessageDeflate` options object.

## Files changed

- `server/index.js` — wire `compression` middleware; enable
  `perMessageDeflate` on `attachWsServer`.
- `server/package.json` + `server/package-lock.json` — add
  `compression@^1.7.4` to dependencies.
- `docs/DEVLOG.md` — index entry for this devlog.
