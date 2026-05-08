# Geo-Sonification: Interactive Sound Map

[![CI](https://github.com/halicwang/geo-sonification/actions/workflows/ci.yml/badge.svg)](https://github.com/halicwang/geo-sonification/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
![Node](https://img.shields.io/badge/node-18%2B-green)

<p align="center">
  <img src="docs/images/075bd0e64435f1650a993001f7dd3338.png" alt="Geo-Sonification Demo — globe view with real-time land cover sonification" width="800">
</p>

Turn geographic data into soundscapes. This project maps ESA WorldCover satellite land-cover data to ambient audio — pan across forests, cities, and oceans, and hear the landscape change in real-time, powered by your own Google Earth Engine exports.

### How it works

- Frontend (Mapbox) visualizes **landcover** and streams viewport metrics to a Node.js server.
- The server computes audio parameters (7-bus fold-mapping, land-coverage ratio) and sends them back via WebSocket.
- The browser's Web Audio engine plays ambient soundscapes that reflect the land cover composition of the current viewport.

### Live demo

Production deployment lives at **https://placeecho.com/geo-sonification/**.
See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the topology
(Cloudflare Pages + Worker reverse proxy + R2 + Fly.io), redeploy
commands, credential map, and known production issues.

## Architecture

```
┌─────────────────┐      ┌─────────────────┐
│   Mapbox Map    │ WS   │   Node.js       │
│   (Frontend)    │ ───> │   Server        │
│                 │      │                 │
│  viewport ──────┼──────┼─> calculate     │
│  interaction    │      │   stats +       │
│                 │      │   audioParams   │
│  audio engine ◄─┼──────┼── busTargets,   │
│  (Web Audio)    │  WS  │   coverage …    │
└─────────────────┘      └─────────────────┘
```

## Quick Start

> **One-click start (macOS):** Double-click `start.command` to start the Node server and open the browser. Requires steps 1-4 below to be completed first.

### 1. Prerequisites

- Node.js 18+
- Mapbox account (for access token)
- Tippecanoe CLI for PMTiles generation (`brew install tippecanoe` on macOS)
- Seven ambience loops in `frontend/audio/ambience/` (gitignored; repository only includes `.gitkeep`):
    - **Runtime files**: `forest.opus`, `shrub.opus`, `grass.opus`, `crop.opus`, `urban.opus`, `bare.opus`, `water.opus` — the audio engine fetches these directly via `frontend/audio/buffer-cache.js`.
    - **Source files**: keep the matching `forest.wav`, `shrub.wav`, … alongside as the editing master; `scripts/encode-ambience-opus.sh` re-encodes them to 128 kbps Opus (~1/20th the size) whenever the loops change. Both `*.wav` and `*.opus` are gitignored.
    - **Source format**: WAV, 48 kHz, stereo recommended (mono works — Web Audio upmixes automatically).
    - **Duration**: any length, but the last 1.875 s must be an exact copy of the first 1.875 s. The engine crossfades outgoing/incoming voices over this overlap window — identical head and tail content is what makes the loop seamless. Total duration = desired cycle length + 1.875 s (e.g., 120 s cycle → 121.875 s file).
    - **Source**: record your own or obtain ambient loops from sites like [Freesound](https://freesound.org/). Trim to your desired cycle length in a DAW, then copy the first 1.875 s and append it to the end.
    - **Setup**: drop the seven WAVs into `frontend/audio/ambience/`, run `scripts/encode-ambience-opus.sh` to produce the matching `.opus` files, then start the server. Missing `.opus` files leave their buses silent and surface as loading errors in the UI.

### 2. Get Mapbox Token

1. Go to https://account.mapbox.com/access-tokens/
2. Create a new token or copy your default public token
3. Copy `frontend/config.local.js.example` to `frontend/config.local.js` and paste your token

### 3. Install Dependencies

```bash
npm install && cd server && npm install
```

### 4. Run GEE Export and Build PMTiles (if not done)

Run the scripts in `gee-scripts/` and download CSVs to `data/raw/`. See `gee-scripts/README_EXPORT.md`.

**Before starting the server**: Confirm CSVs in `data/raw/` match the schema in `data/raw/SCHEMA.md`. If you have old `loss_*` CSVs, re-export and replace them. Validate the CSVs, clear derived caches, then rebuild the gitignored PMTiles overlay + the hover-glow border-distance index:

```bash
npm run check:csv
npm run clean:cache
node scripts/download-natural-earth.js          # idempotent — skips if files present
node scripts/compute-border-distance.js         # ~3s, fingerprinted cache
npm --prefix server run build:tiles             # rebuilds grids.pmtiles + grid_index.bin
```

`data/tiles/grids.pmtiles` and `data/tiles/grid_index.bin` are generated locally and are not committed. Re-run the build steps whenever the raw CSVs or grid size change. The Natural Earth GeoJSONs in `data/sources/natural-earth/` are also gitignored — `download-natural-earth.js` fetches them on first run.

### Border-aware hover glow (M6)

When the cursor hovers over the map, grid dots near a country border or coastline brighten on a smooth radial falloff. The visual is fully data-driven:

- Build time: `compute-border-distance.js` flattens Natural Earth coastline + country-boundary GeoJSONs into ~476k segments and computes the minimum distance from each grid centroid to any segment using a 1° bbox-prefiltered point-to-segment scan. Distances are baked into PMTiles as a `border_dist_km` per-feature property and into a parallel `grid_index.bin` sidecar.
- Run time: `frontend/hover-glow.js` loads the sidecar once, registers a Mapbox custom WebGL layer (`frontend/hover-glow-layer.js`) above the grey `grid-dots` circle layer, and forwards the cursor's lng/lat into a `vec2` uniform on every `mousemove`. The layer uploads all 67k cell positions + border distances as a single static VBO at init; per frame, only the cursor uniform plus a few zoom-derived scalars change. The fragment shader computes the per-cell glow (`cursorFactor × min(1, borderFactor + cursorFloor)`) and emits an additive premultiplied-white point sprite — the grey base layer underneath is untouched.
- Live tunables in DevTools: `__hg.tune({ rByZoom, borderFalloff, cursorFloor, eps, haloScale })` patches the runtime values in place; the layer triggers a repaint and the next frame picks them up — no reload. Setting `cursorFloor: 0` recovers the M6 P1 border-only baseline.

### 5. Start the System

**Terminal: Start Node.js Server**

```bash
npm start
```

**Browser: Open Frontend**

- Navigate to http://localhost:3000
- Click the play button in the top-right control strip to start audio

### 6. Interact!

- Pan and zoom the map
- Watch the info panel update (landcover UI)
- Listen to the ambient soundscape change as the viewport moves across different land cover types

## File Structure

<details>
<summary>Click to expand full directory tree</summary>

```
geo-sonification/
├── package.json                          # Root scripts: start, dev, check:csv, clean:cache
├── .env.example                          # All configurable env vars with defaults
├── start.command                         # macOS one-click launcher (double-click)
├── start.bat                             # Windows one-click launcher (double-click)
├── data/
│   ├── raw/                              # GEE-exported CSVs (source data, do not delete)
│   │   ├── SCHEMA.md                     # Data contract (fields, types, ranges)
│   │   └── <continent>_grid.csv          # One CSV per continent (exported from GEE)
│   ├── cities.json                       # City database (~555 entries, pop > 1M)
│   ├── cache/                            # Derived data (safe to delete, auto-rebuilt)
│   │   ├── all_grids.json
│   │   ├── normalize.json
│   │   └── border-distance.v1.json       # Per-cell border distance (M6, fingerprinted)
│   ├── sources/                          # Third-party source data (gitignored)
│   │   └── natural-earth/                # Coastline + admin boundaries (M6)
│   └── tiles/                            # PMTiles + sidecar (built by build-tiles.js)
│       ├── grids.pmtiles
│       └── grid_index.bin                # Hover-glow sidecar (M6, ~1 MB)
├── docs/
│   ├── ARCHITECTURE.md                   # System architecture
│   ├── DEVLOG.md                         # Development log index + recording guide
│   ├── plans/                            # Design proposals, milestone specs
│   └── devlog/                           # Development logs and debugging records
├── gee-scripts/
│   ├── README_EXPORT.md                  # GEE export instructions
│   └── <continent>_grid.js               # GEE export scripts (one per continent)
├── server/
│   ├── package.json
│   ├── index.js                          # Express routes, WebSocket, startup
│   ├── config.js                         # Env parsing, aggregation settings
│   ├── landcover.js                      # ESA WorldCover class metadata + normalization
│   ├── audio-metrics.js                  # Audio computation: bus fold-mapping, proximity, delta, ocean detection
│   ├── routes.js                         # HTTP route handlers (M4 P4-1)
│   ├── ws-handler.js                     # WebSocket message router (M4 P4-2)
│   ├── client-state.js                   # Per-client mode + delta state (M4 P4-3 merger)
│   ├── viewport-processor.js             # Viewport processing orchestrator
│   ├── parse-bounds.js                   # Shared bounds parser
│   ├── data-loader.js                    # CSV parsing, caching, deduplication
│   ├── spatial.js                        # Spatial index, viewport stats, bounds validation
│   ├── normalize.js                      # p1/p99 percentile normalization
│   ├── load-env.js                       # Minimal .env loader
│   ├── types.js                          # JSDoc type definitions
│   └── __tests__/                        # Jest test suite (server side)
├── frontend/
│   ├── index.html
│   ├── style.css
│   ├── main.js                           # Entry point — wires modules, DOMContentLoaded
│   ├── config.js                         # Shared state, server config loading, hover-glow tunables
│   ├── config.local.js.example           # Mapbox token template (copy to config.local.js)
│   ├── config.runtime.example.js         # Production deploy config template (used by build-pages.js)
│   ├── landcover.js                      # Landcover metadata lookups (name, color, XSS escape)
│   ├── map.js                            # Mapbox init, grid overlay, viewport tracking, HTTP fallback
│   ├── websocket.js                      # WebSocket connection with exponential-backoff reconnect
│   ├── ui.js                             # DOM updates: stats panel, connection status, toast
│   ├── popup.js                          # Per-dot click popup (M4 P3 extract from map.js)
│   ├── progress.js                       # Loop-cycle progress bar (M4 P3 extract from main.js)
│   ├── initial-viewport-push.js          # Pre-`load` bounds push so audio starts at the visible viewport
│   ├── sheet-drag.js                     # Mobile bottom-sheet drag handler
│   ├── city-announcer.js                 # City name voice announcement with stereo panning
│   ├── hover-glow.js                     # M6: load grid_index.bin, register GPU layer, mousemove → uniform
│   ├── hover-glow-layer.js               # M6: Mapbox custom WebGL layer, additive halo overlay
│   ├── hover-glow-shaders.js             # M6: vertex + fragment shader sources, falloff packing
│   ├── audio/engine.js                   # Web Audio engine: 7-bus EMA crossfade + ocean detector
│   ├── audio/                            # context, buffer-cache, raf-loop, utils, constants (M4 P3)
│   ├── audio/ambience/                   # Loopable Opus assets (.opus runtime + .wav source masters)
│   ├── audio/cities/                     # Pre-generated TTS M4A clips (one per city)
│   └── __tests__/                        # vitest + happy-dom (frontend side; runs via npm run test:frontend)
├── scripts/
│   ├── check_csv_schema.js                # CSV schema validator
│   ├── build-tiles.js                     # PMTiles builder (also chains build-grid-index.js)
│   ├── build-grid-index.js                # M6: emit grid_index.bin sidecar (fid + lng/lat + border_dist_km)
│   ├── compute-border-distance.js         # M6: per-cell distance to coastline + boundary, fingerprint-cached
│   ├── download-natural-earth.js          # M6: idempotent fetch of Natural Earth GeoJSONs
│   ├── encode-ambience-opus.sh            # ffmpeg WAV → 128 kbps Opus encoder for ambience loops
│   ├── measure-loudness.js                # LUFS measurement to calibrate master makeup gain
│   ├── benchmark-viewport.js              # Viewport processing benchmark
│   ├── smoke-worldcover.js                # WorldCover smoke test
│   ├── smoke-wire-format.js               # WS wire-format smoke (asserts against wire-format-baseline.json)
│   ├── wire-format-baseline.json          # Frozen reference payloads for the wire-format smoke
│   ├── build-pages.js                     # Cloudflare Pages build (frontend/ + cities.json + runtime config)
│   ├── clean-cache.js                     # Cross-platform cache cleaner
│   ├── generate-city-audio.js             # City TTS audio generator (macOS `say`)
│   ├── setup-git-hooks.js                 # Cross-platform git hooks installer
│   └── test_bounds_validation.sh          # Bounds regression test (Unix, requires curl)
└── .gitattributes                         # Line ending rules (CRLF for .bat)
```

</details>

## Data Organization

This project uses a single, "now-only" schema (no historical time series). Each continent CSV contains 0.5 x 0.5 degree grid cells. See `data/raw/SCHEMA.md` for the full field spec (types, units, allowed ranges).

## Viewport Aggregation (V2)

- Landcover breakdown and dominant landcover are computed **by land area** (sum of `land_area_km2`), not by grid count.
- Forest and population are aggregated by land area: forest = area-weighted mean of per-cell `forest_pct`, population density = `sum(population_total) / sum(land_area_km2)`.
- Nightlight uses `nightlight_p90` for viewport display; viewport nightlight is an **area-weighted mean of cell-level p90** (approximation, not the true viewport p90).

All server settings (ports, aggregation mode, coastal weighting, cache) are configurable via environment variables. See `.env.example` for a full list with defaults. Copy to `.env` and modify as needed.

Caches live in `data/cache/` and include aggregation version in their keys. Changing aggregation or coastal settings triggers recalculation. Clear all caches with `npm run clean:cache`.

## Sound Mapping

Seven ambience Opus loops represent different land cover types. Land cover channels are folded into 7 audio buses:

- **Forest bus**: classes 10, 95 (tree/forest, mangrove)
- **Shrub bus**: class 20 (shrubland)
- **Grass bus**: class 30 (grassland)
- **Crop bus**: class 40
- **Urban bus**: class 50
- **Bare bus**: classes 60, 100 (bare, moss/lichen)
- **Water bus**: classes 70, 80, 90 (snow/ice, water, wetland) + coverage-linear ocean mix

The audio engine uses `coverage` (fraction of viewport cells with land data) as a linear mix rule: `coverage=0%` maps to `land:ocean = 0:100`, `coverage=40%` maps to `100:0`, and values in between interpolate linearly (`land=coverage/0.4`, `ocean=1-land`). Above 40%, playback stays pure land. Ocean rides the Water bus while land buses are attenuated in low-coverage mode. EMA smoothing provides gradual transitions.

Ambience loops are local assets and are not committed (`frontend/audio/ambience/*.opus` and `*.wav` are both ignored). If an `.opus` file is missing, the corresponding bus shows a loading error and remains silent.

### Audio Controls and Lifecycle

- Play/Stop toggle in the top-right control strip
- Per-bus loading progress indicators
- Audio automatically suspends when the browser tab is hidden (`visibilitychange`), resumes and snaps to current targets on return
- When viewport updates pause (for example, map is stationary), audio keeps looping at the last targets; no idle auto-fade is applied.
- HTTP fallback (`POST /api/viewport`) also updates `audioParams`, so audio keeps tracking map movement when WebSocket is unavailable.

### Requirements

- Modern browser with Web Audio API (Chrome 66+, Firefox 76+, Safari 14.1+)
- Sufficient bandwidth for initial WAV download

## Performance

Drag-stop feedback latency on the grid overlay is dominated by `VIEWPORT_DEBOUNCE` (`frontend/config.js`, default 120 ms) plus the WebSocket round-trip; spatial-index queries themselves average 1–2 ms (visible in the server's `[Stats]` log every 30 s). Several layers reduce that loop without changing user-visible behavior:

- **Server response compression** — `compression` middleware (gzip on HTTP) and `ws perMessageDeflate` (zlib level 1, threshold 256 B, no context takeover). Drops the ~1.5 KB stats frame to ~0.5 KB. Verify with `curl -sI --compressed http://localhost:3000/audio/engine.js`.
- **Opus-encoded ambience** — runtime fetches `*.opus` (128 kbps, ~2 MB each) instead of the source `*.wav` (~46 MB each). Reduces first-load audio payload from ~328 MB to ~15 MB without audibly degrading the textures.
- **Static-asset cache headers** — PMTiles 7 days, ambience 30 days. Repeat reloads skip the network entirely; in production, R2 + Cloudflare carries its own cache layer.
- **Drag-state stroke suppression** — the per-grid dot stroke is set to width 0 during `movestart` and restored on `moveend`. Halves fragment-shader cost at low zoom on the 67k-feature dot layer; the resting visual is unchanged.

## Troubleshooting

### Server won't start / CSV schema mismatch

- Re-export CSVs using `gee-scripts/*.js` and place them into `data/raw/`
- Delete caches: `rm -rf data/cache`

### WebSocket disconnected

- The server sends a ping every 30 seconds; clients that don't respond are terminated automatically
- Make sure Node server is running: `npm start`
- Check console for errors

### Map not loading

- Verify Mapbox token is set in `frontend/config.local.js`
- Check browser console for errors

### No grid overlay

- Run GEE export first for each continent
- Place CSV files in `data/raw/` (e.g., `data/raw/africa_grid.csv`, `data/raw/asia_grid.csv`, etc.)
- Each file should match the schema in `data/raw/SCHEMA.md`
- Install `tippecanoe`, then rebuild the local PMTiles file with `npm --prefix server run build:tiles`
- Confirm `data/tiles/grids.pmtiles` exists after the build

### No ambience audio

- Drop the seven loopable WAVs (`forest.wav`, `shrub.wav`, `grass.wav`, `crop.wav`, `urban.wav`, `bare.wav`, `water.wav`) into `frontend/audio/ambience/`
- Run `scripts/encode-ambience-opus.sh` to produce the matching `forest.opus`, … files the runtime actually loads
- Missing `.opus` files make the corresponding buses silent and surface as loading errors in the UI

## API Endpoints

### HTTP

- `GET /health` — Health check (used by `start.command` to wait for readiness)
- `GET /api/config` — Server configuration (grid size, landcover metadata, proximity zoom thresholds)
- `POST /api/viewport` — Calculate stats for given bounds (HTTP fallback when WebSocket is unavailable)

### WebSocket

Connect to `ws://localhost:3000` — HTTP and WebSocket share a single port (configurable via `PORT` or `HTTP_PORT`). The server enables `permessage-deflate` so viewport stats frames are gzip-compressed on the wire.

**Client → Server:**

```json
{ "type": "viewport", "bounds": [west, south, east, north], "zoom": 12.5 }
```

`zoom` is recommended — it drives the proximity signal and low-pass filter cutoff frequency. If omitted, proximity defaults to 0 (fully distant).

**Server → Client:**

```json
{ "type": "stats", "audioParams": { "busTargets": [...], "proximity": 0.8, "coverage": 0.95 }, "mode": "aggregated", ... }
```

See `docs/ARCHITECTURE.md` for the full field reference.

## Contributing

Contributions are welcome! Please open an issue first to discuss what you would like to change before submitting a pull request.

This project uses [Conventional Commits](https://www.conventionalcommits.org/) enforced by [commitlint](https://commitlint.js.org/). Run `npm run lint` and `npm run format:check` before committing.

## Data Sources

This project uses the following third-party datasets (obtained independently via Google Earth Engine export, not distributed with this repository):

- **ESA WorldCover 2021** — CC BY 4.0 — https://esa-worldcover.org/
- **WorldPop 2020** — CC BY 4.0 — https://www.worldpop.org/
- **VIIRS Nighttime Lights (NASA/NOAA)** — Public domain — https://eogdata.mines.edu/products/vnl/

See `NOTICE` for full attribution details.
