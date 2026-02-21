# Geo-Sonification — Milestone 2 Proposal

Author: Zixiao Wang (Halic)
Date: 2026-02-20

## 1. Abstract

Milestone 1 delivered a working data pipeline: Google Earth Engine data flows through a Node.js server to Max/MSP via OSC, with real-time viewport aggregation and a per-grid mode for zoomed-in views. The map works; the numbers arrive.

Milestone 2 turns those numbers into sound. This milestone extends the server with new control signals (zoom proximity, land cover change detection, ocean coverage), builds a complete Max-side sound engine (crossfade controller, fold-mapping, ocean detection), and delivers **5 ambient WAV loops** — one per audio bus — that crossfade in real time as the user explores the map. The result is a continuous, explorable soundscape where listeners can hear the difference between a rainforest, a city, a desert, an ocean, and a farm without reading a single chart.

---

## 2. What Milestone 1 Established

Milestone 1 (documented in `docs/2026-01-30-sonification-milestone-proposal.md`) delivered:

- **GEE data export**: global 1°×1° grid CSV with landcover, nightlight, population, and forest metrics
- **Node.js server**: loads CSVs, builds spatial index, computes viewport-level aggregated statistics on every pan/zoom
- **OSC pipeline**: 15 aggregated messages per viewport update (`/landcover`, `/nightlight`, `/population`, `/forest`, `/lc/10` through `/lc/100`)
- **Per-grid mode**: when zoomed in (≤50 grid cells), sends individual cell data (`/grid`, `/grid/count`, `/viewport`) alongside aggregated stats; hysteresis prevents mode oscillation
- **Frontend**: Mapbox map with grid overlay, sends viewport bounds to server via WebSocket
- **Max patch**: `udpreceive 7400` with basic `route` and `print` objects for data verification

At this point, the data arrived in Max but produced no sound.

---

## 3. Data and Frontend Improvements

### Grid resolution: 1° → 0.5°

The global grid was re-exported from Google Earth Engine at **0.5°×0.5°** resolution — 4× the number of cells compared to Milestone 1. This significantly improves spatial accuracy: land cover boundaries, coastlines, and urban areas are now resolved at roughly 55 km instead of 110 km at the equator.

### Color-coded grid overlay

The frontend map now renders grid cells colored by dominant land cover type. Forest cells appear dark green, cropland is yellow, urban is grey, water is blue, and so on. Previously all cells were uniform grey. This gives users immediate visual context that pairs with the audio — you can see _and_ hear the landscape shift as you pan.

---

## 4. New Server-Side Signals

### Viewport-level signals

These are sent on every viewport update and drive the sound engine:

| Address      | Type      | Description                                                                                                                                                                                                                                                                                                                       |
| ------------ | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/mode`      | string    | `"aggregated"` or `"per-grid"` — notifies Max of the current mode so it can handle transitions (e.g. crossfade). Always sent first.                                                                                                                                                                                               |
| `/proximity` | float 0–1 | How zoomed-in the user is. 0 = satellite view (hundreds of grid cells visible), 1 = street-level (few cells). Derived from grid cell count with linear interpolation between configurable thresholds (default: 50–800 cells). Forced to 0 when no grid data is present. Drives volume attenuation and listening mode transitions. |
| `/delta/lc`  | 11 floats | Per-class land cover change since the previous update, same class order as `/lc/*`. Tells Max how much the landscape composition shifted, enabling sound to respond to exploration movement rather than just static state. All zeros on first update.                                                                             |
| `/coverage`  | float 0–1 | Ratio of land grid cells to theoretical total in the viewport. The key signal for ocean detection: when the user pans over open ocean, coverage drops to ≈ 0 because no land grid data exists there.                                                                                                                              |

### Per-grid enrichments

Sent in per-grid mode alongside existing `/grid` messages:

| Address     | Type               | Description                                                                                                                                                                                                      |
| ----------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/grid/lc`  | 11 floats per cell | Full land cover distribution per grid cell, same class order as aggregated `/lc/*`. Provides continuous 11-dimensional composition instead of a single discrete class integer.                                   |
| `/grid/pos` | 2 floats per cell  | Viewport-relative normalized position (x: 0 = west edge, 1 = east edge; y: 0 = south, 1 = north). Pre-computed by the server from cell center coordinates, ready for stereo panning or spatial placement in Max. |

### Message ordering

Every viewport update sends messages in this order:

```
/mode              (string)
/proximity         (float 0–1)
/delta/lc          (11 floats)
/landcover         (int)         ┐
/nightlight        (float 0–1)   │
/population        (float 0–1)   │ existing 15 aggregated
/forest            (float 0–1)   │ messages — unchanged
/lc/10 … /lc/100  (11 floats)   ┘
/coverage          (float 0–1)
```

In per-grid mode, per-cell messages (`/grid/count`, `/viewport`, N × `/grid` + `/grid/pos` + `/grid/lc`) are sent after the aggregated payload.

### Infrastructure

- **OSC schema module** (`server/osc_schema.js`): single source of truth for all OSC addresses, class order, canonical message sequence, and packet builder functions. Both the server and the simulator import from it — no duplication.
- **Per-client delta state** (`server/delta-state.js`): WebSocket clients get per-connection state. HTTP clients use `clientId` from the request body (with IP fallback), cleaned up after 5 minutes of inactivity. Independent from the existing per-IP mode hysteresis.
- **OSC simulator** (`scripts/osc_simulator.js`): standalone Node.js script that sends realistic OSC data to Max without needing the browser or map. Six built-in scenarios:
    - `static-forest` — pure forest, steady state
    - `static-mixed` — blended composition (60% tree, 30% water, 10% crop)
    - `gradual-transition` — smooth forest → urban over 10 seconds
    - `abrupt-switch` — instant jump from forest to bare
    - `zoom-sweep` — proximity sweeps from 1 (close) to 0 (distant)
    - `world-tour` — simulated journey across contrasting biomes

---

## 5. Sound Engine Architecture

### Design philosophy

The sonification uses a **three-layer structure**:

1. **Base + texture layer**: ambient loops produced in Ableton (organic synths, drones, noise textures), exported as loopable WAV files. Max handles loop playback and volume control. _This is the focus of this milestone._
2. **Icon layer**: short auditory icons (bird calls, car horns, wind gusts) triggered by data-driven logic. Infrastructure built; samples and wiring are a future goal.
3. **Crossfade mixing**: server data (11 land cover channels + proximity) controls volume envelopes and trigger probabilities.

Listening experience goal: **65% emotional/aesthetic quality, 35% informational legibility**. The sonification should feel like a living soundscape, not a data readout.

### Crossfade controller

`sonification/crossfade_controller.js` — 12 inlets, 11 outlets.

Receives the 11 `/lc/*` percentages and `/proximity`, applies per-frame EMA smoothing (default time constant 500 ms), and outputs 11 smoothed volume values attenuated by proximity. Frame-based design ensures all 11 channels are smoothed with identical dt — the last `/lc/100` message triggers the computation for the entire frame.

### Icon trigger

`sonification/icon_trigger.js` — 13 inlets, 2 outlets.

Weighted probabilistic triggering: on each metro bang, evaluates per-class weights (land cover % × proximity × cooldown eligibility), rolls against a configurable base rate (default 0.05), and outputs an icon category + intensity. Active classes: Tree (10), Crop (40), Urban (50), Bare (60). Others structurally supported.

### Water bus

`sonification/water_bus.js` — 2 inlets, 1 outlet.

Three-level ocean detection based on `/coverage` and `/proximity`:

| Condition                                        | Target signal |
| ------------------------------------------------ | ------------- |
| `proximity == 0` (pure ocean, no grids)          | 1.0           |
| `coverage < 0.1` and `proximity > 0.7` (coastal) | 0.7           |
| Otherwise (land)                                 | 0.0           |

Combined with crossfade controller outputs for classes 70 (Snow/Ice) and 80 (Water) via `[maximum]`, so the Water bus responds to both land-cover water and open ocean.

### Granulator

`sonification/granulator.js` — 8 inlets, 8 outlets.

Optional 4-voice granular synthesis module with round-robin polyphony, 3-phase envelope generation, and proximity-driven parameter modulation (longer/sparser grains when zoomed out). Implemented and ready to wire.

### 5-bus fold-mapping

The crossfade controller always outputs 11 independent channels. In the Max patch, these are folded into **5 audio buses**:

| Bus       | ESA classes             | Description                                                        |
| --------- | ----------------------- | ------------------------------------------------------------------ |
| **Tree**  | 10, 20, 30, 90, 95, 100 | Natural vegetation (forest, shrub, grass, wetland, mangrove, moss) |
| **Crop**  | 40                      | Agricultural land                                                  |
| **Urban** | 50                      | Built-up areas                                                     |
| **Bare**  | 60                      | Desert, bare soil, sparse vegetation                               |
| **Water** | 70, 80 + ocean detector | Snow/ice, permanent water bodies, and open ocean                   |

Fold-mapping is purely a Max patch wiring concern — as new audio assets are authored, individual channels can be unbundled from buses without any code changes.

---

## 6. Close-Up vs. Distant Listening Modes

The `/proximity` signal drives a continuous transition between two listening experiences:

- **Close-up** (zoomed in, proximity → 1): clear soundscape. Crossfade volumes follow land cover data faithfully. Individual land cover types are distinguishable. Map dragging produces audible change.
- **Distant** (zoomed out, proximity → 0): diffuse wash. All volumes attenuate toward zero. The soundscape blurs into a quiet ambient hum — like hearing Earth from space.

The transition is **gradual, not abrupt**. There is no hard switch; proximity smoothly modulates all volume outputs.

---

## 7. Milestone Deliverable: 5 Ambient WAV Loops

The concrete deliverable for this milestone is **5 ambient WAV files**, one per audio bus, authored in Ableton Live:

| File        | Bus   | Sonic character                                                                         |
| ----------- | ----- | --------------------------------------------------------------------------------------- |
| `tree.wav`  | Tree  | Rainforest ambience — organic textures, humid atmosphere, layered natural drones        |
| `crop.wav`  | Crop  | Agricultural/pastoral ambience — open field, wind, gentle organic texture               |
| `urban.wav` | Urban | City ambience — low-frequency mechanical drone, distant traffic texture, industrial hum |
| `bare.wav`  | Bare  | Desert/arid ambience — wind synthesis, dry air, sparse sand particle texture            |
| `water.wav` | Water | Ocean ambience — deep water movement, wave texture, subaquatic resonance                |

### Audio specifications

- Format: WAV, 44100 Hz or 48000 Hz, stereo
- Duration: 1–2 minutes, seamlessly loopable
- Placed in `sonification/samples/ambience/`

### Max patch wiring

Each bus gets a `buffer~` → `play~` loop playback chain, with gain controlled by the corresponding bus output from the crossfade controller. The 5 loops play simultaneously; their relative volumes shift in real time as the user pans the map.

### End-to-end experience

Pan the map from the Amazon rainforest to the Sahara desert → hear the tree loop fade out and the bare loop fade in. Zoom out to satellite view → everything fades to a quiet wash. Pan over the Pacific Ocean → ocean ambience rises. Zoom into Tokyo → urban drone emerges.

---

## 8. Full Vision and Future Goals

The following capabilities are part of the project's long-term vision. The infrastructure for each is already built; they will be realized in future milestones.

- **Auditory icon layer**: short iconic samples (bird calls, car horns, wind gusts) triggered probabilistically by `icon_trigger.js` based on land cover composition and proximity. The trigger script is implemented; samples need to be authored and wired into the Max patch.
- **Granulator integration**: 4-voice granular texture processing via `granulator.js` for adding ambient depth to the base layer or creating distant-view wash effects. The module is implemented; Max patch wiring is pending.
- **Per-grid spatial panning**: when zoomed in far enough, position individual grid cell voices in the stereo field using `/grid/pos` coordinates. The server already computes and sends normalized viewport-relative positions; the Max-side spatialization has not yet been built.

---

## 9. Current OSC Message Reference

### Viewport-level (every update)

| Address              | Args         | Range                         | Description                                 |
| -------------------- | ------------ | ----------------------------- | ------------------------------------------- |
| `/mode`              | 1 string     | `"aggregated"` / `"per-grid"` | Current server mode                         |
| `/proximity`         | 1 float      | 0–1                           | Zoom proximity (0 = far, 1 = close)         |
| `/delta/lc`          | 11 floats    | each typically -1 to +1       | Per-class land cover change                 |
| `/landcover`         | 1 int        | 10–100                        | Dominant ESA WorldCover class               |
| `/nightlight`        | 1 float      | 0–1                           | Normalized VIIRS nightlight                 |
| `/population`        | 1 float      | 0–1                           | Normalized population density               |
| `/forest`            | 1 float      | 0–1                           | Forest fraction (land-area denominator)     |
| `/lc/10` … `/lc/100` | 1 float each | 0–1                           | Per-class land cover fraction (11 messages) |
| `/coverage`          | 1 float      | 0–1                           | Land data coverage ratio                    |

### Per-grid mode (additional, when zoomed in)

| Address       | Args      | Description                                                   |
| ------------- | --------- | ------------------------------------------------------------- |
| `/grid/count` | 1 int     | Number of grid cells in viewport                              |
| `/viewport`   | 4 floats  | Bounding box: west, south, east, north                        |
| `/grid`       | 6 args    | Per-cell: lon, lat, landcover, nightlight, population, forest |
| `/grid/pos`   | 2 floats  | Per-cell viewport-relative position (x, y)                    |
| `/grid/lc`    | 11 floats | Per-cell land cover distribution                              |

---

## 10. Project File Structure

```
geo-sonification/
├── server/
│   ├── index.js              # Entry point, HTTP/WS routes, processViewport()
│   ├── osc.js                # OSC client — sends all messages to Max
│   ├── osc_schema.js         # Shared OSC addresses, class order, packet builders
│   ├── osc-metrics.js        # Pure computation: proximity, delta
│   ├── delta-state.js        # Per-client delta state management
│   ├── mode-manager.js       # Aggregated ↔ per-grid hysteresis
│   ├── spatial.js            # Spatial index, viewport queries, aggregation
│   ├── normalize.js          # p1/p99 normalization for nightlight/pop/forest
│   ├── landcover.js          # ESA class utilities, cell LC distribution
│   ├── data-loader.js        # CSV loading and caching
│   ├── config.js             # All configurable parameters with env var overrides
│   └── __tests__/            # Jest test suite (94 tests)
├── scripts/
│   └── osc_simulator.js      # Standalone OSC simulator (6 scenarios)
├── sonification/
│   ├── max_wav_osc.maxpat    # Main Max patch — data routing + 5-bus fold-mapping
│   ├── crossfade_controller.js   # 11-channel EMA crossfade (Max js)
│   ├── icon_trigger.js       # Probabilistic icon triggering (Max js)
│   ├── water_bus.js          # 3-level ocean detection (Max js)
│   ├── granulator.js         # 4-voice granular synthesis (Max js)
│   └── samples/
│       ├── ambience/         # ← 5 WAV loops go here
│       └── icons/            # Future: icon samples per land cover type
│           ├── tree/
│           ├── crop/
│           ├── urban/
│           ├── bare/
│           └── water/
├── frontend/
│   └── app.js                # Mapbox map with color-coded grid overlay
├── csv/                      # GEE-exported grid data (0.5° resolution)
├── docs/
│   ├── 2026-01-30-sonification-milestone-proposal.md   # Milestone 1
│   └── milestone-2-proposal.md                         # This document
├── README.md
└── DEVLOG.md
```

---

## 11. Success Criteria

1. **Audible differentiation**: users can clearly hear different ambient textures when panning between forest, city, desert, ocean, and farmland regions
2. **Smooth crossfades**: transitions between land cover types are gradual and musical, with no abrupt jumps or clicks
3. **Proximity attenuation**: zooming out produces a smooth fade toward silence; zooming in brings the soundscape back
4. **Ocean detection**: panning over open ocean produces water ambience even though no grid data exists there
5. **End-to-end demo**: a 2–4 minute screen recording demonstrating exploration of several contrasting regions (e.g. Amazon → Atlantic → Sahara → European city → Pacific Ocean)

---

## 12. Risks and Mitigation

| Risk                                         | Mitigation                                                                                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Ambient loops sound monotonous over time** | Design loops with internal variation (evolving textures, subtle modulation). Keep loops at 1–2 minutes to maximize variety before repetition.                |
| **Crossfade transitions feel unnatural**     | EMA smoothing (500 ms time constant) prevents sudden jumps. Tune smoothing constant if transitions feel too sluggish or too abrupt.                          |
| **Volume balance between buses is uneven**   | Normalize all WAV files to similar perceived loudness (LUFS). Fine-tune bus gain multipliers in Max.                                                         |
| **Ocean regions feel empty**                 | Water bus provides a dedicated ambient loop even over open ocean (coverage-based detection). Three-level quantization (ocean / coastal / land) adds variety. |
| **Latency or jitter during fast panning**    | Server-side smoothing + Max-side EMA prevent audible artifacts. OSC simulator's `abrupt-switch` scenario tests worst-case behavior.                          |
