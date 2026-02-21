# Engineering Migration Plan: Open Platform Refactor

**Author:** Zixiao Wang (Halic)
**Date:** February 21, 2026
**Based on:** OPEN-PLATFORM-SPEC.md — file-level change list and phase breakdown. Each phase preserves existing demo functionality on completion.
**Product motivation:** See OPEN-PLATFORM-SPEC.md "Motivation and Use Cases" for target scenarios (air quality monitoring, wildfire alerting, etc.) and platform value proposition.

---

## 0. End-State Architecture Overview

> The canonical end-state architecture diagram is in **OPEN-PLATFORM-SPEC.md §1.5**. Refer to that diagram while reading the migration phases below.
>
> Key layers (top to bottom): **Data Sources → Adapter Layer → H3 Encoding → Spatial Index → Channel Registry / Time Window → OSC Engine → Max/MSP Renderer.** Supporting subsystems: Alert Engine, Frontend, Control Plane (REST API).

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

## 1.5 Dependency Approval Gates

All new npm dependencies require explicit approval per CLAUDE.md. The following table consolidates every planned dependency across all phases:

| Phase | Dependency | Size | Purpose | Gate |
| ----- | ---------- | ---- | ------- | ---- |
| 0 | `h3-js` | ~1.2 MB (JS/WASM) | H3 hexagonal encoding | Approve before Phase 0 begins |
| 1.5 | `multer` or `busboy` | ~50 KB | Multipart form-data parsing | Approve before Phase 1.5 begins |
| Future (§8.1) | `fast-xml-parser` | ~40 KB | KML/GPX XML parsing | Approve when work begins |

**ES5 constraint reminder:** All `sonification/*.js` files must be ES5 — no `let`/`const`, no arrow functions, no template literals, no destructuring. This is enforced by the Max/MSP JS engine (see CLAUDE.md).

**`.maxpat` files are read-only:** Per CLAUDE.md, `.maxpat` files cannot be edited as text. Any future Max-side changes (Phase 3 / Future Work §8.2) must follow **extend-only semantics** and require a dedicated "Max-side change proposal" documenting the exact inlet/outlet changes, backward-compatibility impact, and ES5 compliance verification. No casual `.maxpat` edits.

**Decision documentation:** Major architectural decisions in this migration (H3 over Quadkey, adapter-first vs. grid-first, fold-on-server vs. fold-in-Max) are documented inline in each phase's "Key Design Constraints" or "Additional Considerations" subsections. A future improvement is to adopt a formal **Architecture Decision Record (ADR)** format (e.g., `docs/adr/0001-h3-over-quadkey.md`) for long-term traceability. This is not required for the course timeline but would strengthen the portfolio presentation.

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
- **Total: ~300 lines of new code, ~30 lines of config/types changes (no runtime logic modified)**

### 2.5 Definition of Done (Phase 0)

- [ ] `h3-js` dependency approved and installed (`npm install h3-js`)
- [ ] Encode/decode round-trip test passes: `latLngToCell(lat, lon, res)` → `cellToLatLng(cellId)` returns coordinates within one cell radius
- [ ] `enumerateBounds()` regression test with two fixed bounding boxes: one normal (e.g., continental Europe) and one **dateline-crossing** (e.g., Pacific viewport spanning 170°E–170°W)
- [ ] Coordinate order regression test: verify `latLngToCell(lat, lon)` vs `polygonToCells([lon, lat])` use their documented conventions — catch h3-js version-specific convention changes
- [ ] All existing tests (`npm test`) pass with zero changes to existing code

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

### 3.4.5 Channel Index Policy

The channel registry assigns integer indices to channels for OSC transmission (`/ch/{index}`). The following rules govern index assignment to balance stability (DoD requirement) with runtime flexibility (Phase 1.5 / Phase 4):

- **Rule A — Builtin adapters:** WorldCover channel indices are fixed at hardcoded positions defined in the adapter manifest's channel order. These indices never change, regardless of what other sources are loaded. This guarantees OSC backward compatibility with existing Max patches.
- **Rule B — Imported sources:** Indices are assigned in `manifest.json` import order. The same `manifest.json` produces the same indices across server restarts. Adding a new import appends indices after the last assigned index.
- **Rule C — Runtime mutation:** `DELETE /api/sources/:id` or re-import may reassign indices for non-builtin channels. After any index change, the server MUST send `/ch/reload` (OSC) and `channel_update` (WebSocket) to notify all consumers. `GET /api/channels` is the single source of truth for current index assignments.

This policy makes the Phase 1a DoD ("stable across restarts") testable for the worldcover-only case, while allowing Phase 1.5 and Phase 4 to mutate indices with proper notification.

### 3.5 Non-Functional Requirements (Phase 1a Scope)

Phase 1a introduces the adapter framework, and Phase 1.5 adds `POST /api/import`. Resource governance hooks should be wired in from the start:

- **`import-manager.js`:** Enforce file size, row count, and column count limits (configurable in `config.js`) before parsing begins.
- **`channel-registry.js`:** Enforce a maximum channel count per adapter and globally, preventing a single malformed CSV from registering hundreds of channels.

Authentication, observability, and supply chain concerns are out of scope for Phase 1a. See OPEN-PLATFORM-SPEC.md §9 for the full non-functional requirements roadmap.

### 3.5.5 Audio-Mapping Reload API (Hot-Reload Without Restart)

**Motivation:** Phase 3 (web console) is deferred, and `audio_mapping.json` can currently only be changed by hand-editing followed by a server restart. A minimal reload endpoint enables CI/CD-driven config deployment and faster iteration during development — without requiring the full web console.

**New Files:**

```
server/
├── audio-mapping.js            # Load, validate JSON schema, emit OSC /bus/reload
├── __tests__/
│   └── audio-mapping.test.js
```

**Modified Files:**

| File | Change | Notes |
| ---- | ------ | ----- |
| `server/index.js` | Add `POST /api/audio-mapping/reload` route | Delegates to `audio-mapping.js` |
| `server/osc_schema.js` | Add `/bus/reload` address (promoted from Future Work §8.2) | Backward-compatible, extend-only |
| `server/config.js` | Add `AUDIO_MAPPING_PATH` constant (default: `./audio_mapping.json`) | New config entry |

**Endpoint spec:**

```
POST /api/audio-mapping/reload

Response (200):
{
  "status": "ok",
  "buses": 5,
  "channels": ["worldcover.tree", "worldcover.urban", ...]
}

Response (400):
{
  "status": "error",
  "message": "Invalid audio_mapping.json: buses[2].foldMethod must be one of 'sum', 'max', 'weighted'"
}
```

**Behavior:** Reads `audio_mapping.json` from disk, validates against the schema defined in OPEN-PLATFORM-SPEC.md §7.1, replaces the in-memory bus configuration, and sends `/bus/reload` OSC to notify Max. Invalid JSON returns 400 without changing the running configuration.

**Effort:** ~80 lines (`audio-mapping.js`), ~30 lines (route + config changes), ~60 lines (tests). **Total: ~170 lines.**

### 3.5.6 Minimal Bus Fold-Mapping (Closes the Sound Path for Non-WorldCover Data)

**Problem:** After Phase 1a, imported channels send `/ch/{index}` OSC messages, but Max has no receiver for these — `crossfade_controller.js` only understands `/lc/*` addresses (11 fixed inlets). Without fold-mapping, **all non-WorldCover data is silent.** The full Phase 3 web console is deferred (see Future Work), but the sound path must not be broken for new data sources.

**Solution:** Add minimal fold-mapping to `sendAggregatedToMax()` (or its Phase 1a replacement). This is a much smaller scope than Phase 3 — no web console, no crossfade_controller rewrite, no dynamic inlet changes.

**Behavior:**

1. After sending per-channel `/ch/{index}` values, `sendAggregatedToMax()` reads the `buses` array from `audio_mapping.json` (loaded by `audio-mapping.js` from §3.5.5).
2. For each bus, compute the fold value from its member channels using the declared `foldMethod` (`sum`, `max`, or `weighted`).
3. Send `/bus/{index} <float>` for each bus (extend-only OSC, new addresses in `osc_schema.js`).
4. **Default bus for unmapped channels:** Any channel not assigned to a bus in `audio_mapping.json` contributes to a `default_bus`. The default bus value is `max(all unmapped channel values)`. This ensures imported data produces sound even before the user configures explicit bus mapping.
5. `/bus/{index}` messages are picked up by the existing Max patch's `[route]` chain — the wiring already routes numbered messages to gain controls. No `.maxpat` editing is needed if the bus indices align with existing audio bus indices (0–4 for the 5 current buses).

**Modified Files:**

| File | Change | Notes |
| ---- | ------ | ----- |
| `server/osc.js` | Add fold-mapping loop after channel dispatch in `sendAggregatedToMax()` | ~100 lines |
| `server/osc_schema.js` | Add `/bus/{index}` address template and `buildBusPacket()` builder | ~30 lines, extend-only |
| `server/config.js` | Add `DEFAULT_BUS_FOLD_METHOD = 'max'` | 1 line |

**Effort:** ~130 lines (100 in `osc.js`, 30 in `osc_schema.js`). Covered by Phase 1a effort estimate below.

> **This is the critical bridge that makes "upload CSV → hear sound" possible without the full Phase 3 web console.**

### 3.6 Effort Estimate

- Adapter framework + WorldCover adapter: ~300 lines
- csv-generic adapter: ~150 lines
- Channel registry: ~200 lines (includes namespace key generation and bare-name reverse lookup for backward-compat OSC)
- Audio-mapping reload module + endpoint: ~110 lines (see §3.5.5)
- Minimal bus fold-mapping in osc.js + osc_schema.js: ~130 lines (see §3.5.6)
- Audio-mapping tests: ~60 lines
- Tests (adapter + registry): ~250 lines
- Existing file modifications: ~120 lines (primarily splitting and thin wrappers)
- **Total: ~1320 lines, of which ~1200 new and ~120 modified**

### 3.7 Definition of Done (Phase 1a)

- [ ] **Golden regression:** Same viewport input → **canonicalized-identical** OSC output compared to pre-refactor baseline. Canonicalization: packets sorted by OSC address, float arguments compared within ε = 1e-6. This avoids false failures from float serialization noise or `Map` iteration order instability.
- [ ] Registry index assignment is stable across server restarts (worldcover-only scenario — see §3.4.5 Channel Index Policy Rule A)
- [ ] `csv-generic` adapter ingests a test CSV with `(lat, lon, pm25, temp)` columns and registers 2 channels in the registry
- [ ] `npm test` + `npm run lint` pass
- [ ] Existing frontend demo works identically (manual smoke test — navigate to 3 different viewports, confirm visual and auditory output unchanged)
- [ ] `POST /api/audio-mapping/reload` returns 200 with validated bus config; invalid JSON returns 400 with descriptive error, running config unchanged; Max receives `/bus/reload` OSC after successful reload
- [ ] **Minimal fold-mapping:** after importing a test CSV, `/bus/{index}` OSC messages are sent for each configured bus; unmapped channels contribute to a `default_bus`; Max receives bus values without any Max-side changes (verified by OSC mock in unit test)

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

### 3b.2.5 Recommended Refactoring Approach

The current `spatial.js` (627 lines) has hidden responsibilities that make adding `queryByH3()` riskier than a simple "one method addition." The module simultaneously handles spatial index construction, bucket-key lookup, viewport hit-testing, date-line crossing, legacy aggregation, area-weighted aggregation, landcover breakdown assembly, and bounds validation. Recommend splitting before H3 work:

| New Module | Extracted From | Responsibility | ~Lines |
| ---------- | -------------- | -------------- | ------ |
| `server/spatial-index.js` | Index build, bucket-key lookup, viewport hit-test, date-line crossing | Cell lookup & enumeration | ~130 |
| `server/viewport-aggregator.js` | Legacy & area-weighted aggregation, landcover breakdown, stats assembly | Stats computation | ~280 |
| `server/spatial.js` (retained) | Orchestration + `validateBounds()` | Thin facade delegating to index + aggregator | ~120 |

**Rationale:** `spatial-index.js` is the only file that needs H3 changes in Phase 1b. `viewport-aggregator.js` is minimally affected by Phase 1b (input shape unchanged, but may need minor adaptation if index return type changes). `viewport-processor.js` (95 lines) stays as-is — it orchestrates spatial queries and OSC dispatch, both of which are transparent to the index implementation.

> **Note:** This decomposition is a **recommendation**, not a requirement. The Definition of Done below measures outcomes, not module structure. If the developer prefers a different factoring that achieves the same DoD criteria, that is acceptable.

### 3b.3 Additional Considerations

**Data re-indexing step.** Migrating from 0.5-degree grid IDs to H3 cell IDs requires all CSV data to be re-processed. This should be an explicit step in Phase 1b:
1. The WorldCover adapter's `ingest()` reads the raw CSV and encodes each row to an H3 cell ID.
2. The re-indexed data is written to `data/cache/` (which is `.gitignore`-d and auto-rebuilt).
3. During the transition period, `GridCell` retains both `grid_id` (legacy) and `cellId` (H3) so downstream consumers can migrate incrementally.
4. A one-time validation script compares old spatial query results against new H3 query results to confirm data integrity.

**Single-resolution queries only.** Phase 1b implements single-resolution queries: at import time, all data is stored at `DEFAULT_H3_RESOLUTION`. Files imported at a different resolution are coerced to `DEFAULT_H3_RESOLUTION` or rejected with an error. The full cross-resolution parent-lookup strategy (SPEC §4.3 rules 1–4) is Future Work.

### 3b.4 Effort Estimate

**If recommended module split is performed (see §3b.2.5):**

- `spatial.js` split into `spatial-index.js` (~130 lines), `viewport-aggregator.js` (~280 lines), `spatial.js` facade (~120 lines): ~530 lines reorganized across 3 files
- New `queryByH3()` logic in `spatial-index.js`: ~200 lines
- Validation script (`scripts/validate-h3-migration.js`): ~60 lines
- **Total: ~260 lines new code, ~590 lines modified/reorganized** (530 reorganized + 60 validation script)

**If split is skipped:**

- `spatial.js` H3 index and `queryByH3()`: ~200 lines of changes
- Validation script (`scripts/validate-h3-migration.js`): ~60 lines
- **Total: ~260 lines of changes within the existing `spatial.js`, but with higher integration risk**

> **Note:** The §9 effort summary uses the split-included estimate. If the split is skipped, the new-code count stays the same (~260 lines) but the modified-code count drops from ~590 to ~60, at the cost of higher coupling within the existing 627-line `spatial.js`. The split is a recommendation, not a requirement — the Definition of Done below measures outcomes, not module structure.

### 3b.5 Definition of Done (Phase 1b)

- [ ] `queryByH3()` produces equivalent aggregation results as `queryByBounds()` for WorldCover data. **Primary metric (must pass):** For 3 test viewports at resolution 4, compare per-channel aggregated means from both code paths — max absolute difference < 0.02 per channel, coverage difference < 0.02. **Secondary metric (reported, not gating):** Jaccard distance on enumerated cell sets = 1 − |H3 ∩ Rect| / |H3 ∪ Rect|, where both sets are computed at the same H3 resolution via `polygonToCells(bounds, res)` for the rect path and `queryByH3()` for the H3 path. This avoids comparing incompatible ID spaces (H3 cellId vs legacy grid_id).
- [ ] H3 spatial index (`Map<cellId, Map<sourceId, DataRecord>>`) builds successfully on startup
- [ ] `validateBounds()` behavior unchanged (same inputs → same validation results)
- [ ] Validation script (`scripts/validate-h3-migration.js`) runs and reports both metrics per viewport
- [ ] All existing tests (`npm test`) pass

---

## 4. Phase 1.5: Runtime Data Import (CSV + GeoJSON via API)

**Goal:** Allow third-party data to be imported without restarting the server — uploading a CSV or GeoJSON file via `POST /api/import` immediately ingests it into the spatial index, and the frontend (once Phase 2 is complete) renders new hexagonal grids in real time. For the course demo, a curl-friendly API is sufficient — no frontend wizard is needed.

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
├── adapters/
│   └── geojson-generic.js          # GeoJSON FeatureCollection adapter (Point/LineString/Polygon)
├── __tests__/
│   ├── import-manager.test.js
│   ├── import-validator.test.js
│   └── geojson-generic-adapter.test.js
data/
├── imports/                         # Uploaded data file storage directory
│   └── manifest.json                # Import metadata record
```

### 4.4.5 GeoJSON Import Support

OPEN-PLATFORM-SPEC §8 lists GeoJSON as P0 (same priority as CSV). Phase 1.5 includes GeoJSON import alongside CSV via the same `POST /api/import` endpoint.

**New file:** `server/adapters/geojson-generic.js` (~120 lines)

**Logic:**

1. Detect `.geojson` file extension in `import-manager.js`; route to the GeoJSON adapter
2. Parse `FeatureCollection` (or single `Feature`) from uploaded file
3. Extract geometry coordinates per geometry type:
   - **Point** → direct `latLngToCell(lat, lon, res)` — one cell per point
   - **LineString** → distance-sampled points every `IMPORT_LINE_SAMPLE_METERS` (default: 250m), each encoded to H3, cell-deduplicated (reuses rasterization rules from OPEN-PLATFORM-SPEC §8.1)
   - **Polygon** → `polygonToCells(boundary, res)` interior fill (reuses rasterization rules from OPEN-PLATFORM-SPEC §8.1)
4. Extract `properties` as channels: numeric properties are auto-registered as channels; non-numeric properties are ignored with a warning
5. Produce `DataRecord[]` and feed into the same H3 encoding + spatial index pipeline as CSV

**Test:** `server/__tests__/geojson-generic-adapter.test.js` (~60 lines) — test with a FeatureCollection containing Point, LineString, and Polygon geometries; verify channel auto-detection from properties.

### 4.5 Modified Files

> Note: `server/package.json` also needs updating to add the `multer` (or `busboy`) dependency.

| File | Change | Notes |
| ---- | ------ | ----- |
| `server/index.js` | Add `POST /api/import` endpoint (single-step); add `POST /api/import/preview` stub (delegates to same pipeline, returns confirm-format response — keeps API contract stable for future two-step separation); scan `data/imports/manifest.json` on startup to reload | New routes |
| `server/config.js` | Add `H3_RESOLUTION_LABELS` constant (human-readable scale labels per resolution), `IMPORT_PREVIEW_ROWS` (default: 50,000), `IMPORT_LINE_SAMPLE_METERS` (default: 250) | Used by import API and future KML/GPX rasterization |
| `server/spatial.js` | Add `addCells(records)` method to support runtime data append to spatial index | Existing `Map` structure naturally supports append; primarily interface wrapping |
| `server/channel-registry.js` | Add `registerRuntime(adapter)` method to support runtime channel addition; trigger WebSocket notification | Extends Phase 1a registry |
| `server/osc_schema.js` | Add `/ch/reload` message address (notifies Max that the channel list has changed) | Backward-compatible |
| `server/import-manager.js` | Detect `.geojson` extension and route to `geojson-generic` adapter | Extension-based routing alongside CSV |

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
  ],
  "soundMappingHint": {
    "unmappedChannels": ["air_quality.pm25", "air_quality.temp_c"],
    "message": "These channels are not mapped to any audio bus in audio_mapping.json. They will route to the default bus. Edit audio_mapping.json and call POST /api/audio-mapping/reload to configure explicit bus mapping."
  }
}

**`soundMappingHint`** (present only when imported channels have no explicit bus mapping in `audio_mapping.json`): Tells the user why imported data may produce only default-bus sound instead of targeted audio output. This prevents the common "I uploaded data but nothing sounds different" confusion. When all channels are mapped, this field is omitted.

Response (400):
{
  "status": "error",
  "message": "CSV must contain 'lat' and 'lon' (or 'latitude' and 'longitude') columns"
}
```

### 4.6.5 Control Plane Endpoints

Three read/delete endpoints for inspecting and managing runtime state:

**`GET /api/sources`** — list all data sources (builtin + imported):

```json
{
  "sources": [
    { "id": "worldcover", "name": "ESA WorldCover 2021", "type": "builtin", "channelCount": 14, "cellCount": 17000, "resolution": 4 },
    { "id": "air_quality", "name": "air_quality.csv", "type": "imported", "channelCount": 2, "cellCount": 1247, "resolution": 4 }
  ]
}
```

**`GET /api/channels`** — full channel registry with current index assignments:

```json
{
  "channels": [
    { "index": 0, "key": "worldcover.tree", "source": "worldcover", "name": "tree", "label": "Tree / Forest", "unit": "fraction", "group": "distribution" },
    { "index": 14, "key": "air_quality.pm25", "source": "air_quality", "name": "pm25", "label": "pm25", "unit": "auto", "group": "metric" }
  ]
}
```

**`DELETE /api/sources/:id`** — **hard-delete** an imported source. Removes the source from the channel registry, spatial index, and disk manifest (`data/imports/manifest.json`). Returns 400 for builtin sources. After deletion, triggers `channel_update` (WebSocket) and `/ch/reload` (OSC) notifications. For course scope, hard-delete is sufficient — soft-delete/undo is a Future Work concern.

**Governance:** A `MAX_UNIQUE_CELLS` constant (default: 50,000, configurable in `config.js`) is checked at import time. Uploads producing more unique cells than this limit are rejected with HTTP 413. This prevents runaway memory from unbounded imports during course demos.

### 4.7 Complete Import Flow

1. Caller sends `POST /api/import` via curl or HTTP client with a CSV file
2. Server validates and parses the CSV (first `IMPORT_PREVIEW_ROWS` rows for validation, full file for ingest), auto-detects column roles, runs validation checks. **Streaming parse:** Phase 1.5 uses the `csv-parse` streaming API (async counterpart of `csv-parse/sync` already in the dependency tree — no new dependency). The uploaded file is piped through the streaming parser incrementally, preventing OOM on large uploads and enabling early abort on validation failure. Early governance checks (file size, row count, column count — limits from `config.js`) are evaluated during this phase and reject with 413 before full ingest begins. Existing `data-loader.js` (startup WorldCover pipeline) is unchanged.
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
- Control plane endpoints (`GET /api/sources`, `GET /api/channels`, `DELETE /api/sources/:id`): ~30 lines
- `geojson-generic.js` (FeatureCollection parsing + geometry-to-H3 encoding): ~120 lines (see §4.4.5)
- Tests (import-manager + import-validator + geojson-generic): ~240 lines
- **Total: ~1000 lines, of which ~900 new and ~70 modified**

### 4.9 Definition of Done (Phase 1.5)

- [ ] `POST /api/import` (single-step) accepts a CSV file via curl, returns 200 with source/channels/cellCount. Also accepts a `.geojson` file with Point/LineString/Polygon geometries, returns 200 with source/channels/cellCount. `POST /api/import/preview` stub also returns 200 with the same preview-format response (per §4.6 — contract stability for future two-step split in §8.4). DoD does NOT require full two-step preview/confirm workflow.
- [ ] Imported data survives server restart (`manifest.json` written to `data/imports/`; data reloaded on next startup)
- [ ] `GET /api/sources` lists both builtin and imported sources
- [ ] `GET /api/channels` returns full registry with correct indices (per Channel Index Policy §3.4.5)
- [ ] `DELETE /api/sources/:id` removes an imported source and its disk manifest entry; returns 400 for builtin sources
- [ ] Re-uploading the same `sourceId` replaces the previous import data
- [ ] Upload exceeding `MAX_UNIQUE_CELLS` returns 413. Additionally, early governance checks (file size, row count, column count) reject oversized uploads at the parse phase before full ingest begins.
- [ ] `npm test` + `npm run lint` pass
- [ ] No regressions in existing WorldCover pipeline (manual smoke test)

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

### 5.5 Definition of Done (Phase 2)

- [ ] Hex grid renders correctly at 3 zoom levels: zoom 5 (continental), zoom 8 (regional), zoom 11 (city). Visual spot-check: no visible gaps or overlap between hexagons, cell boundaries align with expected geographic positions on the base map, dateline-crossing viewports do not produce whole-screen fill or shattered fragments.
- [ ] Zoom-to-resolution mapping is documented and explicit in code or config (e.g., zoom 5–7 → res 3, zoom 8–10 → res 4, zoom 11+ → res 5), or fixed at a single resolution for course scope. The mapping must not be implicit or hardcoded in rendering logic.
- [ ] Channel metadata fetched from `/api/channels` (Phase 1.5 control plane) — no hardcoded ESA class names, colors, or indices in frontend code
- [ ] Imported CSV data renders as hex cells alongside WorldCover data
- [ ] Grid overlay toggles on/off without page reload
- [ ] No external CDN requests — h3-js cell boundaries are server-computed and sent via `/api/config` or WebSocket

---

## 5b. Phase 2.5: KML/GPX Import Adapters — DEFERRED

Phase 2.5 (KML/GPX Import Adapters) has been deferred to Future Work. The full design is preserved in §8.1. Prerequisite when implemented: Phase 1.5.

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
- **Total: ~800 lines, of which ~750 new and ~80 modified**

### 7.13 Definition of Done (Phase 4)

- [ ] USGS adapter fetches from the real GeoJSON feed (`earthquake.usgs.gov`), parses features, and produces valid `DataRecord[]`
- [ ] `GET /api/streams` shows the USGS adapter with status `"running"` and a valid `lastFetch` timestamp
- [ ] Sliding time window correctly expires events older than `windowMs`
- [ ] Data-change push fires when an earthquake event falls within a connected client's current viewport
- [ ] Incremental push sends correct OSC: unit test asserts `udpPort.send()` call count matches the number of new cells affected (mock transport, no live UDP needed)
- [ ] Exponential backoff activates on simulated fetch failure (unit test with mock `fetch`)
- [ ] `npm test` + `npm run lint` pass

---

## 7.5. Phase 4.5: Alert Rule Engine

**Goal:** Add a declarative, JSON-configurable alert rule engine that evaluates channel thresholds with hysteresis, cooldown, and deduplication — enabling the "monitoring platform" narrative (see Motivation in OPEN-PLATFORM-SPEC.md). Alert state transitions emit OSC messages for Max-side auditory alerts.

**Prerequisites:** Phase 1a only (channel registry provides channel values for rule evaluation). Phase 4 is **NOT** a prerequisite — the alert engine evaluates `CellSnapshot` channel values generically. Static data (CSV/GeoJSON imports via Phase 1.5) can trigger alerts during viewport navigation; Phase 4's time-window data is just another data source that feeds channel values, not a precondition.

> **When Phase 4 lands:** The stream scheduler's data-change callback also feeds `CellSnapshot`s into the alert engine — no alert engine changes needed. This means real-time earthquake events automatically trigger alert rules that were previously only evaluated on viewport navigation.

### 7.5.1 Rule Schema

Rules are declarative and JSON-configurable, following the same pattern as `audio_mapping.json`:

```jsonc
// alert_rules.json
{
  "rules": [
    {
      "ruleId": "high_magnitude_quake",
      "channel": "usgs_earthquake.quake_mag",
      "enterThreshold": 0.7,    // Normalized value that triggers the alert
      "exitThreshold": 0.5,     // Hysteresis: alert clears when value drops below this
      "severity": "critical",   // "info" | "warning" | "critical"
      "cooldownMs": 30000,      // Minimum time between re-fires for the same cell
      "dedupKey": "cellId"      // One active alert per (ruleId, cellId) pair
    },
    {
      "ruleId": "pm25_warning",
      "channel": "air_quality.pm25",
      "enterThreshold": 0.6,
      "exitThreshold": 0.4,
      "severity": "warning",
      "cooldownMs": 60000,
      "dedupKey": "cellId"
    }
  ]
}
```

### 7.5.2 State Machine

Per `(ruleId, cellId)` pair: `idle` → `active` → `cooldown` → `idle`.

- **idle → active:** Channel value crosses `enterThreshold` upward. Fires `/alert/fire`.
- **active → cooldown:** Channel value drops below `exitThreshold`. Fires `/alert/clear`. Enters cooldown for `cooldownMs`.
- **cooldown → idle:** Cooldown timer expires. Alert can re-fire if threshold is still exceeded.

Hysteresis prevents oscillation at boundary values (enter at 0.7, exit at 0.5 — value must drop significantly before the alert can re-fire).

**Dedup:** Same cell + same rule = one active alert. Prevents alert storms from high-frequency data sources updating the same cell repeatedly.

**Acknowledgment:** `/alert/ack` allows downstream consumers (Max or future UI) to acknowledge an active alert, resetting its visual/audio indicator without clearing the rule state. Explicit payload schemas enable testable unit/integration verification without relying on auditory confirmation.

### 7.5.3 New Files

```
server/
├── alert-engine.js              # Rule evaluation, state machine, cooldown/dedup management
├── __tests__/
│   └── alert-engine.test.js
alert_rules.json                 # Default alert rules configuration (hand-editable)

sonification/
├── alert_sound.js               # ES5 Max [js] object: receives /alert/fire and /alert/clear,
                                 # triggers one-shot alert sounds by severity, fades on clear.
                                 # Wired via [route /alert] → [route fire clear] → [js alert_sound.js].
                                 # No .maxpat editing required — same [route] → [js] pattern as icon_trigger.js.
```

### 7.5.4 Modified Files

| File | Change | Notes |
| ---- | ------ | ----- |
| `server/osc_schema.js` | Add `/alert/fire`, `/alert/clear`, `/alert/mute`, `/alert/ack` addresses with payload schemas | Extend-only, backward-compatible |
| `server/osc.js` | Add `sendAlertFire()`, `sendAlertClear()`, `sendAlertMute()`, `sendAlertAck()` dispatch functions | New OSC push paths |
| `server/config.js` | Add `ALERT_RULES_PATH` constant (default: `./alert_rules.json`), `ALERT_MAX_ACTIVE` (default: 1000) | New config entries |
| `server/index.js` | Initialize alert engine at startup; wire into viewport-processor post-aggregation callback | New startup logic |
| `server/viewport-processor.js` | After aggregation, pass `CellSnapshot[]` to alert engine for rule evaluation | Hook point for static/imported data alerts during navigation |

### 7.5.5 OSC Addresses (Extend-Only)

| Address | Payload | Trigger |
| ------- | ------- | ------- |
| `/alert/fire` | `ruleId(s) cellId(s) severity(s) value(f) timestamp(i)` | Channel crosses `enterThreshold` upward |
| `/alert/clear` | `ruleId(s) cellId(s) timestamp(i)` | Channel drops below `exitThreshold` |
| `/alert/mute` | `ruleId(s) duration(i)` | User/API mutes a rule |
| `/alert/ack` | `ruleId(s) cellId(s) timestamp(i)` | Downstream consumer acknowledges alert |

### 7.5.5.5 Max-Side Alert Sound Handler (alert_sound.js)

**Problem:** `/alert/fire` and `/alert/clear` OSC messages are defined above, but without a Max-side handler, alert sounds cannot be heard. The alert engine's auditory output path is broken until this is addressed.

**Solution:** Add `sonification/alert_sound.js` (~80 lines, ES5 strict):

- **Inlet 0:** Receives messages routed from `[udpreceive]` via `[route /alert]` then `[route fire clear]`.
- **`fire` handler:** Parses `ruleId(s) cellId(s) severity(s) value(f) timestamp(i)`. Selects a one-shot sample based on `severity`:
  - `"critical"` → sharp percussive hit (high urgency)
  - `"warning"` → mid-frequency tone (moderate urgency)
  - `"info"` → soft chime (low urgency)
  - Outputs: bang to trigger `[sfplay~]` or `[buffer~]` playback, plus float for amplitude scaling from `value`.
- **`clear` handler:** Parses `ruleId(s) cellId(s) timestamp(i)`. Outputs a fade-out ramp message (200ms linear ramp to 0) to the corresponding playback voice.
- **Internal cooldown:** Same `ruleId` cannot re-trigger within 500ms (prevents rapid-fire from multiple cells crossing threshold simultaneously).

**Max wiring pattern:** Same as `icon_trigger.js` — `[udpreceive] → [route /alert] → [route fire clear] → [js alert_sound.js] → [sfplay~]`. No `.maxpat` file editing required; wiring is done in the Max patcher UI.

**ES5 constraint:** All code uses `var`, function declarations, no template literals — verified against the same rules as `crossfade_controller.js` and `icon_trigger.js`.

### 7.5.6 Effort Estimate

- `alert-engine.js` (rule evaluation + state machine + cooldown/dedup + config loader): ~200 lines
- `alert_sound.js` (ES5 Max [js] alert handler, see §7.5.5.5): ~80 lines
- OSC dispatch functions in `osc.js`: ~50 lines
- Tests (state machine transitions, cooldown timing, dedup, hysteresis, OSC output verification): ~120 lines
- Existing file modifications (`osc_schema.js`, `config.js`, `index.js` hookup, `viewport-processor.js` hook): ~50 lines
- **Total: ~500 lines, of which ~450 new and ~50 modified**

### 7.5.7 Definition of Done (Phase 4.5)

- [ ] Alert engine loads rules from `alert_rules.json` at startup
- [ ] State machine transitions correctly: idle → active (on `enterThreshold` crossing) → cooldown (on `exitThreshold` crossing) → idle (after `cooldownMs`)
- [ ] Hysteresis works: value oscillating between 0.5 and 0.7 with `exitThreshold`=0.5, `enterThreshold`=0.7 does not cause rapid re-fires
- [ ] Dedup works: same `(ruleId, cellId)` pair produces at most one active alert
- [ ] Cooldown works: after alert clears, re-fire is suppressed for `cooldownMs`
- [ ] `/alert/fire` OSC is sent with correct payload (`ruleId`, `cellId`, `severity`, `value`, `timestamp`) — verified by unit test with mock UDP transport
- [ ] `/alert/clear` OSC is sent when value drops below `exitThreshold`
- [ ] Invalid `alert_rules.json` is rejected at startup with a descriptive error (server still starts with alerting disabled)
- [ ] `sonification/alert_sound.js` receives `/alert/fire` message and outputs trigger bang + amplitude float (verified by manual Max test — load the script, send test `/alert/fire` message via Max message box, confirm `[sfplay~]` triggers)
- [ ] `alert_sound.js` is ES5 compliant — no `let`/`const`, no arrow functions, no template literals, no destructuring (verified by loading in Max [js] object without errors)
- [ ] `npm test` + `npm run lint` pass

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

> **Architectural principle: Server as fold-mapper, Max as audio renderer.** The server reads `audio_mapping.json`, computes folded bus values from channel data, and sends stable per-bus floats to Max via `/bus/{index}`. Max never needs to know about channel counts or fold methods. Adding new data channels = server folds them into existing buses → no Max changes required. The crossfade controller rewrite (Option A below) only handles `N_BUSES` messages, not `N_CHANNELS`.

> **Note:** Existing per-channel `/ch/*` addresses are retained for debugging and visualization. `/bus/*` is additive — it does not replace `/ch/*`. This follows the extend-only OSC principle (CLAUDE.md).

> **Bus registration (minimal self-description):** To avoid shifting the "Max doesn't know what index N means" problem from channels to buses, add bus-level registration messages:
> - `/bus/register {index} {busName}` — sent at startup and after bus config change (foldMethod, volume range as optional trailing args)
> - `/bus/reload` — sent when bus configuration changes at runtime (analogous to `/ch/reload`)
>
> These are extend-only additions. Max-side handling is optional — `/bus/register` can be silently ignored until a future Max patch decides to use bus names. **Note:** `/bus/reload` is implemented in Phase 1a (§3.5.5) via the audio-mapping reload API. Phase 3 builds on this foundation.

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

**Minimum Console scope (for "non-technical user" demo):** A minimal console providing only bus-channel drag-and-drop mapping + per-bus volume sliders (no icon/smoothing configuration) would be ~250 lines of frontend code. This provides the core "configure audio without editing JSON" experience at reduced effort.

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

### 8.5 Alert Engine — Compound Rule Support

Prerequisite: Phase 4.5.

The current Phase 4.5 alert engine supports single-channel threshold rules only. Real-world monitoring scenarios often require **compound conditions** that evaluate AND/OR combinations across multiple channels. For example:

- Fire alert: `fire_count > threshold AND fire_intensity > threshold`
- Air quality alert: `pm25 > threshold AND wind_speed < threshold` (stagnant high-pollution conditions)

**Design direction:** Extend the `alert_rules.json` schema with a `"compound"` rule type that accepts an `"expression"` field containing a mini-DSL or structured condition tree. The `alert-engine.js` evaluator would parse this expression and evaluate it against the current `CellSnapshot` channel values. Estimated additional complexity: ~50–80 lines in `alert-engine.js`, plus schema validation and tests.

This is deferred because single-channel rules cover the course demo scenarios (earthquake magnitude, PM2.5 level) adequately.

### 8.6 Alert Rule Engine — Promoted to Phase 4.5

The alert rule engine design has been promoted from Future Work to a formal phase. See §7.5 (Phase 4.5: Alert Rule Engine) for the complete specification including rule schema, state machine design, OSC addresses, effort estimate, and Definition of Done.

---

## 9. Total Engineering Effort Summary

| Phase | New Code | Modified Code | Risk | Prerequisites |
| ----- | -------- | ------------- | ---- | ------------- |
| 0: H3 Encoding Layer | ~300 lines | ~30 lines | Very low (pure addition) | None (requires `h3-js` dependency approval) |
| 1a: Adapters + Registry + Audio-Mapping + Minimal Fold-Mapping | ~1200 lines | ~120 lines | Medium (refactors core data flow) | Phase 0 |
| 1b: spatial.js H3 Migration | ~250 lines | ~600 lines | **High** (parallel index structure + recommended module split) | Phase 1a |
| 1.5: Runtime Import (CSV + GeoJSON) | ~900 lines | ~70 lines | Medium (runtime state mutation + validation logic) | Phase 1a |
| 2: Frontend Decoupling | ~400 lines | ~200 lines | Medium (grid rendering rewrite) | Phase 1b |
| 4: Stream + USGS Earthquake | ~750 lines | ~80 lines | Medium (real-time state + external dependency) | Phase 1a + Phase 1.5 |
| 4.5: Alert Rule Engine + Max Alert Handler | ~450 lines | ~50 lines | Low-medium (state machine + config parsing + ES5 script) | Phase 1a |

**In-scope total: ~4250 lines of new code, ~1150 lines modified.** The modified total includes ~530 lines of reorganized code from the Phase 1b spatial.js module split — these are existing lines being moved across files, not net new logic. If the split is skipped (see §3b.4), the modified total drops to ~620.

> **Disclaimer:** Line counts are complexity proxies, not schedule predictors. Actual calendar time depends on debugging, Max integration testing, and iteration cycles. Use these numbers for relative sizing between phases, not for setting deadlines.

**`spatial.js` modification ordering:** Phases 1b, 1.5, and 4 all modify `spatial.js`. Apply changes in order: Phase 1b adds `queryByH3()`, Phase 1.5 adds `addCells()`, Phase 4 modifies `queryByH3()` to merge time-window data. Phase 2 does *not* modify `spatial.js` (frontend-only). If phases are developed on branches, rebase against `spatial.js` changes before merging.

**Shortest path to "CSV upload → hex grid → sound":** Phase 0 → 1a → 1b → 1.5 → 2 (~3050 lines new).

**Shortest path to "real-time earthquake → sound":** Phase 0 → 1a → 1.5 → 4 (~3150 lines new; **Phase 1b not required** — stream scheduler encodes H3 directly).

**Shortest path to "real-time earthquake → alert sound":** Phase 0 → 1a → 4.5 → 1.5 → 4 (~3600 lines new).

**Earliest alert capability:** Phase 0 → 1a → 4.5 (~1950 lines new). Alert rules evaluate WorldCover static data during viewport navigation immediately — no streaming or import pipeline needed. With `alert_sound.js`, alert sounds are audible in Max.

> **Note:** Phase 1b is required for Phase 2 (frontend needs `queryByH3()`), but not for Phase 4 (stream scheduler encodes H3 cell IDs directly and injects via `addCells()`). Phase 4.5 depends only on Phase 1a (channel registry) and can be slotted in at any point after 1a.

---

## 10. Suggested Timeline (Aligned with Course Schedule)

- **This week:** Phase 0 — pure addition, changes only touch config and type definitions (no runtime logic modified), safe to run in parallel with the milestone demo.
- **After the next milestone:** Phase 1a — independently demoable (adapter pattern + channel registry + audio-mapping reload, no spatial.js risk).
- **Immediately after Phase 1a:** Phase 4.5 — Alert rule engine + Max alert handler. Only depends on the channel registry from Phase 1a. Lightweight addition (~500 lines) that enables alert capability for both static and imported data, with audible alert sounds via `alert_sound.js`. Can be demonstrated with WorldCover data immediately (e.g., alert when a cell's forest coverage drops below threshold during viewport navigation).
- **If time permits:** Phase 1b — spatial.js H3 migration. Can defer if Phase 2 is not needed for demo.
- **Phase 1.5:** Runtime import — opens the CSV + GeoJSON data path.
- **Before end of course:** Phase 2 OR Phase 4, depending on desired showcase:
  - **Choose Phase 2** → Showcase "hexagonal map + multi-source data visualization" (strong visual impact; requires Phase 1b)
  - **Choose Phase 4** → Showcase "real-time earthquake data driving sound changes + alert triggering" (strong auditory impact; **does not require Phase 1b**; alert engine from Phase 4.5 fires on earthquake threshold crossing)
  - If time permits, do both.
- **After the course ends:** Remaining Future Work (§8).

### 10.0.1 Capability Milestones (End-to-End Status Per Phase)

Each milestone describes what the system **can and cannot do** at that point. This prevents showcase narratives from implying capabilities that have not yet landed.

| After Phase | What Works End-to-End | What Does NOT Work Yet |
| ----------- | --------------------- | ---------------------- |
| Phase 0 | H3 encoding available as library. Existing demo unchanged. | No new data flows through H3 yet. |
| Phase 1a | Adapter framework + channel registry operational. WorldCover data flows identically. Imported channels send `/ch/{index}` OSC. Minimal fold-mapping computes `/bus/{index}` values. | Frontend still shows legacy grid. No real-time streaming. |
| Phase 1a + import (Phase 1.5) | Upload CSV → channels registered → server fold-maps to `/bus/*` → Max receives bus values → **sound from arbitrary data.** First "upload to sound" demo possible. | No hexagonal grid display (needs Phase 1b + 2). No real-time streaming. |
| Phase 4.5 | Alert rules evaluate channel values. `/alert/fire` and `/alert/clear` OSC fire on threshold crossing. `alert_sound.js` triggers audible alert sounds in Max. | Alerts only fire during viewport navigation (static/imported data). No real-time stream triggers yet. |
| Phase 4 | Real-time USGS earthquake data streams in. Data-change-driven OSC push. Alert engine fires on live earthquake events. **First "live monitoring" demo possible.** | Frontend hex rendering requires Phase 1b + Phase 2. |

### 10.1 Showcase Narratives and Product Verification Mainlines

The two closed loops below serve a dual purpose: **demo scripts** for course presentation AND **product verification mainlines**. After each phase lands, the applicable loop should be executed end-to-end. If a loop breaks, the phase is not complete.

> **Test environment note:** Timing benchmarks (2s, 500ms, 200ms) assume local development (server + Max on same machine, localhost network). CI or remote environments may need relaxed thresholds — these numbers are smoke-test targets, not SLA guarantees.

**Closed Loop A — "From Spreadsheet to Soundscape" (visual emphasis, Phases 0 → 1a → 4.5 → 1b → 1.5 → 2)**

- Demo flow: `POST /api/import` via curl with a CSV → server validates and ingests → hex grid appears on map → pan/zoom viewport → ambient sound changes in real time → navigate into a high-PM2.5 zone → alert engine fires `/alert/fire` → percussive alert sounds.
- Audience sees: hexagonal grid fills in, colors shift as the viewport moves across regions; alert indicator flashes when entering a threshold-crossing zone.
- Audience hears: tonal gradient reflecting data values across the viewport — smooth crossfades between zones, punctuated by a sharp alert tone when a cell exceeds the configured threshold.
- Core message: *"Any tabular geodata becomes an audible landscape in under a minute — and you hear the anomaly before you see it."*
- **Verification criteria:** (1) API returns 200 with valid source/channels/cellCount, (2) hex grid appears within 2s of import, (3) panning produces audible change within 500ms, (4) alert engine fires `/alert/fire` when navigating into a cell exceeding `enterThreshold`, (5) no browser console errors.

**Closed Loop B — "Live Earthquake Alert" (auditory emphasis, Phases 0 → 1a → 4.5 → 1.5 → 4)**

- Demo flow: USGS adapter is running → earthquake event arrives → new cells appear on map → alert engine evaluates magnitude against threshold → `/alert/fire` OSC fires → alert sound triggers in Max.
- Audience sees: new hex cells pulse onto the map at the epicenter location.
- Audience hears: immediate percussive alert driven by `/alert/fire` when magnitude crosses threshold (Phase 4.5 alert engine), ambient low rumble conveying depth.
- Core message: *"You hear the earthquake before you see the dashboard notification."*
- **Verification criteria:** (1) `GET /api/streams` shows USGS adapter as `"running"`, (2) new earthquake cell appears within one poll interval, (3) OSC message fires for the new cell, (4) alert engine fires `/alert/fire` for cells exceeding `enterThreshold`, (5) alert sound triggers in Max within 200ms of OSC receipt.

See §9 "Shortest path" calculations for the engineering effort behind each loop.

### 10.2 Quick Demo Verification Script (5-Minute Smoke Test)

The following curl sequence verifies the full import-to-sound pipeline after Phase 1a + Phase 1.5 land. Run from a terminal with the server running locally.

```bash
# 1. Import a test CSV (assumes test_data/air_quality_sample.csv exists)
curl -X POST http://localhost:3000/api/import \
  -F "file=@test_data/air_quality_sample.csv" \
  -F "sourceId=air_quality"
# Expect: 200 { "status": "ok", "source": "air_quality", "channels": [...], "cellCount": ... }

# 2. Verify channels registered
curl http://localhost:3000/api/channels
# Expect: air_quality.pm25, air_quality.temp_c visible in channel list

# 3. Reload audio mapping (if audio_mapping.json was edited to add bus mapping)
curl -X POST http://localhost:3000/api/audio-mapping/reload
# Expect: 200 { "status": "ok", "buses": 5, ... }

# 4. Verify sources
curl http://localhost:3000/api/sources
# Expect: worldcover (builtin) + air_quality (imported)

# 5. Open frontend, navigate viewport to data region
# → Confirm OSC messages appear in Max console
# → Confirm ambient sound changes reflect imported data
```

This script doubles as a CI smoke test. Steps 1–4 are automatable; step 5 requires manual auditory verification.
