# Geo-Sonification Open Platform Specification

**Status:** Normative Spec v1.0-preview  
**Date:** 2026-02-22  
**Baseline Reality Date:** 2026-02-22  
**Audience:** Product, Architecture, Implementation, QA, Operations

## Executive Intro (North Star)
This document is the first lighthouse for the platform and defines what we are building.  
One-line mission: turn geospatial data into an audible monitoring layer that enterprises can connect and operationalize immediately for situational awareness and anomaly alerting.  
V1 has four hard gates: open ingestion, unified spatial language, monitoring and alerting, and configurable audio behavior.  
Compatibility is a hard constraint: the existing WorldCover demo path must not break.  
Governance is a V1 baseline: authentication, quota limits, and minimum audit logging are required.  
This document uses RFC 2119 terms (MUST/SHOULD/MAY) to drive implementation and acceptance directly.  
Any critical interface, type, or configuration not frozen here must not be invented ad hoc during implementation.  

## Companion Detailed Docs
- Technical rationale and algorithm-level details: `docs/2026-02-22-TECHNICAL-DESIGN.md`
- File-level engineering execution details: `docs/2026-02-22-ENGINEERING-REFERENCE.md`
- Milestone execution contract: `docs/2026-02-21-MIGRATION-PLAN.md`

## Milestone Mapping (M0-M5)
Section numbers in this document are local structure only. Cross-document tracking uses `M0..M5` milestone IDs.
`M0..M5` are progress labels only; normative requirement strength is defined exclusively by RFC 2119 keywords (`MUST/SHOULD/MAY`).

| Milestone ID | Milestone Meaning | Primary Sections In This Spec |
| --- | --- | --- |
| `M0` | Compatibility guardrails | `REQ-COMPAT-001`, `5.5` |
| `M1` | Open ingestion + control plane | `REQ-INGEST-001`, `4.1`, `5.1` |
| `M2` | Unified H3 spatial core | `REQ-GRID-001`, `3.2`, `5.2` |
| `M3` | Monitoring + Alerting + Stream Loop | `REQ-ALERT-001`, `4.2 alert`, `5.3` |
| `M4` | Configurable audio runtime | `REQ-AUDIO-001`, `4.3 audio_mapping.json`, `5.4` |
| `M5` | Governance baseline | `REQ-GOV-001`, `5.6` |

## 0. Document Conventions

### Reality Snapshot (as of 2026-02-22)
- Current system is a stable WorldCover-focused demo with Web Audio rendering.
- Only a limited API surface exists in runtime today (`/health`, `/api/config`, `/api/viewport`).
- Open-platform capabilities below are normative target requirements and must be implemented through the migration plan.

This document uses [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) keywords:
- **MUST**: mandatory for compliance.
- **SHOULD**: strong recommendation; deviations need explicit rationale.
- **MAY**: optional capability.

All requirements are traceable by `REQ-*` IDs and are referenced by milestones in the migration plan.

## 1. North Star Requirements (V1 Red Lines)

### Reality Snapshot (as of 2026-02-22)
- Product intent is clear, but V1 red lines were previously spread across multiple sections and statuses.
- This section is now the single source of truth for V1 commitments.

### REQ-INGEST-001: Open Self-Service Ingestion
Any company/team MUST be able to upload supported files (CSV, GeoJSON) and use them immediately without changing source code or redeploying services.

**Acceptance:** A new source can be imported at runtime via `POST /api/import`, appears in `GET /api/sources`, and contributes to map/audio behavior in the same server session.

### REQ-GRID-001: Unified Spatial Language
All ingested data MUST be aligned to a unified H3 cell model before query, merge, alert evaluation, and audio mapping.

**Acceptance:** Multi-source data queried for the same viewport can be merged by `cellId` with deterministic namespaced channel keys.

### REQ-ALERT-001: Monitoring and Alerting
The platform MUST support operational alerting (not only artistic sonification) with threshold, hysteresis, cooldown, and dedup semantics.

**Acceptance:** Threshold crossings emit alert events, clears are emitted on exit threshold, and duplicate storms are prevented for the same `(ruleId, cellId)`.

### REQ-AUDIO-001: Fully Configurable Audio Mapping
Business users MUST be able to configure what triggers sound, mapping behavior, and severity behavior via configuration/control plane without audio-engineering expertise.

**Acceptance:** Updating `audio_mapping.json` and alert/audio settings via control APIs changes runtime audio behavior without redeploy.

### REQ-COMPAT-001: WorldCover Compatibility Guardrail
Refactoring MUST NOT break existing WorldCover demo behavior during migration.

**Acceptance:** Existing WorldCover-only workflow remains functional and passes regression checks after each milestone.

### REQ-GOV-001: Enterprise Baseline Governance
V1 MUST include baseline governance: authentication, request quotas/rate limits, and auditable operation logs.

**Acceptance:** Unauthorized writes are blocked, import quotas are enforced, and import/delete/config changes are traceable through audit records.

## 2. Target System Architecture (Web Audio Primary)

### Reality Snapshot (as of 2026-02-22)
- Web Audio is already the active rendering path.
- Prior documents mixed historical Max/OSC architecture into the mainline narrative.
- Mainline architecture is now explicitly Web Audio-first; Max/OSC is historical compatibility appendix only.

## 2.1 Mainline Data Flow

```text
Data Sources
  (CSV, GeoJSON, Stream APIs)
        |
        v
Adapter Layer
  (format parsing, validation, channel declaration)
        |
        v
H3 Core
  (WGS84 -> H3 encoding, resolution policy)
        |
        v
Spatial Registry + Query Layer
  (DataRecord storage, CellSnapshot merge)
        |
        +--------------------+
        |                    |
        v                    v
Alert Engine           Audio Mapping Engine
(rule eval/state)      (channel->bus fold)
        |                    |
        +---------+----------+
                  v
          WebSocket + REST Control Plane
                  |
                  v
         Frontend Web Audio Renderer
```

## 2.2 Component Responsibilities
- Adapter Layer MUST output canonical `DataRecord[]`.
- H3 Core MUST be the sole spatial alignment boundary.
- Query Layer MUST produce `CellSnapshot[]` for both visualization and audio/alert logic.
- Alert Engine MUST consume normalized channel values from `CellSnapshot`.
- Audio Mapping Engine MUST produce stable bus targets consumed by browser audio.

**Acceptance:** No module bypasses H3 alignment or writes ad-hoc channel formats directly to renderer logic.

## 3. Canonical Domain Model and Spatial Language

### Reality Snapshot (as of 2026-02-22)
- Existing runtime model is grid/landcover focused.
- Canonical cross-source objects are defined here as frozen target interfaces.

## 3.1 Frozen Types

### DataRecord (storage-layer atomic record)
```json
{
  "cellId": "85283473fffffff",
  "source": "air_quality",
  "channels": { "pm25": 0.65, "temp_c": 0.38 },
  "channelsRaw": { "pm25": 83.2, "temp_c": 29.5 },
  "resolution": 4,
  "timestamp": "2026-02-22T06:30:00Z",
  "temporalType": "stream",
  "meta": { "confidence": 0.91 }
}
```
- `channels` MUST contain normalized values in `[0,1]`.
- `channelsRaw` MUST preserve source-native values for re-normalization.
- Channel keys in `DataRecord` MUST be bare names (no source prefix).

### CellSnapshot (query/output-layer merged record)
```json
{
  "cellId": "85283473fffffff",
  "resolution": 4,
  "channels": {
    "worldcover.tree": 0.42,
    "air_quality.pm25": 0.65
  },
  "sources": ["worldcover", "air_quality"]
}
```
- `CellSnapshot.channels` MUST use namespaced keys `sourceId.channelName`.

### ChannelManifest
```json
{
  "name": "pm25",
  "label": "PM2.5",
  "range": [0, 500],
  "unit": "ug/m3",
  "normalization": "log",
  "group": "metric"
}
```
- Adapters MUST declare manifests for all exported channels.

### AlertRule
```json
{
  "ruleId": "pm25_warning",
  "channel": "air_quality.pm25",
  "enterThreshold": 0.6,
  "exitThreshold": 0.4,
  "severity": "warning",
  "cooldownMs": 60000,
  "dedupKey": "cellId"
}
```

### AlertEvent
```json
{
  "eventType": "fire",
  "ruleId": "pm25_warning",
  "cellId": "85283473fffffff",
  "severity": "warning",
  "value": 0.73,
  "timestamp": "2026-02-22T06:31:10Z"
}
```

## 3.2 Spatial Language Rules (H3)
- Internal CRS MUST be WGS84 (EPSG:4326).
- Coordinate arrays MUST use GeoJSON order `[lon, lat]`.
- H3 function invocation order MUST follow library contracts (`lat, lon` where required).
- Import pipeline MUST reject invalid coordinates and malformed geometries.

## 3.3 Merge and Namespace Rules
- Storage key model MUST be `(cellId, sourceId)`.
- Query merge MUST namespace channel keys during `CellSnapshot` construction.
- Name collisions between sources MUST be resolved structurally via namespace, not by silent overwrite.

**Acceptance:** Multi-source merge behavior is deterministic, namespaced, and reproducible across restarts.

## 4. Frozen Public Interfaces (Contract Baseline)

### Reality Snapshot (as of 2026-02-22)
- The current runtime does not yet expose the full control plane below.
- The interfaces in this section are frozen target contracts for V1.

## 4.1 REST APIs

### `POST /api/import`
- Purpose: runtime ingest CSV/GeoJSON.
- Request: `multipart/form-data` (`file` required, `sourceId` optional, `resolution` optional).
- Response `200` MUST include: `status`, `source`, `channels`, `cellCount`, `resolution`.
- Response `400/413` MUST include: `status`, `message`.

Example success:
```json
{
  "status": "ok",
  "source": "air_quality",
  "channels": ["air_quality.pm25", "air_quality.temp_c"],
  "cellCount": 1247,
  "resolution": 4,
  "warnings": []
}
```

### `GET /api/sources`
- Purpose: list builtin + imported sources.
- Response MUST include `sources[]` with `id`, `type`, `channelCount`, `cellCount`, `resolution`.

### `GET /api/channels`
- Purpose: expose registry and current channel indices.
- Response MUST include `channels[]` with `index`, `key`, `source`, `name`, `label`, `unit`, `group`.

### `DELETE /api/sources/:id`
- Purpose: remove imported source from memory + manifest.
- MUST reject deletion of builtin sources with `400`.

### `POST /api/audio-mapping/reload`
- Purpose: hot-reload audio bus mapping.
- `200` MUST include `status`, `buses`, `channels`.

### `GET /api/streams`
- Purpose: inspect stream adapter states.
- Response MUST include stream `status`, `lastFetch`, `activeCells`, and poll/window config.

### `GET /api/config`
- Purpose: client runtime config (`wsPort`, rendering metadata, capability flags).

### `POST /api/viewport`
- Purpose: viewport query fallback path.
- Response MUST include stats fields used by UI/audio, consistent with WebSocket `stats` payload.

**Acceptance:** All listed APIs have stable request/response schemas and are documented with mandatory fields.

## 4.2 WebSocket Events

### `stats`
```json
{
  "type": "stats",
  "gridCount": 120,
  "audioParams": { "busTargets": [0.2, 0.1, 0.5, 0.1, 0.3], "oceanLevel": 0.0 }
}
```

### `channel_update`
```json
{ "type": "channel_update", "version": 8 }
```

### `bus_config_update`
```json
{ "type": "bus_config_update", "version": 5 }
```

### `alert`
```json
{
  "type": "alert",
  "eventType": "fire",
  "ruleId": "pm25_warning",
  "cellId": "85283473fffffff",
  "severity": "warning",
  "value": 0.73,
  "timestamp": "2026-02-22T06:31:10Z"
}
```

- Producers MUST treat these events as contract-stable for V1.

**Acceptance:** Frontend can drive visualization/audio/alert UX from these four event types only.

## 4.3 Configuration Schemas

### `audio_mapping.json` (frozen minimum)
```json
{
  "version": "1.0",
  "default_bus": 4,
  "buses": [
    {
      "index": 0,
      "name": "nature",
      "channels": ["worldcover.tree", "worldcover.grass"],
      "foldMethod": "sum",
      "volume": { "min": 0.0, "max": 1.0 }
    }
  ],
  "smoothing": { "emaTimeConstantMs": 500, "volumeRampMs": 20 }
}
```

### `alert_rules.json` (frozen minimum)
```json
{
  "rules": [
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

### `data/imports/manifest.json` (frozen minimum)
```json
{
  "manifestVersion": 1,
  "sources": [
    {
      "sourceId": "air_quality",
      "file": "air_quality.csv",
      "format": "csv",
      "resolution": 4,
      "importedAt": "2026-02-22T06:20:00Z"
    }
  ]
}
```

- Config loaders MUST fail safely (reject invalid config, keep previous valid runtime config).

**Acceptance:** Invalid config cannot corrupt runtime state; last valid config remains active.

## 5. V1 Capability Specifications

### Reality Snapshot (as of 2026-02-22)
- Capabilities are currently uneven across ingestion, alignment, alerting, configurability, and governance.
- This section defines mandatory target behavior and explicit gap statements.

## 5.1 [M1] Open Ingestion (REQ-INGEST-001)
**Current:** Runtime import/control-plane endpoints are not fully available in production path.  
**Target:** Runtime self-service import for CSV/GeoJSON with source/channel registration and persistence.  
**Gap:** Build adapter framework, import manager, validation pipeline, and source lifecycle controls.

**Acceptance:** New vendor data becomes queryable and audible in one running session without redeploy.

## 5.2 [M2] Unified Spatial Language (REQ-GRID-001)
**Current:** Existing behavior is still tied to legacy grid logic in parts of the runtime path.  
**Target:** End-to-end H3-based storage/query/merge semantics for all sources.  
**Gap:** Complete H3 index/query migration and frontend hex rendering alignment.

**Acceptance:** Different sources align on shared H3 cells with deterministic merged snapshots.

## 5.3 [M3] Monitoring and Alerting (REQ-ALERT-001)
**Current:** Alerting semantics are not yet complete as a production control-plane feature.  
**Target:** Rule-driven threshold alerts with hysteresis, cooldown, dedup, and auditable events.  
**Gap:** Implement alert engine, runtime rule loading, and event dispatch contract.

**Acceptance:** Alert lifecycle is deterministic: `idle -> active -> cooldown -> idle`.

## 5.4 [M4] Configurable Audio (REQ-AUDIO-001)
**Current:** Core Web Audio path exists, but business-level runtime configurability is limited.  
**Target:** Non-audio engineers can configure channel/bus mapping and alert-sonification behavior.  
**Gap:** Deliver stable mapping schema, hot reload path, and minimum console workflows.

**Acceptance:** Mapping change is applied at runtime and reflected in output without deployment.

## 5.5 [M0] Compatibility Guardrail (REQ-COMPAT-001)
**Current:** WorldCover demo is the stable baseline.  
**Target:** Every milestone preserves baseline behavior while extending platform scope.  
**Gap:** Introduce and enforce golden-regression harness across milestones.

**Acceptance:** WorldCover-only scenario remains functionally unchanged at each milestone exit.

## 5.6 [M5] Governance Baseline (REQ-GOV-001)
**Current:** Enterprise baseline controls are not complete in V1 runtime path.  
**Target:** API authentication, import quotas/rate limits, and auditable change logs.  
**Gap:** Add auth middleware, limiter policies, and audit event persistence.

**Acceptance:** Unauthorized writes fail, quota breaches are blocked, and key operations are traceable.

## 6. Quality Gates for This Spec

### Reality Snapshot (as of 2026-02-22)
- Prior drafts mixed design notes and roadmap ideas; this quality gate is now normative.

1. Interface consistency: SPEC and migration plan MUST not conflict on API/type/schema names.
2. Reality alignment: each core chapter MUST include `Current/Target/Gap`.
3. Traceability: every milestone MUST map to at least one `REQ-*`.
4. Compatibility: `REQ-COMPAT-001` MUST be explicitly testable.
5. Ingestion scenario: runtime import path MUST support CSV/GeoJSON without code changes.
6. Spatial alignment: multi-source H3 merge MUST be deterministic.
7. Alert scenario: threshold crossing and clear semantics MUST be testable.
8. Audio scenario: runtime configuration MUST affect output without redeploy.
9. Governance scenario: auth/rate-limit/audit controls MUST be demonstrable.
10. Readability: the executive intro MUST communicate value in 3 minutes; the body MUST be implementation-ready.

**Acceptance:** Reviewers can derive implementation and QA plans from this document without unresolved decisions.

## 7. Explicit Decision Locks (No Open Design Slots)

### Reality Snapshot (as of 2026-02-22)
- Some earlier sections used optional pathways as if still undecided.
- This section freezes defaults for execution.

- V1 main renderer MUST be Web Audio.
- Max/OSC MUST be treated as historical compatibility appendix only.
- V1 MUST include baseline governance but MAY defer full multi-tenant isolation.
- Data ingest MVP MUST support CSV + GeoJSON first.
- H3 is the sole internal spatial language for merged operations.

**Acceptance:** Implementers are not required to make architecture-level choices outside this document.

## 8. Future Work (Single Consolidated Chapter)

### Reality Snapshot (as of 2026-02-22)
- Deferred items were previously scattered.
- Future scope is now centralized to avoid contaminating V1 commitments.

- KML/GPX adapters and richer geometry semantics.
- AOI bucketed strategies for many concurrent global viewports.
- Full tenant isolation model (tenant-aware access control and data boundaries).
- Compound alert expressions (AND/OR trees across channels).
- Expanded observability and long-term compliance reporting features.

**Acceptance:** Deferred scope does not alter V1 red lines or milestones.

## Appendix A: Legacy Max/OSC Compatibility Notes (Historical)
- Historical Max/OSC references are preserved for migration context only.
- They MUST NOT redefine V1 primary architecture.
- Any compatibility bridge must be additive and non-blocking to Web Audio-first delivery.

## Appendix B: Glossary
- **DataRecord:** per-source storage record for one cell.
- **CellSnapshot:** merged output record for one cell across sources.
- **ChannelManifest:** adapter-declared metadata for channels.
- **AlertRule:** declarative threshold rule.
- **AlertEvent:** emitted runtime alert transition event.
- **Control Plane:** APIs that manage source/channel/audio/stream/alert configuration.
