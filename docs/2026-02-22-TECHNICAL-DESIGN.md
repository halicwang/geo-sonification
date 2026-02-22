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

### 0.1 Mandatory Multi-Document Use (Human + AI)
- This document MUST NOT be used as a standalone implementation source.
- Any implementation agent (human or AI) MUST use all four lighthouse documents together and provide a trace tuple (`REQ-*`, `M*`, technical section, engineering packet) in execution artifacts.
- Conflict precedence MUST be: `OPEN-PLATFORM-SPEC` > `MIGRATION-PLAN` > `TECHNICAL-DESIGN` > `ENGINEERING-REFERENCE`.
Validation authority MUST be inherited from `docs/2026-02-21-OPEN-PLATFORM-SPEC.md` Section 0.1 acceptance criteria; this document provides rationale and constraints and MUST NOT redefine acceptance criteria.

## Milestone Anchors (M0-M5)
Section numbers in this document are local structure only. Cross-document tracking uses `M0..M5` milestone IDs.
`M0..M5` are progress labels only; normative requirement strength is defined exclusively by RFC 2119 keywords (`MUST/SHOULD/MAY`).

| Milestone ID | Primary Technical Anchors In This Document |
| --- | --- |
| `M0` | `8. WorldCover Baseline Manifest` |
| `M1` | `3. Adapter Interface Contracts`, `4. Import Pipeline`, `5. Channel Registry` |
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

## 7. Engineering Pitfall Checklist

1. Do not drop `channelsRaw`; it breaks re-normalization flexibility.
2. Do not namespace channels in storage layer.
3. Do not mix coordinate orders across h3-js and GeoJSON boundaries.
4. Do not use child expansion in hot query path.
5. Do not allow silent source overwrite with unsanitized IDs.
6. Do not mutate channel indices without explicit reload notifications.
7. Do not treat alert sounds as UI ornament; they are monitoring signals.

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
- REQ-GRID-001: Sections 1 and 2
- REQ-ALERT-001: Section 6
- REQ-AUDIO-001: Sections 5 and 6 integration assumptions
- REQ-COMPAT-001: Sections 5.2 and 8
- REQ-GOV-001: Sections 4.3, 5.5, and pipeline hardening hooks
