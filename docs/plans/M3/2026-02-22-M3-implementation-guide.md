# Milestone 3 — Open Platform Implementation Guide

**Status:** Technical Design Rationale + Engineering Guidance
**Date:** 2026-02-22 (reorganized 2026-02-23)
**Scope:** Design decisions, engineering pitfalls, validation guidance

## Executive Intro

This document answers WHY design choices were made and HOW to avoid common failure modes.
It does not replace the SPEC or PLAN; it supports both as the rationale and guidance layer.

Frozen contracts (types, interfaces, API shapes) live in the SPEC.
Phase sequencing, evidence gates, and rollback live in the MIGRATION PLAN.
Granular execution steps live in stage files (`docs/plans/M3/P*/`).

## 0. Document Role and Protocol

The Three-Document Protocol is defined authoritatively in `OPEN-PLATFORM-SPEC` §0.1. This document inherits all protocol rules and adds no overrides. Stage execution plans in `docs/plans/M3/P*/` are the primary operational guide for implementation.

## 1. Phase Anchors

Section numbers in this document are local structure only. Cross-document tracking uses `P0..P5` phase IDs.

| Phase ID | Primary Anchors In This Document |
| --- | --- |
| `P0` | Spec Appendix B (WorldCover Baseline Manifest) |
| `P1` | `6. Adapter Rationale`, `7. Import Pipeline Guidance` |
| `P2` | `4. H3 Design Rationale` |
| `P3` | `9. Alert Engine & Stream Design Rationale` |
| `P4` | Spec §5.4 (Audio Runtime) |
| `P5` | `8. Governance Extension Points` |

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

## 4. H3 Design Rationale and Engineering Guidance

### 4.1 Why H3 over Quadkey/Geohash

| Factor | H3 | Quadkey | Geohash |
| --- | --- | --- | --- |
| Ecosystem interoperability | Strongest in analytics tools | Tile ecosystem focused | Moderate |
| Area consistency | Better consistency per resolution | Latitude distortion | Latitude distortion |
| Neighbor ops | Native `gridDisk` | Manual computation | Boundary handling complexity |
| Viewport enumeration | `polygonToCells` | loop math | moderate |

Decision consequence: H3 is the platform spatial language. Alternative encoders are extensibility topics, not V1 defaults.

### 4.2 Coordinate-Order Pitfalls (high-risk bug class)

Normative coordinate-order conversion rules are frozen in Spec §3.2.1.

Why this is a dedicated pitfall: H3's `latLngToCell` takes `(lat, lon)` while GeoJSON uses `[lon, lat]`. This inversion is the single most common silent-bug source in geospatial code. Every code path that crosses the GeoJSON↔H3 boundary needs explicit coordinate-order tests.

Safe conversion pattern:

```js
const cellId = latLngToCell(coord[1], coord[0], res); // coord from GeoJSON [lon, lat]
const geojsonBoundary = cellToBoundary(cellId).map(([lat, lng]) => [lng, lat]);
```

### 4.3 Resolution policy and human-facing labels

| Res | Approx Edge | Approx Area | Human Label | Primary Use |
| --- | --- | --- | --- | --- |
| 3 | ~60 km | ~12,400 km² | Province / State | broad regional |
| 4 | ~23 km | ~1,770 km² | Metro area (default) | default platform layer |
| 5 | ~8 km | ~253 km² | City | denser city ops |
| 7 | ~1.2 km | ~5.2 km² | Neighborhood | fine local analysis |

Rationale: Numeric H3 levels are not intuitive for operators; labels prevent incorrect tuning decisions.

### 4.4 Multi-Resolution Query Rationale

The normative multi-resolution query strategy is frozen in Spec §3.7.

Design rationale for the parent-lookup approach: `cellToChildren()` has `O(7^(deltaRes))` complexity — at delta-3, one parent cell expands to 343 children. Using parent lookup instead keeps per-cell work close to O(1) regardless of resolution delta, which is essential for real-time viewport queries.

### 4.5 CellEncoder Design Intent

The CellEncoder interface is frozen in Spec §3.5.

Rationale: Keeps spatial backend swappable while preserving uniform contracts for ingestion and query code. V1 uses H3 exclusively, but the abstraction boundary exists so post-V1 experiments with alternative encoders (S2, Geohash) can be tested without rewriting ingestion or query paths.

### 4.6 SLO Prerequisite Boundary (P2+)

- Before P2, legacy grid path behavior can be measured for baseline and trend only.
- After P2 exits, H3 path is the normative target and supports stable p95/p99 gate enforcement.
- Any statement claiming normative SLO compliance MUST identify the active spatial path and MUST NOT certify P2+ SLOs while legacy path is still the serving path.

### 4.7 Scaling Boundary Rationale

V1 scaling hard limits are frozen in Spec §5.8.

Rationale for single-instance design: V1 prioritizes feature completeness over horizontal scaling. Sharding the spatial index, coordinating multiple instances, and distributing push ingestion queues are each non-trivial projects that would delay V1 delivery without proportional user value. The 200-client / 500K-cell boundary covers the target V1 deployment profile (single org, multiple teams, regional data).

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
- `CellSnapshot` is a merged output object and exposes namespaced keys (`sourceId.channelName`) to prevent collisions.
- Incorrect pattern: storing namespaced keys in `DataRecord` and then namespacing again at merge time.

### 5.3 Storage index shape and merge algorithm

Index shape (target): `Map<cellId, Map<sourceId, DataRecord>>`

Merge algorithm (query layer):

1. Load all `DataRecord`s for `cellId`.
2. Prefix each channel key with `sourceId.`.
3. Merge namespaced channels into one `CellSnapshot.channels` object.
4. Record contributing sources in `CellSnapshot.sources`.

Design rationale: Makes multi-source overlay deterministic and explicit. Supports partial source deletes and source-specific replacement.

## 6. Adapter Design Rationale

Adapter interface typedefs (DataAdapter, StreamAdapter, PushAdapter, SourceDescriptor, CellEncoder) are frozen in Spec §3.5.

**DataAdapter intent:** All adapters expose the same discovery and ingest surface for registry/control-plane integration. `requiredConfig` validates presence/type at registration time, but secrets must never leak via public APIs.

**Push ingress intent:** Push ingress is a first-class stream mode, not an ad-hoc side path. `POST /api/sources` establishes source metadata/schema before data payloads arrive. `POST /api/streams/push/:sourceId` accepts event batches only for pre-registered `mode=stream_push` sources.

**SourceDescriptor intent:** Source lifecycle and push validity checks depend on stable metadata, not inferred runtime state. `mode` disambiguates static/batch import sources from stream poll/push descriptors.

## 7. Import Pipeline Guidance

### 7.1 CSV Handling Guidance

The CSV minimal contract (required columns, candidate channel detection) is frozen in Spec §4.1.1.

Implementation guidance: coordinate column detection should support common aliases (`lat`/`latitude`/`y`, `lon`/`longitude`/`lng`/`x`). Non-numeric columns should be silently skipped with a warning, not rejected.

### 7.2 Preview Validation Checks

| Check | Why It Exists |
| --- | --- |
| Role detection | Prevent manual mapping for common cases |
| Non-numeric detection | Avoid accidental string-as-channel corruption |
| Missing values | Make row drop/NaN behavior explicit |
| Coordinate sanity and swap detection | Prevent silent lat/lon inversion bugs |
| CRS hint check | Block projected coordinates falsely treated as WGS84 |
| Density/resolution mismatch warning | Avoid undersampled/oversampled H3 output |

### 7.3 Source ID and Persistence Rationale

The sourceId sanitization rules and manifest persistence contract are frozen in Spec §4.1.1.

Design rationale for atomic writes (temp-file + rename): If the server crashes mid-write, a half-written manifest.json would corrupt the source registry on restart. The temp + rename pattern ensures the file is either fully written or not present, avoiding partial state.

Design rationale for manifest channel persistence: On restart, the channel registry must be rebuilt from manifest metadata without re-parsing source files. This avoids coupling restart speed to import file size and ensures consistent channel ordering.

### 7.4 API Boundary Rationale (`/api/import` vs `/api/sources`)

API responsibility contracts are frozen in Spec §4.1 (API Responsibility Matrix).

Boundary rationale:

- `POST /api/import` is optimized for static/batch file payloads and data-carrying registration.
- `POST /api/sources` is metadata-only pre-registration for stream sources (poll/push).
- Keeping them separate prevents ambiguous partial-registration states and simplifies validation/error contracts.

Why not merge them: A combined endpoint would need to handle both file uploads and JSON metadata, distinguish between "replace existing static source" and "update stream descriptor", and manage two different persistence stores in one code path. The complexity doesn't justify the convenience.

## 8. Governance Extension Points

Design guidance for P5 governance implementation:

- Adapter required config must support secret-presence validation without leaking values.
- Import and control mutations should be designed for auth middleware insertion points.
- Import path must expose quota/rate-limit decision hooks before expensive parse/ingest work.
- Change operations should emit auditable events (import/delete/reload/rule updates).

## 9. Alert Engine and Stream Design Rationale

### 9.1 State Machine Rationale

Alert engine frozen contracts (state machine, compound rules, unresolved channel handling) are in Spec §3.1, §3.4, and §5.3.

Why hysteresis/cooldown/dedup matters: Without these mechanisms, operators get alert storms and stop trusting audio alerts. A single oscillating value near a threshold would produce hundreds of fire/clear events per minute, making the alert system worse than useless.

Why flat-only compound rules in V1: Nested compound rules create exponential state complexity and make operator debugging extremely difficult. The 2-3 condition limit with flat AND/OR is sufficient for common multi-channel monitoring scenarios (e.g., "high pollution AND high temperature").

### 9.2 Push Ingestion Design Notes

Push ingestion normative semantics (idempotency, dedup, backpressure) are frozen in Spec §4.1.2. PushEvent and PushIngestAck types are frozen in Spec §3.6.

Design rationale for idempotency-key requirement: External producers retry on network failures. Without idempotency tracking, retries create duplicate data points that skew aggregation and may trigger false alerts. The dedup window bounds memory usage while covering typical retry windows.

Design rationale for backpressure (429): Without queue depth caps, a burst from an external producer can exhaust server memory. Returning 429 early (before expensive ingest work) lets producers back off gracefully rather than experiencing silent data loss.

### 9.3 Control Workflow Rationale (non-contract)

Rationale for `Draft -> Validate -> Apply -> Rollback`:

- Draft separates exploration from activation.
- Validate prevents runtime corruption from invalid mapping/rule sets.
- Apply is the explicit operational cutover point.
- Rollback preserves operator trust under incident pressure.

Boundary note: The workflow itself is normative in SPEC §4.1. This section exists only to explain why this workflow is safer than direct in-place edits.

V1 delivery surface note: The workflow is delivered as REST API endpoints in V1. A graphical UI is future scope. Operators use HTTP clients (curl, Postman, scripts) to execute the workflow.

## 10. Engineering Pitfall Checklist

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

## 11. Demo and Verification Scripts

### 11.1 Import-to-sound smoke script

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

### 11.2 Push ingress smoke script

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

### 11.3 Benchmark gate script (provisional SLO freeze input)

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
