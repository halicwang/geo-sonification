# Milestone 3 — Open Platform Migration Plan

**Status:** Phase Execution Plan v1.0-preview  
**Date:** 2026-02-22  
**Baseline Reality Date:** 2026-02-22  
**Paired Spec:** `docs/plans/M3/2026-02-21-M3-open-platform-spec.md`

## Executive Intro (Execution Lighthouse)
This document is the second lighthouse and defines the execution order for delivering the North Star.
It is a deliverable P0-P5 phase execution plan where P0 and P1 Packet A start in parallel for faster initial delivery.
Each phase binds requirement IDs (`REQ-*`), acceptance definitions (DoD), evidence IDs (`EVID-*`), and rollback plans.
Execution principle: protect WorldCover compatibility first, then progressively deliver open ingestion, unified H3, alerting loop closure, audio configurability, and governance baseline.
Every release must include observability metrics and rollback triggers to avoid "implemented but not operational" outcomes.  

## Companion Detailed Docs
- Normative requirement source: `docs/plans/M3/2026-02-21-M3-open-platform-spec.md`
- Technical rationale and engineering execution: `docs/plans/M3/2026-02-22-M3-implementation-guide.md`
- Stage execution plans (granular steps within each phase): `docs/plans/M3/P*/` — see `CLAUDE.md` § "Planning Hierarchy" for the Milestone → Phase → Stage definition. Each phase subdirectory contains numbered stage files (e.g., `P0/2026-02-22-M3P0-1-production-code-changes.md`). Implementation agents MUST consult the relevant `P*/` folder before executing any phase.

## Phase Mapping (P0-P5)
Section numbers in this document are local structure only. Cross-document tracking uses `P0..P5` phase IDs.
`P0..P5` are progress labels only; normative requirement strength is defined exclusively by RFC 2119 keywords (`MUST/SHOULD/MAY`).

| Phase ID | Phase | Execution Note |
| --- | --- | --- |
| `P0` | Compatibility guardrails | Parallel start with P1-A |
| `P1` | Open ingestion + control plane | P1-A parallel with P0; P1-B+ after P0 gate |
| `P2` | Unified H3 spatial core (includes structural decoupling) | Stage 1: decoupling, Stage 2: H3 migration |
| `P3` | Monitoring + Alerting + Stream Loop | |
| `P4` | Configurable audio runtime (includes sample management) | |
| `P5` | Governance baseline | |

### Cross-Document Phase Alignment Matrix

| Phase ID | Spec Anchor | Migration Anchor | Implementation Guide Anchor |
| --- | --- | --- | --- |
| `P0` | `5.5 [P0]` | `[P0] P0` | `10.1 [P0]`, `14. WorldCover Baseline Manifest` |
| `P1` | `5.1 [P1]` | `[P1] P1` | `10.2 [P1]`, `6. Adapter Contracts`, `7. Import Pipeline` |
| `P2` | `5.2 [P2]` | `[P2] P2` | `10.3 [P2]`, `4. H3 Technical Deep Dive` |
| `P3` | `5.3 [P3]` | `[P3] P3` | `10.4 [P3]`, `9. Alert Engine Semantics` |
| `P4` | `5.4 [P4]` | `[P4] P4` | `10.5 [P4]`, `8.4 Audio Runtime Config Invariants` |
| `P5` | `5.6 [P5]` | `[P5] P5` | `10.6 [P5]`, `8.5 Governance Baseline Hooks` |

## 0. Execution Conventions

### Baseline Reality Statement (as of 2026-02-22)
- Existing codebase is stable for the current WorldCover demo.
- Open platform capabilities exist mainly as design intent and partial implementation.
- This plan converts intent into decision-complete delivery phases.
- Runtime APIs focus on current demo path; Web Audio renderer is active; legacy WorldCover path is the known stable behavior.
- Key gaps to V1: runtime open ingestion, unified H3 path, operational alerting, dual stream ingress, runtime audio configurability, enterprise governance, deployment-boundary disclosure, and staged SLO activation.
- Guardrails are not yet formalized as release blockers (P0 addresses this).
- Alerting, monitoring, governance, and audio configurability are not yet fully operationalized (P3-P5 address these).
- Prior planning did not enforce one consistent release discipline (§4 addresses this).
- Requirement-to-evidence mapping was previously implicit and fragmented (§5 addresses this).
- Core risks are known but must be tied to phase controls (§6 addresses this).
- Deferred items are intentionally separated from V1 commitments (§7 addresses this).

This plan uses RFC 2119 terms and traceability IDs:
- Requirement IDs: `REQ-*` (defined in the paired SPEC).
- Evidence IDs: `EVID-*` (objective proof artifacts per phase).

No phase is considered complete without all of: `DoD + Evidence + Rollback readiness`.

### Evidence-as-Code Rule
Every `EVID-*` item MUST have a corresponding executable test case integrated into `npm test` before the phase is considered complete. `npm test` all-green is the single machine-verifiable acceptance gate for any phase. Evidence items that require visual or auditory confirmation (e.g., frontend rendering, audio output) MUST additionally include a scripted smoke command (curl / API call) whose output can be inspected, plus a documented manual verification step.

### 0.1 Three-Document Execution Gate
The Three-Document Protocol is defined authoritatively in `OPEN-PLATFORM-SPEC` §0.1. All phase execution is bound by that protocol. Additional execution-context rules:
- Each phase ticket/PR MUST include a trace tuple: `REQ-*` + `P*` + implementation guide section anchor.
- Before executing any phase, the agent MUST consult the corresponding stage plans in `docs/plans/M3/P*/` (e.g., `P0/`, `P1/`). Stage files define the granular, ordered execution steps and are the primary operational guide for implementation within each phase.

## 1. Phase Map (P0-P5)

| Phase | Goal | Covered Requirements | Exit Evidence |
| --- | --- | --- | --- |
| P0 | Compatibility Guardrails | REQ-COMPAT-001 | EVID-P0-001..004 |
| P1 | Open Ingestion + Control Plane | REQ-INGEST-001, REQ-COMPAT-001 | EVID-P1-001..009 |
| P2 | Unified H3 Spatial Core (includes structural decoupling) | REQ-GRID-001, REQ-PERF-001, REQ-COMPAT-001 | EVID-P2-001..013 |
| P3 | Monitoring + Alerting + Stream Loop | REQ-ALERT-001, REQ-STREAM-001, REQ-COMPAT-001 | EVID-P3-001..009 |
| P4 | Configurable Audio Runtime (includes sample management) | REQ-AUDIO-001, REQ-UX-001, REQ-COMPAT-001 | EVID-P4-001..009 |
| P5 | Enterprise Baseline Governance | REQ-GOV-001, REQ-DEPLOY-001, REQ-COMPAT-001 | EVID-P5-001..007 |

**Acceptance:** Every V1 requirement is covered by at least one phase and evidence set.

## 2. Phase Details

## [P0] P0 — Compatibility Guardrails First (Parallel Start with P1-A)

### Objective
Lock current behavior as golden baseline before platform refactor begins.

### Parallel Execution Note
P0 and P1 Packet A (adapter/registry foundation) start in parallel. P1-A is purely additive and does not touch existing behavior, so it can proceed safely while P0 establishes the regression harness. P1-B onward starts only after P0 gate is green.

### Covers
- REQ-COMPAT-001

### In Scope
- Golden regression harness for WorldCover-only flow.
- Snapshot fixtures for `/api/config`, `/api/viewport`, and WebSocket `stats` payloads.
- Non-functional baseline measurements (latency/throughput) for later comparison.

### Out of Scope
- Any new ingestion or H3 migration work.

### DoD
- Golden tests pass in CI and local runs.
- Regression checks are required gates for all subsequent phases.
- Baseline performance numbers recorded.

### Evidence
- EVID-P0-001: Golden payload fixture set committed and reviewed.
- EVID-P0-002: CI job enforces compatibility test gate.
- EVID-P0-003: Manual smoke walkthrough on WorldCover demo.
- EVID-P0-004: Baseline latency report stored in docs/devlog.

### Rollback
- If guardrails fail after any merge, release is blocked and branch reverts to last passing commit.

### Release Train
- Canary: internal validation only.
- Monitoring: compatibility pass rate, viewport latency p95.
- Rollback trigger: any golden mismatch in required scenarios.

---

## [P1] P1 — Open Ingestion + Control Plane (P1-A Parallel with P0)

### Objective
Enable self-service runtime data onboarding without code edits/redeploy.

### Parallel Execution Note
Packet P1-A (adapter/registry foundation) starts in parallel with P0. P1-B, P1-C, and P1-D start after P0 gate is green.

### Covers
- REQ-INGEST-001
- REQ-COMPAT-001

### In Scope
- `POST /api/import` for CSV + GeoJSON.
- `POST /api/sources` for stream source pre-registration (`stream_poll`, `stream_push`).
- `GET /api/sources`, `GET /api/channels`, `DELETE /api/sources/:id`.
- Import persistence with `data/imports/manifest.json` (atomic write/recovery).
- Stream source descriptor persistence with `stream_sources.json` (atomic write/recovery).
- `DELETE /api/sources/:id` lifecycle cleanup across applicable persistence store(s) with all-or-nothing behavior.
- Runtime channel registry updates and frontend notifications.
- Source replacement behavior for duplicate `sourceId`.
- API responsibility lock: `POST /api/import` (data-carrying registration) and `POST /api/sources` (metadata-only pre-registration) are both delivered and non-overlapping.
- Implementation strategy lock: P1 is additive only; no structural split of `server/spatial.js` or `server/data-loader.js` is attempted in this phase.
- Degraded end-to-end demo: imported CSV data displayed on existing grid overlay and routed through existing audio bus system (no H3 or hex rendering required). This validates the "upload -> see -> hear" loop at the earliest phase.

### Out of Scope
- Full H3 query migration and hex frontend rendering.
- Alerting and governance features.

### DoD
- New source can be imported and used in same session.
- Stream source descriptors can be pre-registered and queried before first stream data arrival.
- Source/channel APIs return stable schema.
- Imported source survives restart and can be deleted cleanly.
- Degraded demo: imported CSV produces visible map response and audible output when viewport covers the imported area.
- WorldCover compatibility gate (P0) remains green.

### Evidence
- EVID-P1-001: API integration test for CSV import success path.
- EVID-P1-002: API integration test for GeoJSON import success path.
- EVID-P1-003: Restart persistence test using manifest replay.
- EVID-P1-004: Duplicate `sourceId` replacement test.
- EVID-P1-005: Delete imported source test (and builtin delete rejection).
- EVID-P1-006: Compatibility regression report after merge.
- EVID-P1-007: API boundary test (`/api/import` vs `/api/sources`) with success/conflict scenarios.
- EVID-P1-008: Stream source descriptor persistence/reload test.
- EVID-P1-009: Degraded end-to-end demo walkthrough (import CSV -> map overlay -> audible output).

### Rollback
- Feature flag off for runtime imports; fallback to WorldCover-only mode.

### Release Train
- Canary: enable import for internal sample datasets only.
- Monitoring: import failure rate, parse/ingest latency, memory delta per import.
- Rollback trigger: import corruption, manifest recovery failure, compatibility regression.

---

## [P2] P2 — Unified H3 Spatial Core (includes Structural Decoupling)

### Objective
Establish H3 as the single internal spatial language across ingest/query/render, starting with structural decoupling of legacy modules.

### Covers
- REQ-GRID-001
- REQ-PERF-001
- REQ-COMPAT-001

### In Scope

**Stage 1 — Structural Decoupling (first PRs of P2):**
- Split-prep for `server/spatial.js` into index/query/aggregation responsibilities with compatibility facade preserved.
- Split-prep for `server/data-loader.js` into parser/validator/cache/manifest responsibilities.
- Add parity harness hooks so Stage 2 can compare legacy and H3 outputs deterministically.
- Maintain behavior parity and compatibility guardrails while refactor scaffolding lands.

**Stage 2 — H3 Migration (starts after Stage 1 evidence passes):**
- H3 encoder/core utilities.
- Spatial index/query migration to H3 cell model.
- Cross-source merge via `CellSnapshot` namespaced channels.
- Frontend hex rendering path aligned with server output.
- Coordinate validation and coordinate-order safety checks.
- SLO freeze gate execution for `REQ-PERF-001` (provisional -> normative transition).

### Out of Scope
- Advanced AOI bucketed stream strategies.

### DoD
- Stage 1: decoupled module boundaries merged and covered by regression tests; no material behavior drift.
- Stage 2: viewport query produces merged H3-aligned snapshots.
- Frontend displays hex-based overlays from H3 output.
- Provisional performance targets are benchmark-validated and frozen as normative P2+ gates.
- Existing WorldCover behavior remains non-regressed in compatibility path.

### Evidence

Stage 1 evidence:
- EVID-P2-001: `spatial.js` split-prep architecture test report.
- EVID-P2-002: `data-loader.js` split-prep architecture test report.
- EVID-P2-003: Legacy parity test harness integrated into CI.
- EVID-P2-004: Performance smoke comparison before/after split-prep.
- EVID-P2-005: Stage 1 compatibility regression report.

Stage 2 evidence:
- EVID-P2-006: Unit tests for encoding/parent lookup/dateline cases.
- EVID-P2-007: Query parity report (legacy vs H3 tolerance bounds).
- EVID-P2-008: Integration tests for multi-source merge semantics.
- EVID-P2-009: Frontend visual verification across zoom ranges.
- EVID-P2-010: Coordinate-order regression tests.
- EVID-P2-011: Stage 2 compatibility regression report.
- EVID-P2-012: SLO benchmark freeze report (`provisional` to `normative` transition).
- EVID-P2-013: P2 gate policy update showing SLO enforcement active after P2 exit.

### Rollback
- Stage 1: re-enable monolithic path behind fallback facade if split-prep introduces instability.
- Stage 2: keep fallback switch to legacy query path until H3 path is verified stable.

### Release Train
- Canary: H3 path for internal users behind runtime flag.
- Monitoring: query latency p95/p99, memory footprint, rendering errors, compatibility pass rate, query drift.
- Rollback trigger: query correctness drift beyond tolerance, severe frontend rendering defects, or parity mismatch.

---

## [P3] P3 — Monitoring + Alerting + Stream Loop

### Objective
Deliver operator-grade alerting and real-time stream-driven monitoring from spatial channel signals.

### Covers
- REQ-ALERT-001
- REQ-STREAM-001
- REQ-COMPAT-001

### In Scope
- `alert_rules.json` loader/validator.
- Alert engine state machine (`idle -> active -> cooldown -> idle`).
- Basic compound alert rules (AND/OR across 2-3 channel conditions, flat operator — no nesting).
- Compound rule loader/validator supporting `type: "compound"` in `alert_rules.json`.
- Hysteresis, cooldown, dedup by `(ruleId, cellId)`.
- Alert event dispatch (`alert` WebSocket event).
- Stream scheduler and lifecycle management for at least one production stream adapter.
- `POST /api/streams/push/:sourceId` HTTPS JSON ingress for `mode=stream_push`.
- Sliding time-window aggregation (`windowMs`, `windowAggregate`) with expiry cleanup.
- Dual push triggers: viewport-driven updates and data-change-driven incremental updates.
- Per-client viewport cache (`lastViewport`) for data-change routing.
- Stream memory safeguards (for example `MAX_EVENTS_PER_CELL`, `MAX_STREAM_CELLS`).
- Push ingress safeguards: idempotency key handling, dedup window policy, queue caps/backpressure (`429`), and per-record error reporting.
- `GET /api/streams` status contract with health and last-fetch metadata.

### Out of Scope
- Advanced compound rule DSL (nested AND/OR trees, N-of-M, temporal correlation — future scope).
- External producer WebSocket ingress.

### DoD
- Alert fire/clear lifecycle works with deterministic transitions.
- Duplicate storms are prevented.
- Compound alert rules (AND/OR, 2-3 conditions) evaluate correctly with deterministic fire/clear semantics.
- Alert events are observable by frontend and test harness.
- Stream adapter status and health are observable via `GET /api/streams`.
- Stream time-window expiry and incremental push behavior are test-verified.
- Push ingestion path is deterministic for accepted/deduped/rejected outcomes.
- Backpressure and oversize batches are rejected predictably with stable error contract.
- Compatibility guardrail remains green.

### Evidence
- EVID-P3-001: Unit tests for state transitions and hysteresis.
- EVID-P3-002: Cooldown suppression tests.
- EVID-P3-003: Dedup tests for repeated updates.
- EVID-P3-009: Compound alert rule evaluation tests (AND/OR logic, 2-3 conditions, fire/clear transitions).
- EVID-P3-004: WebSocket alert payload contract tests.
- EVID-P3-005: Stream scheduler + time-window integration tests.
- EVID-P3-006: Compatibility regression report.
- EVID-P3-007: Push ingress contract tests (idempotency, dedup, per-record errors).
- EVID-P3-008: Backpressure tests (`429`) and queue-cap behavior report.

### Rollback
- Disable alert engine and fall back to non-alerting stats path while preserving data flow.

### Release Train
- Canary: alert rules and stream ingestion enabled for curated channels/sources only.
- Monitoring: false-positive rate, event throughput, dispatch latency, stream fetch error rate, push reject/backpressure rate.
- Rollback trigger: alert storms, high false positives, broken frontend handling, or unstable stream health.

---

## [P4] P4 — Configurable Audio Runtime (No Redeploy, includes Sample Management)

### Objective
Allow non-audio engineers to tune mapping, trigger behavior, and audio samples safely at runtime.

### Covers
- REQ-AUDIO-001
- REQ-UX-001
- REQ-COMPAT-001

### In Scope
- `audio_mapping.json` schema enforcement (including per-bus `sampleUrl` field for custom samples).
- Audio mapping workflow REST API endpoints (SPEC-frozen): `GET /api/audio-mapping`, `/draft`, `/validate`, `/apply`, `/rollback`, `/history`.
- WebSocket `bus_config_update` event.
- SPEC-frozen workflow contract: `Draft -> Validate -> Apply -> Rollback` via the frozen REST endpoint set (no GUI required in V1).
- Runtime validation and rollback to last-known-good mapping.
- Audio sample management: `POST /api/audio-samples/upload` for custom WAV/OGG files, `GET /api/audio-samples` for listing available samples, stored in `data/samples/` with format/size validation. Frontend loads samples from configured URL.

### Out of Scope
- Advanced DAW-grade authoring interfaces.
- Full sample library management or audio processing pipeline.

### DoD
- Config changes apply without restart/redeploy.
- Invalid config does not break runtime audio path.
- Operators can complete `Draft -> Validate -> Apply -> Rollback` through REST API endpoints and JSON config edits.
- Custom audio samples can be uploaded and referenced in bus mapping.
- Compatibility guardrail remains green.

### Evidence
- EVID-P4-001: API tests for apply success/failure and schema errors via frozen workflow endpoints.
- EVID-P4-002: Runtime config update propagation test.
- EVID-P4-003: API workflow test for mapping update (`Draft -> Validate -> Apply -> Rollback` via frozen REST endpoints).
- EVID-P4-004: Last-known-good fallback test.
- EVID-P4-005: Audio behavior change verification script.
- EVID-P4-006: Compatibility regression report.
- EVID-P4-007: Audio sample upload API test (format validation, size limits).
- EVID-P4-008: Custom sample playback verification (upload -> reference in mapping -> audible output).
- EVID-P4-009: Audio sample listing API test (upload sample -> list -> verify presence and metadata).

### Rollback
- Revert to previous valid audio mapping at runtime; disable new control API endpoint if needed.

### Release Train
- Canary: control API limited to internal operator cohort.
- Monitoring: reload failures, config validation errors, audio update latency, workflow completion success rate.
- Rollback trigger: repeated reload failures or broken audible behavior.

---

## [P5] P5 — Enterprise Baseline Governance

### Objective
Provide minimum enterprise gatekeeping and traceability required for production adoption.

### Covers
- REQ-GOV-001
- REQ-DEPLOY-001
- REQ-COMPAT-001

### In Scope
- Authentication for write/control endpoints.
- Rate limits/quotas for import and control-plane mutation endpoints.
- Audit logging for import/delete/config/rule changes.
- Governance visibility in ops runbooks.
- Deployment model disclosure (`single_org_multi_team`) across API docs/control API responses/operator runbooks.

### Out of Scope
- Full multi-tenant isolation model and tenant-scoped RBAC depth.

### DoD
- Unauthorized writes are rejected.
- Quota/rate breaches are enforced predictably.
- All critical mutations are traceable in audit log.
- Deployment model boundary is explicitly visible and consistent in user-facing artifacts.
- Compatibility guardrail remains green.

### Evidence
- EVID-P5-001: Auth rejection tests for protected endpoints.
- EVID-P5-002: Rate-limit and quota enforcement tests.
- EVID-P5-003: Audit log integrity tests.
- EVID-P5-004: Security smoke test checklist run.
- EVID-P5-005: Operator runbook update with governance procedures.
- EVID-P5-006: Compatibility regression report.
- EVID-P5-007: Deployment-model boundary disclosure consistency check.

### Rollback
- Disable governance middleware only in controlled emergency mode; restore last stable policy set.

### Release Train
- Canary: governance enabled for internal consumers first.
- Monitoring: auth failures, throttling rates, audit pipeline health.
- Rollback trigger: governance outage affecting critical operations.

## 3. Cross-Phase Release Train Rules

For every phase:
1. **Build:** all phase tests + compatibility gate MUST pass.
2. **Canary:** deploy to limited operator cohort with scoped dataset.
3. **Observe:** collect phase-specific KPIs for at least one full operational window.
4. **Promote:** full rollout only if no blocker in canary window.
5. **Fallback:** execute documented rollback immediately on trigger conditions.
6. **Boundary check:** verify phase ownership table still maps each API contract to exactly one owning phase.

SLO gate staging (`REQ-PERF-001`):
- `P0`/`P1`: SLO metrics are observed and benchmarked, but do not block release promotion.
- `P2` exit onward: frozen SLO values become normative release gates and MUST block promotion on breach.

**Acceptance:** No phase is considered done without canary evidence and rollback readiness.

## 4. Requirement Traceability Matrix

| Requirement | Implemented In | Primary Evidence |
| --- | --- | --- |
| REQ-COMPAT-001 | P0..P5 (continuous gate) | EVID-P0-001..004 + each phase compat report |
| REQ-INGEST-001 | P1 | EVID-P1-001..009 |
| REQ-GRID-001 | P2 (Stage 1 + Stage 2) | EVID-P2-001..013 |
| REQ-ALERT-001 | P3 | EVID-P3-001..009 |
| REQ-STREAM-001 | P3 | EVID-P3-001..009 |
| REQ-AUDIO-001 | P4 | EVID-P4-001..009 |
| REQ-UX-001 | P4 | EVID-P4-001..009 |
| REQ-GOV-001 | P5 | EVID-P5-001..007 |
| REQ-DEPLOY-001 | P5 | EVID-P5-007 |
| REQ-PERF-001 | P0/P1 observe + P2 freeze gate | EVID-P0-004 + EVID-P2-012..013 |

**Acceptance:** Every REQ has explicit phase ownership and objective evidence.

## 4.1 Phase Boundary Ownership Table

This table enforces single ownership for each new API contract to prevent overlap across phases.

| API / Contract | Owning Phase | Notes |
| --- | --- | --- |
| `POST /api/import` | P1 | Static/batch data-carrying registration |
| `POST /api/sources` | P1 | Stream source pre-registration (`stream_poll`, `stream_push`) |
| `GET /api/sources` / `GET /api/channels` / `DELETE /api/sources/:id` | P1 | Source lifecycle control plane |
| Structural decoupling of `server/spatial.js` and `server/data-loader.js` | P2 Stage 1 | Precondition within P2 before H3 migration |
| H3 query/merge/render semantics | P2 Stage 2 | Unified spatial language delivery |
| `POST /api/streams/push/:sourceId` | P3 | Push ingress contract, idempotency, backpressure |
| `GET /api/streams` expanded status contract | P3 | Poll + push operational health contract |
| Audio mapping workflow API (`GET`, `/draft`, `/validate`, `/apply`, `/rollback`, `/history`) | P4 | Runtime audio control plane (no GUI in V1) |
| `POST /api/audio-samples/upload` + `GET /api/audio-samples` | P4 | Custom audio sample upload, listing, and reference |
| Auth/quota/audit + deployment boundary disclosure | P5 | Governance and boundary clarity |

Phase boundary check rule:
- Every new API MUST have exactly one owning phase.
- A phase MAY depend on prior APIs but MUST NOT re-own or redefine existing API contracts.

## 5. Risk Register and Mitigations

1. **Spatial migration risk (P2):** incorrect H3 parity.  
Mitigation: dual-path verification + tolerance checks + rollback flag.
2. **Runtime import risk (P1):** malformed/oversized inputs.  
Mitigation: strict validators, size/row/column caps, safe parser behavior.
3. **Alert fatigue risk (P3):** noisy alerts and compound rule misconfiguration.
Mitigation: hysteresis/cooldown/dedup defaults and ops tuning runbook. Compound rules limited to 2-3 conditions with flat AND/OR to prevent combinatorial explosion. Validation rejects nested or oversized compound rules.
4. **Audio config risk (P4):** invalid mapping breaks output.  
Mitigation: schema validation + last-known-good fallback.
5. **Governance risk (P5):** auth misconfiguration blocks operations.  
Mitigation: staged canary, emergency bypass procedure, policy verification tests.
6. **Migration effort-underestimate risk (P2):** `server/spatial.js` and `server/data-loader.js` split/migration scope is larger than conservative estimates.
Mitigation: force structural decoupling as P2 Stage 1 before H3 semantics in Stage 2, and track scope as range-based estimates with parity checkpoints.
7. **API-boundary ambiguity risk (P1/P3):** `/api/import`, `/api/sources`, and push ingress responsibilities are interpreted inconsistently.
Mitigation: freeze API responsibility matrix in SPEC and enforce phase boundary ownership checks in every review.
8. **Total change-volume ratio risk (P1..P4):** current range estimate is roughly `~8,320-15,670 LOC` touched across new+modified code, which is large relative to current application code footprint (planning heuristic: ~55%-90% rewrite-equivalent).
Mitigation: keep staged delivery (`P1` additive -> `P2` Stage 1 decoupling -> `P2` Stage 2 semantic migration), enforce per-phase rollback gates, and require scope rebasing when realized change volume exceeds upper-range assumptions.
9. **Scaling boundary risk (P2+):** V1 is designed for single-instance deployment (200 concurrent clients, 500K cells per source). Users exceeding these limits will hit performance degradation without clear error signals.
Mitigation: document hard limits in API docs and `/api/config` metadata, add runtime monitoring for client count and cell count approaching limits, return clear error responses when limits are exceeded.

**Acceptance:** Each risk has explicit mitigation and rollback linkage.

## 6. Deferred / Future Work (Single Consolidated Chapter)

- Priority-ordered format roadmap (post-V1):
  1. **Shapefile** (.shp) — highest demand from GIS enterprise workflows.
  2. **Parquet / GeoParquet** — columnar analytics and cloud-native pipelines.
  3. **KML / GPX** — field data, GPS tracks, and Google Earth interop.
  4. **NetCDF / HDF5** — climate and atmospheric science datasets.
  5. Richer geospatial import workflows and geometry semantics.
- AOI bucketed streaming for globally distributed concurrent clients.
- Full multi-tenant isolation and tenant-scoped RBAC.
- External producer WebSocket ingress path (beyond V1 HTTPS push scope).
- Advanced compound alert expressions (nested AND/OR trees, N-of-M, temporal correlation) and advanced rule authoring.
- Audio control graphical UI for the `Draft -> Validate -> Apply -> Rollback` workflow.
- Horizontal scaling architecture (multi-instance, sharded spatial index, load balancing).
- Extended compliance and observability tooling.

**Acceptance:** Deferred work does not block P0-P5 completion criteria.

## Appendix A: Historical Max/OSC Notes
- Historical Max/OSC references are preserved for context only.
- They do not define mainline V1 architecture or release priorities.
