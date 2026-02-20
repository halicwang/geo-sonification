# Geo-Sonification: Interactive Sound Map

Interactive map that streams viewport-level geographic metrics to Max/MSP via OSC.

- Frontend (Mapbox) currently visualizes **landcover only**.
- Other metrics (nightlight, population, forest) are sent via OSC so users can design their own sound mappings in Max.

## Architecture

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   Mapbox Map    │ WS   │   Node.js       │ OSC  │    MaxMSP       │
│   (Frontend)    │ ───> │   Server        │ ───> │    Sound Engine │
│                 │      │                 │      │                 │
│  viewport ──────┼──────┼─> calculate ────┼──────┼─> /landcover    │
│  interaction    │      │   stats         │      │   /nightlight   │
│                 │      │                 │      │   /population   │
│                 │      │                 │      │   /forest       │
│                 │      │                 │      │   /lc/10…/lc/100│
└─────────────────┘      └─────────────────┘      └─────────────────┘
```

## Quick Start

### One-click start (macOS)

Double-click `start.command` to start the Node server, open the Max patch, and open the browser.

### 1. Prerequisites

- Node.js 18+
- MaxMSP 8+
- Mapbox account (for access token)

### 2. Get Mapbox Token

1. Go to https://account.mapbox.com/access-tokens/
2. Create a new token or copy your default public token
3. Copy `frontend/config.local.js.example` to `frontend/config.local.js` and paste your token

### 3. Install Dependencies

```bash
cd server && npm install
```

### 4. Run GEE Export (if not done)

Run the scripts in `gee/` and download CSVs to `data/raw/`. See `gee/README_EXPORT.md`.

**Before starting the server**: Confirm CSVs in `data/raw/` match the schema in `data/raw/SCHEMA.md`. If you have old `loss_*` CSVs, re-export and replace them. Validate with `npm run check:csv`. Delete `data/cache/` then start Node.

### 5. Start the System

**Terminal 1: Start Node.js Server**
```bash
npm start
```

**MaxMSP: Open and Configure**
1. Open `sonification/max_wav_osc.maxpat`
2. Verify `udpreceive 7400` is receiving (numbers should change when the viewport changes)

**Browser: Open Frontend**
- Navigate to http://localhost:3000

### 6. Interact!

- Pan and zoom the map
- Watch the info panel update (landcover-only UI)
- In Max, connect the Data Hub outlets to your own synth/effects and map the parameters as you like

## File Structure

```
geo-sonification/
├── package.json                          # Root scripts: start, dev, check:csv, clean:cache
├── .env.example                          # All configurable env vars with defaults
├── start.command                         # macOS one-click launcher (double-click)
├── DEVLOG.md                             # Development log
├── data/
│   ├── raw/                              # GEE-exported CSVs (source data, do not delete)
│   │   ├── SCHEMA.md                     # Data contract (fields, types, ranges)
│   │   └── <continent>_grid.csv          # One CSV per continent (exported from GEE)
│   └── cache/                            # Derived data (safe to delete, auto-rebuilt)
│       ├── all_grids.json
│       └── normalize.json
├── docs/                                 # Dev notes and milestone proposals
├── gee/
│   ├── README_EXPORT.md                  # GEE export instructions
│   ├── africa_grid.js                    # GEE export scripts (one per continent)
│   ├── antarctica_grid.js
│   ├── asia_grid.js
│   ├── europe_grid.js
│   ├── north_america_grid.js
│   ├── oceania_grid.js
│   ├── south_america_grid.js
│   ├── test_brazil.js                    # Small-region test scripts
│   ├── test_la.js
│   └── test_tokyo.js
├── server/
│   ├── package.json
│   ├── index.js                          # Express routes, WebSocket, startup
│   ├── config.js                         # Env parsing, aggregation settings
│   ├── landcover.js                      # ESA WorldCover class metadata + normalization
│   ├── osc.js                            # OSC/UDP client → MaxMSP
│   ├── data-loader.js                    # CSV parsing, caching, deduplication
│   ├── spatial.js                        # Spatial index, viewport stats, bounds validation
│   └── normalize.js                      # p1/p99 percentile normalization + OSC value mapping
├── frontend/
│   ├── index.html
│   ├── style.css
│   ├── app.js                            # Mapbox + WebSocket client
│   └── config.local.js.example           # Mapbox token template (copy to config.local.js)
├── sonification/
│   ├── max_wav_osc.maxpat                # Max Data Hub: OSC in → numbers/outlets → audio
│   ├── loop_bus.maxpat                   # Per-bus abstraction: buffer + 2×groove~ + crossfade
│   ├── loop_clock.js                     # Global crossfade clock (syncs all 5 buses)
│   ├── loop_voice.js                     # Per-bus voice manager (double-buffered playback)
│   ├── crossfade_controller.js           # 11-ch land cover crossfade with EMA smoothing
│   ├── icon_trigger.js                   # Probabilistic auditory icon triggering
│   ├── granulator.js                     # 4-voice granular synthesis scheduler
│   └── water_bus.js                      # 3-level ocean detector (coverage-based)
└── scripts/
    ├── check_csv_schema.js                # CSV schema validator
    └── test_bounds_validation.sh          # Bounds regression test
```

## Data Organization

This project uses a single, "now-only" schema (no historical time series). Each continent CSV contains 0.5 x 0.5 degree grid cells. See `data/raw/SCHEMA.md` for the full field spec (types, units, allowed ranges).

## Viewport Aggregation (V2)

- Landcover breakdown and dominant landcover are computed **by land area** (sum of `land_area_km2`), not by grid count.
- Forest and population are aggregated by land area: forest = `sum(forest_area_km2) / sum(land_area_km2) * 100`, population density = `sum(population_total) / sum(land_area_km2)`.
- Nightlight uses `nightlight_p90` for OSC; viewport nightlight is an **area-weighted mean of cell-level p90** (approximation, not the true viewport p90).

All server settings (ports, aggregation mode, coastal weighting, cache) are configurable via environment variables. See `.env.example` for a full list with defaults. Copy to `.env` and modify as needed.

Caches live in `data/cache/` and include aggregation version in their keys. Changing aggregation or coastal settings triggers recalculation. Clear all caches with `npm run clean:cache`.

## Sound Mapping

The Max patch includes a sound engine with loop playback, crossfade mixing, icon triggering, and granular synthesis. Five ambience WAVs (2:01.875 each, 128 BPM) are played via double-buffered `groove~` objects with a 1875ms crossfade window, synchronized by a global clock (`loop_clock.js`). Land cover channels are folded into 5 audio buses:

- **Tree bus**: classes 10, 20, 30, 90, 95, 100 (natural vegetation)
- **Crop bus**: class 40
- **Urban bus**: class 50
- **Bare bus**: class 60
- **Water bus**: classes 70, 80 + ocean 3-level detector (`water_bus.js` via `maximum`)

The Water bus combines fine-grained grid-level water data (crossfade controller classes 70+80) with a macro ocean signal derived from `/coverage`. Three quantized levels: 1.0 (pure ocean, no grid data), 0.7 (coastal, coverage < 10% with high proximity), 0.0 (land). EMA smoothing provides gradual transitions.

Additional recommended mappings (optional):

- `/population` → rhythm density / event rate
- `/nightlight` → presence / loudness / brightness
- `/forest` → smoothness / texture / reverb amount

## Troubleshooting

### Server won't start / CSV schema mismatch
- Re-export CSVs using `gee/*.js` and place them into `data/raw/`
- Delete caches: `rm -rf data/cache`

### MaxMSP not receiving OSC
- Check `udpreceive 7400`
- Confirm the server is sending to the right host/port (`OSC_HOST`, `OSC_PORT`)
- Use `POST /api/manual` to test OSC output

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

## API Endpoints

- `GET /health` - Health check (used by `start.command` to wait for readiness)
- `GET /api/config` - Server configuration (ports, OSC status, grid size, landcover metadata)
- `GET /api/grids` - Returns all grid data as JSON
- `POST /api/viewport` - Calculate stats for given bounds
- `POST /api/manual` - Manual OSC control for testing

## OSC Messages

Sent to MaxMSP on port 7400 per viewport update.

**Mode indicator (always sent first):**
- `/mode` (string) - `"aggregated"` or `"per-grid"`, sent before data on every update

**Viewport signals (sent after /mode, before data):**
- `/proximity` (float 0–1) — Viewport zoom proximity. 0 = satellite/distant view, 1 = closest zoom. Based on grid cell count with configurable thresholds (default: 50–800 cells). Forced to 0 when viewport contains zero grid cells.
- `/delta/lc` (11 floats) — Per-class land cover change since previous update, same class order as `/lc/*`. All zeros on first update.

### Aggregated Mode (always sent, 15 messages)

**Aggregated stats (4):**
- `/landcover` (int) - Dominant land cover class (10/20/30/40/50/60/70/80/90/95/100)
- `/nightlight` (float 0-1) - Normalized viewport nightlight (based on `nightlight_p90`)
- `/population` (float 0-1) - Normalized viewport population density
- `/forest` (float 0-1) - Normalized viewport forest percentage

**Landcover distribution (11):**
- `/lc/10` … `/lc/100` (float 0-1) - Area fraction per ESA WorldCover class
- Classes: 10 (Tree), 20 (Shrub), 30 (Grass), 40 (Crop), 50 (Urban), 60 (Bare), 70 (Snow), 80 (Water), 90 (Wetland), 95 (Mangrove), 100 (Moss)
- Classes not present in viewport send `0.0`; all 11 are always sent

**Land coverage:**
- `/coverage` (float 0–1) — Ratio of land grid cells to theoretical grid cells in viewport. Sent after aggregated messages.

### Per-Grid Mode (with hysteresis, default center threshold 50)

Sent **in addition to** aggregated messages when zoomed in with few grid cells. Uses hysteresis to avoid mode flickering (enter/exit thresholds configurable via `PER_GRID_THRESHOLD`, `PER_GRID_THRESHOLD_ENTER`, `PER_GRID_THRESHOLD_EXIT`). Mode state is tracked per-client: per WebSocket connection, and per IP for HTTP clients (expires after 5 minutes of inactivity).

- `/grid/count` (int) - Number of grid cells in viewport
- `/viewport` (4 floats) - Viewport bounds: west, south, east, north (for panning calculation)
- `/grid` (float float int float float float) × N - Per-cell data: lon, lat, landcover, nightlight, population, forest
- `/grid/pos` (2 floats) × N - Per-cell normalized viewport position: xNorm (0=west, 1=east), yNorm (0=south, 1=north)
- `/grid/lc` (11 floats) × N - Per-cell landcover distribution, same class order as `/lc/*`
