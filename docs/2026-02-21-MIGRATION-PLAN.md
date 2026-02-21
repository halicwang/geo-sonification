# Engineering Migration Plan: Open Platform Refactor

**Author:** Zixiao Wang (Halic)
**Date:** February 21, 2026
**Based on:** OPEN-PLATFORM-SPEC.md — file-level change list and phase breakdown. Each phase preserves existing demo functionality on completion.

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
├── channel-registry.js         # Channel registry: dynamic registration, index assignment, bus mapping
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

### 3.5 Effort Estimate

- Adapter framework + WorldCover adapter: ~300 lines
- csv-generic adapter: ~150 lines
- Channel registry: ~200 lines
- Tests: ~250 lines
- Existing file modifications: ~200 lines (primarily splitting and thin wrappers)
- H3 migration validation script (`scripts/validate-h3-migration.js`): ~60 lines
- **Total: ~1160 lines, of which ~960 new and ~200 modified**

---

## 4. Phase 1.5: Runtime Data Import (Upload CSV, Render Immediately)

**Goal:** Allow third-party data to be imported without restarting the server — uploading a CSV immediately ingests it into the spatial index, and the frontend (once Phase 2 is complete) renders new hexagonal grids in real time.

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
    "tree": 0.42, "urban": 0.15, "bare": 0.03,
    // From vendor-uploaded air_quality.csv
    "pm25": 0.65, "temperature": 0.38
  }
}
```

If two data sources declare a same-named channel (conflict), the import is **rejected** with a 400 error requiring the user to rename conflicting columns. The error response lists the conflicting channel names and their existing sources. This prevents silent data corruption of active pipelines (e.g., a vendor CSV with a `tree` column accidentally overwriting WorldCover's `tree` channel).

**Data persistence:** Uploaded CSVs are saved to the `data/imports/` directory, with metadata recorded in `data/imports/manifest.json` (filename, adapter ID, import timestamp, resolution). On server restart, all previously imported data is automatically reloaded.

### 4.3 New Dependency

`multer` or `busboy` (multipart/form-data parsing). Express does not natively handle `multipart/form-data`. Requires approval per CLAUDE.md. Recommended: `multer` (~50 KB, widely used, Express-native middleware).

### 4.4 New Files

```
server/
├── import-manager.js               # Runtime import pipeline: validate, parse, encode, inject, notify
├── __tests__/
│   └── import-manager.test.js
data/
├── imports/                         # Uploaded data file storage directory
│   └── manifest.json                # Import metadata record
```

### 4.5 Modified Files

> Note: `server/package.json` also needs updating to add the `multer` (or `busboy`) dependency.

| File | Change | Notes |
| ---- | ------ | ----- |
| `server/index.js` | Add `POST /api/import` endpoint (multipart file upload); scan `data/imports/manifest.json` on startup to reload | New route |
| `server/spatial.js` | Add `addCells(records)` method to support runtime data append to spatial index | Existing `Map` structure naturally supports append; primarily interface wrapping |
| `server/channel-registry.js` | Add `registerRuntime(adapter)` method to support runtime channel addition; trigger WebSocket notification | Extends Phase 1 registry |
| `server/osc_schema.js` | Add `/ch/reload` message address (notifies Max that the channel list has changed) | Backward-compatible |

### 4.6 API Design

```
POST /api/import
Content-Type: multipart/form-data

Parameters:
  file:        CSV file (required)
  adapter:     Adapter ID, default "csv-generic" (optional)
  resolution:  H3 resolution, defaults to DEFAULT_H3_RESOLUTION (optional)
  aggregate:   Aggregation operator "mean" | "sum" | "max" | "last", default "mean" (optional)

Response (200):
{
  "status": "ok",
  "source": "air_quality",           // Derived from filename
  "channels": ["pm25", "temperature", "humidity"],
  "cellCount": 1247,
  "resolution": 4,
  "warnings": []                     // Non-fatal warnings (e.g., column type coercion, empty rows skipped)
}

Response (400):
{
  "status": "error",
  "message": "CSV must contain 'lat' and 'lon' columns"
}
```

### 4.7 Complete Import Flow

1. Vendor uploads CSV via `POST /api/import`
2. Server parses with `csv-generic` adapter (identifies `lat`/`lon` columns; remaining numeric columns auto-register as channels)
3. Each row's `(lat, lon)` is encoded to a `cellId` via `H3Encoder`
4. Multiple rows within the same `cellId` are merged using the aggregation operator
5. Generated `DataRecord`s are appended to the spatial index
6. New channels are registered in the channel registry
7. CSV file is saved to `data/imports/`; metadata written to `manifest.json`
8. A `channel_update` event is sent to all connected frontends via WebSocket
9. `/ch/register` and `/ch/reload` are sent to Max via OSC
10. Frontend receives notification, re-requests `/api/config` for the latest channel list, and refreshes rendering

### 4.8 Effort Estimate

- `import-manager.js` (import pipeline + persistence + reload): ~200 lines
- `POST /api/import` endpoint + multipart handling: ~80 lines
- `spatial.js` runtime append method: ~60 lines
- `channel-registry.js` runtime update + notification: ~50 lines
- Tests: ~120 lines
- **Total: ~510 lines, of which ~420 new and ~90 modified**

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

### 5.3 New Frontend Dependency

`h3-js` also needs to be loaded in the frontend. Two approaches:

- **CDN**: `<script src="https://unpkg.com/h3-js"></script>` (consistent with the existing no-build-tool frontend)
- **Server-computed**: `/api/h3` endpoint returns pre-computed hexagonal GeoJSON (zero frontend dependency, but increases server load)

The CDN approach is simpler to implement. However, `h3-js` is approximately 1.2 MB (WASM), which has a non-trivial impact on initial page load. The server-computed approach adds zero frontend dependencies and is more consistent with the project's "no build tools" frontend philosophy. **Recommendation:** benchmark both approaches before committing. If the map client is typically used on fast connections (campus/studio), CDN is acceptable; otherwise, prefer server-computed.

### 5.4 Effort Estimate

- `map.js` grid rewrite: ~250 lines of changes (hexagonal polygon rendering is slightly more involved than rectangles)
- `channels.js`: ~80 lines
- `h3-utils.js`: ~50 lines
- Other frontend modifications: ~100 lines
- **Total: ~480 lines**

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

## 7. Phase 4: Real-time Data Stream Pipeline + USGS Earthquake Integration

**Goal:** Build real-time data stream infrastructure and use USGS Earthquake as the first live data source, validating both the adapter plugin system and the streaming pipeline.

### 7.1 Why Combine "Second Data Source" and "Real-time Streaming"

The original plan treated USGS Earthquake as a static GeoJSON one-time import to validate the plugin system. But USGS Earthquake is inherently a continuously updating event stream (new earthquakes every minute) — making it static is an artificial downgrade. Building the stream pipeline and the second data source together validates two things in one pass: whether the adapter interface is truly generic, and whether the real-time pipeline is reliable.

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

### 7.9 New API Endpoints

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

### 7.10 Stream Scheduler Error Recovery

- **Transient failure** (network timeout, 5xx): exponential backoff starting at `pollIntervalMs`, capped at 5 minutes, up to `maxRetries` (default: 10) consecutive failures.
- **`maxRetries` exceeded:** adapter status transitions to `"error"`, polling stops, error is reported via `GET /api/streams` and logged. Manual `POST /api/streams/:id/resume` required to restart.
- **Permanent failure** (4xx, malformed response): log, set status `"error"`, stop polling.
- **Server startup with unreachable network:** stream adapters start in `"error"` status and retry on manual resume.
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
- `usgs-earthquake.js` (adapter + HTTP fetch + parsing): ~120 lines
- `osc.js` incremental push: ~80 lines
- Tests (three modules): ~250 lines
- Existing file modifications: ~100 lines
- **Total: ~880 lines, of which ~780 new and ~100 modified**

---

## 8. Total Engineering Effort Summary

| Phase | New Code | Modified Code | Risk | Prerequisites |
| ----- | -------- | ------------- | ---- | ------------- |
| 0: H3 Encoding Layer | ~290 lines | ~30 lines | Very low (pure addition) | None (requires `h3-js` dependency approval) |
| 1: Adapters + Registry | ~960 lines | ~200 lines | Medium (refactors core data flow) | Phase 0 |
| 1.5: Runtime Import | ~420 lines | ~90 lines | Medium (runtime state mutation) | Phase 1 |
| 2: Frontend Decoupling | ~380 lines | ~200 lines | Medium (grid rendering rewrite) | Phase 1 |
| 3: Config + Console | ~650 lines | ~100 lines | Low (new feature) | Phase 1 |
| 4: Real-time Stream + USGS Earthquake | ~780 lines | ~100 lines | Medium (real-time state + external dependency) | Phase 1 + Phase 1.5 |

**Total: ~3480 lines of new code, ~720 lines modified.**

Phases 1.5, 2, and 3 can be worked on in parallel or in any order. Phase 4 depends on Phase 1.5 (runtime spatial index append capability). **Phase 0 + Phase 1 is the critical path.**

**`spatial.js` modification ordering:** Phases 1, 1.5, and 4 all modify `spatial.js`. To avoid merge conflicts, apply changes in order: Phase 1 adds `queryByH3()`, Phase 1.5 adds `addCells()`, Phase 4 modifies `queryByH3()` to merge time-window data. Phase 2 does *not* modify `spatial.js` (frontend-only). If phases are developed on branches, rebase against `spatial.js` changes before merging.

**Shortest path to "vendor uploads CSV, frontend renders immediately":** Phase 0 → 1 → 1.5 → 2 (~2560 lines).

**Shortest path to "real-time data stream driving sound":** Phase 0 → 1 → 1.5 → 4 (~3160 lines; frontend still uses old rendering, but OSC/sound updates in real time).

**All phases complete:** ~3480 lines new + ~720 lines modified.

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
