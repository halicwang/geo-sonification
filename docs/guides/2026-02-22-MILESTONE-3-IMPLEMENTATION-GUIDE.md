# Milestone 3 — Open Platform Implementation Guide

**Status:** Combined Technical Design + Engineering Execution Reference
**Date:** 2026-02-22
**Scope:** Technical rationale, file-level work packets, dependency gates, risk hotspots, and validation scripts

## Executive Intro

This document merges the former Technical Design Companion and Engineering Reference Companion into a single implementation guide.
It answers WHY choices were made, HOW to avoid failure modes, and WHAT the file-level execution packets are for each phase.
It does not replace the SPEC or PLAN; it supports both with a single reference layer.

## 0. Three-Document Protocol

The project uses three lighthouse documents:

| Document | Role | Authority |
| --- | --- | --- |
| `OPEN-PLATFORM-SPEC` | Normative contracts (`MUST/SHOULD/MAY`) | Highest — defines what to build |
| `MIGRATION-PLAN` | Phase sequencing, evidence, rollback | Second — defines delivery order |
| `IMPLEMENTATION-GUIDE` | Technical rationale + engineering packets | Third — defines why and how |

### 0.1 Three-Document Use
The Three-Document Protocol is defined authoritatively in `OPEN-PLATFORM-SPEC` §0.1. This document inherits all protocol rules and adds no overrides.

## 1. Phase Anchors

Section numbers in this document are local structure only. Cross-document tracking uses `P0..P5` phase IDs.
`P0..P5` are progress labels only; normative requirement strength is defined exclusively by RFC 2119 keywords (`MUST/SHOULD/MAY`).

| Phase ID | Primary Anchors In This Document |
| --- | --- |
| `P0` | `10.1`, `14. WorldCover Baseline Manifest` |
| `P1` | `10.2`, `6. Adapter Contracts`, `7. Import Pipeline`, `8. Channel Registry` |
| `P2` | `10.3`, `4. H3 Technical Deep Dive` |
| `P3` | `10.4`, `9. Alert Engine Semantics` |
| `P4` | `10.5`, `8.4 Audio Runtime Config Invariants` |
| `P5` | `10.6`, `8.5 Governance Baseline Hooks` |

## 2. Coupling Analysis (Legacy Constraints)

These couplings explain why migration must be staged and regression-guarded.

| File | Coupling Point | Severity |
| --- | --- | --- |
| `server/config.js` | `GRID_SIZE`, `LON_BUCKETS`, `LAT_BUCKETS` legacy geometry | High |
| `server/spatial.js` | bucket-based spatial index and viewport query | High |
| `server/data-loader.js` | WorldCover-specific CSV mapping and fields | High |
| `server/landcover.js` | fixed ESA class metadata assumptions | High |
| `server/types.js` | `GridCell` with fixed `lc_pct_*` shape | Medium |
| `server/audio-metrics.js` | fixed 11-class to 5-bus fold logic | High |
| `frontend/map.js` | legacy grid overlay assumptions | High |
| `frontend/landcover.js` | hard assumptions on WorldCover class metadata | Medium |

Execution note: Any change touching `server/spatial.js` or query contracts should be treated as high-risk and gated behind compatibility tests.

## 3. V1 Dependency Approvals (Pre-Approved)

All V1 dependencies below are pre-approved. No per-packet approval gate is needed; dependencies may be introduced when the corresponding work packet begins.

| Dependency | Estimated Size | Used By | Purpose |
| --- | --- | --- | --- |
| `h3-js` | ~1.2 MB | P2 | H3 encode/query support |
| `multer` or `busboy` | ~50 KB | P1 | `POST /api/import` multipart file handling |
| `ajv` (or equivalent) | ~200 KB | P3 | Push/source payload schema validation |
| `express-rate-limit` (or equivalent) | ~30 KB | P5 | Control-plane rate limiting and quota |

Future dependencies (not pre-approved, require explicit approval):

| Dependency | Estimated Size | Used By | Purpose | Priority |
| --- | --- | --- | --- | --- |
| `shpjs` or `shapefile` | ~60 KB | Future | Shapefile parsing | P1 |
| `parquet-wasm` or `hyparquet` | ~500 KB | Future | Parquet / GeoParquet reading | P2 |
| `fast-xml-parser` | ~40 KB | Future | KML/GPX XML parsing | P3 |
| `netcdfjs` | ~120 KB | Future | NetCDF reading | P4 |

## 4. H3 Technical Deep Dive

### 4.1 Why H3 over Quadkey/Geohash

| Factor | H3 | Quadkey | Geohash |
| --- | --- | --- | --- |
| Ecosystem interoperability | Strongest in analytics tools | Tile ecosystem focused | Moderate |
| Area consistency | Better consistency per resolution | Latitude distortion | Latitude distortion |
| Neighbor ops | Native `gridDisk` | Manual computation | Boundary handling complexity |
| Viewport enumeration | `polygonToCells` | loop math | moderate |

Decision consequence: H3 is the platform spatial language. Alternative encoders are extensibility topics, not V1 defaults.

### 4.2 Coordinate-order traps (high-risk bug class)

Rule summary:

- GeoJSON arrays are `[lon, lat]`.
- `latLngToCell` takes `(lat, lon)`.
- `cellToBoundary` returns `[lat, lng]` pairs; flip to `[lng, lat]` for GeoJSON.
- `polygonToCells` consumes GeoJSON-style coordinates (`[lon, lat]`).

Safe conversion examples:

```js
const cellId = latLngToCell(coord[1], coord[0], res); // coord from GeoJSON [lon, lat]
const geojsonBoundary = cellToBoundary(cellId).map(([lat, lng]) => [lng, lat]);
```

Guardrail: Add coordinate-order regression tests for `latLngToCell`, `polygonToCells`, and `cellToBoundary` output transforms.

### 4.3 Resolution policy and human-facing labels

| Res | Approx Edge | Approx Area | Human Label | Primary Use |
| --- | --- | --- | --- | --- |
| 3 | ~60 km | ~12,400 km² | Province / State | broad regional |
| 4 | ~23 km | ~1,770 km² | Metro area (default) | default platform layer |
| 5 | ~8 km | ~253 km² | City | denser city ops |
| 7 | ~1.2 km | ~5.2 km² | Neighborhood | fine local analysis |

Rationale: Numeric H3 levels are not intuitive for operators; labels prevent incorrect tuning decisions.

### 4.4 Multi-resolution query strategy

Required strategy:

1. Store per-source data at native resolution (`DataRecord.resolution`).
2. Downsample (`queryRes < storedRes`): aggregate by parent using channel fold semantics.
3. Upsample (`queryRes > storedRes`): parent broadcast to children (no fake interpolation).
4. Same resolution: direct lookup.

Critical performance constraint: Do not use `cellToChildren()` in hot viewport query path. Complexity explosion `O(7^(deltaRes))`; parent-lookup approach keeps per-cell work close to O(1).

### 4.5 CellEncoder abstraction (extensibility boundary)

```js
/**
 * encode(lat, lon, precision) -> cellId
 * decode(cellId) -> {lat, lon, boundary}
 * parent(cellId, precision) -> cellId
 * precision(cellId) -> number
 * precisionForZoom(zoom) -> number
 * enumerateBounds(bounds, precision) -> cellId[]
 * neighbors(cellId, k) -> cellId[]
 */
```

Rationale: Keeps spatial backend swappable while preserving uniform contracts for ingestion and query code.

### 4.6 SLO prerequisite boundary (P2+)

- Before P2, legacy grid path behavior can be measured for baseline and trend only.
- After P2 exits, H3 path is the normative target and supports stable p95/p99 gate enforcement.
- Any statement claiming normative SLO compliance MUST identify the active spatial path and MUST NOT certify P2+ SLOs while legacy path is still the serving path.

### 4.7 V1 Scaling Boundary (Hard Limit)

V1 is architectured for single-instance deployment with explicit capacity limits:

| Dimension | V1 Hard Limit | Scaling Approach (Post-V1) |
| --- | --- | --- |
| Concurrent viewport clients | 200 per instance | Horizontal instance scaling + load balancer |
| Unique cells per source | 500,000 | Sharded spatial index |
| Total sources | Not hard-limited in V1 | Source partitioning |

- These limits are V1 scope and MUST be validated by the P2 benchmark gate.
- Runtime SHOULD expose current utilization (active clients, cell counts) via `/api/config` or a status endpoint.
- Exceeding these limits without architecture changes is unsupported and may cause degraded performance without clear error signals.
- Implementation SHOULD add monitoring hooks that warn operators when utilization approaches 80% of hard limits.

## 5. Canonical Data Model Rationale

### 5.1 DataRecord keeps both `channels` and `channelsRaw`

```json
{
    "cellId": "85283473fffffff",
    "source": "air_quality",
    "channels": { "pm25": 0.65 },
    "channelsRaw": { "pm25": 83.2 }
}
```

Design rationale:

- `channels` is the runtime normalized value used by alert/audio/query paths.
- `channelsRaw` preserves source-unit values, so normalization methods/ranges can change without full re-import.
- If raw values are not preserved, changing from `linear` to `log`, or changing range bounds, forces data reload and creates operational downtime risk.

Implementation invariant: For already normalized sources (e.g. WorldCover fractions), `channelsRaw == channels` is valid.

### 5.2 Bare keys in storage, namespaced keys in merged output

- `DataRecord` stores bare keys (`tree`, `pm25`) plus `source`, avoiding double-encoding source identity.
- `CellSnapshot` is a merged output object and MUST expose namespaced keys (`sourceId.channelName`) to prevent collisions.
- Incorrect pattern: storing namespaced keys in `DataRecord` and then namespacing again at merge time.

### 5.3 Storage index shape and merge algorithm

Index shape (target): `Map<cellId, Map<sourceId, DataRecord>>`

Merge algorithm (query layer):

1. Load all `DataRecord`s for `cellId`.
2. Prefix each channel key with `sourceId.`.
3. Merge namespaced channels into one `CellSnapshot.channels` object.
4. Record contributing sources in `CellSnapshot.sources`.

Design rationale: Makes multi-source overlay deterministic and explicit. Supports partial source deletes and source-specific replacement.

## 6. Adapter Interface Contracts (Frozen Module Boundary)

### 6.1 DataAdapter contract

```js
/**
 * @typedef {Object} DataAdapter
 * @property {string} id - Unique adapter ID (e.g. "worldcover", "air_quality")
 * @property {string} name - Display name
 * @property {ChannelManifest[]} channels - Declared channel manifest
 * @property {"static"|"stream"|"timeseries"} temporalType - Adapter data mode
 * @property {string} [version] - Semantic version
 * @property {Object<string, string>} [requiredConfig] - Required config key types
 * @property {(rawData: any, encoder: CellEncoder, precision: number) => DataRecord[]} ingest
 * @property {Object<string, Function>} [importFormats] - Supported import format parsers
 */
```

Engineering intent: All adapters expose the same discovery and ingest surface for registry/control-plane integration. `requiredConfig` validates presence/type at registration time, but secrets must never leak via public APIs.

### 6.2 StreamAdapter extension

```js
/**
 * @typedef {Object} StreamAdapter
 * @extends DataAdapter
 * @property {"stream"} temporalType
 * @property {number} pollIntervalMs
 * @property {number} windowMs
 * @property {"count"|"mean"|"max"|"last"} windowAggregate
 * @property {(encoder: CellEncoder, precision: number) => Promise<DataRecord[]>} fetch
 */
```

### 6.3 PushAdapter extension (V1 minimum)

```js
/**
 * @typedef {Object} PushAdapter
 * @extends DataAdapter
 * @property {"stream"} temporalType
 * @property {"stream_push"} mode
 * @property {number} dedupWindowMs
 * @property {number} maxBatchSize
 * @property {number} maxQueueDepth
 * @property {(records: PushEvent[], encoder: CellEncoder, precision: number) => Promise<PushIngestAck>} ingestPush
 */
```

Engineering intent: Push ingress is a first-class stream mode, not an ad-hoc side path. `POST /api/sources` establishes source metadata/schema before data payloads arrive. `POST /api/streams/push/:sourceId` accepts event batches only for pre-registered `mode=stream_push` sources.

### 6.4 SourceDescriptor shape (control-plane metadata)

```json
{
    "sourceId": "aq_stream",
    "mode": "stream_push",
    "schemaVersion": 1,
    "ownerTeam": "ops_air",
    "status": "active"
}
```

Rationale: Source lifecycle and push validity checks depend on stable metadata, not inferred runtime state. `mode` disambiguates static/batch import sources from stream poll/push descriptors.

## 7. Import Pipeline Deep Semantics

### 7.1 CSV minimal contract

Required columns: `lat`, `lon` (or aliases `latitude`, `longitude`). Any additional numeric field becomes candidate channel. Optional: `timestamp`, `alt`.

### 7.2 Preview validation checks

| Check | Why It Exists |
| --- | --- |
| Role detection | Prevent manual mapping for common cases |
| Non-numeric detection | Avoid accidental string-as-channel corruption |
| Missing values | Make row drop/NaN behavior explicit |
| Coordinate sanity and swap detection | Prevent silent lat/lon inversion bugs |
| CRS hint check | Block projected coordinates falsely treated as WGS84 |
| Density/resolution mismatch warning | Avoid undersampled/oversampled H3 output |

### 7.3 Source ID and persistence rules

- `sourceId` must be sanitized: lowercase, underscores, max length, safe chars.
- Re-import with same `sourceId` replaces previous source atomically.
- Manifest writes must use temp-file + rename to avoid crash corruption.
- Manifest MUST persist discovered channel names (bare keys) per source. On restart, channel registry is rebuilt from manifest metadata without re-parsing source files. If source file is re-parsed (e.g., cache miss), channel list MUST match manifest declaration or trigger a validation warning.

### 7.4 API boundary (`/api/import` vs `/api/sources`)

Boundary rationale:

- `POST /api/import` is optimized for static/batch file payloads and data-carrying registration.
- `POST /api/sources` is metadata-only pre-registration for stream sources (poll/push).
- Keeping them separate prevents ambiguous partial-registration states and simplifies validation/error contracts.

Implementation invariants:

- `/api/import` MUST parse payload and produce `DataRecord[]` in one transaction.
- `/api/sources` MUST validate descriptor/schema without ingesting observation payload.
- Push events MUST be rejected (`404`/`409`) when source registration state is absent or incompatible.
- Static/batch lifecycle persists in `data/imports/manifest.json`; stream lifecycle persists in `stream_sources.json`.
- `DELETE /api/sources/:id` MUST remove from applicable store(s) and runtime registry atomically (all-or-nothing).

## 8. Channel Registry and Runtime Stability

### 8.1 Namespace strategy

Canonical key format: `sourceId.channelName`

Used in: channel registry records, CellSnapshot channels, audio mapping config, alert rule channel references.

### 8.2 Channel index assignment policy

- Builtin channels: fixed positions for compatibility.
- Imported channels: deterministic append order from manifest/import order.
- Runtime mutation (delete/re-import): index changes allowed for non-builtin channels, but must trigger reload notifications.

### 8.3 Notification invariants

On registry change:
- Emit `channel_update` (WebSocket) with incremented `version`.
- Emit reload signal for downstream consumers.
- `GET /api/channels` is source of truth.

On audio mapping change:
- Emit `bus_config_update` (WebSocket) with incremented `version`.

Ordering rule: if a single operation triggers both `channel_update` and `bus_config_update`, the server MUST send `channel_update` first on each client connection before sending `bus_config_update`. This ensures clients can update their channel index before processing new bus assignments.

Anti-pattern: sending `bus_config_update` referencing channels that the client hasn't yet received via `channel_update`.

### 8.4 Audio Runtime Config Invariants

- Runtime mapping changes must be schema-validated before activation.
- Invalid updates must preserve last-known-good runtime config.
- Audio mapping reload and channel registry updates must remain causally ordered.
- Bus-level behavior must remain deterministic for the same channel snapshot input.

### 8.5 Governance Baseline Hooks

- Adapter required config must support secret-presence validation without leaking values.
- Import and control mutations should be designed for auth middleware insertion points.
- Import path must expose quota/rate-limit decision hooks before expensive parse/ingest work.
- Change operations should emit auditable events (import/delete/reload/rule updates).

### 8.6 Channel Resolution Invariants

- Channel registry is dynamic: sources may arrive and depart at runtime.
- All consumers of channel values (alert engine, audio mapping engine) MUST check resolution status before evaluation.
- Unresolved channel → value is undefined (not 0, not NaN).
- Re-evaluation trigger: source online/offline events MUST propagate to alert engine and audio mapping engine for rule/mapping re-check.
- Anti-pattern: treating unresolved channels as 0 silently suppresses alerts and produces incorrect audio output.

## 9. Alert Engine Semantics

State machine per `(ruleId, cellId)`: `idle -> active -> cooldown -> idle`

Required semantics:

- Enter on `enterThreshold` crossing.
- Clear on `exitThreshold` crossing.
- Cooldown suppresses immediate refire.
- Dedup prevents repeated active fires for same key.

Why this matters: Without hysteresis/cooldown/dedup, operators get alert storms and stop trusting audio alerts.

### 9.0.1 Compound Rule Evaluation (V1)

V1 supports basic compound rules with `AND` / `OR` operators across 2-3 conditions (single operator level, no nesting).

Evaluation semantics:
- `AND`: rule fires when ALL conditions cross their `enterThreshold`. Rule clears when ANY condition crosses its `exitThreshold`.
- `OR`: rule fires when ANY condition crosses its `enterThreshold`. Rule clears when ALL conditions cross their `exitThreshold`.
- Each condition is evaluated independently against its channel's current normalized value.
- Cooldown and dedup apply at the compound rule level (keyed by `ruleId + cellId`), not per-condition.

State machine remains `idle -> active -> cooldown -> idle` per `(ruleId, cellId)`. The fire/clear transition logic differs only in how enter/exit predicates are composed.

Implementation constraint: V1 MUST NOT support nested compound rules (compound rules containing compound conditions). The `conditions` array MUST contain 2-3 simple channel/threshold entries only.

Why flat-only: Nested compound rules create exponential state complexity and make operator debugging extremely difficult. The 2-3 condition limit is sufficient for common multi-channel monitoring scenarios (e.g., "high pollution AND high temperature").

### 9.0.2 Unresolved Channel Handling in Alert Evaluation

- If a simple rule's channel is unresolved, the rule stays in `idle` and does not evaluate.
- If a compound AND rule has any unresolved condition, the rule stays in `idle`.
- If a compound OR rule has some resolved and some unresolved conditions, only resolved conditions are evaluated. If all are unresolved, the rule stays in `idle`.

### 9.1 Push ingress payload and acknowledgement types

`PushEvent` (technical type):

```json
{
    "eventId": "evt-20260222-001",
    "timestamp": "2026-02-22T06:31:10Z",
    "cellId": "85283473fffffff",
    "lat": 37.78,
    "lon": -122.41,
    "channelsRaw": { "pm25": 83.2, "temp_c": 29.5 },
    "meta": { "sourceConfidence": 0.91 }
}
```

Type rules:

- `timestamp` is required.
- Spatial key precedence (deterministic):
  1. If `cellId` is present and non-null: use `cellId` directly; `lat`/`lon` are ignored.
  2. If `cellId` is absent/null and both `lat`+`lon` are present: encode cell from coordinates using source's declared resolution.
  3. If neither `cellId` nor `lat`+`lon` are present: reject record with code `MISSING_SPATIAL_KEY`.
  4. If `cellId` is present but is not a valid H3 index: reject record with code `INVALID_CELL_ID`.
- `channelsRaw` is required; normalization is adapter/runtime responsibility, not producer responsibility.

`PushIngestAck` (technical type):

```json
{
    "accepted": 4980,
    "deduped": 15,
    "rejected": 5,
    "ingestLatencyMs": 42,
    "errors": [
        {
            "index": 17,
            "code": "INVALID_COORDINATE",
            "message": "lat out of range"
        }
    ]
}
```

Ack rules:

- Partial acceptance is allowed and MUST include per-record error details.
- Ack counters MUST sum to input record count.
- `ingestLatencyMs` MUST measure server-side processing window for the batch.

### 9.2 Idempotency, dedup, and backpressure semantics

- `Idempotency-Key` identifies retried push requests and MUST prevent duplicate ingestion in the dedup window.
- Dedup window default (`dedupWindowMs`) is source-configurable with a V1 baseline default.
- Queue depth cap enforces backpressure; exceeded cap MUST return `429`.
- Oversized push batches MUST return `413` before expensive ingest work begins.

### 9.3 Control workflow rationale (non-contract)

Rationale for `Draft -> Validate -> Apply -> Rollback`:

- Draft separates exploration from activation.
- Validate prevents runtime corruption from invalid mapping/rule sets.
- Apply is the explicit operational cutover point.
- Rollback preserves operator trust under incident pressure.

Boundary note: The workflow itself is normative in SPEC. This section exists only to explain why this workflow is safer than direct in-place edits.

V1 delivery surface note: The `Draft -> Validate -> Apply -> Rollback` workflow is delivered as REST API endpoints in V1. A graphical UI is future scope. Operators use HTTP clients (curl, Postman, scripts) to execute the workflow.

## 10. Phase Work Packets

### 10.1 [P0] Compatibility Guardrails

**Execution note: P0 and P1 Packet A start in parallel. See section 12 for sequencing.**

#### Packet P0-A: Golden baseline harness

- Scope:
    - Snapshot `/api/config`, `/api/viewport`, WebSocket `stats` payloads.
    - Add canonical comparison rules (stable ordering + float tolerance).
    - Lock WorldCover baseline channels: `tree`, `shrub`, `grass`, `crop`, `urban`, `bare`, `snow`, `water`, `wetland`, `mangrove`, `moss`, `nightlight`, `population`, `forest`, plus derived `proximity` where applicable.
- Risk: Low.
- Output: baseline fixtures and mandatory CI gate.

#### Packet P0-B: Provisional SLO benchmark gate

- Scope:
    - Execute coarse local benchmark script against `POST /api/viewport`.
    - Capture p50/p95/p99 and sample environment metadata.
    - Publish provisional metric table and freeze criteria handoff for P2.
- Output: benchmark report template + first baseline run record.
- Risk: Low (informational), but high impact if omitted because SLO freeze cannot proceed cleanly.

### 10.2 [P1] Open Ingestion + Control Plane (Parallel Start with P0)

**Execution note: Packet P1-A starts in parallel with P0. P1-B onward starts after P0 gate is green.**

#### Packet P1-A: Adapter + Registry foundation

- New files:
    - `server/adapters/adapter-interface.js`
    - `server/adapters/worldcover.js`
    - `server/adapters/csv-generic.js`
    - `server/channel-registry.js`
- Core file updates:
    - `server/index.js`, `server/data-loader.js`, `server/landcover.js`, `server/audio-metrics.js`
- Target effort: ~1100 LOC equivalent change volume.
- Key risk: behavior parity with existing WorldCover path.

#### Packet P1-B: Runtime import lifecycle

- New files:
    - `server/import-manager.js`
    - `server/import-validator.js`
    - `server/adapters/geojson-generic.js`
    - tests for manager/validator/geojson adapter
- Data persistence:
    - `data/imports/manifest.json` for static/batch sources with atomic write/recover semantics.
    - `stream_sources.json` for stream source descriptors with atomic write/recover semantics.
    - `DELETE /api/sources/:id` cleanup across applicable store(s) with all-or-nothing behavior.
- API additions:
    - `POST /api/import`
    - `POST /api/sources`
    - `GET /api/sources`
    - `GET /api/channels`
    - `DELETE /api/sources/:id`
- Target effort: ~1000 LOC equivalent change volume.
- Key risk: runtime mutation safety and import validation correctness.

#### Packet P1-C: API responsibility boundary hardening

- Scope:
    - Enforce non-overlapping responsibilities for `/api/import` vs `/api/sources`.
    - Add conflict/error contracts for mode/schema mismatch.
    - Add integration tests for success + conflict scenarios.
- Risk: Medium (contract ambiguity creates downstream rework in P3/P4).

#### Packet P1-D: Degraded end-to-end demo (early value validation)

- Scope:
    - Import CSV using existing grid system (no H3 required).
    - Display imported data on existing map overlay layer.
    - Route imported channels through existing audio bus system.
- Purpose: validate the "upload -> see -> hear" loop at the earliest possible phase.
- Degraded aspects: no hex rendering, no H3 alignment, existing grid overlay only.
- Exit criteria: imported CSV data produces visible map response and audible output when viewport covers the imported area.
- Risk: Low (additive, no architectural changes needed).

### 10.3 [P2] Unified H3 Spatial Core (includes Structural Decoupling)

**Stage 1: Structural Decoupling (formerly P2-Prep)**

These packets execute as the first PRs of P2, not as a separate phase. P2 Stage 2 starts only after Stage 1 evidence passes.

Objective: Reduce migration risk before H3 cutover by decoupling high-coupling legacy modules into testable boundaries.

#### Packet P2-P1: `spatial.js` split-prep

- Scope:
    - Split responsibilities into `spatial-index`, `viewport-query`, `viewport-aggregator` with compatibility facade preserved.
    - Preserve external contracts while preparing for H3 path swap in Stage 2.
- Target effort: ~250-450 modified LOC (range-based estimate).
- Risk: High (touches highest-coupling runtime path).

#### Packet P2-P2: `data-loader.js` split-prep

- Scope:
    - Separate parser/validator/cache/manifest responsibilities.
    - Create explicit extension points for static import and stream source metadata.
- Target effort: ~300-550 modified LOC (range-based estimate).
- Risk: High (startup/load path reliability).

#### Packet P2-P3: Parity harness hardening

- Scope:
    - Add deterministic parity hooks so Stage 2 can compare legacy and H3 outputs.
    - Ensure compatibility fixtures remain mandatory in CI.
- Risk: Medium (tooling discipline risk).

Stage 1 exit criteria: decoupled module boundaries are merged and covered by regression tests; no material behavior drift in WorldCover compatibility scenarios.

**Stage 2: H3 Migration**

#### Packet P2-A: H3 foundation

- New files:
    - `server/grid/h3-encoder.js`
    - optional `server/grid/cell-encoder.js`
- Target effort: ~300 LOC.
- Risk: Very low (additive).

#### Packet P2-B: Spatial H3 migration (High Risk)

- High-risk hotspot: `server/spatial.js` (legacy responsibilities now decoupled in Stage 1).
- Migration targets:
    - `server/spatial-index.js` -> H3 cell index
    - `server/viewport-aggregator.js` -> H3 cell query/merge
    - thin `server/spatial.js` facade
- Validation: parity script for old vs H3 query path.
- Target effort: ~250 new LOC + heavy refactor/reorg in spatial path.

#### Packet P2-C: Frontend hex rendering

- New files:
    - `frontend/h3-utils.js`
    - `frontend/channels.js`
- Core updates:
    - `frontend/map.js`, `frontend/ui.js`, `/api/config` response contract
- Target effort: ~480 LOC.
- Risk: Medium (render correctness + zoom/resolution behavior).

### 10.4 [P3] Monitoring + Alerting + Stream Loop

#### Packet P3-A: Alert engine core

- New files:
    - `server/alert-engine.js`
    - `server/alert-rule-validator.js`
    - `alert_rules.json`
- Core updates:
    - `server/index.js`, `server/viewport-processor.js`, event dispatch path
- Compound rule support:
    - `type` discriminator (`"simple"` / `"compound"`) in rule schema.
    - AND/OR evaluation logic for 2-3 conditions (see Section 9.0.1).
    - Validation: reject nested compounds, enforce 2-3 condition limit.
- Target effort: ~470-600 LOC.
- Risk: Medium (state machine correctness + compound evaluation edge cases).

#### Packet P3-B: Real-time stream pipeline (poll)

- New files:
    - `server/stream-scheduler.js`
    - `server/time-window.js`
    - first stream adapter module (e.g. `server/adapters/usgs-earthquake.js`)
- Core updates:
    - `server/index.js` stream lifecycle wiring
    - per-client `lastViewport` cache for data-change push
    - `server/spatial.js` merge path for time-window output
- Trigger model:
    - user-interaction trigger (viewport-driven update)
    - data-change trigger (new stream events inside active viewport)
- Runtime safeguards:
    - `MAX_EVENTS_PER_CELL` cap
    - `MAX_STREAM_CELLS` cap
    - retry/backoff with terminal error state
- API contract:
    - `GET /api/streams` with status, last fetch, active cells, and health markers
- Target effort: ~720 LOC equivalent change volume.
- Risk: Medium (external feed instability + state growth + push correctness).

#### Packet P3-C: HTTPS push ingress pipeline

- API additions:
    - `POST /api/streams/push/:sourceId`
    - stream-push fields in `GET /api/streams`
- Scope:
    - Enforce `Idempotency-Key` semantics and dedup window behavior.
    - Queue depth cap + `429` backpressure behavior.
    - Per-record rejection reporting for partial batch failures.
    - Contract tests for replay, oversize batch, invalid payload, and auth failures.
- Target effort: ~450-850 LOC equivalent change volume.
- Risk: Medium-high (producer variability + retries + queue pressure).

### 10.5 [P4] Configurable Audio Runtime (includes Sample Management)

#### Packet P4-A: Mapping engine + apply baseline

- New file:
    - `server/audio-mapping.js`
- API (SPEC-frozen):
    - `GET /api/audio-mapping` (active config retrieval)
    - `POST /api/audio-mapping/apply` (runtime apply, replaces prior reload semantics)
- Behavior:
    - runtime config validation and in-memory swap
    - fallback to previous valid config on error
    - emit `bus_config_update` WebSocket event on successful apply
- Risk: Medium (runtime audio continuity).

#### Packet P4-B: Control API workflow endpoints

- Scope:
    - Remaining SPEC-frozen workflow endpoints: `POST /api/audio-mapping/draft`, `POST /api/audio-mapping/validate`, `POST /api/audio-mapping/rollback`, `GET /api/audio-mapping/history`
    - channel-to-bus mapping edits via draft API
    - threshold and basic intensity controls via draft API
    - version visibility and rollback target selection via history/rollback APIs
    - No graphical UI required; operators interact via HTTP clients or scripts.
- Risk: Medium (API contract correctness + runtime sync).

#### Packet P4-C: Audio sample management (minimum viable)

- Scope:
    - Allow per-bus sample file override via `audio_mapping.json` (`sampleUrl` field).
    - `POST /api/audio-samples/upload` for uploading custom WAV/OGG files.
    - `GET /api/audio-samples` for operators to discover available sample files before editing mapping config.
    - Sample files stored in `data/samples/` with source/bus namespacing.
    - Validation: format check (WAV/OGG only), max duration limit, max file size limit.
    - Frontend audio engine loads sample from configured URL instead of hardcoded path.
- Risk: Low-medium (file handling + audio format compatibility).

### 10.6 [P5] Enterprise Governance Baseline

#### Packet P5-A: Auth and access control

- Protect mutation/control endpoints.
- Verify unauthorized write rejection behavior.

#### Packet P5-B: Quotas and throttling

- Import quotas (size/row/cell caps).
- Rate limiting for control-plane writes.

#### Packet P5-C: Audit trail

- Log import/delete/reload/alert-rule updates with operator identity and timestamp.

#### Packet P5-D: Deployment-boundary disclosure

- Ensure API docs, `/api/config` capability metadata, and operator UI consistently show `single_org_multi_team`.
- Add verification checks preventing accidental hard multi-tenant claims in V1 artifacts.

## 11. Effort and Risk Reference Matrix

| Packet | Approx New LOC | Approx Modified LOC | Risk |
| --- | --- | --- | --- |
| Golden baseline harness (P0-A) | ~150-250 | ~20-50 | Low |
| Provisional SLO benchmark (P0-B) | ~100-200 | ~10-30 | Low |
| Adapter + registry (P1-A) | ~900-1300 | ~120-220 | Medium |
| Runtime import + boundary (P1-B + P1-C) | ~950-1500 | ~90-220 | Medium |
| Degraded demo (P1-D) | ~100-200 | ~50-100 | Low |
| Structural decoupling (P2 Stage 1) | ~200-450 | ~600-1400 | High |
| H3 foundation (P2-A) | ~250-400 | ~30-80 | Very low |
| Spatial H3 migration (P2-B) | ~300-700 | ~500-1300 | High |
| Frontend hex rendering (P2-C) | ~380-700 | ~180-420 | Medium |
| Alert engine + compound rules (P3-A) | ~420-650 | ~60-150 | Medium |
| Stream pipeline poll (P3-B) | ~600-1000 | ~100-260 | Medium |
| Push ingress pipeline (P3-C) | ~450-850 | ~80-220 | Medium-high |
| Mapping engine + apply baseline (P4-A) | ~200-350 | ~80-150 | Medium |
| Control API workflow (P4-B) | ~350-600 | ~50-120 | Medium |
| Audio sample management (P4-C) | ~200-350 | ~50-100 | Low-medium |
| Auth and access control (P5-A) | ~200-350 | ~60-120 | Medium |
| Quotas and throttling (P5-B) | ~150-250 | ~40-80 | Low-medium |
| Audit trail (P5-C) | ~200-350 | ~30-60 | Low-medium |
| Deployment boundary (P5-D) | ~50-100 | ~20-40 | Low |

Cumulative planning envelope (matrix sum):

- Approx new LOC: `~6,150-10,550`
- Approx modified LOC: `~2,170-5,120`
- Approx total touched LOC: `~8,320-15,670`

Execution warning: Keep structural decoupling (P2 Stage 1) mandatory before H3 semantics migration. Treat all estimates as ranges; do not commit to lower-bound values without parity evidence checkpoints.

## 12. Critical Sequencing and Merge Order

1. Compatibility harness (P0-A) and adapter/registry foundation (P1-A) start in parallel.
2. Provisional SLO benchmark (P0-B) after compatibility harness.
3. P0 gate must be green before P1-B/P1-C/P1-D merge.
4. Degraded demo (P1-D) after P1-B import lifecycle lands.
5. Finish P1 additive control-plane work before P2 Stage 1.
6. P2 Stage 1 (structural decoupling) before Stage 2 (H3 semantics).
7. H3 foundation (P2-A) before H3 spatial migration (P2-B).
8. Spatial migration before frontend hex rendering (P2-C).
9. Alert engine can start after registry abstractions stabilize.
10. Push ingress packet lands in P3 after stream registry is stable.
11. Audio sample management (P4-C) after mapping reload baseline (P4-A).
12. Governance packet lands after core functionality is stable enough to secure.

Special note for `server/spatial.js`: If multiple branches touch it, merge order should preserve query parity checks after each integration.

## 13. Shortest Delivery Paths (Decision Aid)

- **CSV upload -> degraded demo (earliest value):**
    P0-A + P1-A parallel -> P1-B import -> P1-D degraded demo
- **CSV upload -> hex view -> sound (full H3 path):**
    compatibility harness -> P1 ingest -> P2 decoupling -> H3 migration -> frontend hex
- **Live earthquake -> sound:**
    adapter/registry -> stream registry -> poll stream packet -> alert engine
- **Enterprise push feed -> alert -> sound:**
    source pre-registration -> push ingress -> dedup/backpressure -> alert engine -> mapping reload workflow
- **Earliest alert capability:**
    H3 foundation -> adapter/registry -> alert engine core

Use this section to choose showcase path under tight schedule.

## 14. WorldCover Baseline Manifest (Compatibility Contract)

The baseline WorldCover compatibility set is the contract protected by P0 regression gates.

### 14.1 Declared channel manifest (11 distribution + 3 metric)

| Channel | Range | Unit | Normalization | Group |
| --- | --- | --- | --- | --- |
| `tree` | [0,1] | fraction | linear | distribution |
| `shrub` | [0,1] | fraction | linear | distribution |
| `grass` | [0,1] | fraction | linear | distribution |
| `crop` | [0,1] | fraction | linear | distribution |
| `urban` | [0,1] | fraction | linear | distribution |
| `bare` | [0,1] | fraction | linear | distribution |
| `snow` | [0,1] | fraction | linear | distribution |
| `water` | [0,1] | fraction | linear | distribution |
| `wetland` | [0,1] | fraction | linear | distribution |
| `mangrove` | [0,1] | fraction | linear | distribution |
| `moss` | [0,1] | fraction | linear | distribution |
| `nightlight` | [0,1] | normalized | percentile | metric |
| `population` | [0,1] | normalized | log | metric |
| `forest` | [0,1] | fraction | linear | metric |

### 14.2 Derived compatibility control signal

- `proximity` in [0,1] (runtime-derived control path, non-manifest channel).
- P0 fixtures should lock the 14 declared channels and this derived control signal where applicable.

## 15. Engineering Pitfall Checklist

1. Do not drop `channelsRaw`; it breaks re-normalization flexibility.
2. Do not namespace channels in storage layer.
3. Do not mix coordinate orders across h3-js and GeoJSON boundaries.
4. Do not use child expansion in hot query path.
5. Do not allow silent source overwrite with unsanitized IDs.
6. Do not mutate channel indices without explicit reload notifications.
7. Do not treat alert sounds as UI ornament; they are monitoring signals.
8. Do not conflate `/api/import` with `/api/sources`; they solve different registration problems.
9. Do not accept push retries without idempotency and dedup checks.
10. Do not claim normative SLO compliance before P2 path activation and benchmark freeze.
11. Do not allow nested compound alert rules; V1 supports flat AND/OR with 2-3 conditions only.
12. Do not apply cooldown per-condition in compound rules; cooldown is per `(ruleId, cellId)` at the compound rule level.
13. Do not treat unresolved channel references as zero; absent channels must be distinguishable from channels with value 0.

## 16. Compatibility Gate Checklist (Must Pass Every Phase)

1. WorldCover-only flow still works end-to-end.
2. Existing viewport stats payload fields remain compatible.
3. Existing audio update behavior remains non-regressed.
4. Any new feature can be disabled without breaking baseline path.
5. API ownership boundaries remain intact (`/api/import` vs `/api/sources` vs push ingress).
6. V1 scaling boundary (200 clients, 500K cells) is not exceeded without explicit post-V1 architecture work.
7. Every `EVID-*` item for the completed phase has a corresponding test case in `npm test`. All tests pass.

This checklist prevents platformization work from breaking core demo reliability.

**Automated acceptance gate:** `npm test` all-green is the single machine-verifiable signal that a phase is complete. Any implementation agent (human or AI) completing a phase MUST ensure all `EVID-*` test cases are committed and passing before declaring the phase done.

## 17. Demo and Verification Scripts

### 17.1 Import-to-sound smoke script

```bash
curl -X POST http://localhost:3000/api/import \
  -F "file=@test_data/air_quality_sample.csv" \
  -F "sourceId=air_quality"

curl http://localhost:3000/api/channels

curl -X POST http://localhost:3000/api/audio-mapping/apply \
  -H "Content-Type: application/json" \
  -d '{"draftId":"current"}'

curl http://localhost:3000/api/sources
```

Manual step: Open frontend and confirm audible response while navigating imported region.

### 17.2 Push ingress smoke script

```bash
curl -X POST http://localhost:3000/api/sources \
  -H "Content-Type: application/json" \
  -d '{
    "sourceId":"aq_stream",
    "mode":"stream_push",
    "schemaVersion":1,
    "channels":["pm25","temp_c"]
  }'

curl -X POST http://localhost:3000/api/streams/push/aq_stream \
  -H "Authorization: Bearer <token>" \
  -H "Idempotency-Key: bench-20260222-001" \
  -H "Content-Type: application/json" \
  -d '{
    "records":[
      {"timestamp":"2026-02-22T06:31:10Z","lat":37.78,"lon":-122.41,"channelsRaw":{"pm25":83.2,"temp_c":29.5}}
    ]
  }'

curl http://localhost:3000/api/streams
```

Validation targets:

- Source descriptor registration succeeds.
- Push ack counters are coherent (`accepted + deduped + rejected = input`).
- Stream status reflects push activity and queue/depth metrics.

### 17.3 Benchmark gate script (provisional SLO freeze input)

```bash
# Run repeated /api/viewport requests and capture p50/p95/p99.
# Informational in P0/P1, freeze input for P2 SLO gate.
# V1 scaling boundary validation targets:
# - Sustain 200 concurrent viewport clients without p95 > 250ms
# - Sustain source with 500,000 cells without query degradation
# - These become hard gates from P2 exit onward
```

Reference baseline sample (informational only):

- Date: 2026-02-22
- Requests: 80
- Bounds: `[-120,30,-110,40]` at zoom `5`
- Result: `p50=1.622ms`, `p95=2.059ms`, `p99=10.331ms`

## Appendix A: Historical Max/OSC Notes

- Historical Max/OSC references are preserved for context only.
- They do not define mainline V1 architecture or release priorities.
