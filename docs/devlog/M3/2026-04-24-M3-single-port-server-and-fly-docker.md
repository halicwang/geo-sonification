# 2026-04-24 — Refactor: Single-Port Server + Fly.io Docker Setup

Merge the HTTP (`3000`) and WebSocket (`3001`) listeners into a single
port — the `ws` server now attaches to the existing `http.Server`
upgrade channel instead of opening its own TCP listener. Add
`Dockerfile`, `.dockerignore`, and `fly.toml` so the backend can be
deployed to Fly.io as-is. The frontend's WebSocket URL now derives
from `window.location.host`, so it naturally follows whatever port
the page itself is served on.

## Why now

Fly.io exposes exactly one public port per app, which our previous
"HTTP on 3000 + WS on 3001" split can't satisfy. Single-port is also
more aligned with how every managed-runtime provider (Cloudflare
Workers, Railway, Render, Heroku) expects apps to be shaped: listen
on `$PORT`, accept both HTTP and WebSocket upgrade requests on the
same listener, be done.

Running the split locally and merged in production would force
per-environment branching in both `server/index.js` and the frontend
URL builder — not worth it. Keep them identical so dev matches prod.

## Server-side changes

**Port config (`server/config.js`):**
- `WS_PORT` removed from the exports.
- `HTTP_PORT` now reads `PORT` env first (the PaaS standard), falling
  back to `HTTP_PORT` for existing local setups, defaulting to 3000.

**Listener wiring (`server/index.js`):**
- `startWsServer(port)` deleted; replaced with `attachWsServer(server)`
  that wraps `new WebSocketServer({ server })`.
- `startServer()` now binds HTTP first and attaches WS to that server,
  so both ride the same port.
- `/api/config` no longer returns `wsPort` / `httpPort` — the frontend
  derives the WS URL from the page origin instead.
- Startup banner collapses to a single `Server listening on port X
  (HTTP + WebSocket)` line.

**Tests (`server/__tests__/index.startup.test.js`):**
- The two `startWsServer` tests (resolves-on-bind, rejects-on-EADDRINUSE)
  are replaced with a single `attachWsServer` test that verifies the
  return type and that the HTTP listener is still bound on a shared
  port. EADDRINUSE is no longer meaningful for the WS layer.
- `golden-baseline.test.js` + `golden-config.json` lose the `wsPort`
  assertion; the config fixture now uses a single `port` field for the
  HTTP_PORT default.

## Frontend changes

**`frontend/config.js`:**
- `state.config.wsPort` and `state.runtime.wsUrl` removed — neither
  is needed once the URL tracks `window.location.host`.
- `fallbackWsPort()` (hard-coded 3001 fallback) replaced with
  `wsPortOverride()` which only returns a number when `?ws_port=` is
  explicitly present in the query string (debug escape hatch for dev
  proxies that remap ports).
- `buildWsUrl()` takes no argument; URL priority is
  `runtime.wsUrl` → `window.location.host` (+ optional override).
- `loadServerConfig()` no longer parses `wsPort` from `/api/config`.

**`frontend/map.js`:**
- `refreshServerConfig()` drops the `wsPort` branch and the cached
  `state.runtime.wsUrl` rebuild.

## Deployment artifacts

**`Dockerfile`** — `node:20-alpine` base; installs server deps via
`npm ci --omit=dev`; copies `server/` + `data/raw/`; pre-warms the
spatial-index cache at build time (`node -e "require('./server/data-loader').loadGridData()"`)
so cold starts complete in ~1-2s instead of 10-30s; exposes `8080`
(overridden by Fly's injected `$PORT`).

**`.dockerignore`** — excludes frontend, large assets (PMTiles, audio),
docs, tests, lint config, scripts, and the Docker files themselves.
Keeps the image lean: only `server/` + `data/raw/` + `node_modules/`
make it in.

**`fly.toml`** — `primary_region = "iad"` (US-East, included in free
tier); `auto_stop_machines = "suspend"` pairs with the pre-warmed cache
for fast resume; `[[vm]]` pinned to 256 MB / shared-1 CPU (free tier
ceiling); `ALLOWED_ORIGINS = "https://placeecho.com"` threaded through
env; `/health` HTTP check with a 30s grace period to absorb the
spatial-index load on first boot.

## Local verification

- `npm test` — all 153 tests pass (including the rewired
  `attachWsServer` startup test).
- `npm run lint` — clean.
- `npm run format:check` — clean.
- `npm start` → Preview at `http://localhost:3000/`:
  - No console errors or failed network requests.
  - `ws://localhost:3000` handshake succeeds, info panel shows
    "Connected to server"; viewport stats stream (1,260 / 1,260 grids,
    Tree/Forest 62.4%, Mode: Aggregated).
  - All same-origin assets load 200 / 206.

`docker build` was not run locally — Docker isn't installed on this
machine and Fly.io ships a remote builder, so the Dockerfile is
validated the first time `fly deploy` runs against a real account.

## Files changed

- `server/config.js` — `PORT` alias, drop `WS_PORT`.
- `server/index.js` — `attachWsServer`, drop `/api/config` port fields,
  unified startup banner.
- `server/__tests__/index.startup.test.js` — rewrite WS bind tests.
- `server/__tests__/golden-baseline.test.js` — drop `wsPort` assertion.
- `server/__tests__/fixtures/golden-config.json` — `port` instead of
  `httpPort` / `wsPort`.
- `frontend/config.js` — `buildWsUrl()` no-arg, drop wsPort plumbing.
- `frontend/map.js` — drop `wsPort` branch in `refreshServerConfig`.
- `.env.example` — drop `WS_PORT`, document the `PORT` alias.
- `Dockerfile` — new, production image recipe.
- `.dockerignore` — new, prune non-runtime files.
- `fly.toml` — new, Fly.io deployment manifest.
- `docs/DEVLOG.md` — index entry for this devlog.
