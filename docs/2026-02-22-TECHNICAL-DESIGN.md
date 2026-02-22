# Technical Design Companion (Detailed)

**Status:** Detailed Engineering Reference for V1  
**Date:** 2026-02-22  
**Scope:** Deep technical rationale and invariants that complement the lighthouse docs

## Executive Intro
This document is the technical base layer for the lighthouse docs and answers the WHY and HOW.  
It does not replace `2026-02-21-OPEN-PLATFORM-SPEC.md`; it restores critical engineering semantics that must not be lost during implementation.  
If the lighthouse docs define what must be delivered, this companion defines why choices were made and how to avoid common failure modes.

## 0. How To Use This With Lighthouse Docs

- Use `docs/2026-02-21-OPEN-PLATFORM-SPEC.md` for normative contracts (`MUST/SHOULD/MAY`).
- Use `docs/2026-02-21-MIGRATION-PLAN.md` for milestone sequencing, evidence, and rollback gates.
- Use `docs/2026-02-22-TECHNICAL-DESIGN.md` for design rationale, algorithm choices, and implementation traps.
- Use `docs/2026-02-22-ENGINEERING-REFERENCE.md` for file-level execution sequencing.
- UI workflow contracts are normative in SPEC; this document only explains rationale/invariants behind those contracts.

### 0.1 Mandatory Multi-Document Use (Human + AI)
- This document MUST NOT be used as a standalone implementation source.
- Any implementation agent (human or AI) MUST use all four lighthouse documents together and provide a trace tuple (`REQ-*`, `M*`, technical section, engineering packet) in execution artifacts.
- Conflict precedence MUST be: `OPEN-PLATFORM-SPEC` > `MIGRATION-PLAN` > `TECHNICAL-DESIGN` > `ENGINEERING-REFERENCE`.
Validation authority MUST be inherited from `docs/2026-02-21-OPEN-PLATFORM-SPEC.md` Section 0.1 acceptance criteria; this document provides rationale and constraints and MUST NOT redefine acceptance criteria.

## Milestone Anchors (M0-M5 + M2-Prep Execution Stage)
Section numbers in this document are local structure only. Cross-document tracking uses `M0..M5` milestone IDs plus one execution-only precondition stage (`M2-Prep`).
`M0..M5` are progress labels only; normative requirement strength is defined exclusively by RFC 2119 keywords (`MUST/SHOULD/MAY`).

| Milestone ID | Primary Technical Anchors In This Document |
| --- | --- |
| `M0` | `8. WorldCover Baseline Manifest` |
| `M1` | `3. Adapter Interface Contracts`, `4. Import Pipeline`, `5. Channel Registry` |
| `M2-Prep` | `7. Engineering Pitfall Checklist` |
| `M2` | `2. H3 Technical Deep Dive` |
| `M3` | `6. Alert Engine Semantics` |
| `M4` | `5.4 Audio Runtime Config Invariants` |
| `M5` | `5.5 Governance Baseline Hooks` |

## 1. Canonical Data Model: Why It Is Designed This Way

### 1.1 DataRecord keeps both `channels` and `channelsRaw`

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

Implementation invariant:
- For already normalized sources (for example WorldCover fractions), `channelsRaw == channels` is valid.

### 1.2 Bare keys in storage, namespaced keys in merged output

Design rationale:
- `DataRecord` stores bare keys (`tree`, `pm25`) plus `source`, avoiding double-encoding source identity.
- `CellSnapshot` is a merged output object and MUST expose namespaced keys (`sourceId.channelName`) to prevent collisions.

Incorrect pattern to avoid:
- Storing namespaced keys in `DataRecord` and then namespacing again at merge time.

### 1.3 Storage index shape and merge algorithm

Index shape (target):
- `Map<cellId, Map<sourceId, DataRecord>>`

Merge algorithm (query layer):
1. Load all `DataRecord`s for `cellId`.
2. Prefix each channel key with `sourceId.`.
3. Merge namespaced channels into one `CellSnapshot.channels` object.
4. Record contributing sources in `CellSnapshot.sources`.

Design rationale:
- Makes multi-source overlay deterministic and explicit.
- Supports partial source deletes and source-specific replacement.

## 2. [M2] H3 Technical Deep Dive (Do Not Skip)

### 2.1 Why H3 over Quadkey/Geohash

| Factor | H3 | Quadkey | Geohash |
| --- | --- | --- | --- |
| Ecosystem interoperability | Strongest in analytics tools | Tile ecosystem focused | Moderate |
| Area consistency | Better consistency per resolution | Latitude distortion | Latitude distortion |
| Neighbor ops | Native `gridDisk` | Manual computation | Boundary handling complexity |
| Viewport enumeration | `polygonToCells` | loop math | moderate |

Decision consequence:
- H3 is the platform spatial language. Alternative encoders are extensibility topics, not V1 defaults.

### 2.2 Coordinate-order traps (high-risk bug class)

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

Guardrail:
- Add coordinate-order regression tests for `latLngToCell`, `polygonToCells`, and `cellToBoundary` output transforms.

### 2.3 Resolution policy and human-facing labels

| Res | Approx Edge | Approx Area | Human Label | Primary Use |
| --- | --- | --- | --- | --- |
| 3 | ~60 km | ~12,400 km2 | Province / State | broad regional |
| 4 | ~23 km | ~1,770 km2 | Metro area (default) | default platform layer |
| 5 | ~8 km | ~253 km2 | City | denser city ops |
| 7 | ~1.2 km | ~5.2 km2 | Neighborhood | fine local analysis |

Rationale:
- Numeric H3 levels are not intuitive for operators; labels prevent incorrect tuning decisions.

### 2.4 Multi-resolution query strategy

Required strategy:
1. Store per-source data at native resolution (`DataRecord.resolution`).
2. Downsample (`queryRes < storedRes`): aggregate by parent using channel fold semantics.
3. Upsample (`queryRes > storedRes`): parent broadcast to children (no fake interpolation).
4. Same resolution: direct lookup.

Critical performance constraint:
- Do not use `cellToChildren()` in hot viewport query path.
- Reason: complexity explosion `O(7^(deltaRes))`; parent-lookup approach keeps per-cell work close to O(1).

### 2.5 CellEncoder abstraction (extensibility boundary)

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

Rationale:
- Keeps spatial backend swappable, while preserving uniform contracts for ingestion and query code.

### 2.6 SLO prerequisite boundary (M2+)

Performance rationale:
- V1 provisional SLO values are useful planning guardrails, but release-gate enforcement depends on the M2 data path.
- Before M2, legacy grid path behavior can be measured for baseline and trend only.
- After M2 exits, H3 index/query path is the normative target and supports stable p95/p99 gate enforcement.

Implementation invariant:
- Any statement claiming normative SLO compliance MUST identify the active spatial path and MUST NOT certify M2+ SLOs while legacy path is still the serving path.

## 3. [M1] Adapter Interface Contracts (Frozen Module Boundary)

### 3.1 DataAdapter contract

```js
/**
 * @typedef {Object} DataAdapter
 * @property {string} id - Unique adapter ID (for example "worldcover", "air_quality")
 * @property {string} name - Display name
 * @property {ChannelManifest[]} channels - Declared channel manifest
 * @property {"static"|"stream"|"timeseries"} temporalType - Adapter data mode
 * @property {string} [version] - Semantic version
 * @property {Object<string, string>} [requiredConfig] - Required config key types
 * @property {(rawData: any, encoder: CellEncoder, precision: number) => DataRecord[]} ingest
 * @property {Object<string, Function>} [importFormats] - Supported import format parsers
 */
```

Engineering intent:
- All adapters expose the same discovery and ingest surface for registry/control-plane integration.
- `requiredConfig` validates presence/type at registration time, but secrets must never leak via public APIs.

### 3.2 StreamAdapter extension

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

Engineering intent:
- `StreamAdapter` extends, not replaces, DataAdapter semantics.
- Runtime scheduler treats stream adapters as first-class registry participants.

### 3.3 PushAdapter extension (V1 minimum)

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

Engineering intent:
- Push ingress is a first-class stream mode, not an ad-hoc side path.
- `POST /api/sources` establishes source metadata/schema before data payloads arrive.
- `POST /api/streams/push/:sourceId` accepts event batches only for pre-registered `mode=stream_push` sources.

### 3.4 SourceDescriptor shape (control-plane metadata)

```json
{
  "sourceId": "aq_stream",
  "mode": "stream_push",
  "schemaVersion": 1,
  "ownerTeam": "ops_air",
  "status": "active"
}
```

Rationale:
- Source lifecycle and push validity checks depend on stable metadata, not inferred runtime state.
- `mode` disambiguates static/batch import sources from stream poll/push descriptors.

## 4. [M1] Import Pipeline Deep Semantics

### 4.1 CSV minimal contract

Required columns:
- `lat`, `lon` (or aliases `latitude`, `longitude`).
- Any additional numeric field becomes candidate channel.
- Optional: `timestamp`, `alt`.

### 4.2 Preview validation checks (why each exists)

| Check | Why It Exists |
| --- | --- |
| Role detection | Prevent manual mapping for common cases |
| Non-numeric detection | Avoid accidental string-as-channel corruption |
| Missing values | Make row drop/NaN behavior explicit |
| Coordinate sanity and swap detection | Prevent silent lat/lon inversion bugs |
| CRS hint check | Block projected coordinates falsely treated as WGS84 |
| Density/resolution mismatch warning | Avoid undersampled/oversampled H3 output |

### 4.3 Source ID and persistence rules

- `sourceId` must be sanitized: lowercase, underscores, max length, safe chars.
- Re-import with same `sourceId` replaces previous source atomically.
- Manifest writes must use temp-file + rename to avoid crash corruption.

### 4.4 Stream source registration boundary (`/api/import` vs `/api/sources`)

Boundary rationale:
- `POST /api/import` is optimized for static/batch file payloads and data-carrying registration.
- `POST /api/sources` is metadata-only pre-registration for stream sources (poll/push).
- Keeping them separate prevents ambiguous partial-registration states and simplifies validation/error contracts.

Implementation invariants:
- `/api/import` MUST parse payload and produce `DataRecord[]` in one transaction.
- `/api/sources` MUST validate descriptor/schema without ingesting observation payload.
- Push events MUST be rejected (`404`/`409`) when source registration state is absent or incompatible.
- Static/batch source lifecycle persists in `data/imports/manifest.json`; stream source lifecycle persists in `stream_sources.json`.
- `DELETE /api/sources/:id` MUST remove source entries from the applicable persistence store(s) and runtime registry atomically (all-or-nothing).

## 5. [M1] Channel Registry and Runtime Stability

### 5.1 Namespace strategy

Canonical key format:
- `sourceId.channelName`

This key is used in:
- Channel registry records
- CellSnapshot channels
- Audio mapping config
- Alert rule channel references

### 5.2 Channel index assignment policy

- Builtin channels: fixed positions for compatibility.
- Imported channels: deterministic append order from manifest/import order.
- Runtime mutation (delete/re-import): index changes allowed for non-builtin channels, but must trigger reload notifications.

### 5.3 Notification invariants

On registry change:
- emit `channel_update` (WebSocket)
- emit reload signal for downstream consumers
- `GET /api/channels` is source of truth

### 5.4 [M4] Audio Runtime Config Invariants

- Runtime mapping changes must be schema-validated before activation.
- Invalid updates must preserve last-known-good runtime config.
- Audio mapping reload and channel registry updates must remain causally ordered.
- Bus-level behavior must remain deterministic for the same channel snapshot input.

### 5.5 [M5] Governance Baseline Hooks

- Adapter required config must support secret-presence validation without leaking values.
- Import and control mutations should be designed for auth middleware insertion points.
- Import path must expose quota/rate-limit decision hooks before expensive parse/ingest work.
- Change operations should emit auditable events (import/delete/reload/rule updates).

## 6. [M3] Alert Engine Semantics (Operational, Not Decorative)

State machine per `(ruleId, cellId)`:
- `idle -> active -> cooldown -> idle`

Required semantics:
- Enter on `enterThreshold` crossing.
- Clear on `exitThreshold` crossing.
- Cooldown suppresses immediate refire.
- Dedup prevents repeated active fires for same key.

Why this matters:
- Without hysteresis/cooldown/dedup, operators get alert storms and stop trusting audio alerts.

### 6.1 Push ingress payload and acknowledgement types

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
- Spatial key is `cellId` OR (`lat` + `lon`) with deterministic precedence documented in adapter logic.
- `channelsRaw` is required; normalization is adapter/runtime responsibility, not producer responsibility.

`PushIngestAck` (technical type):

```json
{
  "accepted": 4980,
  "deduped": 15,
  "rejected": 5,
  "ingestLatencyMs": 42,
  "errors": [
    { "index": 17, "code": "INVALID_COORDINATE", "message": "lat out of range" }
  ]
}
```

Ack rules:
- Partial acceptance is allowed and MUST include per-record error details.
- Ack counters MUST sum to input record count.
- `ingestLatencyMs` MUST measure server-side processing window for the batch.

### 6.2 Idempotency, dedup, and backpressure semantics

Required semantics:
- `Idempotency-Key` identifies retried push requests and MUST prevent duplicate ingestion in the dedup window.
- Dedup window default (`dedupWindowMs`) is source-configurable with a V1 baseline default.
- Queue depth cap enforces backpressure; exceeded cap MUST return `429`.
- Oversized push batches MUST return `413` before expensive ingest work begins.

Why this matters:
- Without hard idempotency/dedup contracts, push retries create false alert storms and invalid trend signals.
- Without backpressure, one noisy producer can destabilize all downstream alert/audio paths.

### 6.3 Control workflow rationale (non-contract)

Rationale for `Draft -> Validate -> Apply -> Rollback`:
- Draft separates exploration from activation.
- Validate prevents runtime corruption from invalid mapping/rule sets.
- Apply is the explicit operational cutover point.
- Rollback preserves operator trust under incident pressure.

Boundary note:
- The workflow itself is normative in SPEC.
- This section exists only to explain why this workflow is safer than direct in-place edits.

## 7. Engineering Pitfall Checklist

1. Do not drop `channelsRaw`; it breaks re-normalization flexibility.
2. Do not namespace channels in storage layer.
3. Do not mix coordinate orders across h3-js and GeoJSON boundaries.
4. Do not use child expansion in hot query path.
5. Do not allow silent source overwrite with unsanitized IDs.
6. Do not mutate channel indices without explicit reload notifications.
7. Do not treat alert sounds as UI ornament; they are monitoring signals.
8. Do not conflate `/api/import` with `/api/sources`; they solve different registration problems.
9. Do not accept push retries without idempotency and dedup checks.
10. Do not claim normative SLO compliance before M2 path activation and benchmark freeze.

## 8. [M0] WorldCover Baseline Manifest (Compatibility Contract)

The baseline WorldCover compatibility set is the contract protected by M0 regression gates.

### 8.1 Declared channel manifest (11 distribution + 3 metric)

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

### 8.2 Derived compatibility control signal

For legacy behavior checks, protect the derived control signal:
- `proximity` in [0,1] (runtime-derived control path, non-manifest channel).

Compatibility note:
- M0 fixtures should lock the 14 declared channels and this derived control signal where applicable.

## 9. Relationship to V1 Requirements

- REQ-INGEST-001: Sections 3 and 4
- REQ-STREAM-001: Sections 3.3 and 6.1/6.2
- REQ-GRID-001: Sections 1 and 2
- REQ-ALERT-001: Section 6
- REQ-AUDIO-001: Sections 5 and 6.3 integration assumptions
- REQ-UX-001: Section 6.3 (rationale only; normative contract in SPEC)
- REQ-COMPAT-001: Sections 5.2 and 8
- REQ-GOV-001: Sections 4.3, 5.5, and pipeline hardening hooks
- REQ-DEPLOY-001: deployment boundary is normative in SPEC; this document only provides integration assumptions (Sections 0 and 5.5 hooks)
- REQ-PERF-001: Section 2.6 prerequisite boundary
