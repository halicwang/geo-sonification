# 2026-04-25 — Fix: Launcher Scripts Drop Stale WS_PORT After Single-Port Migration

The double-click launchers (`start.command`, `start.bat`) and the
`smoke-worldcover.js` script still hard-coded `WS_PORT=3001` from the
old two-port era and passed `?ws_port=3001` as a query string when
opening the browser. The server has been single-port since
[2026-04-24-M3-single-port-server-and-fly-docker](2026-04-24-M3-single-port-server-and-fly-docker.md)
(HTTP + WebSocket share `HTTP_PORT`, default 3000), so the launchers
were directing the frontend to a port nothing listened on. Symptom: the
browser opened to `http://localhost:3000/?ws_port=3001`,
`getWebSocketURL()` honored the override, and every WebSocket attempt
to `ws://localhost:3001` failed → reconnect loop → the panel sat in
"Reconnecting..." forever and tripped the stale warning after a few
seconds of dragging.

## Why this slipped through

The single-port migration entry's "Files Changed" list mentioned
`server/config.js`, `server/index.js`, `frontend/map.js`, `.env.example`,
`Dockerfile` and tests, but did not touch the launchers or the smoke
script. Both are runtime entry points for local dev, not part of the
server build pipeline, so the typecheck / unit-test gate didn't catch
the drift. Only humans double-clicking `start.command` see it, and the
old behavior masked itself behind the existing `wsPortOverride()` debug
escape hatch.

## Changes

### `start.command`

- Drop `WS_PORT=${WS_PORT:-3001}` and the `kill_port "$WS_PORT"
  "WebSocket"` call (nothing listens on 3001 anymore).
- Open `http://localhost:${HTTP_PORT}` without the `?ws_port=` query so
  the frontend falls through to `window.location.host` and connects to
  the same port the server actually listens on.

### `start.bat`

Same three edits in cmd.exe syntax: drop `set WS_PORT=3001`, drop the
`netstat`/`taskkill` block targeting `%WS_PORT%`, and remove
`?ws_port=%WS_PORT%` from the `start ""` URL.

### `scripts/smoke-worldcover.js`

- Drop the `WS_PORT` env var and constant.
- `WS_URL` now resolves from `HTTP_PORT` so `npm run smoke` connects
  WebSocket to the same port that hosts `/api/viewport` (matches what a
  real client does in single-port mode).
- Header docstring: replace the WS_PORT bullet with a single
  `HTTP_PORT - HTTP + WebSocket port (default: 3000, single-port server)`
  line.

## What's intentionally preserved

- `frontend/config.js` `wsPortOverride()` — kept as the documented
  debug escape hatch for the rare case where a dev proxy remaps the WS
  port. It only activates when `?ws_port=` is explicitly present, so
  removing the query from the launcher URL is enough to fix the bug
  without touching the override mechanism.
- `server/__tests__/load-env.test.js` `WS_PORT=3001` — used as an
  arbitrary `KEY=VALUE` fixture for the .env parser test. The test
  asserts string-parsing behavior, not that `WS_PORT` itself is a real
  config key. Renaming would be churn.

## Verification

- `bash -n start.command` — clean.
- `node --check scripts/smoke-worldcover.js` — clean.
- `start.bat` — syntax can only be validated under cmd.exe; the change
  is mechanical (3 deletions / 1 comment swap), not structural.
- Manual: relaunching `start.command` opens
  `http://localhost:3000/` (no query). DevTools → Network → WS shows
  one connection to `ws://localhost:3000/` in `101 Switching Protocols`.
  No `Data may be stale` warning during normal map drag.

## Files Changed

- **Modified**: `start.command` — drop WS_PORT, drop port-3001 kill,
  drop ws_port URL query.
- **Modified**: `start.bat` — same three edits in cmd.exe syntax.
- **Modified**: `scripts/smoke-worldcover.js` — `WS_URL` derives from
  `HTTP_PORT`; docstring updated.
- **Modified**: `docs/DEVLOG.md` — index entry.
- **Added**: this entry.
