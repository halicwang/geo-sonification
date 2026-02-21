# Engineering Migration Plan: Open Platform Refactor

**Author:** Zixiao Wang (Halic)
**Date:** February 21, 2026
**Based on:** OPEN-PLATFORM-SPEC.md — file-level change list and phase breakdown. Each phase preserves existing demo functionality on completion.
**Product motivation:** See OPEN-PLATFORM-SPEC.md "Motivation and Use Cases" for target scenarios (air quality monitoring, wildfire alerting, etc.) and platform value proposition.

---

## 1. Current Coupling Analysis

The following locations in the existing codebase hardcode WorldCover's 11 classes or the 0.5-degree grid:

| File | Coupling Point | Severity |
| ---- | -------------- | -------- |
| `server/osc_schema.js` | `LC_CLASS_ORDER = [10,20,...,100]`, `/lc/10` through `/lc/100` addresses | High — core of the OSC protocol |
| `server/types.js` | `GridCell` typedef hardcodes `lc_pct_10` through `lc_pct_100` | Medium — type annotations only |
| `server/config.js` | `GRID_SIZE = 0.5`, `LON_BUCKETS` / `LAT_BUCKETS` | High — spatial index foundation |
| `server/landcover.js` | ESA class metadata (names, colors, normalization) | High — but can become adapter-internal |
| `server/data-loader.js` | CSV parsing, `grid_id` generation, field mapping | High — refactor into worldcover adapter |
| `server/spatial.js` | Spatial index and viewport queries based on `lon_buckets` / `lat_buckets` | High — needs H3 enumeration replacement |
| `server/normalize.js` | p1/p99 percentile normalization | Low — logic is generic, just needs an interface |
| `server/osc.js` | `sendAggregatedToMax()`, `sendGridsToMax()` hardcode 11 channels | High — needs registry-driven channel dispatch |
| `server/osc-metrics.js` | `proximity`, `delta` computation | Low — already generic math |
| `server/delta-state.js` | Delta computation for 11 channels | Medium — needs dynamic channel count |
| `server/index.js` | Routing, viewport processing pipeline | Medium — pipeline unchanged, internal calls change |
| `frontend/config.js` | State structure | Low |
| `frontend/landcover.js` | ESA class color/name lookup | Medium — needs dynamic metadata from server |
| `frontend/map.js` | 0.5-degree grid overlay rendering | High — needs H3 hexagon replacement |
| `sonification/crossfade_controller.js` | 12 inlets (11 channels + proximity) | Medium — Max JS, inlet count hardcoded |
| `sonification/icon_trigger.js` | `ACTIVE_CLASSES` hardcoded | Low — make config-driven |
| `sonification/max_wav_osc.maxpat` | Route and fold-mapping wiring | High — but unchanged in Phase 1 |

---

## 2. Phase 0: Foundation Layer Extraction (Zero Impact on Existing Functionality)

**Goal:** Add H3 encoding alongside the existing system, running in parallel.

> **Note:** The `CellEncoder` interface (`cell-encoder.js`) is optional at implementation time. If YAGNI is preferred, implement `h3-encoder.js` directly and extract the abstraction later when a second encoder is needed. The effort estimate below includes `cell-encoder.js` (~40 lines) since the cost is low and it provides a clearer contract for downstream phases.

### 2.1 New Files

```
server/
├── grid/
│   ├── cell-encoder.js         # CellEncoder interface definition (JSDoc)
│   ├── h3-encoder.js           # H3 implementation: encode, decode, parent, neighbors, enumerateBounds
│   └── __tests__/
│       └── h3-encoder.test.js
```

### 2.2 New Dependency

```
h3-js  (npm install h3-js)
```

Requires approval per CLAUDE.md ("Do not introduce new npm dependencies without explicit approval"). `h3-js` is a pure JS/WASM implementation with no native compilation dependencies, approximately 1.2 MB.

### 2.3 Modified Files

| File | Change | Notes |
| ---- | ------ | ----- |
| `server/config.js` | Add `DEFAULT_H3_RESOLUTION = 4` | Coexists with existing `GRID_SIZE` |
| `server/types.js` | Add `DataRecord`, `ChannelManifest`, `CellEncoder` typedefs | No impact on existing types |
| `server/package.json` | Add `h3-js` dependency | — |

### 2.4 Effort Estimate

- `h3-encoder.js`: ~100 lines (encode/decode/parent/neighbors/enumerateBounds, mostly delegated to h3-js)
- `cell-encoder.js`: ~40 lines (interface documentation + factory function)
- Tests: ~120 lines (encode round-trip, viewport enumeration, neighbors, cross-resolution, coordinate order regression — verify `polygonToCells()` uses `[lon, lat]` and `latLngToCell()` uses `(lat, lon)` to catch h3-js version-specific convention changes)
- config/types changes: ~30 lines
- **Total: ~290 lines of new code, ~30 lines of config/types changes (no runtime logic modified)**

---

## 3. Phase 1: Data Adapter Pattern and Channel Registry

**Goal:** Refactor the existing WorldCover pipeline into the first "adapter," introduce a channel registry, and keep OSC output backward-compatible.

### 3.1 New Files

```
server/
├── adapters/
│   ├── adapter-interface.js    # Adapter interface JSDoc + validation utilities
│   ├── worldcover.js           # WorldCover adapter (refactored from data-loader + landcover)
│   └── csv-generic.js          # Generic CSV adapter (lat/lon + arbitrary columns)
├── channel-registry.js         # Channel registry: namespaced keys (sourceId.channelName), index assignment, bus mapping
├── __tests__/
│   ├── worldcover-adapter.test.js
│   ├── csv-generic-adapter.test.js
│   └── channel-registry.test.js
scripts/
├── validate-h3-migration.js    # One-time script: compare old spatial query results against H3 query results
```

### 3.2 Modified Files

| File | Change | Impact |
| ---- | ------ | ------ |
| `server/data-loader.js` | Internal logic migrated to `adapters/worldcover.js`; this file becomes a thin wrapper calling the adapter | External interface unchanged |
| `server/landcover.js` | ESA metadata migrated to `adapters/worldcover.js`; this file retains lookup functions needed by the frontend | Frontend API unchanged |
| `server/osc_schema.js` | Add `/ch/register` (with optional `group` arg) and `/ch/{index}` addresses; retain all existing `/lc/*` addresses | Backward-compatible |
| `server/osc.js` | `sendAggregatedToMax()` reads channel list from registry; sends both `/lc/*` (compat) and `/ch/*` (new) | Max requires no changes |
| `server/delta-state.js` | Channel count changes from hardcoded 11 to registry-driven | Internal change |
| `server/spatial.js` | Add `queryByH3(bounds, resolution)` method alongside existing `queryByBounds()` | Gradual replacement |
| `server/index.js` | Load adapters and initialize registry at startup; route handlers call registry | Pipeline unchanged |

### 3.3 Key Design Constraints

- **The WorldCover adapter must produce OSC data identical to the current output** — including `/lc/10`–`/lc/100`, `/nightlight`, `/population`, and `/forest` — enforced by regression tests.
- The generic CSV adapter at this stage only needs to import data and expose channels; full audio mapping is not required.
- When only WorldCover is loaded, the channel registry behaves identically to the hardcoded 11-class system.

### 3.4 Additional Considerations

**`spatial.js` refactor complexity.** The current `lon_buckets / lat_buckets` bucket-based spatial index and the H3 `Map<cellId, DataRecord>` lookup are fundamentally different data structures. Adding `queryByH3()` is not simply adding a method — it requires building a parallel index structure (H3 cell ID → data mapping). Estimate `spatial.js` changes separately from other modifications; the actual modified line count is likely higher than the overall ~200 line estimate suggests.

**Data re-indexing step.** Migrating from 0.5-degree grid IDs to H3 cell IDs requires all CSV data to be re-processed. This should be an explicit step in Phase 1:
1. The WorldCover adapter's `ingest()` reads the raw CSV and encodes each row to an H3 cell ID.
2. The re-indexed data is written to `data/cache/` (which is `.gitignore`-d and auto-rebuilt).
3. During the transition period, `GridCell` retains both `grid_id` (legacy) and `cellId` (H3) so downstream consumers can migrate incrementally.
4. A one-time validation script compares old spatial query results against new H3 query results to confirm data integrity.

**Dual-value DataRecord (`channelsRaw` + `channels`).** Per OPEN-PLATFORM-SPEC.md §3.1, each DataRecord stores both raw source values (`channelsRaw`) and normalized 0–1 values (`channels`). Adapters must populate both fields at ingest time:
- **WorldCover adapter:** raw values are already 0–1 fractions, so `channelsRaw === channels` — zero overhead.
- **csv-generic adapter:** `channelsRaw` stores the original CSV values; `channels` is computed using the ChannelManifest's normalization method and range (inferred from data or declared by user in the import wizard).
- **Resolution field:** Each DataRecord includes a `resolution` field recording the H3 resolution at which it was encoded. This enables cross-resolution queries (see OPEN-PLATFORM-SPEC.md §4.3).

### 3.5 Non-Functional Requirements (Phase 1 Scope)

Phase 1 introduces the adapter framework, and Phase 1.5 adds `POST /api/import`. Resource governance hooks should be wired in from the start:

- **`import-manager.js`:** Enforce file size, row count, and column count limits (configurable in `config.js`) before parsing begins.
- **`channel-registry.js`:** Enforce a maximum channel count per adapter and globally, preventing a single malformed CSV from registering hundreds of channels.

Authentication, observability, and supply chain concerns are out of scope for Phase 1. See OPEN-PLATFORM-SPEC.md §9 for the full non-functional requirements roadmap.

### 3.6 Effort Estimate

- Adapter framework + WorldCover adapter: ~300 lines
- csv-generic adapter: ~150 lines
- Channel registry: ~200 lines (includes namespace key generation and bare-name reverse lookup for backward-compat OSC)
- Tests: ~250 lines
- Existing file modifications: ~200 lines (primarily splitting and thin wrappers)
- H3 migration validation script (`scripts/validate-h3-migration.js`): ~60 lines
- **Total: ~1160 lines, of which ~960 new and ~200 modified**

---

## 4. Phase 1.5: Runtime Data Import (Upload CSV, Render Immediately)

**Goal:** Allow third-party data to be imported without restarting the server — uploading a CSV immediately ingests it into the spatial index, and the frontend (once Phase 2 is complete) renders new hexagonal grids in real time. The import pipeline includes a preview/validation step so that data quality issues are caught *before* data enters the system, not after.

### 4.1 Why This Phase Is Needed

Phase 1's `csv-generic` adapter only solves "how to parse arbitrary CSVs," but assumes data already exists in the `data/raw/` directory at startup. For the "vendor imports their own CSV" use case, a runtime import pipeline is required:

```
Vendor uploads CSV ──→ POST /api/import ──→ csv-generic adapter parses
    ──→ H3 encoding ──→ spatial index append ──→ channel registry update
    ──→ WebSocket notifies frontend to refresh ──→ frontend renders new hexagons
```

### 4.2 Key Design Decisions

**Multi-source channel merge strategy:** The same H3 cell may simultaneously contain WorldCover data and vendor CSV data. The two channel sets remain independent and do not overwrite each other. For example:

```js
// Merged result for cell "85283473fffffff"
{
  "cellId": "85283473fffffff",
  "channels": {
    // From worldcover adapter
    "worldcover.tree": 0.42, "worldcover.urban": 0.15, "worldcover.bare": 0.03,
    // From vendor-uploaded air_quality.csv
    "air_quality.pm25": 0.65, "air_quality.temperature": 0.38
  }
}
```

Channel names are automatically namespaced by source: the internal key is `sourceId.channelName` (see OPEN-PLATFORM-SPEC.md §6.2). When a user uploads `air_quality.csv`, its columns become `air_quality.pm25`, `air_quality.temperature`, etc. This eliminates same-name collisions structurally — no reject-and-rename workflow needed. The only remaining conflict case is uploading a file with the **same source ID** as an existing import (e.g., re-uploading `air_quality.csv`), which **replaces** the previous import for that source (with a confirmation warning in the API response).

**Data persistence:** Uploaded CSVs are saved to the `data/imports/` directory, with metadata recorded in `data/imports/manifest.json` (filename, adapter ID, import timestamp, resolution). On server restart, all previously imported data is automatically reloaded.

### 4.3 New Dependency

`multer` or `busboy` (multipart/form-data parsing). Express does not natively handle `multipart/form-data`. Requires approval per CLAUDE.md. Recommended: `multer` (~50 KB, widely used, Express-native middleware).

### 4.4 New Files

```
server/
├── import-manager.js               # Runtime import pipeline: preview, validate, confirm, encode, inject, notify
├── import-validator.js              # CSV validation: column detection, type checks, coordinate sanity, range inference
├── __tests__/
│   ├── import-manager.test.js
│   └── import-validator.test.js
frontend/
├── import.html                      # Import wizard page (upload → review → adjust → confirm)
├── import.js                        # Wizard logic (calls preview/confirm API, renders preview report)
data/
├── imports/                         # Uploaded data file storage directory
│   └── manifest.json                # Import metadata record
```

### 4.5 Modified Files

> Note: `server/package.json` also needs updating to add the `multer` (or `busboy`) dependency.

| File | Change | Notes |
| ---- | ------ | ----- |
| `server/index.js` | Add `POST /api/import/preview` and `POST /api/import/confirm` endpoints; serve `/import` wizard page; scan `data/imports/manifest.json` on startup to reload | New routes |
| `server/config.js` | Add `H3_RESOLUTION_LABELS` constant (human-readable scale labels per resolution) | Used by preview API and wizard |
| `server/spatial.js` | Add `addCells(records)` method to support runtime data append to spatial index | Existing `Map` structure naturally supports append; primarily interface wrapping |
| `server/channel-registry.js` | Add `registerRuntime(adapter)` method to support runtime channel addition; trigger WebSocket notification | Extends Phase 1 registry |
| `server/osc_schema.js` | Add `/ch/reload` message address (notifies Max that the channel list has changed) | Backward-compatible |

### 4.6 API Design: Two-Step Import (Preview → Confirm)

The import pipeline is split into two API calls to prevent silent data corruption. Step 1 analyzes the file and returns a preview report; Step 2 commits with (optionally adjusted) parameters. See OPEN-PLATFORM-SPEC.md §5.7 for the full validation specification.

**Step 1 — Preview:**

```
POST /api/import/preview
Content-Type: multipart/form-data

Parameters:
  file:        CSV file (required)
  resolution:  H3 resolution, defaults to DEFAULT_H3_RESOLUTION (optional)

Response (200):
{
  "status": "preview",
  "previewId": "abc123",              // Temporary ID to reference this preview in Step 2
  "source": "air_quality",            // Derived from filename
  "totalRows": 5420,
  "columnMapping": {                  // Auto-detected column roles (user can override in Step 2)
    "latitude":  { "role": "lat" },
    "longitude": { "role": "lon" },
    "pm25":      { "role": "channel", "unit": null, "normalization": "linear", "range": [2.1, 487.3] },
    "temp_c":    { "role": "channel", "unit": null, "normalization": "linear", "range": [-12.5, 41.2] },
    "station_id": { "role": "ignore", "reason": "non-numeric" }
  },
  "resolution": { "value": 4, "label": "Metro area (~23 km edge, ~1,770 km²)" },
  "cellCount": 1247,                  // Unique H3 cells generated
  "rowsPerCell": { "min": 1, "mean": 4.3, "max": 38 },
  "warnings": [                       // Non-fatal issues
    { "type": "missing_values", "column": "pm25", "count": 12, "action": "excluded from aggregation" },
    { "type": "empty_rows", "count": 3, "action": "skipped" },
    { "type": "resolution_mismatch", "message": "Existing data sources use res 4; importing at res 5 will require cross-resolution queries (see spec §4.3)" }
  ],
  "errors": []                        // Fatal issues — if non-empty, Step 2 will reject
}

Response (400):
{
  "status": "error",
  "message": "CSV must contain 'lat' and 'lon' (or 'latitude' and 'longitude') columns"
}
```

**Step 2 — Confirm:**

```
POST /api/import/confirm
Content-Type: application/json

Parameters:
{
  "previewId": "abc123",
  "columnMapping": { ... },           // Optional: override auto-detected mappings
  "resolution": 5,                    // Optional: override resolution from preview
  "aggregate": "mean"                 // Optional: aggregation operator (default "mean")
}

Response (200):
{
  "status": "ok",
  "source": "air_quality",
  "channels": ["air_quality.pm25", "air_quality.temp_c"],
  "cellCount": 1247,
  "resolution": 5,
  "warnings": []
}
```

The preview file is kept in a temporary upload area and deleted after confirmation (or after a timeout, default 30 minutes). The two-step pattern also works headlessly — automated pipelines can call preview, check for zero errors, and immediately call confirm without user interaction.

### 4.7 Import Wizard (Minimal Frontend)

The backend two-step API is usable via `curl`, but for the "vendor drops in a CSV" use case, a minimal import wizard page (`/import`) is needed. This is deliberately scoped as a simple, functional page — not the full Phase 3 console.

**Wizard flow:**

1. **Upload**: drag-and-drop or file picker → calls `POST /api/import/preview`
2. **Review**: displays the preview report — detected columns with role badges (lat/lon/channel/ignore), warnings highlighted in yellow, errors in red, resolution selector with human-readable scale labels (see OPEN-PLATFORM-SPEC.md §4.3)
3. **Adjust** (optional): user can reassign column roles (dropdown: lat / lon / channel / ignore), set normalization method per channel (linear / log / percentile), override value range
4. **Confirm**: calls `POST /api/import/confirm` → success message with channel count and cell count

**Implementation scope:** Plain HTML + vanilla JS (consistent with the project's no-build-tool frontend). Approximately one HTML page + one JS file. The wizard is intentionally minimal — no drag-and-drop bus mapping, no audio preview. Those belong in the Phase 3 console.

### 4.8 Complete Import Flow

1. User opens `/import` wizard (or calls API directly)
2. File uploaded via `POST /api/import/preview`
3. Server parses first N rows (default: all, cap at resource limits), auto-detects column roles, runs validation checks
4. Preview report returned — user reviews warnings, adjusts column mapping and resolution if needed
5. User confirms via `POST /api/import/confirm` (or API caller posts confirm with overrides)
6. Server re-parses full file with confirmed settings; each row's `(lat, lon)` encoded to `cellId` via `H3Encoder`
7. Multiple rows within the same `cellId` merged using the aggregation operator
8. Generated `DataRecord`s appended to the spatial index
9. New channels registered in the channel registry
10. CSV file saved to `data/imports/`; metadata written to `manifest.json`
11. A `channel_update` event sent to all connected frontends via WebSocket
12. `/ch/register` and `/ch/reload` sent to Max via OSC
13. Frontend receives notification, re-requests `/api/config` for the latest channel list, and refreshes rendering

### 4.9 Effort Estimate

- `import-manager.js` (two-step pipeline: preview state management + confirm + persistence + reload): ~250 lines
- `import-validator.js` (column detection, type checks, coordinate sanity, range inference): ~180 lines
- `POST /api/import/preview` + `POST /api/import/confirm` endpoints + multipart handling: ~120 lines
- `import.html` + `import.js` (import wizard frontend): ~200 lines
- `spatial.js` runtime append method: ~60 lines
- `channel-registry.js` runtime update + notification: ~50 lines
- Tests (import-manager + import-validator): ~200 lines
- **Total: ~1060 lines, of which ~920 new and ~140 modified**

---

## 5. Phase 2: Frontend Decoupling and H3 Hexagonal Grid Display

**Goal:** Switch the frontend from hardcoded 0.5-degree grid rendering to H3 hexagonal display, with channel metadata fetched dynamically from the server.

### 5.1 Modified Files

| File | Change | Notes |
| ---- | ------ | ----- |
| `frontend/config.js` | Fetch channel metadata (names, colors, ranges) from `/api/config` | Replaces hardcoded ESA classes |
| `frontend/landcover.js` | Rename to `frontend/channels.js`; lookup functions read from dynamic metadata | Generalized |
| `frontend/map.js` | Grid overlay changes from 0.5-degree rectangles to H3 hexagonal polygons (via `cellToBoundary()` to GeoJSON) | Largest frontend change |
| `frontend/ui.js` | Panel display changes from "landcover breakdown" to "channel breakdown" | Data-driven |
| `server/index.js` | `/api/config` response adds a `channels` field | Additive change |

### 5.2 New Files

```
frontend/
├── channels.js        # Generic channel metadata lookup (replaces landcover.js)
├── h3-utils.js        # Frontend H3 utilities (viewport → hex enumeration, boundary → GeoJSON polygon)
```

### 5.3 Frontend H3 Strategy

**Default approach: server-computed.** The server exposes a `/api/h3` endpoint that returns pre-computed hexagonal boundaries as GeoJSON polygons. The frontend receives ready-to-render geometry with zero additional dependencies. This is the recommended path because:

- Zero frontend dependency — no 1.2 MB WASM download, no CDN reliance
- Compatible with enterprise/air-gapped networks that block external CDN links (see OPEN-PLATFORM-SPEC.md §9.3)
- Consistent with the project's "no build tools" frontend philosophy
- H3 computation is fast (~ms for typical viewport cell counts) and already runs server-side

**Dev-mode alternative:** For local development where minimizing server round-trips is useful, `h3-js` can be vendored to `frontend/vendor/h3-js.min.js` and served from the same origin. External CDN (`unpkg.com`) is not used in any deployment configuration.

### 5.4 Effort Estimate

- `map.js` grid rewrite: ~250 lines of changes (hexagonal polygon rendering is slightly more involved than rectangles)
- `channels.js`: ~80 lines
- `h3-utils.js`: ~50 lines
- Other frontend modifications: ~100 lines
- **Total: ~480 lines**

---

## 5b. Phase 2.5: KML/GPX Import Adapters

**Goal:** Add KML and GPX import support via the adapter framework, enabling interoperability with Fog of World, Google Earth, Strava, and other track-based ecosystems. This is critical for the "open platform" narrative — KML/GPX are the most common geospatial exchange formats outside of CSV.

### 5b.1 Scope and Constraints

- **KML:** Extract coordinates from `<Point>`, `<LineString>`, and `<Polygon>` elements. KML stores coordinates as `lon,lat,alt` tuples (WGS84 natively — no CRS conversion needed). Style elements (`<Style>`, `<IconStyle>`) are ignored. Only `<Placemark>` features with geometry are processed.
- **GPX:** Extract coordinates from `<wpt>` (waypoint), `<trkpt>` (track point), and `<rtept>` (route point) elements. GPX uses `lat`/`lon` attributes (WGS84 natively).
- Both formats produce `DataRecord[]` with H3-encoded cells, feeding into the same spatial index and channel registry as CSV imports.
- KML `<ExtendedData>` and GPX `<extensions>` fields with numeric values are auto-registered as channels (same logic as CSV's "remaining numeric columns" rule).

### 5b.2 New Dependency

A lightweight XML parser is needed. Recommended: `fast-xml-parser` (~40 KB, zero dependencies, widely used). Requires approval per CLAUDE.md.

### 5b.3 New Files

```
server/
├── adapters/
│   ├── kml.js                  # KML adapter: parse XML → extract coordinates + data → DataRecord[]
│   └── gpx.js                  # GPX adapter: parse XML → extract coordinates + data → DataRecord[]
├── __tests__/
│   ├── kml-adapter.test.js
│   └── gpx-adapter.test.js
```

### 5b.4 Modified Files

| File | Change | Notes |
| ---- | ------ | ----- |
| `server/import-manager.js` | Accept `.kml` and `.gpx` file extensions; route to appropriate adapter | Extends Phase 1.5 import pipeline |
| `server/index.js` | Register KML and GPX adapters at startup | Additive |
| `server/package.json` | Add `fast-xml-parser` dependency | — |

### 5b.5 Effort Estimate

- `kml.js` (XML parse + coordinate extraction + data mapping): ~120 lines
- `gpx.js` (XML parse + coordinate extraction + data mapping): ~100 lines
- Tests: ~120 lines
- Existing file modifications: ~40 lines
- **Total: ~380 lines, of which ~340 new and ~40 modified**

---

## 6. Phase 3: Configurable Audio Mapping and Web Console

**Goal:** Move audio mapping from hardcoded Max patch wiring to a configuration file, and provide a web console for real-time adjustment.

### 6.1 New Files

```
server/
├── audio-mapping.js            # Load + validate audio_mapping.json
├── audio-mapping.json          # Default configuration (5 buses + existing fold-mapping)
frontend/
├── console.html                # Console page
├── console.js                  # Console logic
```

### 6.2 Modified Files

| File | Change |
| ---- | ------ |
| `server/osc.js` | Fold-mapping logic moves from Max patch to server-side (optional; alternatively keep Max-side but use config messages) |
| `server/index.js` | Add `/console` route and WebSocket config push |
| `sonification/crossfade_controller.js` | Accept dynamic channel count (configurable inlet count) |

### 6.3 Effort Estimate

- Config loading + validation: ~150 lines
- Console frontend: ~400 lines
- OSC config messages: ~100 lines
- **Total: ~650 lines**

---

## 7. Phase 4: Real-time Data Stream Pipeline + USGS Earthquake + FIRMS Fire Integration

**Goal:** Build real-time data stream infrastructure with two live data sources — USGS Earthquake (global pull) and NASA FIRMS fire hotspots (AOI-scoped pull) — validating both the adapter plugin system and the streaming pipeline, including the AOI subscription strategy.

### 7.1 Why Combine "Second Data Source" and "Real-time Streaming"

The original plan treated USGS Earthquake as a static GeoJSON one-time import to validate the plugin system. But USGS Earthquake is inherently a continuously updating event stream (new earthquakes every minute) — making it static is an artificial downgrade. Building the stream pipeline and the second data source together validates two things in one pass: whether the adapter interface is truly generic, and whether the real-time pipeline is reliable.

> **Platform positioning:** This platform integrates and sonifies *authoritative, processed data feeds* — it does not perform raw signal processing or detection algorithms. For example, fire detection from satellite imagery (VIIRS/MODIS threshold algorithms, cloud masking, etc.) is the responsibility of upstream remote sensing pipelines. This platform consumes their outputs (e.g., NASA FIRMS hotspot feeds) and transforms them into auditory situational awareness. The same principle applies to all stream adapters: earthquakes come from USGS processed catalogs, air quality from sensor network APIs, etc.

### 7.2 Real-time Stream Architecture

```
┌─────────────────────────────┐
│    stream-scheduler.js      │  Manages poll cycles for all stream adapters
│    ┌──────────────────┐     │
│    │ USGS Adapter      │ ←── Poll every 60 seconds
│    │ (future: FIRMS,   │     │
│    │  OpenSky, ...)    │     │
│    └────────┬─────────┘     │
└─────────────┼───────────────┘
              ▼
┌─────────────────────────────┐
│    time-window.js           │  Maintains sliding time windows per cellId
│                             │  Aggregates events within window → current value
│    Window width: configurable│  Expired events auto-cleaned
│    Aggregation: count/mean/max│
└─────────────┬───────────────┘
              ▼
    Spatial index append/update (reuses Phase 1.5's addCells)
              ▼
    ┌─────────┴──────────┐
    ▼                    ▼
  OSC push             WebSocket notify frontend
  (data-change driven) (cell data update event)
```

### 7.3 Two OSC Push Trigger Sources

Before Phase 4, OSC push only fires when the user drags the map. Phase 4 adds a second trigger source:

| Trigger Source | When | Behavior |
| -------------- | ---- | -------- |
| User interaction (existing) | Frontend sends viewport update | Query all data in current viewport, push to Max |
| Data change (new) | Stream adapter fetches new data | Check if new data falls within current viewport; if so, push incremental update to Max |

Data-change-triggered pushes only send affected channel values (incremental), avoiding full viewport re-push. This prevents OSC flooding from high-frequency data sources.

**Per-client viewport caching:** To support data-change push, the server must cache each WebSocket client's current viewport (`lastViewport`). When new stream data arrives, each client's `lastViewport` is checked to determine whether an incremental push is needed. This is a new per-connection state requirement — add a `lastViewport` field to the existing per-client state (alongside `createDeltaState()` etc.).

**AOI / subscription strategy (see OPEN-PLATFORM-SPEC.md §5.4):** Stream adapters with `aoiStrategy: "global"` (e.g., USGS earthquakes) fetch all events regardless of client viewports — the scheduler runs one poll cycle per interval. Stream adapters with `aoiStrategy: "aoi"` (e.g., NASA FIRMS) only fetch data within the union bounding box of all connected clients' viewports. The `aoi-manager.js` module tracks per-client viewports (updated on each WebSocket viewport message), computes the merged AOI with a configurable expansion margin (`AOI_MARGIN_DEG`), and debounces AOI changes (`AOI_DEBOUNCE_SEC`) to avoid thrashing the upstream API. When no clients are connected, AOI-scoped adapters pause polling automatically.

### 7.4 Stream Adapter Interface (extends Phase 1's DataAdapter)

```js
/**
 * @typedef {Object} StreamAdapter
 * @extends DataAdapter
 * @property {string} temporalType - Fixed to "stream"
 * @property {number} pollIntervalMs - Poll interval (milliseconds)
 * @property {number} windowMs - Time window width (milliseconds)
 * @property {string} windowAggregate - Window aggregation operator: "count" | "mean" | "max" | "last"
 * @property {(encoder: CellEncoder, precision: number) => Promise<DataRecord[]>} fetch
 *   Fetch latest data and return DataRecord array (replaces static adapter's ingest)
 */
```

### 7.5 USGS Earthquake Adapter

```js
// server/adapters/usgs-earthquake.js
module.exports = {
    id: 'usgs-earthquake',
    name: 'USGS Real-time Earthquakes',
    temporalType: 'stream',
    pollIntervalMs: 60_000,        // Poll every 60 seconds
    windowMs: 24 * 60 * 60_000,   // Retain last 24 hours of earthquakes
    windowAggregate: 'max',        // Within same cell, take max magnitude
    channels: [
        { name: 'quake_mag',   label: 'Earthquake Magnitude', range: [0, 10], unit: 'Mw',    normalization: 'linear' },
        { name: 'quake_depth', label: 'Earthquake Depth',     range: [0, 700], unit: 'km',   normalization: 'log' },
        { name: 'quake_count', label: 'Earthquake Count',     range: [0, 50], unit: 'count', normalization: 'linear' },
    ],
    async fetch(encoder, precision) {
        // GET https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson
        // Parse features → encode each feature to H3 cellId → return DataRecord[]
    },
};
```

USGS provides multiple feed granularities: `all_hour` (last 1 hour), `all_day` (last 24 hours), `significant_month` (last 30 days significant earthquakes). The adapter can select based on configuration.

### 7.6 NASA FIRMS Fire Hotspot Adapter (Second Stream Adapter)

NASA FIRMS provides near real-time active fire detections via a REST API that supports bounding-box spatial queries. Adding it as the second stream adapter validates that the streaming pipeline generalizes beyond USGS earthquakes — specifically, it exercises the AOI-scoped subscription strategy (see OPEN-PLATFORM-SPEC.md §5.4), since fire hotspot volumes globally (~300K detections/day) require spatial filtering.

```js
// server/adapters/firms-fire.js
module.exports = {
    id: 'firms-fire',
    name: 'NASA FIRMS Active Fire',
    temporalType: 'stream',
    aoiStrategy: 'aoi',
    pollIntervalMs: 10 * 60_000,       // 10 minutes (FIRMS NRT update cadence)
    windowMs: 24 * 60 * 60_000,        // Retain last 24 hours
    windowAggregate: 'max',
    channels: [
        { name: 'fire_count',     label: 'Active Fire Count',    range: [0, 100], unit: 'count', normalization: 'log',    group: 'metric' },
        { name: 'fire_intensity', label: 'Fire Radiative Power', range: [0, 500], unit: 'MW',    normalization: 'log',    group: 'metric' },
        { name: 'fire_newness',   label: 'Time Since Detection', range: [0, 1],   unit: 'ratio', normalization: 'linear', group: 'metric' },
    ],
    async fetch(encoder, precision, aoi) {
        // GET https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/VIIRS_SNPP_NRT/{aoi}/{dayRange}
        // Parse CSV response → for each hotspot:
        //   encode (latitude, longitude) → cellId
        //   fire_intensity = frp (fire radiative power, MW)
        //   fire_newness = 1 - (now - acq_datetime) / windowMs  (0 = oldest in window, 1 = just detected)
        //   fire_count accumulated during aggregation step
    },
};
```

**Why FIRMS as the second adapter (not first):** USGS earthquakes are simpler (global pull, lower volume, GeoJSON response). FIRMS introduces AOI-scoped fetching, CSV parsing, and higher event volumes — making it a good second-step validation of the streaming pipeline's flexibility.

**API key requirement:** FIRMS API requires a free MAP_KEY (obtainable at https://firms.modaps.eosdis.nasa.gov/api/area/). This is declared in `requiredConfig: { mapKey: 'string' }` and validated at adapter registration. The key is stored in `.env` (not committed).

**Alternative data source:** Copernicus EFFIS provides similar fire data for Europe. A future `effis-fire` adapter can reuse the same channel schema (`fire_count`, `fire_intensity`, `fire_newness`).

### 7.7 Sliding Time Window Design

```js
// time-window.js core data structure
// Each cellId maintains an event array, sorted by time

{
  "85283473fffffff": {
    events: [
      { timestamp: 1708500000000, channels: { quake_mag: 0.45, quake_depth: 0.12 } },
      { timestamp: 1708503600000, channels: { quake_mag: 0.72, quake_depth: 0.35 } },
    ],
    aggregated: { quake_mag: 0.72, quake_depth: 0.35, quake_count: 0.04 }
    //           ↑ max               ↑ max               ↑ count/range
  }
}

// On each new event arrival or window slide:
// 1. Delete expired events where timestamp < now - windowMs
// 2. Recompute aggregated values
// 3. If aggregated change > threshold, trigger incremental OSC push
```

**Memory safeguards:** Add `MAX_EVENTS_PER_CELL` (default: 1000) and `MAX_STREAM_CELLS` (default: 50000) configuration in `config.js`. When a cell exceeds `MAX_EVENTS_PER_CELL`, the oldest events are evicted regardless of window expiry. When total active cells exceed `MAX_STREAM_CELLS`, the least-recently-updated cells are evicted. These limits prevent unbounded memory growth from high-frequency or wide-window data sources.

### 7.8 New Files

```
server/
├── stream-scheduler.js              # Poll scheduler: manages lifecycle of multiple stream adapters
├── time-window.js                   # Sliding time window: event storage, expiry cleanup, aggregation
├── aoi-manager.js                   # AOI tracking: per-client viewport → merged bounding box for AOI-scoped adapters
├── adapters/
│   ├── usgs-earthquake.js           # USGS earthquake stream adapter
│   └── firms-fire.js                # NASA FIRMS fire hotspot stream adapter
├── __tests__/
│   ├── stream-scheduler.test.js
│   ├── time-window.test.js
│   ├── aoi-manager.test.js
│   ├── usgs-earthquake.test.js
│   └── firms-fire.test.js
```

### 7.9 Modified Files

| File | Change | Notes |
| ---- | ------ | ----- |
| `server/index.js` | Initialize `stream-scheduler` at startup; register stream adapters; add `GET /api/streams` status endpoint; store `lastViewport` per WebSocket connection (update on each viewport message) for data-change-driven incremental push | New startup logic + per-client state |
| `server/spatial.js` | `queryByH3()` results merge static data with time-window aggregated data | Query logic extension |
| `server/osc_schema.js` | Add `/adapter/error` address (adapter ID + error message); used by stream scheduler to notify Max of adapter failures | New address, backward-compatible |
| `server/osc.js` | Add `sendIncrementalUpdate()` — data-change-driven incremental OSC push; add `sendAdapterError()` for `/adapter/error` dispatch | New push paths |
| `server/config.js` | Add `STREAM_ENABLED`, `STREAM_CHANGE_THRESHOLD`, `MAX_EVENTS_PER_CELL`, `MAX_STREAM_CELLS`, `DEFAULT_AOI_STRATEGY`, `AOI_MARGIN_DEG`, `AOI_DEBOUNCE_SEC` | New config entries |

### 7.10 New API Endpoints

```
GET /api/streams
Response:
{
  "streams": [
    {
      "id": "usgs-earthquake",
      "name": "USGS Real-time Earthquakes",
      "status": "running",           // "running" | "paused" | "error"
      "pollIntervalMs": 60000,
      "lastFetch": "2026-02-21T15:30:00Z",
      "lastFetchCount": 12,          // Events fetched in last poll
      "windowMs": 86400000,
      "activeCells": 847             // Cells with data in current window
    }
  ]
}

POST /api/streams/:id/pause     # Pause polling
POST /api/streams/:id/resume    # Resume polling
```

### 7.11 Stream Scheduler Error Recovery

- **Transient failure** (network timeout, 5xx): exponential backoff starting at `pollIntervalMs`, capped at 5 minutes, up to `maxRetries` (default: 10) consecutive failures.
- **`maxRetries` exceeded:** adapter status transitions to `"error"`, polling stops, error is reported via `GET /api/streams` and logged. Manual `POST /api/streams/:id/resume` required to restart.
- **Permanent failure** (4xx, malformed response): log, set status `"error"`, stop polling.
- **Server startup with unreachable network:** stream adapters start in `"error"` status and retry on manual resume.
- All error states are visible via `GET /api/streams` (the `"error"` status already defined in §7.10).

### 7.12 Sound Mapping Suggestions (USGS Earthquake → Max)

| Channel | Suggested Mapping | Sound Effect |
| ------- | ----------------- | ------------ |
| `quake_mag` | Icon trigger intensity + probability | Higher magnitude → more frequent triggers, louder sound |
| `quake_depth` | Pitch / low-pass filter cutoff frequency | Shallow quake = high-pitched sharp, deep quake = muffled low-frequency |
| `quake_count` | Background texture density | Dense earthquake clusters = sustained granular texture |

These mappings can be freely adjusted by the user once Phase 3 (audio config console) is complete. During Phase 4, a hardwired demo in the Max patch is sufficient.

**Sound Mapping Suggestions (FIRMS Fire → Max):**

| Channel | Suggested Mapping | Sound Effect |
| ------- | ----------------- | ------------ |
| `fire_count` | Background texture density + urgency | More fires in cell = denser, more agitated granular texture |
| `fire_intensity` | Icon trigger intensity + filter brightness | Higher FRP = brighter, more piercing alert tone |
| `fire_newness` | Temporal envelope / attack sharpness | Fresh detection = sharp attack; aging detections = softer, sustained |

The fire adapter's channels are designed to drive both ambient background tension (tracking overall fire activity density) and discrete auditory icons (alerting to new high-intensity detections).

### 7.13 Effort Estimate

- `stream-scheduler.js` (scheduler + lifecycle management): ~150 lines
- `time-window.js` (sliding window + aggregation + expiry): ~180 lines
- `aoi-manager.js` (viewport tracking + AOI merge + debounce): ~100 lines
- `usgs-earthquake.js` (adapter + HTTP fetch + GeoJSON parsing): ~120 lines
- `firms-fire.js` (adapter + HTTP fetch + CSV parsing + AOI param): ~140 lines
- `osc.js` incremental push: ~80 lines
- Tests (five modules): ~350 lines
- Existing file modifications: ~120 lines
- **Total: ~1240 lines, of which ~1120 new and ~120 modified**

---

## 8. Total Engineering Effort Summary

| Phase | New Code | Modified Code | Risk | Prerequisites |
| ----- | -------- | ------------- | ---- | ------------- |
| 0: H3 Encoding Layer | ~290 lines | ~30 lines | Very low (pure addition) | None (requires `h3-js` dependency approval) |
| 1: Adapters + Registry | ~960 lines | ~200 lines | Medium (refactors core data flow) | Phase 0 |
| 1.5: Runtime Import + Import Wizard | ~920 lines | ~140 lines | Medium (runtime state mutation + validation logic) | Phase 1 |
| 2: Frontend Decoupling | ~380 lines | ~200 lines | Medium (grid rendering rewrite) | Phase 1 |
| 2.5: KML/GPX Import Adapters | ~340 lines | ~40 lines | Low (new adapters on existing framework) | Phase 1.5 (requires `fast-xml-parser` approval) |
| 3: Config + Console | ~650 lines | ~100 lines | Low (new feature) | Phase 1 |
| 4: Real-time Stream + USGS Earthquake + FIRMS Fire | ~1120 lines | ~120 lines | Medium (real-time state + external dependency + AOI management) | Phase 1 + Phase 1.5 |

**Total: ~4660 lines of new code, ~830 lines modified.**

Phases 1.5, 2, 2.5, and 3 can be worked on in parallel or in any order after their prerequisites. Phase 4 depends on Phase 1.5 (runtime spatial index append capability). Phase 2.5 depends on Phase 1.5 (import pipeline). **Phase 0 + Phase 1 is the critical path.**

**`spatial.js` modification ordering:** Phases 1, 1.5, and 4 all modify `spatial.js`. To avoid merge conflicts, apply changes in order: Phase 1 adds `queryByH3()`, Phase 1.5 adds `addCells()`, Phase 4 modifies `queryByH3()` to merge time-window data. Phase 2 does *not* modify `spatial.js` (frontend-only). If phases are developed on branches, rebase against `spatial.js` changes before merging.

**Shortest path to "vendor uploads CSV, frontend renders immediately":** Phase 0 → 1 → 1.5 → 2 (~3010 lines).

**Shortest path to "vendor uploads KML/GPX, frontend renders":** Phase 0 → 1 → 1.5 → 2 → 2.5 (~3390 lines).

**Shortest path to "real-time data stream driving sound":** Phase 0 → 1 → 1.5 → 4 (~3960 lines; frontend still uses old rendering, but OSC/sound updates in real time).

**All phases complete:** ~4660 lines new + ~830 lines modified.

---

## 9. Suggested Timeline (Aligned with Course Schedule)

- **This week:** Phase 0 — pure addition, changes only touch config and type definitions (no runtime logic modified), safe to run in parallel with the milestone demo.
- **After the next milestone:** Phase 1 — the largest refactor, requires comprehensive testing.
- **Immediately after Phase 1:** Phase 1.5 — runtime import pipeline, opens the data path for all subsequent phases.
- **Before end of course:** Phase 2 or Phase 4, depending on desired showcase:
  - **Choose Phase 2** → Showcase "hexagonal map + multi-source data visualization" (strong visual impact)
  - **Choose Phase 4** → Showcase "real-time earthquake data driving sound changes" (strong auditory impact)
  - If time permits, do both.
- **After the course ends:** Phase 3 — the console is a nice-to-have that does not affect core functionality.

### 9.1 Showcase Narratives

Two "closed-loop" demo paths, each self-contained and presentable on its own.

**Closed Loop A — "From Spreadsheet to Soundscape" (visual emphasis, Phases 0 → 1 → 1.5 → 2)**

- Demo flow: open import wizard → drag-drop a CSV → preview validates columns and resolution → confirm → hex grid appears on map → pan/zoom viewport → ambient sound changes in real time.
- Audience sees: hexagonal grid fills in, colors shift as the viewport moves across regions.
- Audience hears: tonal gradient reflecting data values across the viewport — smooth crossfades between zones.
- Core message: *"Any tabular geodata becomes an audible landscape in under a minute."*

**Closed Loop B — "Live Earthquake Alert" (auditory emphasis, Phases 0 → 1 → 1.5 → 4)**

- Demo flow: USGS adapter is running → earthquake event arrives → new cells appear on map → OSC message fires → alert sound triggers in Max.
- Audience sees: new hex cells pulse onto the map at the epicenter location.
- Audience hears: immediate percussive alert when magnitude crosses threshold, ambient low rumble conveying depth.
- Core message: *"You hear the earthquake before you see the dashboard notification."*

See §8 "Shortest path" calculations for the engineering effort behind each loop.
