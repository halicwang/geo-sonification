# Dev Log

Update logs, design decisions, and ideas for Geo-Sonification.

---

## 2026-01-22 — Homework: Initial Proposal

**Data source**: Google Earth Engine — draw ROI on map, extract landscape/land-cover composition and ~20-year forest-loss time series (annual loss + cumulative loss). Export as CSV.

**Tech pipeline**: GEE data extraction → Python preprocessing → Max/MSP synthesis & mapping → WAV export. Max handles sound generation (pads/drone/noise/percussion), mapping data to filter, detune, noise ratio, textural fragmentation, rhythmic density. Can also output MIDI to Ableton for arrangement.

**Core problem**: Use sound to make trend, acceleration, and key years perceptually immediate — listeners should hear whether cumulative loss over 20 years is substantial without staring at a chart.

**Sound structure (original plan)**:
- 2D place baseline — land-cover composition defines background timbre (forest = organic/continuous, water = open/floating, built-up = mechanical/regular)
- Time-weighted degradation — cumulative loss drives detune, instability, roughness, fragmentation over time
- Year-based events — annual loss triggers ruptures/noise in high-loss years; annual gain attenuates loss weight

---

## 2026-01-27 — Classroom Discussion: Pivot to Real-Time

Key feedback from instructor review of the first working demo (frontend + sine wave mapping):

### What worked
- Interactive map with Mapbox grid overlay — novel that it covers the whole world, not just one city
- Data pipeline from GEE to frontend to Max via OSC is functional
- Real-time interaction: hover over grid cells, get data back

### Design tension identified
- **Historical vs. real-time**: The map shows today's data, but the original plan wants to sonify 20 years of change. Navigating a "now" map while listening to the past is perceptually confusing.
- Instructor recommendation: **drop the historical time-series axis** and focus on real-time "now" data. The interactive map probing is the strong differentiator.

### Sonification strategy shift
- Direct frequency mapping (data → pitch) is not very informative — listeners can't tell actual values
- Sound doesn't need to directly map data with precise numeric fidelity; **loose, indirect mappings are valid sonification**
- Example: green space → one type of music, developed area → different type of music. Switching sounds based on data category is legitimate sonification
- Sound's role: **emotional impact and weight**, not numeric readout. Like a film score enhances visual storytelling.

### New directions discussed
- Add more data dimensions beyond just landcover: **population**, nightlight, forest percentage — more streams = more things to work with in sound design, enables comparisons
- Consider focusing on a specific region (e.g., one city) if detailed historical data is available, or stay global with real-time data
- Acoustic ecology angle mentioned (Nature's Soundscape studies in British Columbia) — not pursued but interesting reference

### Action items from discussion
- Integrate landscape/landcover data into the map (was only using loss rate at this point)
- Add population data as a new dimension
- Focus on "now" data, abandon historical time-series for this project
- Make the sound design more creative — move beyond sine wave pitch mapping

---

## 2026-02-06 — Per-Grid Mode: Design & Initial Implementation

See `docs/2026-02-06-per-grid-devlog.md` for full design rationale.

**Core idea**: When the user zooms in far enough (≤50 grid cells visible), switch from aggregated (1 blended sound) to per-grid mode (N independent voices, spatially distributed). Threshold uses hysteresis (enter at 50, exit at 50) to avoid oscillation.

**Server changes** (`server/osc.js`, `server/index.js`):
- New `sendGridsToMax()` — sends `/grid/count`, `/viewport`, then N × `/grid` (lon, lat, lc, nl, pop, forest)
- New `processViewport()` shared helper — handles hysteresis-based mode switching for both WebSocket and HTTP clients
- Per-client mode state tracked separately (WS: per-connection, HTTP: per-IP with 5-min TTL expiry)
- `normalizeOscValues()` extracted to standalone `normalize.js` for reuse in both modes

**Max patch** (`sonification/max_wav_osc.maxpat`):
- Added `route /grid/count /grid /viewport` branch on per-grid `udpreceive`
- `print` objects for data verification (sound design deferred)

---

## 2026-02-08 — OSC Pipeline Extensions: `/grid/lc`, `/mode`, `/grid/pos`

Three new OSC message types added to complete the per-grid data pipeline. Design principle: **extend with independent addresses, never modify existing message formats**.

### 1. `/grid/lc` — Per-cell landcover distribution (11 floats)

**Problem**: Per-grid mode only sent the dominant landcover class as an integer. Cells with mixed land use (e.g., 60% forest + 30% cropland) lost their distribution detail.

**Solution**: New `/grid/lc` message per cell — 11 floats in the same class order as aggregated `/lc/*` (classes 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100). Each float is a 0-1 fraction. Fallback: if `lc_pct_*` columns are missing, synthesizes 100% from the discrete `landcover_class`.

**Files**: `server/osc.js` (`sendGridsToMax`), `server/landcover.js` (new `getCellLcDistribution()` helper)

### 2. `/mode` — Mode transition notification

**Problem**: MaxMSP had no way to know when the server switched between aggregated and per-grid modes. Needed for crossfade transitions and routing.

**Solution**: `/mode` message (string: `"aggregated"` or `"per-grid"`) sent **before** any data messages on every viewport update. Max can use this to trigger crossfades or route switches.

**Files**: `server/osc.js` (new `sendModeToMax()`), `server/index.js` (`processViewport()` calls it before data send)

### 3. `/grid/pos` — Viewport-relative normalized position (2 floats)

**Problem**: Max received absolute lon/lat per cell but needed viewport-relative coordinates for spatial audio panning. Max would have had to compute `(lon - west) / (east - west)` itself using `/viewport` bounds.

**Solution**: Server pre-computes and sends `/grid/pos` with `xNorm` (0=west, 1=east) and `yNorm` (0=south, 1=north). Max can directly map these to stereo panning or spatial placement.

**Implementation details**:
- Uses **cell center** (lon + GRID_SIZE/2, lat + GRID_SIZE/2), not bottom-left corner — otherwise all cells are offset by half a grid cell
- Date-line crossing (west > east → negative xRange) falls through to 0.5 default — acceptable for current data coverage
- Computed once per viewport update (xRange/yRange outside the per-cell loop)

**Files**: `server/osc.js` (`sendGridsToMax`), imported `GRID_SIZE` from config

### Updated Per-Grid OSC Sequence

```
/mode        "per-grid"                        ← mode notification (always first)
/grid/count  N                                 ← number of cells
/viewport    west south east north             ← viewport bounds
  × N cells:
    /grid      lon lat lc nl pop forest        ← cell data (6 args, unchanged)
    /grid/pos  xNorm yNorm                     ← viewport-relative position
    /grid/lc   f10 f20 f30 f40 f50 f60 f70 f80 f90 f95 f100  ← landcover distribution
```

Aggregated mode unchanged (15 messages: 4 stats + 11 `/lc/*`).

### Max Patch Updates

Updated route from `route /grid/count /grid /viewport` to:
```
route /grid/count /grid/pos /grid/lc /grid /viewport
```

**Defensive ordering**: More specific paths (`/grid/pos`, `/grid/lc`) before shorter `/grid` to prevent prefix-matching issues. 5 routes → 6 outlets (including remainder).

New objects: `unpack f f` for `/grid/pos`, `unpack f f f f f f f f f f f` for `/grid/lc`, corresponding `print` objects for verification.

### Bug Fixes

1. **Max `route` numinlets** — Was incorrectly set to 6 (matching numoutlets); Max `route` always has exactly 1 inlet. Fixed to 1.
2. **Cell center offset** — lon/lat from CSV are bottom-left corners of 0.5° cells. Normalizing with corner values offsets all positions by ~0.25°. Fixed by computing `centerLon = lon + GRID_SIZE / 2`.
3. **Max patch layout** — Several boxes had overlapping/truncated text. Adjusted `patching_rect` coordinates for `grid_data_route`, `print_viewport`, `print_grid_lc`.

### `/forest` vs `/lc/10` — Clarification

Two "forest" values exist in the OSC stream with different semantics:

| Message | Denominator | Meaning |
|---------|-------------|---------|
| `/forest` (aggregated) / `/grid` forest arg | land area only | forest_area ÷ land_area (excludes water) |
| `/lc/10` (aggregated) / `/grid/lc` first float | total area | tree_cover_pixels ÷ total_pixels (includes water) |

For a coastal cell that's 50% water + 50% forest: `/forest` = 1.0, `/lc/10` ≈ 0.5.

**Sonification recommendation**: Use `/lc/*` (or `/grid/lc`) as the primary 11-channel landcover mapping. `/forest` is redundant but available as a convenience if a simpler forest-only control is needed.

---

## 2026-02-19 — Milestone A: Server-Side Foundation

### Scope completed

- Task 6: sample directory structure under `sonification/samples/`
- Task 2: new `/proximity` OSC message
- Task 1: new `/delta/*` OSC messages and per-client delta state
- Task 3: standalone `scripts/osc_simulator.js`

### Key architecture decisions

1. **Global ordering update (insert-only)**:
   - `/mode` -> `/proximity` -> `/delta/*` -> existing messages
   - Existing aggregated payload ordering remains unchanged.
   - Existing per-grid payload logic remains unchanged.
2. **Client-state separation preserved**:
   - Existing mode hysteresis state remains in `mode-manager.js` (no behavior change).
   - Delta state is managed independently in `delta-state.js`.
3. **Delta keying strategy**:
   - WebSocket: per-connection state
   - HTTP: `clientId` from request body first, fallback to IP
   - HTTP delta state uses 5-minute TTL cleanup
4. **Schema single source of truth**:
   - `server/osc_schema.js` centralizes OSC addresses, class order, canonical sequence, and packet builders
   - Both `server/osc.js` and `scripts/osc_simulator.js` import this schema

### New config knobs

- `PROXIMITY_LOWER` / `PROXIMITY_UPPER`
- `DT_MIN_MS` / `DT_MAX_MS`
- `DELTA_RATE_CEILING`

All added to `server/config.js` with validation and documented in `.env.example`.

### Formula notes (implemented)

- `proximity` from grid count:
  - `gridCount === 0` -> `0` (forced distant/no-data behavior)
  - `<= lower` -> `1`, `>= upper` -> `0`, linear interpolation in between
- `delta`:
  - `magnitude = clamp(0.5 * sum(abs(current_i - prev_i)), 0, 1)`
  - `dt` clamped to `[DT_MIN_MS, DT_MAX_MS]`
  - `rate = clamp((magnitude / (dt/1000)) / DELTA_RATE_CEILING, 0, 1)`
  - First frame emits all-zero deltas

### Simulator behavior

- Supports:
  - `static-forest`
  - `static-mixed`
  - `gradual-transition`
  - `abrupt-switch`
  - `zoom-sweep`
  - `world-tour`
- CLI:
  - `node scripts/osc_simulator.js <scenario>`
  - No args + TTY -> interactive selection
  - No args + non-TTY -> print usage and exit
- Graceful shutdown on Ctrl+C

### Validation and regression coverage

- Expanded OSC unit tests:
  - `/proximity` send + clamp
  - `/delta` send + canonical addresses
- Added schema tests:
  - class order, address ordering, canonical sequence
- Added pure metrics tests:
  - proximity edge/linear mapping
  - delta magnitude/rate formulas and dt clamping
- Added delta-state tests:
  - clientId-first key derivation and state persistence

---

## Idea Backlog

- Auditory icons for landcover types (literal nature sounds: crickets, birds, wind)
- City-level deep dive with localized datasets (acoustic ecology, urban soundscape)
- Historical data slider if a self-built map backend is ever created
- Frequency-domain audification for multiple simultaneous data streams
