# Engineering Reference Companion (Detailed)

**Status:** Implementation Execution Reference  
**Date:** 2026-02-22  
**Scope:** File-level decomposition, dependency gates, risk hotspots, and validation scripts

## Executive Intro
This document is the implementation blueprint for the migration plan, intended for engineering execution rather than strategy communication.  
It preserves critical execution knowledge from the prior detailed drafts: coupling analysis, dependency approvals, file-level change packets, risk hotspots, shortest delivery paths, and demo validation scripts.  
Recommended reading order: lighthouse migration document first, then this reference for packet-level execution.

## 0. How To Use This With Lighthouse Plan

- Use `docs/2026-02-21-OPEN-PLATFORM-SPEC.md` for normative contracts and requirement authority (`MUST/SHOULD/MAY`).
- Use `docs/2026-02-21-MIGRATION-PLAN.md` for milestone outcomes (`M0..M5`).
- Use `docs/2026-02-22-ENGINEERING-REFERENCE.md` for implementation sequencing and detailed work packets.
- Use `docs/2026-02-22-TECHNICAL-DESIGN.md` for model/algorithm rationale.

### 0.1 Mandatory Multi-Document Use (Human + AI)
- This document MUST NOT be used as a standalone execution source.
- Any implementation agent (human or AI) MUST consult all four lighthouse documents before changing code.
- Execution artifacts MUST include a trace tuple: `REQ-*`, `M*`, technical section anchor, and engineering packet anchor.
- Conflict precedence MUST be: `OPEN-PLATFORM-SPEC` > `MIGRATION-PLAN` > `TECHNICAL-DESIGN` > `ENGINEERING-REFERENCE`.
Validation authority MUST be inherited from `docs/2026-02-21-OPEN-PLATFORM-SPEC.md` Section 0.1 acceptance criteria; this document provides execution detail and MUST NOT redefine acceptance criteria.

## Milestone Mapping (M0-M5)
Section numbers in this document are local structure only. Cross-document tracking uses `M0..M5` milestone IDs.
`M0..M5` are progress labels only; normative requirement strength is defined exclusively by RFC 2119 keywords (`MUST/SHOULD/MAY`).

| Milestone ID | Primary Execution Anchors In This Document |
| --- | --- |
| `M0` | `3.1 M0 Compatibility Guardrails` |
| `M1` | `3.2 M1 Open Ingestion + Control Plane` |
| `M2` | `3.3 M2 Unified H3 Spatial Core` |
| `M3` | `3.4 M3 Monitoring + Alerting + Stream Loop` |
| `M4` | `3.5 M4 Configurable Audio Runtime` |
| `M5` | `3.6 M5 Enterprise Governance Baseline` |

## 1. Coupling Analysis (Legacy Constraints Inventory)

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

Execution note:
- Any change touching `server/spatial.js` or query contracts should be treated as high-risk and gated behind compatibility tests.

## 2. Dependency Approval Gates

| Work Packet | Dependency | Estimated Size | Why Needed | Approval Gate |
| --- | --- | --- | --- | --- |
| H3 core setup | `h3-js` | ~1.2 MB | H3 encode/query support | approve before H3 packet |
| Runtime multipart import | `multer` or `busboy` | ~50 KB | `POST /api/import` file handling | approve before import packet |
| KML/GPX future | `fast-xml-parser` | ~40 KB | XML parse for KML/GPX | future approval |

Rule:
- No packet that introduces a new dependency starts before approval is recorded.

## 3. Work Packet Decomposition Under M0-M5

This section restores the fine-grained packet model from legacy phases.

## 3.1 [M0] M0 Compatibility Guardrails

### Packet M0-A: Golden baseline harness
- Scope:
  - Snapshot `/api/config`, `/api/viewport`, WebSocket `stats` payloads.
  - Add canonical comparison rules (stable ordering + float tolerance).
  - Lock WorldCover baseline channels: `tree`, `shrub`, `grass`, `crop`, `urban`, `bare`, `snow`, `water`, `wetland`, `mangrove`, `moss`, `nightlight`, `population`, `forest`, plus derived `proximity` where applicable.
- Risk: Low
- Output: baseline fixtures and mandatory CI gate.

## 3.2 [M1] M1 Open Ingestion + Control Plane

### Packet M1-A (former Phase 1a): Adapter + Registry foundation
- New files:
  - `server/adapters/adapter-interface.js`
  - `server/adapters/worldcover.js`
  - `server/adapters/csv-generic.js`
  - `server/channel-registry.js`
- Core file updates:
  - `server/index.js`, `server/data-loader.js`, `server/landcover.js`, `server/audio-metrics.js`
- Target effort:
  - ~1100 LOC equivalent change volume
- Key risk:
  - behavior parity with existing WorldCover path.

### Packet M1-B (former Phase 1.5): Runtime import lifecycle
- New files:
  - `server/import-manager.js`
  - `server/import-validator.js`
  - `server/adapters/geojson-generic.js`
  - tests for manager/validator/geojson adapter
- Data persistence:
  - `data/imports/manifest.json` with atomic write/recover semantics
- API additions:
  - `POST /api/import`
  - `GET /api/sources`
  - `GET /api/channels`
  - `DELETE /api/sources/:id`
- Target effort:
  - ~1000 LOC equivalent change volume
- Key risk:
  - runtime mutation safety and import validation correctness.

## 3.3 [M2] M2 Unified H3 Spatial Core

### Packet M2-A (former Phase 0): H3 foundation
- New files:
  - `server/grid/h3-encoder.js`
  - optional `server/grid/cell-encoder.js`
- Target effort:
  - ~300 LOC
- Risk:
  - Very low (additive).

### Packet M2-B (former Phase 1b): spatial.js migration (High Risk)
- High-risk hotspot:
  - `server/spatial.js` (legacy responsibilities are tightly coupled).
- Recommended split before migration:
  - `server/spatial-index.js`
  - `server/viewport-aggregator.js`
  - thin `server/spatial.js` facade
- Validation:
  - parity script for old vs H3 query path.
- Target effort:
  - ~250 new LOC + heavy refactor/reorg in spatial path.

### Packet M2-C (former Phase 2): frontend hex rendering
- New files:
  - `frontend/h3-utils.js`
  - `frontend/channels.js`
- Core updates:
  - `frontend/map.js`, `frontend/ui.js`, `/api/config` response contract
- Target effort:
  - ~480 LOC
- Risk:
  - medium (render correctness + zoom/resolution behavior).

## 3.4 [M3] M3 Monitoring + Alerting + Stream Loop

### Packet M3-A (former Phase 4.5): alert engine core
- New files:
  - `server/alert-engine.js`
  - `alert_rules.json`
- Core updates:
  - `server/index.js`, `server/viewport-processor.js`, event dispatch path
- Target effort:
  - ~370 LOC
- Risk:
  - low-medium (state machine correctness).

### Packet M3-B (former Phase 4): real-time stream pipeline
- New files:
  - `server/stream-scheduler.js`
  - `server/time-window.js`
  - first stream adapter module (for example `server/adapters/usgs-earthquake.js`)
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
- Target effort:
  - ~720 LOC equivalent change volume
- Risk:
  - medium (external feed instability + state growth + push correctness).

## 3.5 [M4] M4 Configurable Audio Runtime

### Packet M4-A: mapping reload baseline (legacy Phase 1a §3.5.5/3.5.6)
- New file:
  - `server/audio-mapping.js`
- API:
  - `POST /api/audio-mapping/reload`
- Behavior:
  - runtime config validation and in-memory swap
  - fallback to previous valid config on error
- Risk:
  - medium (runtime audio continuity)

### Packet M4-B: minimum control UI
- Scope:
  - channel-to-bus mapping edits
  - threshold and basic intensity controls
  - save/reload workflow
- Risk:
  - medium (UX correctness + runtime sync)

## 3.6 [M5] M5 Enterprise Governance Baseline

### Packet M5-A: auth and access control
- Protect mutation/control endpoints.
- Verify unauthorized write rejection behavior.

### Packet M5-B: quotas and throttling
- Import quotas (size/row/cell caps).
- Rate limiting for control-plane writes.

### Packet M5-C: audit trail
- Log import/delete/reload/alert-rule updates with operator identity and timestamp.

## 4. Effort and Risk Reference Matrix

| Legacy Packet | Approx New LOC | Approx Modified LOC | Risk |
| --- | --- | --- | --- |
| H3 foundation (former 0) | ~300 | ~30 | Very low |
| Adapter + registry (former 1a) | ~980 | ~120 | Medium |
| Spatial H3 migration (former 1b) | ~250 | up to ~600 | High |
| Runtime import (former 1.5) | ~900 | ~70 | Medium |
| Frontend decouple (former 2) | ~400 | ~200 | Medium |
| Stream pipeline (former 4) | ~640 | ~80 | Medium |
| Alert engine (former 4.5) | ~320 | ~50 | Low-medium |

Execution warning:
- Keep `spatial.js` packet isolated and heavily tested; it remains the biggest technical risk concentration.

## 5. Critical Sequencing and Merge Order

1. Compatibility harness first.
2. Adapter/registry foundations before runtime import.
3. H3 foundation before H3 spatial migration.
4. Spatial migration before frontend hex rendering.
5. Alert engine can start after registry abstractions stabilize.
6. Governance packet lands after core functionality is stable enough to secure.

Special note for `server/spatial.js`:
- If multiple branches touch it, merge order should preserve query parity checks after each integration.

## 6. Shortest Delivery Paths (Decision Aid)

- CSV upload -> hex view -> sound:
  - H3 foundation -> adapter/registry -> spatial H3 migration -> runtime import -> frontend hex.
- Live earthquake -> sound:
  - H3 foundation -> adapter/registry -> runtime import baseline -> stream packet.
- Earliest alert capability:
  - H3 foundation -> adapter/registry -> alert engine core.

Use this section to choose showcase path under tight schedule.

## 7. Demo and Verification Scripts

## 7.1 Closed-loop demo A: Spreadsheet to Soundscape

Flow:
1. Import CSV.
2. Verify channels/sources.
3. Reload mapping if needed.
4. Move viewport to affected area.
5. Confirm audible and visual response.

Validation targets:
- Import API success.
- Hex layer visible.
- Audio response latency within operational target.
- Alert fires on threshold-crossing area.

## 7.2 Closed-loop demo B: Live Earthquake Alert

Flow:
1. Ensure stream adapter is running.
2. Wait for incoming events.
3. Confirm spatial update and alert event dispatch.
4. Confirm audible alert and ambient change.

Validation targets:
- `GET /api/streams` health.
- Timely appearance of new impacted cells.
- Alert event dispatch correctness.

## 7.3 Quick smoke script (import-to-sound)

```bash
curl -X POST http://localhost:3000/api/import \
  -F "file=@test_data/air_quality_sample.csv" \
  -F "sourceId=air_quality"

curl http://localhost:3000/api/channels

curl -X POST http://localhost:3000/api/audio-mapping/reload

curl http://localhost:3000/api/sources
```

Manual step:
- Open frontend and confirm audible response while navigating imported region.

## 8. Compatibility Gate Checklist (Must Pass Every Milestone)

1. WorldCover-only flow still works end-to-end.
2. Existing viewport stats payload fields remain compatible.
3. Existing audio update behavior remains non-regressed.
4. Any new feature can be disabled without breaking baseline path.

This checklist prevents platformization work from breaking core demo reliability.
