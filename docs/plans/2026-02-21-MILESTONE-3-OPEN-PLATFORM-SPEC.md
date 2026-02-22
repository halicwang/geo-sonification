# Milestone 3 — Open Platform Target Specification

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
- Technical rationale and engineering execution: `docs/guides/2026-02-22-MILESTONE-3-IMPLEMENTATION-GUIDE.md`
- Phase execution contract: `docs/plans/2026-02-21-MILESTONE-3-MIGRATION-PLAN.md`

## Phase Mapping (P0-P5)
Section numbers in this document are local structure only. Cross-document tracking uses `P0..P5` phase IDs.
`P0..P5` are progress labels only; normative requirement strength is defined exclusively by RFC 2119 keywords (`MUST/SHOULD/MAY`).

| Phase ID | Phase Meaning | Primary Sections In This Spec |
| --- | --- | --- |
| `P0` | Compatibility guardrails | `REQ-COMPAT-001`, `5.5` |
| `P1` | Open ingestion + control plane | `REQ-INGEST-001`, `4.1`, `5.1` |
| `P2` | Unified H3 spatial core | `REQ-GRID-001`, `REQ-PERF-001`, `3.2`, `5.2`, `5.8` |
| `P3` | Monitoring + Alerting + Stream Loop | `REQ-ALERT-001`, `REQ-STREAM-001`, `4.2 alert`, `5.3` |
| `P4` | Configurable audio runtime (includes sample management) | `REQ-AUDIO-001`, `REQ-UX-001`, `4.3 audio_mapping.json`, `5.4` |
| `P5` | Governance baseline | `REQ-GOV-001`, `REQ-DEPLOY-001`, `5.6`, `5.7` |

## 0. Document Conventions

### Baseline Reality Statement (as of 2026-02-22)
- Current system is a stable WorldCover-focused demo with Web Audio rendering.
- Only a limited API surface exists in runtime today (`/health`, `/api/config`, `/api/viewport`).
- Open-platform capabilities below are normative target requirements and must be implemented through the migration plan.
- Existing runtime model is grid/landcover focused; canonical cross-source objects in §3 are frozen target interfaces.
- The current runtime does not yet expose the full control plane; interfaces in §4 are frozen target contracts.
- Capabilities are currently uneven across ingestion, alignment, alerting, configurability, and governance; §5 defines mandatory target behavior and explicit gap statements.
- Prior drafts mixed design notes and roadmap ideas; quality gates in §6 are now normative.
- Decision locks in §7 freeze defaults for execution; no open design slots remain.
- Deferred items in §8 are centralized to avoid contaminating V1 commitments.

This document uses [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) keywords:
- **MUST**: mandatory for compliance.
- **SHOULD**: strong recommendation; deviations need explicit rationale.
- **MAY**: optional capability.

All requirements are traceable by `REQ-*` IDs and are referenced by phases in the migration plan.

### 0.1 Mandatory Three-Document Protocol (Human + AI)
- Any implementation agent (human or AI) MUST consult all three lighthouse documents before planning or coding:
  - `docs/plans/2026-02-21-MILESTONE-3-OPEN-PLATFORM-SPEC.md`
  - `docs/plans/2026-02-21-MILESTONE-3-MIGRATION-PLAN.md`
  - `docs/guides/2026-02-22-MILESTONE-3-IMPLEMENTATION-GUIDE.md`
- Every implementation plan, task, or PR MUST include a trace tuple: at least one `REQ-*`, one `P*`, and one implementation guide section anchor.
- Document precedence MUST be: `OPEN-PLATFORM-SPEC` > `MIGRATION-PLAN` > `IMPLEMENTATION-GUIDE`.
- If cross-document conflict is detected, implementation MUST pause and the document conflict MUST be resolved (or explicitly decision-locked) before merge.

**Acceptance:** Delivery artifacts include a three-doc trace tuple and no unresolved cross-document conflicts.

## 1. North Star Requirements (V1 Red Lines)

### REQ-INGEST-001: Open Self-Service Ingestion
Any company/team MUST be able to upload supported files (CSV, GeoJSON) and use them immediately without changing source code or redeploying services.

**Acceptance:** A new source can be imported at runtime via `POST /api/import`, appears in `GET /api/sources`, and contributes to map/audio behavior in the same server session.

### REQ-GRID-001: Unified Spatial Language
All ingested data MUST be aligned to a unified H3 cell model before query, merge, alert evaluation, and audio mapping.

**Acceptance:** Multi-source data queried for the same viewport can be merged by `cellId` with deterministic namespaced channel keys.

### REQ-ALERT-001: Monitoring and Alerting
The platform MUST support operational alerting (not only artistic sonification) with threshold, hysteresis, cooldown, and dedup semantics. V1 MUST also support basic compound alert rules combining 2-3 channels with AND/OR logic.

**Acceptance:** Threshold crossings emit alert events, clears are emitted on exit threshold, and duplicate storms are prevented for the same `(ruleId, cellId)`. Compound rules with AND/OR operators across 2-3 channels produce correct fire/clear transitions.

### REQ-AUDIO-001: Fully Configurable Audio Mapping and Samples
Business users MUST be able to configure what triggers sound, mapping behavior, severity behavior, and audio samples via configuration/control plane without audio-engineering expertise.

**Acceptance:** Updating `audio_mapping.json` (including per-bus sample references) and alert/audio settings via control APIs changes runtime audio behavior without redeploy. Custom audio samples can be uploaded and referenced in bus mapping.

### REQ-COMPAT-001: WorldCover Compatibility Guardrail
Refactoring MUST NOT break existing WorldCover demo behavior during migration.

**Acceptance:** Existing WorldCover-only workflow remains functional and passes regression checks after each phase.

### REQ-GOV-001: Enterprise Baseline Governance
V1 MUST include baseline governance: authentication, request quotas/rate limits, and auditable operation logs.

**Acceptance:** Unauthorized writes are blocked, import quotas are enforced, and import/delete/config changes are traceable through audit records.

### REQ-STREAM-001: Dual Stream Ingestion (Poll + Push)
V1 MUST support both poll-based stream ingestion and HTTPS JSON push ingestion under one source registry model.

**Acceptance:** A `mode=stream_push` source created by `POST /api/sources` can receive events via `POST /api/streams/push/:sourceId` with idempotency, dedup, and backpressure semantics.

### REQ-DEPLOY-001: Deployment Model Boundary (V1)
V1 MUST explicitly target `single_org_multi_team` deployment and MUST NOT implicitly claim hard multi-tenant SaaS isolation.

**Acceptance:** API/UI/docs expose the deployment model boundary consistently, and full tenant isolation remains outside V1 commitments.

### REQ-UX-001: Minimum Operator Workflow for Audio Control
V1 MUST provide a minimum operator workflow for runtime audio behavior updates without audio-engineering expertise. V1 control surface is REST API + JSON configuration files only; a graphical UI is not required.

**Acceptance:** Operators can complete `Draft -> Validate -> Apply -> Rollback` for mapping/rule updates through REST APIs and JSON config edits, and observe runtime effect without redeploy.

### REQ-PERF-001: Quantified V1 Performance Envelope
V1 MUST publish quantified capacity/latency limits as provisional targets, then freeze them to normative gates after benchmark validation.

**Acceptance:** Provisional metrics are declared in SPEC, benchmark gate is defined, and metrics become release-blocking from `P2` exit onward.

## 2. Target System Architecture (Web Audio Primary)

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

Single-channel rule (default `type: "simple"`):
```json
{
  "ruleId": "pm25_warning",
  "type": "simple",
  "channel": "air_quality.pm25",
  "enterThreshold": 0.6,
  "exitThreshold": 0.4,
  "severity": "warning",
  "cooldownMs": 60000,
  "dedupKey": "cellId"
}
```

Compound rule (`type: "compound"`, V1 limit: 2-3 conditions, one operator level):
```json
{
  "ruleId": "heat_and_pollution",
  "type": "compound",
  "operator": "AND",
  "conditions": [
    { "channel": "air_quality.pm25", "enterThreshold": 0.6, "exitThreshold": 0.4 },
    { "channel": "air_quality.temp_c", "enterThreshold": 0.7, "exitThreshold": 0.5 }
  ],
  "severity": "critical",
  "cooldownMs": 120000,
  "dedupKey": "cellId"
}
```

V1 compound rule constraints:
- V1 MUST support `AND` and `OR` operators only.
- V1 MUST contain 2-3 conditions per compound rule (no nesting, single operator level).
- `type` field defaults to `"simple"` if omitted for backward compatibility.

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
- Push event spatial key resolution MUST follow deterministic precedence: `cellId` (if present) > `lat`/`lon` encoding > rejection.

## 3.3 Merge and Namespace Rules
- Storage key model MUST be `(cellId, sourceId)`.
- Query merge MUST namespace channel keys during `CellSnapshot` construction.
- Name collisions between sources MUST be resolved structurally via namespace, not by silent overwrite.

**Acceptance:** Multi-source merge behavior is deterministic, namespaced, and reproducible across restarts.

## 3.4 Channel Resolution Policy
- Configuration artifacts (`alert_rules.json`, `audio_mapping.json`) MUST accept references to channels not currently registered in the channel registry (lazy resolution).
- At evaluation time, unresolved channel references MUST be treated as absent (value = undefined), not as zero.
- Alert rules with unresolved channels:
  - Simple rules: MUST NOT fire while the referenced channel is unresolved.
  - Compound AND rules: MUST NOT fire if any condition channel is unresolved.
  - Compound OR rules: MUST evaluate only resolved conditions; if all conditions are unresolved, the rule MUST NOT fire.
- Audio mapping with unresolved channels: bus target contribution MUST be 0 for unresolved channels; resolved channels in the same bus MUST still function normally.
- When a source comes online or goes offline, the runtime MUST re-evaluate all rules and mappings that reference channels from that source.
- Runtime SHOULD log a warning for each unresolved channel reference at config load and at periodic health check intervals.

**Acceptance:** Operators can configure rules/mappings referencing future data sources without causing runtime errors; rules activate automatically when referenced sources come online.

## 4. Frozen Public Interfaces (Contract Baseline)

## 4.1 REST APIs

### API Responsibility Matrix

| API | Primary Responsibility | Scope Boundary |
| --- | --- | --- |
| `POST /api/import` | **Data-carrying registration** for static/batch files | Upload file + parse + source create/replace in one call |
| `POST /api/sources` | **Metadata-only pre-registration** for stream sources | Declare source schema/mode without observation payload |
| `POST /api/streams/push/:sourceId` | **Incremental push ingestion** | Accept runtime event batches only for `mode=stream_push` |

Responsibility lock:
- `POST /api/import` and `POST /api/sources` MUST NOT be treated as interchangeable.
- Static/batch onboarding MUST use `POST /api/import`.
- Stream push onboarding MUST use `POST /api/sources` first, then `POST /api/streams/push/:sourceId`.

### Error Response Envelope (Frozen)

All error responses (4xx, 5xx) across REST APIs MUST use this envelope:

```json
{
  "status": "error",
  "code": "UPPER_SNAKE_CASE error code",
  "message": "Human-readable description",
  "errors": []
}
```

- `code` MUST be a stable, machine-readable `UPPER_SNAKE_CASE` identifier.
- `message` is informational and MAY change across versions.
- `errors[]` is OPTIONAL; used for batch endpoints (push ingress) or multi-field validation failures. Each entry MUST include `index` (if batch), `code`, and `message`.
- Success responses use `"status": "ok"` and are endpoint-specific.

### `POST /api/import`
- Purpose: runtime ingest CSV/GeoJSON.
- Request: `multipart/form-data` (`file` required, `sourceId` optional, `resolution` optional).
- Response `200` MUST include: `status`, `source`, `channels`, `cellCount`, `resolution`.
- Response `400/413` MUST use error envelope.
- Responsibility boundary: this endpoint performs **data-carrying registration** for static/batch ingestion paths.
- Source behavior: if `sourceId` exists, import MUST atomically replace prior static/batch source data.

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

### `POST /api/sources`
- Purpose: register or update a stream source descriptor before events arrive.
- Request: `application/json` with `sourceId`, `mode`, `channels`, and schema/version metadata.
- Supported modes in V1: `stream_poll`, `stream_push`.
- Response `200` MUST include: `status`, `source`, `mode`, `schemaVersion`.
- Response `400` MUST use error envelope.
- Response `409` MUST use error envelope for incompatible descriptor conflicts (for example mode/schema mismatch without replace flag).

### `GET /api/sources`
- Purpose: list builtin + imported sources.
- Response MUST include `sources[]` with `id`, `type`, `mode`, `schemaVersion`, `ownerTeam`, `channelCount`, `cellCount`, `resolution`, `status`.

### `GET /api/channels`
- Purpose: expose registry and current channel indices.
- Response MUST include `channels[]` with `index`, `key`, `source`, `name`, `label`, `unit`, `group`.

### `DELETE /api/sources/:id`
- Purpose: remove imported source from memory + persistence store(s).
- MUST reject deletion of builtin sources with `400`.
- Lifecycle rule:
  - For static/batch sources, delete MUST remove source state from runtime registry and `data/imports/manifest.json`.
  - For stream sources (`stream_poll`, `stream_push`), delete MUST remove source state from runtime registry and `stream_sources.json`.
  - If a source has entries in both persistence stores due to migration/backfill operations, delete MUST remove both entries atomically or fail without partial state.
- Response `200` MUST include: `status`, `deletedSource`, `cleanedStores[]`.
- Response `400` (builtin source) MUST use error envelope with code `BUILTIN_SOURCE`.
- Response `404` (source not found) MUST use error envelope with code `SOURCE_NOT_FOUND`.

Example success:
```json
{
  "status": "ok",
  "deletedSource": "air_quality",
  "cleanedStores": ["manifest"]
}
```

### Audio Mapping Control Workflow APIs

#### `GET /api/audio-mapping`
- Purpose: retrieve active mapping config and version metadata.
- Response `200` MUST include: `version`, `config` (full `audio_mapping` object), `appliedAt`.

#### `POST /api/audio-mapping/draft`
- Purpose: create a draft mapping from active config or from request body.
- Request: `application/json` with optional `config` body. If omitted, clones active config.
- Response `200` MUST include: `status`, `draftId`, `config`, `createdAt`.
- Response `400` MUST use error envelope.

#### `POST /api/audio-mapping/validate`
- Purpose: validate a draft mapping without applying it.
- Request: `application/json` with `draftId` or inline `config`.
- Response `200` MUST include: `status`, `valid` (boolean), `warnings[]`, `errors[]`.
- Response `400` MUST use error envelope.

#### `POST /api/audio-mapping/apply`
- Purpose: apply a validated draft to runtime. Replaces prior `reload` semantics.
- Request: `application/json` with `draftId`.
- Response `200` MUST include: `status`, `version`, `appliedAt`, `buses`, `channels`.
- Response `400/409` MUST use error envelope.
- Behavior: MUST reject unvalidated drafts. On success, MUST emit `bus_config_update` WebSocket event.

#### `POST /api/audio-mapping/rollback`
- Purpose: rollback to a previous mapping version.
- Request: `application/json` with optional `targetVersion`. If omitted, rolls back to immediately previous version.
- Response `200` MUST include: `status`, `version`, `rolledBackFrom`, `appliedAt`.
- Behavior: MUST emit `bus_config_update` WebSocket event on success.

#### `GET /api/audio-mapping/history`
- Purpose: list recent mapping versions for rollback selection.
- Response `200` MUST include: `versions[]` with `version`, `appliedAt`, `channelCount`, `busCount`.

### `GET /api/streams`
- Purpose: inspect stream adapter states.
- Response MUST include `status`, `mode`, and stream health metadata.
- For `stream_poll`, response MUST include `lastFetch`, poll/window config, and active cell count.
- For `stream_push`, response MUST include `lastEventAt`, `queueDepth`, `dedupWindowMs`, `errorRate1m`, and active cell count.

### `POST /api/streams/push/:sourceId`
- Purpose: accept event batches pushed by external systems for a pre-registered `mode=stream_push` source.
- Request: `application/json` with `records[]`.
- Required headers: `Authorization`, `Idempotency-Key`.
- Response `200` MUST include `accepted`, `deduped`, `rejected`, `errors[]`, `ingestLatencyMs`.
- Response `400/401/403/404/409/413/429` MUST use error envelope.
- Backpressure rule: when source queue depth exceeds configured cap, endpoint MUST return `429` and MUST NOT partially enqueue rejected records.

### `GET /api/config`
- Purpose: client runtime config (`wsPort`, rendering metadata, capability flags).
- Response MUST include `deploymentModel`, capability flags (`supportsStreamPoll`, `supportsStreamPush`), and active limit profile identifiers.

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

### Event Ordering and Consistency Semantics
- Server MUST send events in causal order within the same connection: `channel_update` MUST precede `bus_config_update` when both result from the same operation.
- `bus_config_update` MUST precede any `alert` events that depend on the updated configuration.
- Events carry no cross-event atomicity guarantee: the client MAY observe intermediate states between related events.
- Client mitigation: the existing EMA smoothing in the audio engine provides transient-state tolerance. Clients SHOULD apply events immediately in receive order and rely on smoothing to mask parameter jumps.
- Server SHOULD minimize the window between related events but MAY NOT guarantee zero-gap delivery in V1.
- `channel_update` and `bus_config_update` events MUST include a monotonic `version` field (integer) so clients can detect stale or out-of-order delivery.

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
      "volume": { "min": 0.0, "max": 1.0 },
      "sampleUrl": "/audio/ambience/tree.wav"
    }
  ],
  "smoothing": { "emaTimeConstantMs": 500, "volumeRampMs": 20 }
}
```

- `sampleUrl` MAY reference a built-in sample path or a custom uploaded sample path (`/api/audio-samples/<filename>`).
- If `sampleUrl` is omitted, the bus MUST use the default built-in sample for that bus index.

### `POST /api/audio-samples/upload` (frozen minimum)
- Purpose: upload custom audio sample files for bus mapping.
- Request: `multipart/form-data` (`file` required, `busName` optional).
- Validation: format MUST be WAV or OGG only; max file size MUST be enforced (configurable, default 10 MB); max duration MUST be enforced (configurable, default 30 seconds).
- Response `200` MUST include: `status`, `filename`, `url`, `format`, `durationMs`.
- Response `400/413` MUST use error envelope.
- Uploaded files MUST be stored in `data/samples/` with safe filename sanitization.

### `GET /api/audio-samples`
- Purpose: list available audio sample files for mapping configuration.
- Response `200` MUST include: `samples[]` with `filename`, `url`, `format`, `durationMs`, `sizeBytes`, `uploadedAt`.

### `alert_rules.json` (frozen minimum)
```json
{
  "version": 1,
  "rules": [
    {
      "ruleId": "pm25_warning",
      "type": "simple",
      "channel": "air_quality.pm25",
      "enterThreshold": 0.6,
      "exitThreshold": 0.4,
      "severity": "warning",
      "cooldownMs": 60000,
      "dedupKey": "cellId"
    },
    {
      "ruleId": "heat_and_pollution",
      "type": "compound",
      "operator": "AND",
      "conditions": [
        { "channel": "air_quality.pm25", "enterThreshold": 0.6, "exitThreshold": 0.4 },
        { "channel": "air_quality.temp_c", "enterThreshold": 0.7, "exitThreshold": 0.5 }
      ],
      "severity": "critical",
      "cooldownMs": 120000,
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
      "channels": ["pm25", "temp_c"],
      "resolution": 4,
      "importedAt": "2026-02-22T06:20:00Z"
    }
  ]
}
```

### `stream_sources.json` (frozen minimum)
```json
{
  "version": 1,
  "sources": [
    {
      "sourceId": "air_quality_stream",
      "mode": "stream_push",
      "schemaVersion": 1,
      "channels": ["pm25", "temp_c"],
      "dedupWindowMs": 600000
    }
  ]
}
```

Persistence relationship (`manifest.json` vs `stream_sources.json`):
- `data/imports/manifest.json` is the source of truth for static/batch import lifecycle (`POST /api/import`).
- `stream_sources.json` is the source of truth for stream source descriptors (`POST /api/sources`).
- `DELETE /api/sources/:id` MUST apply lifecycle cleanup to whichever store(s) contain the source entry according to endpoint rules.

### `ingest_limits.json` (frozen minimum)
```json
{
  "version": 1,
  "maxImportBytes": 262144000,
  "maxImportRows": 1000000,
  "maxSourceCells": 500000,
  "maxPushBatchRecords": 5000,
  "maxPushQueueDepth": 20000
}
```

- Config loaders MUST fail safely (reject invalid config, keep previous valid runtime config).

**Acceptance:** Invalid config cannot corrupt runtime state; last valid config remains active.

## 5. V1 Capability Specifications

## 5.1 [P1] Open Ingestion (REQ-INGEST-001)
**Current:** Runtime import/control-plane endpoints are not fully available in production path.  
**Target:** Runtime self-service import for CSV/GeoJSON with source/channel registration and persistence.  
**Gap:** Build adapter framework, import manager, validation pipeline, and source lifecycle controls.

Responsibility lock in this phase:
- `POST /api/import` = static/batch data-carrying registration.
- `POST /api/sources` = stream source descriptor registration (no observation payload).

**Acceptance:** New vendor data becomes queryable and audible in one running session without redeploy. P1 includes a degraded end-to-end demo (using existing grid overlay, no H3) to validate the "upload -> see -> hear" loop at the earliest possible phase.

## 5.2 [P2] Unified Spatial Language (REQ-GRID-001)
**Current:** Existing behavior is still tied to legacy grid logic in parts of the runtime path.  
**Target:** End-to-end H3-based storage/query/merge semantics for all sources.  
**Gap:** Complete H3 index/query migration and frontend hex rendering alignment.

**Acceptance:** Different sources align on shared H3 cells with deterministic merged snapshots.

## 5.3 [P3] Monitoring and Alerting (REQ-ALERT-001 + REQ-STREAM-001)
**Current:** Alerting semantics are not yet complete as a production control-plane feature.  
**Target:** Rule-driven threshold alerts with hysteresis, cooldown, dedup, auditable events, basic compound alert rules (AND/OR across 2-3 channels), and dual stream ingestion (`poll + HTTPS push`).
**Gap:** Implement alert engine (including compound rule evaluation), runtime rule loading, event dispatch contract, and push ingress path (`POST /api/streams/push/:sourceId`).

V1 stream scope lock:
- V1 MUST support poll and HTTPS JSON push ingestion.
- WebSocket ingress from external producers is explicitly deferred.

V1 alert scope lock:
- V1 MUST support simple single-channel rules and basic compound rules (AND/OR, 2-3 conditions, flat operator — no nesting).
- Advanced compound rule DSL (nested AND/OR trees, N-of-M, temporal correlation) is explicitly deferred.

**Acceptance:** Alert lifecycle is deterministic: `idle -> active -> cooldown -> idle`.

## 5.4 [P4] Configurable Audio (REQ-AUDIO-001 + REQ-UX-001)
**Current:** Core Web Audio path exists, but business-level runtime configurability is limited. Audio samples are hardcoded.
**Target:** Non-audio engineers can configure channel/bus mapping, alert-sonification behavior, and custom audio samples.
**Gap:** Deliver stable mapping schema, frozen audio mapping workflow REST API endpoints (`GET /api/audio-mapping`, `/draft`, `/validate`, `/apply`, `/rollback`, `/history`), sample upload/management (`POST /api/audio-samples/upload`, `GET /api/audio-samples`), and the `Draft -> Validate -> Apply -> Rollback` operator workflow (no GUI required in V1).

Minimum control workflow contract for V1:
- Workflow state machine: `Draft -> Validate -> Apply -> Rollback`.
- V1 delivery surface: REST API endpoints + JSON config files. A graphical UI for this workflow is future scope.
- Required operator tasks:
  - edit channel-to-bus mapping;
  - validate mapping/rules before activation;
  - apply changes without redeploy;
  - rollback to last-known-good config;
  - inspect active version and recent change history.

**Acceptance:** Mapping change is applied at runtime and reflected in output without deployment.

## 5.5 [P0] Compatibility Guardrail (REQ-COMPAT-001)
**Current:** WorldCover demo is the stable baseline.  
**Target:** Every phase preserves baseline behavior while extending platform scope.  
**Gap:** Introduce and enforce golden-regression harness across phases.

**Acceptance:** WorldCover-only scenario remains functionally unchanged at each phase exit.

## 5.6 [P5] Governance Baseline (REQ-GOV-001)
**Current:** Enterprise baseline controls are not complete in V1 runtime path.  
**Target:** API authentication, import quotas/rate limits, and auditable change logs.  
**Gap:** Add auth middleware, limiter policies, and audit event persistence.

**Acceptance:** Unauthorized writes fail, quota breaches are blocked, and key operations are traceable.

## 5.7 [P5] Deployment Model Boundary (REQ-DEPLOY-001)
**Current:** Deployment boundary is not consistently documented across API/UX/ops artifacts.  
**Target:** V1 is explicitly `single_org_multi_team` with no implied hard tenant isolation guarantees.  
**Gap:** Align API docs, config flags, and operator runbooks to one deployment boundary statement.

**Acceptance:** All public artifacts expose the same deployment model boundary without ambiguity.

## 5.8 [P2+] Performance Envelope (REQ-PERF-001)
**Current:** Performance monitoring language exists, but quantified acceptance targets are not yet frozen.  
**Target:** Publish provisional SLO/capacity targets, validate with benchmark gate, and freeze as normative gates from `P2` exit.  
**Gap:** Define metric table, benchmark method, freeze criteria, and release-gate enforcement boundary.

Provisional V1 targets (subject to benchmark freeze):

| Metric | Provisional Target | Gate Activation |
| --- | --- | --- |
| Active viewport clients (per instance) | `>= 200` | Normative after `P2` exit |
| `POST /api/viewport` latency | `p95 <= 250ms`, `p99 <= 500ms` | Normative after `P2` exit |
| Single import size | `<= 250MB`, `<= 1,000,000 rows` | Normative after `P2` exit |
| Source unique cells | `<= 500,000` | Normative after `P2` exit |
| Push batch size | `<= 5,000` records | Normative after `P2` exit |
| Push queue depth cap | `20,000` (`429` above cap) | Normative after `P2` exit |

Benchmark note (informative, non-commitment): a local 80-request smoke sample on 2026-02-22 observed `p50=1.622ms`, `p95=2.059ms`, `p99=10.331ms` for one fixed viewport. This sample is sanity input only, not release certification.

V1 scaling boundary (hard limit):
- V1 is designed and tested for a single-instance deployment serving up to 200 concurrent viewport clients and up to 500,000 unique cells per source.
- Horizontal scaling, sharding, or multi-instance coordination is explicitly out of V1 scope.
- Exceeding these limits in production requires architecture changes tracked as post-V1 work.

## 6. Quality Gates for This Spec

1. Interface consistency: SPEC, migration plan, and implementation guide MUST not conflict on API/type/schema names.
2. Reality alignment: each core chapter MUST include `Current/Target/Gap`.
3. Traceability: every phase MUST map to at least one `REQ-*`.
4. Compatibility: `REQ-COMPAT-001` MUST be explicitly testable.
5. Ingestion scenario: runtime import path MUST support CSV/GeoJSON without code changes.
6. Spatial alignment: multi-source H3 merge MUST be deterministic.
7. Alert scenario: threshold crossing and clear semantics MUST be testable.
8. Audio scenario: runtime configuration MUST affect output without redeploy.
9. Governance scenario: auth/rate-limit/audit controls MUST be demonstrable.
10. Readability: the executive intro MUST communicate value in 3 minutes; the body MUST be implementation-ready.
11. API responsibility boundary: `POST /api/import`, `POST /api/sources`, and `POST /api/streams/push/:sourceId` MUST have non-overlapping responsibilities.
12. Control workflow contract: the `Draft -> Validate -> Apply -> Rollback` workflow MUST be testable end-to-end.
13. SLO governance: provisional performance targets MUST include benchmark freeze rule and explicit gate activation boundary (`P2` exit).

**Acceptance:** Reviewers can derive implementation and QA plans from this document without unresolved decisions.

## 7. Explicit Decision Locks (No Open Design Slots)

- V1 main renderer MUST be Web Audio.
- Max/OSC MUST be treated as historical compatibility appendix only.
- V1 MUST include baseline governance but MAY defer full multi-tenant isolation.
- V1 deployment model is locked to `single_org_multi_team`.
- Data ingest MVP MUST support CSV + GeoJSON first.
- V1 stream ingestion MUST support `poll + HTTPS JSON push`.
- External producer WebSocket ingress is future scope, not V1.
- H3 is the sole internal spatial language for merged operations.
- Performance targets are provisional before benchmark freeze and become normative release gates from `P2` exit.
- V1 npm dependencies are pre-approved (no per-packet gate needed): `h3-js`, `multer` or `busboy`, `ajv` or equivalent, `express-rate-limit` or equivalent. Future dependencies (e.g. `fast-xml-parser` for KML/GPX) require explicit approval.
- Audio sample customization is V1 scope: custom WAV/OGG upload via `POST /api/audio-samples/upload` and per-bus `sampleUrl` in `audio_mapping.json`.
- V1 audio control surface is API + JSON config only. A graphical UI for audio mapping/alert rule management is future scope and does not block V1 delivery.
- V1 compound alert rules support basic AND/OR with 2-3 conditions (flat, no nesting). Advanced compound DSL (nested trees, N-of-M, temporal correlation) is future scope.
- V1 performance boundary is single-instance: 200 concurrent viewport clients, 500,000 cells per source. Scaling beyond these limits is post-V1 architecture work.
- P0 and P1 Packet A execute in parallel; P1-B onward starts after P0 gate is green.

**Acceptance:** Implementers are not required to make architecture-level choices outside this document.

## 8. Future Work (Single Consolidated Chapter)

- Priority-ordered format roadmap (post-V1):
  1. **Shapefile** (.shp) — highest demand from GIS enterprise workflows.
  2. **Parquet / GeoParquet** — columnar analytics and cloud-native pipelines.
  3. **KML / GPX** — field data, GPS tracks, and Google Earth interop.
  4. **NetCDF / HDF5** — climate and atmospheric science datasets.
  5. Richer geometry semantics (polygon/line features beyond point-in-cell).
- AOI bucketed strategies for many concurrent global viewports.
- Full tenant isolation model (tenant-aware access control and data boundaries).
- External producer WebSocket ingress path.
- Advanced compound alert expressions (nested AND/OR trees, N-of-M, temporal correlation across channels).
- Audio control graphical UI for the `Draft -> Validate -> Apply -> Rollback` workflow.
- Horizontal scaling architecture (multi-instance, sharded spatial index, load balancing).
- Expanded observability and long-term compliance reporting features.

**Acceptance:** Deferred scope does not alter V1 red lines or phases.

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
- **SourceDescriptor:** source metadata object including `mode`, schema version, and status.
- **PushEvent:** runtime event payload accepted by push ingestion endpoint.
- **PushIngestAck:** push endpoint ingestion acknowledgement summary.
- **Control Plane:** APIs that manage source/channel/audio/stream/alert configuration.
