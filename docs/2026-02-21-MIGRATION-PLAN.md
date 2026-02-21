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

**Goal:** Add H3 encoding and the CellEncoder interface alongside the existing system, running in parallel.

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
| `server/config.js` | Add `DEFAULT_H3_RESOLUTION = 3` | Coexists with existing `GRID_SIZE` |
| `server/types.js` | Add `DataRecord`, `ChannelManifest`, `CellEncoder` typedefs | No impact on existing types |
| `server/package.json` | Add `h3-js` dependency | — |

### 2.4 Effort Estimate

- `h3-encoder.js`: ~100 lines (encode/decode/parent/neighbors/enumerateBounds, mostly delegated to h3-js)
- `cell-encoder.js`: ~40 lines (interface documentation + factory function)
- Tests: ~120 lines (encode round-trip, viewport enumeration, neighbors, cross-resolution)
- config/types changes: ~30 lines
- **Total: ~290 lines of new code, 0 lines of existing code modified**

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
```

### 3.2 Modified Files

| File | Change | Impact |
| ---- | ------ | ------ |
| `server/data-loader.js` | Internal logic migrated to `adapters/worldcover.js`; this file becomes a thin wrapper calling the adapter | External interface unchanged |
| `server/landcover.js` | ESA metadata migrated to `adapters/worldcover.js`; this file retains lookup functions needed by the frontend | Frontend API unchanged |
| `server/osc_schema.js` | Add `/ch/register` and `/ch/{index}` addresses; retain all existing `/lc/*` addresses | Backward-compatible |
| `server/osc.js` | `sendAggregatedToMax()` reads channel list from registry; sends both `/lc/*` (compat) and `/ch/*` (new) | Max requires no changes |
| `server/delta-state.js` | Channel count changes from hardcoded 11 to registry-driven | Internal change |
| `server/spatial.js` | Add `queryByH3(bounds, resolution)` method alongside existing `queryByBounds()` | Gradual replacement |
| `server/index.js` | Load adapters and initialize registry at startup; route handlers call registry | Pipeline unchanged |

### 3.3 Key Design Constraints

- **The WorldCover adapter must produce OSC data identical to the current output** — enforced by regression tests.
- The generic CSV adapter at this stage only needs to import data and expose channels; full audio mapping is not required.
- When only WorldCover is loaded, the channel registry behaves identically to the hardcoded 11-class system.

### 3.4 Effort Estimate

- Adapter framework + WorldCover adapter: ~300 lines
- csv-generic adapter: ~150 lines
- Channel registry: ~200 lines
- Tests: ~250 lines
- Existing file modifications: ~200 lines (primarily splitting and thin wrappers)
- **Total: ~1100 lines, of which ~900 new and ~200 modified**

---

## 4. Phase 2: Frontend Decoupling and H3 Hexagonal Grid Display

**Goal:** Switch the frontend from hardcoded 0.5-degree grid rendering to H3 hexagonal display, with channel metadata fetched dynamically from the server.

### 4.1 Modified Files

| File | Change | Notes |
| ---- | ------ | ----- |
| `frontend/config.js` | Fetch channel metadata (names, colors, ranges) from `/api/config` | Replaces hardcoded ESA classes |
| `frontend/landcover.js` | Rename to `frontend/channels.js`; lookup functions read from dynamic metadata | Generalized |
| `frontend/map.js` | Grid overlay changes from 0.5-degree rectangles to H3 hexagonal polygons (via `cellToBoundary()` to GeoJSON) | Largest frontend change |
| `frontend/ui.js` | Panel display changes from "landcover breakdown" to "channel breakdown" | Data-driven |
| `server/index.js` | `/api/config` response adds a `channels` field | Additive change |

### 4.2 New Files

```
frontend/
├── channels.js        # Generic channel metadata lookup (replaces landcover.js)
├── h3-utils.js        # Frontend H3 utilities (viewport → hex enumeration, boundary → GeoJSON polygon)
```

### 4.3 New Frontend Dependency

`h3-js` also needs to be loaded in the frontend. Two approaches:

- **CDN**: `<script src="https://unpkg.com/h3-js"></script>` (consistent with the existing no-build-tool frontend)
- **Server-computed**: `/api/h3` endpoint returns pre-computed hexagonal GeoJSON (zero frontend dependency, but increases server load)

The CDN approach is recommended for simplicity.

### 4.4 Effort Estimate

- `map.js` grid rewrite: ~250 lines of changes (hexagonal polygon rendering is slightly more involved than rectangles)
- `channels.js`: ~80 lines
- `h3-utils.js`: ~50 lines
- Other frontend modifications: ~100 lines
- **Total: ~480 lines**

---

## 5. Phase 3: Configurable Audio Mapping and Web Console

**Goal:** Move audio mapping from hardcoded Max patch wiring to a configuration file, and provide a web console for real-time adjustment.

### 5.1 New Files

```
server/
├── audio-mapping.js            # Load + validate audio_mapping.json
├── audio-mapping.json          # Default configuration (5 buses + existing fold-mapping)
frontend/
├── console.html                # Console page
├── console.js                  # Console logic
```

### 5.2 Modified Files

| File | Change |
| ---- | ------ |
| `server/osc.js` | Fold-mapping logic moves from Max patch to server-side (optional; alternatively keep Max-side but use config messages) |
| `server/index.js` | Add `/console` route and WebSocket config push |
| `sonification/crossfade_controller.js` | Accept dynamic channel count (configurable inlet count) |

### 5.3 Effort Estimate

- Config loading + validation: ~150 lines
- Console frontend: ~400 lines
- OSC config messages: ~100 lines
- **Total: ~650 lines**

---

## 6. Phase 4: Second Data Source Integration (Plugin System Validation)

**Goal:** Integrate a non-WorldCover data source to prove the plugin system works end-to-end.

### 6.1 Candidate Data Sources (Choose One)

| Data Source | Format | temporalType | Integration Complexity |
| ----------- | ------ | ------------ | ---------------------- |
| PurpleAir (air quality) | JSON API | stream | Medium (requires API key, rate limiting) |
| USGS Earthquake | GeoJSON feed | stream | Low (public, no auth required) |
| User-uploaded CSV | CSV | static | Lowest (Phase 1 already has csv-generic) |
| OpenSky (flights) | REST API | stream | Medium (public but rate-limited) |

**Recommendation: start with USGS Earthquake** — public GeoJSON feed, no authentication required, simple data structure (lat, lon, magnitude, depth, time), naturally a `stream` type, and validates time-window aggregation.

### 6.2 New Files

```
server/adapters/usgs-earthquake.js           # USGS adapter
server/adapters/__tests__/usgs-earthquake.test.js
```

### 6.3 Effort Estimate

- Adapter implementation: ~100 lines
- Tests: ~60 lines
- **Total: ~160 lines**

---

## 7. Total Engineering Effort Summary

| Phase | New Code | Modified Code | Risk | Prerequisites |
| ----- | -------- | ------------- | ---- | ------------- |
| 0: H3 Encoding Layer | ~290 lines | ~30 lines | Very low (pure addition) | None (requires `h3-js` dependency approval) |
| 1: Adapters + Registry | ~900 lines | ~200 lines | Medium (refactors core data flow) | Phase 0 |
| 2: Frontend Decoupling | ~380 lines | ~200 lines | Medium (grid rendering rewrite) | Phase 1 |
| 3: Config + Console | ~650 lines | ~100 lines | Low (new feature) | Phase 1 |
| 4: Second Data Source | ~160 lines | 0 | Very low (validation) | Phase 1 |

Phases 2, 3, and 4 can be worked on in parallel or in any order. **Phase 0 + Phase 1 is the critical path.**

---

## 8. Suggested Timeline (Aligned with Course Schedule)

- **This week:** Phase 0 — pure addition, does not touch existing code, safe to run in parallel with the milestone demo.
- **After the next milestone:** Phase 1 — the largest refactor, requires comprehensive testing.
- **Before end of course:** Phase 2 or Phase 4 — pick one for the final presentation.
- **After the course ends:** Phase 3 — the console is a nice-to-have that does not affect core functionality.
