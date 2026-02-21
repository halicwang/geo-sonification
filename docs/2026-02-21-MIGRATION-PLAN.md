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
| `sonification/crossfade_controller.js` | 12 inlets (11 channels + proximity) | High risk — 12 hardcoded inlets, `NUM_CHANNELS = 11`, ES5 engine. Dynamic channel count requires message-based protocol rewrite or full Max-side redesign — not a small change (see Future Work) |
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

## 3. Phase 1a: Adapter Pattern + Channel Registry (no spatial.js)

**Goal:** Refactor the existing WorldCover pipeline into the first "adapter," introduce a channel registry, and keep OSC output backward-compatible. This phase does NOT touch `spatial.js` — the existing `queryByBounds()` continues to work. Independently demoable: after Phase 1a, a second data source can be loaded and its channels registered, but viewport queries still use the legacy grid.

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
```

### 3.2 Modified Files

| File | Change | Impact |
| ---- | ------ | ------ |
| `server/data-loader.js` | Internal logic migrated to `adapters/worldcover.js`; this file becomes a thin wrapper calling the adapter | External interface unchanged |
| `server/landcover.js` | ESA metadata migrated to `adapters/worldcover.js`; this file retains lookup functions needed by the frontend | Frontend API unchanged |
| `server/osc_schema.js` | Add `/ch/register` (with optional `group` arg), `/ch/meta` (optional display metadata — see SPEC §6.3), and `/ch/{index}` addresses; retain all existing `/lc/*` addresses | Backward-compatible |
| `server/osc.js` | `sendAggregatedToMax()` reads channel list from registry; sends both `/lc/*` (compat) and `/ch/*` (new) | Max requires no changes |
| `server/delta-state.js` | Channel count changes from hardcoded 11 to registry-driven | Internal change |
| `server/index.js` | Load adapters and initialize registry at startup; route handlers call registry | Pipeline unchanged |

### 3.3 Key Design Constraints

- **The WorldCover adapter must produce OSC data identical to the current output** — including `/lc/10`–`/lc/100`, `/nightlight`, `/population`, and `/forest` — enforced by regression tests.
- The generic CSV adapter at this stage only needs to import data and expose channels; full audio mapping is not required.
- When only WorldCover is loaded, the channel registry behaves identically to the hardcoded 11-class system.

### 3.4 Additional Considerations

**Dual-value DataRecord (`channelsRaw` + `channels`).** Per OPEN-PLATFORM-SPEC.md §3.1, each DataRecord stores both raw source values (`channelsRaw`) and normalized 0–1 values (`channels`). Adapters must populate both fields at ingest time:
- **WorldCover adapter:** raw values are already 0–1 fractions, so `channelsRaw === channels` — zero overhead.
- **csv-generic adapter:** `channelsRaw` stores the original CSV values; `channels` is computed using the ChannelManifest's normalization method and range (inferred from data or declared by user).
- **Resolution field:** Each DataRecord includes a `resolution` field recording the H3 resolution at which it was encoded. This enables cross-resolution queries (see OPEN-PLATFORM-SPEC.md §4.3).

### 3.5 Non-Functional Requirements (Phase 1a Scope)

Phase 1a introduces the adapter framework, and Phase 1.5 adds `POST /api/import`. Resource governance hooks should be wired in from the start:

- **`import-manager.js`:** Enforce file size, row count, and column count limits (configurable in `config.js`) before parsing begins.
- **`channel-registry.js`:** Enforce a maximum channel count per adapter and globally, preventing a single malformed CSV from registering hundreds of channels.

Authentication, observability, and supply chain concerns are out of scope for Phase 1a. See OPEN-PLATFORM-SPEC.md §9 for the full non-functional requirements roadmap.

### 3.6 Effort Estimate

- Adapter framework + WorldCover adapter: ~300 lines
- csv-generic adapter: ~150 lines
- Channel registry: ~200 lines (includes namespace key generation and bare-name reverse lookup for backward-compat OSC)
- Tests: ~250 lines
- Existing file modifications: ~120 lines (primarily splitting and thin wrappers)
- **Total: ~1020 lines, of which ~900 new and ~120 modified**

---

## 3b. Phase 1b: spatial.js H3 Migration (High Risk)

**Goal:** Add `queryByH3()` alongside the existing `queryByBounds()` in `spatial.js`. This phase can be **deferred** if Phase 1a works and Phase 2 (frontend hexagonal rendering) is not needed for the demo. Phase 4 (streaming) does NOT require Phase 1b — the stream scheduler encodes H3 cell IDs directly.

> **Risk:** This is the highest-risk phase in the migration. The current `lon_buckets / lat_buckets` bucket-based spatial index and the H3 `Map<cellId, Map<sourceId, DataRecord>>` lookup are fundamentally different data structures. Adding `queryByH3()` is not simply adding a method — it requires building a parallel index structure (H3 cell ID → data mapping). The actual modified line count in `spatial.js` is likely higher than the estimate below suggests.

### 3b.1 New Files

```
scripts/
├── validate-h3-migration.js    # One-time script: compare old spatial query results against H3 query results
```

### 3b.2 Modified Files

| File | Change | Impact |
| ---- | ------ | ------ |
| `server/spatial.js` | Add `queryByH3(bounds, resolution)` method alongside existing `queryByBounds()`. Returns `CellSnapshot[]` (merged from multiple `DataRecord`s per cell — see SPEC §3.2). Internal index structure: `Map<cellId, Map<sourceId, DataRecord>>`. | Gradual replacement |

### 3b.3 Additional Considerations

**Data re-indexing step.** Migrating from 0.5-degree grid IDs to H3 cell IDs requires all CSV data to be re-processed. This should be an explicit step in Phase 1b:
1. The WorldCover adapter's `ingest()` reads the raw CSV and encodes each row to an H3 cell ID.
2. The re-indexed data is written to `data/cache/` (which is `.gitignore`-d and auto-rebuilt).
3. During the transition period, `GridCell` retains both `grid_id` (legacy) and `cellId` (H3) so downstream consumers can migrate incrementally.
4. A one-time validation script compares old spatial query results against new H3 query results to confirm data integrity.

**Single-resolution queries only.** Phase 1b implements single-resolution queries: at import time, all data is stored at `DEFAULT_H3_RESOLUTION`. Files imported at a different resolution are coerced to `DEFAULT_H3_RESOLUTION` or rejected with an error. The full cross-resolution parent-lookup strategy (SPEC §4.3 rules 1–4) is Future Work.

### 3b.4 Effort Estimate

- `spatial.js` H3 index and `queryByH3()`: ~200 lines of changes
- Validation script (`scripts/validate-h3-migration.js`): ~60 lines
- **Total: ~260 lines, of which ~200 new/modified in spatial.js and ~60 new in scripts**

---

## 4. Phase 1.5: Runtime Data Import (Upload CSV via API)

**Goal:** Allow third-party data to be imported without restarting the server — uploading a CSV via `POST /api/import` immediately ingests it into the spatial index, and the frontend (once Phase 2 is complete) renders new hexagonal grids in real time. For the course demo, a curl-friendly API is sufficient — no frontend wizard is needed.

### 4.1 Why This Phase Is Needed

Phase 1a's `csv-generic` adapter only solves "how to parse arbitrary CSVs," but assumes data already exists in the `data/raw/` directory at startup. For the "vendor imports their own CSV" use case, a runtime import pipeline is required:

```
Vendor uploads CSV ──→ POST /api/import ──→ csv-generic adapter parses
    ──→ H3 encoding ──→ spatial index append ──→ channel registry update
    ──→ WebSocket notifies frontend to refresh ──→ frontend renders new hexagons
```

### 4.2 Key Design Decisions

**Multi-source channel merge strategy:** The same H3 cell may simultaneously contain WorldCover data and vendor CSV data. Each source's data is stored as a separate `DataRecord` (with bare channel keys — see SPEC §3.1). The query layer merges them into a `CellSnapshot` (see SPEC §3.2) by prefixing channel keys with `sourceId.`:

```js
// CellSnapshot (merged view) for cell "85283473fffffff"
// Produced by queryByH3() merging DataRecords from multiple sources
{
  "cellId": "85283473fffffff",
  "channels": {
    // From worldcover DataRecord (bare keys: tree, urban, bare → prefixed at merge)
    "worldcover.tree": 0.42, "worldcover.urban": 0.15, "worldcover.bare": 0.03,
    // From air_quality DataRecord (bare keys: pm25, temperature → prefixed at merge)
    "air_quality.pm25": 0.65, "air_quality.temperature": 0.38
  },
  "sources": ["worldcover", "air_quality"]
}
```

Channel names are automatically namespaced by source: the internal key is `sourceId.channelName` (see OPEN-PLATFORM-SPEC.md §6.2). When a user uploads `air_quality.csv`, its columns become `air_quality.pm25`, `air_quality.temperature`, etc. This eliminates same-name collisions structurally — no reject-and-rename workflow needed. The only remaining conflict case is uploading a file with the **same source ID** as an existing import (e.g., re-uploading `air_quality.csv`), which **replaces** the previous import for that source (with a confirmation warning in the API response).

**Data persistence:** Uploaded CSVs are saved to the `data/imports/` directory, with metadata recorded in `data/imports/manifest.json` (filename, adapter ID, import timestamp, resolution, sourceId). On server restart, all previously imported data is automatically reloaded. `manifest.json` includes a `manifestVersion` field (integer, incremented on each write). Writes use **atomic rename**: write to `manifest.json.tmp`, then `fs.renameSync()` to `manifest.json`. This prevents corruption from crashes mid-write. On startup, if `manifest.json` is missing but `manifest.json.tmp` exists, recover from the tmp file.

### 4.3 New Dependency

`multer` or `busboy` (multipart/form-data parsing). Express does not natively handle `multipart/form-data`. Requires approval per CLAUDE.md. Recommended: `multer` (~50 KB, widely used, Express-native middleware).

### 4.4 New Files

```
server/
├── import-manager.js               # Runtime import pipeline: validate, encode, inject, notify
├── import-validator.js              # CSV validation: column detection, type checks, coordinate sanity, range inference
├── __tests__/
│   ├── import-manager.test.js
│   └── import-validator.test.js
data/
├── imports/                         # Uploaded data file storage directory
│   └── manifest.json                # Import metadata record
```

### 4.5 Modified Files

> Note: `server/package.json` also needs updating to add the `multer` (or `busboy`) dependency.

| File | Change | Notes |
| ---- | ------ | ----- |
| `server/index.js` | Add `POST /api/import` endpoint (single-step); add `POST /api/import/preview` stub (delegates to same pipeline, returns confirm-format response — keeps API contract stable for future two-step separation); scan `data/imports/manifest.json` on startup to reload | New routes |
| `server/config.js` | Add `H3_RESOLUTION_LABELS` constant (human-readable scale labels per resolution), `IMPORT_PREVIEW_ROWS` (default: 50,000), `IMPORT_LINE_SAMPLE_METERS` (default: 250) | Used by import API and future KML/GPX rasterization |
| `server/spatial.js` | Add `addCells(records)` method to support runtime data append to spatial index | Existing `Map` structure naturally supports append; primarily interface wrapping |
| `server/channel-registry.js` | Add `registerRuntime(adapter)` method to support runtime channel addition; trigger WebSocket notification | Extends Phase 1a registry |
| `server/osc_schema.js` | Add `/ch/reload` message address (notifies Max that the channel list has changed) | Backward-compatible |

### 4.6 API Design: Single-Step Import with Preview Stub

The course demo uses a single-step `POST /api/import` that parses, validates, and ingests in one call. A `POST /api/import/preview` stub exists and delegates to the same pipeline, returning a confirm-format response — this keeps the API contract stable for the full two-step preview/confirm split defined in SPEC §5.7 (see Future Work §8.4).

**Single-step import:**

```
POST /api/import
Content-Type: multipart/form-data

Parameters:
  file:        CSV file (required)
  sourceId:    Source identifier (optional; sanitized: lowercase, underscores, max 64 chars;
               default: derived from filename sans extension)
  resolution:  H3 resolution, defaults to DEFAULT_H3_RESOLUTION (optional)
  aggregate:   Aggregation operator: "mean" | "sum" | "max" | "last" (default "mean")

Response (200):
{
  "status": "ok",
  "source": "air_quality",
  "channels": ["air_quality.pm25", "air_quality.temp_c"],
  "cellCount": 1247,
  "resolution": 4,
  "warnings": [
    { "type": "missing_values", "column": "pm25", "count": 12, "action": "excluded from aggregation" }
  ]
}

Response (400):
{
  "status": "error",
  "message": "CSV must contain 'lat' and 'lon' (or 'latitude' and 'longitude') columns"
}
```

### 4.7 Complete Import Flow

1. Caller sends `POST /api/import` via curl or HTTP client with a CSV file
2. Server validates and parses the CSV (first `IMPORT_PREVIEW_ROWS` rows for validation, full file for ingest), auto-detects column roles, runs validation checks
3. Each row's `(lat, lon)` encoded to `cellId` via `H3Encoder`
4. Multiple rows within the same `cellId` merged using the aggregation operator
5. Generated `DataRecord`s appended to the spatial index
6. New channels registered in the channel registry
7. CSV file saved to `data/imports/`; metadata written to `manifest.json`
8. A `channel_update` event sent to all connected frontends via WebSocket
9. `/ch/register`, `/ch/meta`, and `/ch/reload` sent to Max via OSC
10. Frontend receives notification, re-requests `/api/config` for the latest channel list, and refreshes rendering

### 4.8 Effort Estimate

- `import-manager.js` (single-step pipeline: validate + encode + persist + reload): ~200 lines
- `import-validator.js` (column detection, type checks, coordinate sanity, range inference): ~180 lines
- `POST /api/import` endpoint + preview stub + multipart handling: ~100 lines
- `spatial.js` runtime append method: ~60 lines
- `channel-registry.js` runtime update + notification: ~50 lines
- Tests (import-manager + import-validator): ~180 lines
- **Total: ~770 lines, of which ~700 new and ~70 modified**

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

## 5b. Phase 2.5: KML/GPX Import Adapters — DEFERRED

Phase 2.5 (KML/GPX Import Adapters) has been deferred to Future Work. The full design is preserved in the Future Work section below (§8.1). Prerequisite when implemented: Phase 1.5.

---

## 6. Phase 3: Configurable Audio Mapping and Web Console — DEFERRED

Phase 3 (Configurable Audio Mapping and Web Console) has been deferred to Future Work. See §8.2 for the full design and the Max/MSP dynamic channel risk callout — `crossfade_controller.js` has 12 hardcoded inlets, `NUM_CHANNELS = 11`, ES5 only; this is not a ~100 line change. The `audio_mapping.json` config file (SPEC §7.1) can be hand-edited without the console in the interim.

---

## 7. Phase 4: Real-time Data Stream Pipeline + USGS Earthquake Integration

**Goal:** Build real-time data stream infrastructure with USGS Earthquake as the first live data source, validating both the adapter plugin system and the streaming pipeline. Phase 4 implements `"global"` strategy only — one poll per interval regardless of clients.

### 7.1 Why Combine "Second Data Source" and "Real-time Streaming"

The original plan treated USGS Earthquake as a static GeoJSON one-time import to validate the plugin system. But USGS Earthquake is inherently a continuously updating event stream (new earthquakes every minute) — making it static is an artificial downgrade. Building the stream pipeline and the second data source together validates two things in one pass: whether the adapter interface is truly generic, and whether the real-time pipeline is reliable.

> **Platform positioning:** This platform integrates and sonifies *authoritative, processed data feeds* — it does not perform raw signal processing or detection algorithms. Earthquakes come from USGS processed catalogs, air quality from sensor network APIs, etc. The same principle applies to all stream adapters.

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

**Subscription strategy:** Phase 4 implements `"global"` strategy only. USGS uses global pull — one poll per interval regardless of clients. The `"aoi"` strategy and `aoi-manager.js` are Future Work (see §8.3).

### 7.4 Stream Adapter Interface (extends Phase 1a's DataAdapter)

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

### 7.6 Sliding Time Window Design

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

### 7.7 New Files

```
server/
├── stream-scheduler.js              # Poll scheduler: manages lifecycle of multiple stream adapters
├── time-window.js                   # Sliding time window: event storage, expiry cleanup, aggregation
├── adapters/
│   └── usgs-earthquake.js           # USGS earthquake stream adapter
├── __tests__/
│   ├── stream-scheduler.test.js
│   ├── time-window.test.js
│   └── usgs-earthquake.test.js
```

### 7.8 Modified Files

| File | Change | Notes |
| ---- | ------ | ----- |
| `server/index.js` | Initialize `stream-scheduler` at startup; register stream adapters; add `GET /api/streams` status endpoint; store `lastViewport` per WebSocket connection (update on each viewport message) for data-change-driven incremental push | New startup logic + per-client state |
| `server/spatial.js` | `queryByH3()` results merge static data with time-window aggregated data | Query logic extension |
| `server/osc_schema.js` | Add `/adapter/error` address (adapter ID + error message); used by stream scheduler to notify Max of adapter failures | New address, backward-compatible |
| `server/osc.js` | Add `sendIncrementalUpdate()` — data-change-driven incremental OSC push; add `sendAdapterError()` for `/adapter/error` dispatch | New push paths |
| `server/config.js` | Add `STREAM_ENABLED`, `STREAM_CHANGE_THRESHOLD`, `MAX_EVENTS_PER_CELL`, `MAX_STREAM_CELLS` | New config entries |

### 7.9 New API Endpoint

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
```

### 7.10 Stream Scheduler Error Recovery

- **Transient failure** (network timeout, 5xx): exponential backoff starting at `pollIntervalMs`, capped at 5 minutes, up to `maxRetries` (default: 10) consecutive failures.
- **`maxRetries` exceeded:** adapter status transitions to `"error"`, polling stops, error is reported via `GET /api/streams` and logged. Manual restart requires server restart (stream pause/resume controls belong with the Phase 3 console — see Future Work §8.2).
- **Permanent failure** (4xx, malformed response): log, set status `"error"`, stop polling.
- **Server startup with unreachable network:** stream adapters start in `"error"` status and retry on next poll cycle.
- All error states are visible via `GET /api/streams` (the `"error"` status already defined in §7.9).

### 7.11 Sound Mapping Suggestions (USGS Earthquake → Max)

| Channel | Suggested Mapping | Sound Effect |
| ------- | ----------------- | ------------ |
| `quake_mag` | Icon trigger intensity + probability | Higher magnitude → more frequent triggers, louder sound |
| `quake_depth` | Pitch / low-pass filter cutoff frequency | Shallow quake = high-pitched sharp, deep quake = muffled low-frequency |
| `quake_count` | Background texture density | Dense earthquake clusters = sustained granular texture |

These mappings can be freely adjusted by the user once Phase 3 (audio config console) is complete. During Phase 4, a hardwired demo in the Max patch is sufficient.

### 7.12 Effort Estimate

- `stream-scheduler.js` (scheduler + lifecycle management): ~150 lines
- `time-window.js` (sliding window + aggregation + expiry): ~180 lines
- `usgs-earthquake.js` (adapter + HTTP fetch + GeoJSON parsing): ~120 lines
- `osc.js` incremental push: ~80 lines
- Tests (three modules): ~200 lines
- Existing file modifications: ~80 lines
- **Total: ~810 lines, of which ~730 new and ~80 modified**

---

## 8. Future Work

The following sections preserve designs that have been deferred from the course timeline. They are retained as a portfolio reference and implementation guide for post-course development.

### 8.1 KML/GPX Import Adapters (was Phase 2.5)

Deferred from course scope. Prerequisite: Phase 1.5. Rasterization rules already defined in SPEC §8.1.

**Goal:** Add KML and GPX import support via the adapter framework, enabling interoperability with Fog of World, Google Earth, Strava, and other track-based ecosystems.

**Scope and Constraints:**

- **KML:** Extract coordinates from `<Point>`, `<LineString>`, and `<Polygon>` elements. KML stores coordinates as `lon,lat,alt` tuples (WGS84 natively — no CRS conversion needed). Style elements (`<Style>`, `<IconStyle>`) are ignored. Only `<Placemark>` features with geometry are processed.
- **GPX:** Extract coordinates from `<wpt>` (waypoint), `<trkpt>` (track point), and `<rtept>` (route point) elements. GPX uses `lat`/`lon` attributes (WGS84 natively).
- Both formats produce `DataRecord[]` with H3-encoded cells, feeding into the same spatial index and channel registry as CSV imports.
- KML `<ExtendedData>` and GPX `<extensions>` fields with numeric values are auto-registered as channels.
- **Rasterization rules (see SPEC §8.1):** Point geometry → direct `latLngToCell()`. LineString / GPX track → distance-sampled points every `IMPORT_LINE_SAMPLE_METERS` (default: 250m), each encoded to H3, cell-deduplicated. Polygon → `polygonToCells(boundary, res)` interior fill; holes ignored initially.

**New dependency:** `fast-xml-parser` (~40 KB, zero dependencies). Requires approval per CLAUDE.md.

**New files:** `server/adapters/kml.js` (~120 lines), `server/adapters/gpx.js` (~100 lines), tests (~120 lines). **Modified files:** `import-manager.js` (accept `.kml`/`.gpx` extensions), `index.js` (register adapters), `package.json`. **Total: ~380 lines (~340 new, ~40 modified).**

### 8.2 Configurable Audio Mapping and Web Console (was Phase 3)

Deferred from course scope. Prerequisite: Phase 1a. The `audio_mapping.json` config file (SPEC §7.1) can be hand-edited without the console in the interim.

**Goal:** Move audio mapping from hardcoded Max patch wiring to a configuration file, and provide a web console for real-time adjustment.

**New files:** `server/audio-mapping.js` (config loading + validation, ~150 lines), `audio-mapping.json` (default 5-bus mapping), `frontend/console.html` + `frontend/console.js` (console frontend, ~400 lines), OSC config messages (~100 lines).

**Modified files:** `server/osc.js` (fold-mapping logic), `server/index.js` (`/console` route), `sonification/crossfade_controller.js` (dynamic channel count).

**Max/MSP dynamic channel risk callout:** `crossfade_controller.js` has the following hardcoded values:

- `inlets = 12` (11 land cover classes + proximity)
- `outlets = 11`
- `var NUM_CHANNELS = 11`
- `var target = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]` — fixed-length array of 11
- `var smoothed = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]` — fixed-length array of 11
- Inlet 10 is hardwired as the frame trigger (the last land cover class in the canonical send order)
- ES5 only — no `let`/`const`, no arrow functions, no destructuring

Two viable options for dynamic channel count:

**(A) Message-based protocol (recommended).** Replace 12 inlets with a single inlet that receives `/ch/val <index> <float>` messages. The script maintains dynamic-length `target`/`smoothed` arrays. Frame update is triggered by a `/ch/frame` message sent after all channel values. This is a full protocol rewrite of the crossfade controller — the inlet-per-channel paradigm is replaced by a message-per-channel paradigm.

**(B) Parameterized Max patch via `[poly~]` or scripted patching.** Dynamically create/destroy inlets in the Max patch using `[thispatcher]` scripting or `[poly~]` voices. This requires editing the `.maxpat` file (prohibited by CLAUDE.md) and is significantly more complex.

Option A is the viable path. Effort is substantially higher than the original ~650 line estimate — the crossfade controller rewrite alone is ~200 lines (ES5), plus integration testing with the Max patch.

**Original total estimate: ~650 lines.** Revised estimate with crossfade controller rewrite: ~850+ lines.

### 8.3 AOI-Scoped Stream Adapters and NASA FIRMS

Deferred from course scope. Prerequisite: Phase 4 complete.

**Goal:** Add AOI-scoped subscription strategy and NASA FIRMS fire hotspot adapter, validating that the streaming pipeline generalizes beyond global-pull adapters.

**AOI strategy (`"aoi"`):** The stream adapter accepts an Area of Interest (bounding box) and only requests events within that region from the upstream API. The `aoi-manager.js` module tracks per-client viewports, computes the merged AOI with a configurable expansion margin (`AOI_MARGIN_DEG`), and debounces AOI changes (`AOI_DEBOUNCE_SEC`). When no clients are connected, AOI-scoped adapters pause polling automatically. **AOI size cap:** When the merged union bbox exceeds `MAX_AOI_AREA_KM2` (default: 10,000,000 km²), fall back to the most-recently-active client's viewport only. See SPEC §5.4 for the bucketed AOI roadmap.

**NASA FIRMS fire hotspot adapter:**

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
};
```

**API key requirement:** FIRMS API requires a free MAP_KEY (stored in `.env`). **Security:** `requiredConfig` values are NEVER returned by public endpoints — only `"configured": true/false`.

**Sound mapping (FIRMS Fire → Max):**

| Channel | Suggested Mapping | Sound Effect |
| ------- | ----------------- | ------------ |
| `fire_count` | Background texture density + urgency | More fires in cell = denser, more agitated granular texture |
| `fire_intensity` | Icon trigger intensity + filter brightness | Higher FRP = brighter, more piercing alert tone |
| `fire_newness` | Temporal envelope / attack sharpness | Fresh detection = sharp attack; aging detections = softer, sustained |

**New files:** `server/aoi-manager.js` (~100 lines), `server/adapters/firms-fire.js` (~140 lines), tests (~200 lines). **New config entries:** `DEFAULT_AOI_STRATEGY`, `AOI_MARGIN_DEG`, `AOI_DEBOUNCE_SEC`, `MAX_AOI_AREA_KM2`, `MAX_AOI_BUCKETS`. **Stream pause/resume endpoints:** `POST /api/streams/:id/pause`, `POST /api/streams/:id/resume`. **Total: ~440+ lines.**

### 8.4 Import Pipeline Enhancements

Deferred from course scope. Prerequisite: Phase 1.5.

- **Preview/confirm two-step split:** Full SPEC §5.7 implementation — `POST /api/import/preview` returns a detailed preview report with `previewId`; `POST /api/import/confirm` commits with optionally adjusted parameters. The current single-step `POST /api/import` becomes an alias for preview+immediate-confirm.
- **Import wizard frontend:** `frontend/import.html` + `frontend/import.js` (~200 lines) — drag-and-drop upload, preview report display with column role badges, resolution selector with scale labels, adjust/confirm flow.
- **Cross-resolution queries:** Add `cellToParent()` branch to `queryByH3()` (~80 lines in `spatial.js`) — implements SPEC §4.3 rules 1–4 for mixed-resolution data sources.

---

## 9. Total Engineering Effort Summary

| Phase | New Code | Modified Code | Risk | Prerequisites |
| ----- | -------- | ------------- | ---- | ------------- |
| 0: H3 Encoding Layer | ~290 lines | ~30 lines | Very low (pure addition) | None (requires `h3-js` dependency approval) |
| 1a: Adapters + Registry | ~900 lines | ~120 lines | Medium (refactors core data flow) | Phase 0 |
| 1b: spatial.js H3 Migration | ~200 lines | ~60 lines | **High** (parallel index structure) | Phase 1a |
| 1.5: Runtime Import (simplified) | ~700 lines | ~70 lines | Medium (runtime state mutation + validation logic) | Phase 1a |
| 2: Frontend Decoupling | ~380 lines | ~200 lines | Medium (grid rendering rewrite) | Phase 1b |
| 4: Stream + USGS Earthquake | ~730 lines | ~80 lines | Medium (real-time state + external dependency) | Phase 1a + Phase 1.5 |

**In-scope total: ~3200 lines of new code, ~560 lines modified.**

**`spatial.js` modification ordering:** Phases 1b, 1.5, and 4 all modify `spatial.js`. Apply changes in order: Phase 1b adds `queryByH3()`, Phase 1.5 adds `addCells()`, Phase 4 modifies `queryByH3()` to merge time-window data. Phase 2 does *not* modify `spatial.js` (frontend-only). If phases are developed on branches, rebase against `spatial.js` changes before merging.

**Shortest path to "CSV upload → hex grid → sound":** Phase 0 → 1a → 1b → 1.5 → 2 (~2470 lines new).

**Shortest path to "real-time earthquake → sound":** Phase 0 → 1a → 1.5 → 4 (~2620 lines new; **Phase 1b not required** — stream scheduler encodes H3 directly).

> **Note:** Phase 1b is required for Phase 2 (frontend needs `queryByH3()`), but not for Phase 4 (stream scheduler encodes H3 cell IDs directly and injects via `addCells()`).

---

## 10. Suggested Timeline (Aligned with Course Schedule)

- **This week:** Phase 0 — pure addition, changes only touch config and type definitions (no runtime logic modified), safe to run in parallel with the milestone demo.
- **After the next milestone:** Phase 1a — independently demoable (adapter pattern + channel registry, no spatial.js risk).
- **If time permits:** Phase 1b — spatial.js H3 migration. Can defer if Phase 2 is not needed for demo.
- **Phase 1.5:** Runtime import — opens the CSV data path.
- **Before end of course:** Phase 2 OR Phase 4, depending on desired showcase:
  - **Choose Phase 2** → Showcase "hexagonal map + multi-source data visualization" (strong visual impact; requires Phase 1b)
  - **Choose Phase 4** → Showcase "real-time earthquake data driving sound changes" (strong auditory impact; **does not require Phase 1b**)
  - If time permits, do both.
- **After the course ends:** Everything in Future Work (§8).

### 10.1 Showcase Narratives

Two "closed-loop" demo paths, each self-contained and presentable on its own.

**Closed Loop A — "From Spreadsheet to Soundscape" (visual emphasis, Phases 0 → 1a → 1b → 1.5 → 2)**

- Demo flow: `POST /api/import` via curl with a CSV → server validates and ingests → hex grid appears on map → pan/zoom viewport → ambient sound changes in real time.
- Audience sees: hexagonal grid fills in, colors shift as the viewport moves across regions.
- Audience hears: tonal gradient reflecting data values across the viewport — smooth crossfades between zones.
- Core message: *"Any tabular geodata becomes an audible landscape in under a minute."*

**Closed Loop B — "Live Earthquake Alert" (auditory emphasis, Phases 0 → 1a → 1.5 → 4)**

- Demo flow: USGS adapter is running → earthquake event arrives → new cells appear on map → OSC message fires → alert sound triggers in Max.
- Audience sees: new hex cells pulse onto the map at the epicenter location.
- Audience hears: immediate percussive alert when magnitude crosses threshold, ambient low rumble conveying depth.
- Core message: *"You hear the earthquake before you see the dashboard notification."*

See §9 "Shortest path" calculations for the engineering effort behind each loop.
