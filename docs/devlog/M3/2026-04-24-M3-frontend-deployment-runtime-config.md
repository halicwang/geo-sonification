# 2026-04-24 — Refactor: Frontend Deployment Runtime Config

Introduce a deployment-time runtime config (`frontend/config.runtime.js`)
that the frontend reads from `window.GEO_SONIFICATION_CONFIG` to override
asset paths, API base, WebSocket URL, base path, and Mapbox token. The
file ships as an empty placeholder so `npm start` keeps working exactly
as before; production builds overwrite it with real values, enabling the
app to be hosted under a subpath (e.g. `placeecho.com/geo-sonification/`)
with large static assets on a CDN/object storage (R2) and a separately
hosted Node.js backend.

## Why now

Cloudflare Pages caps individual files at 25 MB, but this project ships
a 177 MB PMTiles file plus seven 46 MB ambience WAVs. And CF Pages is
static-only — the WebSocket + viewport-aggregation backend needs a
real Node.js host. To fan this out across CF Pages (frontend),
CF R2 (large assets), and Fly.io (backend), the frontend must stop
hardcoding same-origin root paths and start reading every external URL
from one configuration point.

## Design

**One config object, two read sites:**

- `frontend/config.runtime.js` is a tiny script loaded from `index.html`
  that sets `window.GEO_SONIFICATION_CONFIG`. The committed file is an
  empty placeholder (`window.GEO_SONIFICATION_CONFIG = {}`), so absent
  runtime config, the frontend falls through to same-origin defaults.
- `frontend/config.js` reads the object once at module load and exports
  two constants — `BASE_PATH` (site subpath) and `ASSET_BASE` (large
  static assets) — plus threads `apiBase`, `wsUrl`, and `mapboxToken`
  into the existing token/state/URL-building helpers.

**URL routing matrix:**

| Asset | Local dev | Production |
|-------|-----------|------------|
| HTML / JS / CSS | Express `/` | CF Pages `/geo-sonification/` |
| `/api/config`, `/api/viewport` | Express `:3000` | Fly.io `api.placeecho.com` |
| WebSocket | `ws://localhost:3001` | `wss://api.placeecho.com` |
| `grids.pmtiles` | Express `/tiles/` | R2 `assets.placeecho.com/tiles/` |
| `audio/ambience/*.wav` | Express `/audio/ambience/` | R2 `assets.placeecho.com/audio/ambience/` |
| `audio/cities/*.m4a` | Express `/audio/cities/` | CF Pages `/geo-sonification/audio/cities/` |
| `data/cities.json` | Express `/data/` | CF Pages `/geo-sonification/data/` |

**Trailing slashes** are stripped from `basePath` and `assetBase` at
read time so callers can always build URLs as ``${BASE}/path`` without
double-slash risk.

**Mapbox token precedence:** `runtime.mapboxToken` (production, URL-restricted)
wins over `window.MAPBOX_TOKEN` from `config.local.js` (local dev,
unrestricted). Placeholder-string detection (`YOUR_MAPBOX_ACCESS_TOKEN_HERE`,
`your-token-here`) is hoisted into a shared `PLACEHOLDER_TOKENS` set.

## Local verification

Launched the existing `dev` preview (`npm --prefix server run dev`),
loaded `http://localhost:3000/`, and confirmed parity with pre-change
behavior:

- `/config.js`, `/map.js`, `/audio-engine.js`, `/city-announcer.js` all
  load 200.
- `/api/config`, `/data/cities.json`, `/tiles/grids.pmtiles` (206 Range
  requests) all succeed.
- Mapbox dark-v10 style and glyphs load.
- WebSocket `Connected to server` indicator lights up; viewport stats
  stream (1,260 / 1,260 grids, Tree/Forest 62.4%, Mode: Aggregated).
- No failed network requests; no console errors.
- `npm run lint` and `npm run format:check` green.

## Files changed

- `frontend/config.js` — new `runtime` reader, `BASE_PATH` and
  `ASSET_BASE` exports, Mapbox-token priority change, `buildWsUrl` and
  `getWebSocketURL` prefer `runtime.wsUrl`, `state.config.apiBase`
  seeded from `runtime.apiBase`.
- `frontend/map.js` — PMTiles URL uses `ASSET_BASE`, falls back to
  `window.location.origin` when unset.
- `frontend/audio-engine.js` — ambience fetch uses `ASSET_BASE`.
- `frontend/city-announcer.js` — `cities.json` and M4A fetches use
  `BASE_PATH`.
- `frontend/index.html` — loads `config.runtime.js` before
  `config.local.js`.
- `frontend/config.runtime.js` — new, committed as empty placeholder
  (`window.GEO_SONIFICATION_CONFIG = window.GEO_SONIFICATION_CONFIG || {}`).
  Deploy pipeline overwrites with real values.
- `frontend/config.runtime.example.js` — new, documents every accepted
  key with a production-style example.
- `docs/DEVLOG.md` — index entry for this devlog.
