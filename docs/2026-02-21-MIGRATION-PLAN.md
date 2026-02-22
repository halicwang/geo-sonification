# Geo-Sonification Migration Plan

**Status:** Milestone Execution Plan v1.0-preview  
**Date:** 2026-02-22  
**Baseline Reality Date:** 2026-02-22  
**Paired Spec:** `docs/2026-02-21-OPEN-PLATFORM-SPEC.md`

## Executive Intro (Execution Lighthouse)
This document is the second lighthouse and defines the execution order for delivering the North Star.  
It is no longer a loose phase narrative; it is a deliverable M0-M5 milestone execution plan with one explicit precondition stage (`M2-Prep`) between M1 and M2.  
Each milestone binds requirement IDs (`REQ-*`), acceptance definitions (DoD), evidence IDs (`EVID-*`), and rollback plans.  
Execution principle: protect WorldCover compatibility first, then progressively deliver open ingestion, unified H3, alerting loop closure, audio configurability, and governance baseline.  
Every release must include observability metrics and rollback triggers to avoid \"implemented but not operational\" outcomes.  

## Companion Detailed Docs
- Normative requirement source: `docs/2026-02-21-OPEN-PLATFORM-SPEC.md`
- Technical rationale and invariants: `docs/2026-02-22-TECHNICAL-DESIGN.md`
- Engineering execution packets and scripts: `docs/2026-02-22-ENGINEERING-REFERENCE.md`

## Milestone Mapping (M0-M5 + M2-Prep Execution Stage)
Section numbers in this document are local structure only. Cross-document tracking uses `M0..M5` milestone IDs plus one execution-only precondition stage (`M2-Prep`).
`M0..M5` are progress labels only; normative requirement strength is defined exclusively by RFC 2119 keywords (`MUST/SHOULD/MAY`).

| Milestone ID | Milestone |
| --- | --- |
| `M0` | Compatibility guardrails |
| `M1` | Open ingestion + control plane |
| `M2-Prep` | Structural decoupling gate (between `M1` and `M2`) |
| `M2` | Unified H3 spatial core |
| `M3` | Monitoring + Alerting + Stream Loop |
| `M4` | Configurable audio runtime |
| `M5` | Governance baseline |

`M2-Prep` is an execution stage, not a separate requirement milestone. It exists to de-risk `M2` delivery by decoupling high-risk legacy modules after `M1` exits.

### Cross-Document Milestone Alignment Matrix

| Milestone ID | Spec Anchor | Migration Anchor | Technical Anchor | Engineering Anchor |
| --- | --- | --- | --- | --- |
| `M0` | `5.5 [M0]` | `[M0] M0` | `8. [M0] WorldCover Baseline Manifest` | `3.1 [M0] M0 Compatibility Guardrails` |
| `M1` | `5.1 [M1]` | `[M1] M1` | `3/4/5 [M1]` | `3.2 [M1] M1 Open Ingestion + Control Plane` |
| `M2-Prep` | `5.2 [M2]` (precondition path) | `[M2-Prep] M2-Prep` | `7. Engineering Pitfall Checklist` | `3.3 [M2-Prep] Structural Decoupling Gate` |
| `M2` | `5.2 [M2]` | `[M2] M2` | `2. [M2] H3 Technical Deep Dive` | `3.4 [M2] M2 Unified H3 Spatial Core` |
| `M3` | `5.3 [M3]` | `[M3] M3` | `6. [M3] Alert Engine Semantics` | `3.5 [M3] M3 Monitoring + Alerting + Stream Loop` |
| `M4` | `5.4 [M4]` | `[M4] M4` | `5.4 [M4] Audio Runtime Config Invariants` | `3.6 [M4] M4 Configurable Audio Runtime` |
| `M5` | `5.6 [M5]` | `[M5] M5` | `5.5 [M5] Governance Baseline Hooks` | `3.7 [M5] M5 Enterprise Governance Baseline` |

## 0. Execution Conventions

### Reality Snapshot (as of 2026-02-22)
- Existing codebase is stable for the current WorldCover demo.
- Open platform capabilities exist mainly as design intent and partial implementation.
- This plan converts intent into decision-complete delivery milestones.

This plan uses RFC 2119 terms and traceability IDs:
- Requirement IDs: `REQ-*` (defined in the paired SPEC).
- Evidence IDs: `EVID-*` (objective proof artifacts per milestone).

No milestone is considered complete without all of: `DoD + Evidence + Rollback readiness`.

### 0.1 Mandatory Four-Document Execution Gate (Human + AI)
- Implementation agents (human or AI) MUST consult all four lighthouse documents before executing any milestone work:
  - `docs/2026-02-21-OPEN-PLATFORM-SPEC.md`
  - `docs/2026-02-21-MIGRATION-PLAN.md`
  - `docs/2026-02-22-TECHNICAL-DESIGN.md`
  - `docs/2026-02-22-ENGINEERING-REFERENCE.md`
- Each milestone ticket/PR MUST include a trace tuple: `REQ-*` + `M*` + technical section anchor + engineering packet anchor.
- If document conflicts are found, execution MUST stop and conflict resolution MUST occur before continuing milestone delivery.
- Precedence MUST follow the paired SPEC definition: `OPEN-PLATFORM-SPEC` > `MIGRATION-PLAN` > `TECHNICAL-DESIGN` > `ENGINEERING-REFERENCE`.
Validation authority MUST be inherited from `docs/2026-02-21-OPEN-PLATFORM-SPEC.md` Section 0.1 acceptance criteria and enforced here via milestone gates (`DoD`, `EVID-*`, rollback).

## 1. Baseline and Gap Statement

### Reality Snapshot (as of 2026-02-22)
**Current baseline:**
- Runtime APIs focus on current demo path.
- Web Audio renderer is active.
- Legacy WorldCover path is the known stable behavior.

**Key gaps to V1:**
- Runtime open ingestion and source/channel lifecycle management.
- Unified H3-aligned end-to-end path.
- Operational alert engine semantics.
- Dual stream ingress path (poll + HTTPS push) with deterministic runtime behavior.
- Runtime audio configurability for non-audio specialists.
- Enterprise baseline governance (auth/quota/audit).
- Explicit deployment-boundary disclosure (`single_org_multi_team`) and staged SLO gate activation.

**Acceptance:** Baseline is explicit enough to define non-regression and migration scope.

## 2. Milestone Map (M0-M5 + M2-Prep Execution Stage)

### Reality Snapshot (as of 2026-02-22)
- Previous plan mixed phase and future items.
- This map is now milestone-driven and business-demonstrable.

| Milestone | Goal | Covered Requirements | Exit Evidence |
| --- | --- | --- | --- |
| M0 | Compatibility Guardrails | REQ-COMPAT-001 | EVID-M0-001..004 |
| M1 | Open Ingestion + Control Plane | REQ-INGEST-001, REQ-COMPAT-001 | EVID-M1-001..008 |
| M2-Prep | Structural Decoupling Gate | (precondition stage for REQ-GRID-001) | EVID-M2P-001..005 |
| M2 | Unified H3 Spatial Core | REQ-GRID-001, REQ-PERF-001, REQ-COMPAT-001 | EVID-M2-001..008 |
| M3 | Monitoring + Alerting + Stream Loop | REQ-ALERT-001, REQ-STREAM-001, REQ-COMPAT-001 | EVID-M3-001..008 |
| M4 | Configurable Audio Runtime | REQ-AUDIO-001, REQ-UX-001, REQ-COMPAT-001 | EVID-M4-001..006 |
| M5 | Enterprise Baseline Governance | REQ-GOV-001, REQ-DEPLOY-001, REQ-COMPAT-001 | EVID-M5-001..007 |

**Acceptance:** Every V1 requirement is covered by at least one milestone and evidence set.

## 3. Milestone Details

## [M0] M0 — Compatibility Guardrails First

### Reality Snapshot (as of 2026-02-22)
- WorldCover path is the stability anchor.
- Guardrails are not yet formalized as release blockers.

### Objective
Lock current behavior as golden baseline before platform refactor begins.

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
- Regression checks are required gates for all subsequent milestones.
- Baseline performance numbers recorded.

### Evidence
- EVID-M0-001: Golden payload fixture set committed and reviewed.
- EVID-M0-002: CI job enforces compatibility test gate.
- EVID-M0-003: Manual smoke walkthrough on WorldCover demo.
- EVID-M0-004: Baseline latency report stored in docs/devlog.

### Rollback
- If guardrails fail after any merge, release is blocked and branch reverts to last passing commit.

### Release Train
- Canary: internal validation only.
- Monitoring: compatibility pass rate, viewport latency p95.
- Rollback trigger: any golden mismatch in required scenarios.

---

## [M1] M1 — Open Ingestion + Control Plane

### Reality Snapshot (as of 2026-02-22)
- Runtime import/control-plane contract is not complete.

### Objective
Enable self-service runtime data onboarding without code edits/redeploy.

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
- Implementation strategy lock: M1 is additive only; no structural split of `server/spatial.js` or `server/data-loader.js` is attempted in this milestone.

### Out of Scope
- Full H3 query migration and hex frontend rendering.
- Alerting and governance features.

### DoD
- New source can be imported and used in same session.
- Stream source descriptors can be pre-registered and queried before first stream data arrival.
- Source/channel APIs return stable schema.
- Imported source survives restart and can be deleted cleanly.
- WorldCover compatibility gate (M0) remains green.

### Evidence
- EVID-M1-001: API integration test for CSV import success path.
- EVID-M1-002: API integration test for GeoJSON import success path.
- EVID-M1-003: Restart persistence test using manifest replay.
- EVID-M1-004: Duplicate `sourceId` replacement test.
- EVID-M1-005: Delete imported source test (and builtin delete rejection).
- EVID-M1-006: Compatibility regression report after merge.
- EVID-M1-007: API boundary test (`/api/import` vs `/api/sources`) with success/conflict scenarios.
- EVID-M1-008: Stream source descriptor persistence/reload test.

### Rollback
- Feature flag off for runtime imports; fallback to WorldCover-only mode.

### Release Train
- Canary: enable import for internal sample datasets only.
- Monitoring: import failure rate, parse/ingest latency, memory delta per import.
- Rollback trigger: import corruption, manifest recovery failure, compatibility regression.

---

## [M2-Prep] M2-Prep — Structural Decoupling Gate (Between M1 and M2)

### Reality Snapshot (as of 2026-02-22)
- `server/spatial.js` and `server/data-loader.js` are high-coupling modules and are the main risk concentration for M2.

### Objective
Reduce migration risk before H3 cutover by decoupling hot legacy modules into testable boundaries.

### Covers
- (precondition stage for REQ-GRID-001)
- REQ-COMPAT-001

### In Scope
- Split-prep for `server/spatial.js` into index/query/aggregation responsibilities with compatibility facade preserved.
- Split-prep for `server/data-loader.js` into parser/validator/cache/manifest responsibilities.
- Add parity harness hooks so M2 can compare legacy and H3 outputs deterministically.
- Maintain behavior parity and compatibility guardrails while refactor scaffolding lands.

### Out of Scope
- H3 query semantics themselves.
- Frontend hex rendering.

### DoD
- Decoupled module boundaries are merged and covered by regression tests.
- No material behavior drift in WorldCover compatibility scenarios.
- M2 implementation can proceed without direct high-risk edits across monolithic legacy files.

### Evidence
- EVID-M2P-001: `spatial.js` split-prep architecture test report.
- EVID-M2P-002: `data-loader.js` split-prep architecture test report.
- EVID-M2P-003: Legacy parity test harness integrated into CI.
- EVID-M2P-004: Performance smoke comparison before/after split-prep.
- EVID-M2P-005: Compatibility regression report.

### Rollback
- Re-enable monolithic path behind fallback facade if split-prep introduces instability.

### Release Train
- Canary: internal-only refactor release.
- Monitoring: compatibility pass rate, query drift, startup/load regressions.
- Rollback trigger: parity mismatch or compatibility failures above tolerance.

---

## [M2] M2 — Unified H3 Spatial Core

### Reality Snapshot (as of 2026-02-22)
- Legacy grid semantics still influence runtime behavior.

### Objective
Establish H3 as the single internal spatial language across ingest/query/render.

### Covers
- REQ-GRID-001
- REQ-PERF-001
- REQ-COMPAT-001

### In Scope
- M2 entry condition: starts only after `M2-Prep` evidence passes.
- H3 encoder/core utilities.
- Spatial index/query migration to H3 cell model.
- Cross-source merge via `CellSnapshot` namespaced channels.
- Frontend hex rendering path aligned with server output.
- Coordinate validation and coordinate-order safety checks.
- SLO freeze gate execution for `REQ-PERF-001` (provisional -> normative transition).

### Out of Scope
- Advanced AOI bucketed stream strategies.

### DoD
- Viewport query produces merged H3-aligned snapshots.
- Frontend displays hex-based overlays from H3 output.
- Provisional performance targets are benchmark-validated and frozen as normative M2+ gates.
- Existing WorldCover behavior remains non-regressed in compatibility path.

### Evidence
- EVID-M2-001: Unit tests for encoding/parent lookup/dateline cases.
- EVID-M2-002: Query parity report (legacy vs H3 tolerance bounds).
- EVID-M2-003: Integration tests for multi-source merge semantics.
- EVID-M2-004: Frontend visual verification across zoom ranges.
- EVID-M2-005: Coordinate-order regression tests.
- EVID-M2-006: Compatibility regression report.
- EVID-M2-007: SLO benchmark freeze report (`provisional` to `normative` transition).
- EVID-M2-008: M2 gate policy update showing SLO enforcement active after M2 exit.

### Rollback
- Keep fallback switch to legacy query path until H3 path is verified stable.

### Release Train
- Canary: H3 path for internal users behind runtime flag.
- Monitoring: query latency p95/p99, memory footprint, rendering errors.
- Rollback trigger: query correctness drift beyond tolerance or severe frontend rendering defects.

---

## [M3] M3 — Monitoring + Alerting + Stream Loop

### Reality Snapshot (as of 2026-02-22)
- Alerting and real-time monitoring semantics are not yet fully operationalized for production monitoring.

### Objective
Deliver operator-grade alerting and real-time stream-driven monitoring from spatial channel signals.

### Covers
- REQ-ALERT-001
- REQ-STREAM-001
- REQ-COMPAT-001

### In Scope
- `alert_rules.json` loader/validator.
- Alert engine state machine (`idle -> active -> cooldown -> idle`).
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
- Full compound rule DSL (future scope).
- External producer WebSocket ingress.

### DoD
- Alert fire/clear lifecycle works with deterministic transitions.
- Duplicate storms are prevented.
- Alert events are observable by frontend and test harness.
- Stream adapter status and health are observable via `GET /api/streams`.
- Stream time-window expiry and incremental push behavior are test-verified.
- Push ingestion path is deterministic for accepted/deduped/rejected outcomes.
- Backpressure and oversize batches are rejected predictably with stable error contract.
- Compatibility guardrail remains green.

### Evidence
- EVID-M3-001: Unit tests for state transitions and hysteresis.
- EVID-M3-002: Cooldown suppression tests.
- EVID-M3-003: Dedup tests for repeated updates.
- EVID-M3-004: WebSocket alert payload contract tests.
- EVID-M3-005: Stream scheduler + time-window integration tests.
- EVID-M3-006: Compatibility regression report.
- EVID-M3-007: Push ingress contract tests (idempotency, dedup, per-record errors).
- EVID-M3-008: Backpressure tests (`429`) and queue-cap behavior report.

### Rollback
- Disable alert engine and fall back to non-alerting stats path while preserving data flow.

### Release Train
- Canary: alert rules and stream ingestion enabled for curated channels/sources only.
- Monitoring: false-positive rate, event throughput, dispatch latency, stream fetch error rate, push reject/backpressure rate.
- Rollback trigger: alert storms, high false positives, broken frontend handling, or unstable stream health.

---

## [M4] M4 — Configurable Audio Runtime (No Redeploy)

### Reality Snapshot (as of 2026-02-22)
- Web Audio is active, but runtime configurability for business users is not complete.

### Objective
Allow non-audio engineers to tune mapping and trigger behavior safely at runtime.

### Covers
- REQ-AUDIO-001
- REQ-UX-001
- REQ-COMPAT-001

### In Scope
- `audio_mapping.json` schema enforcement.
- `POST /api/audio-mapping/reload` hot reload path.
- WebSocket `bus_config_update` event.
- Minimum control UI/workflow for channel-to-bus mapping and threshold tuning.
- SPEC-frozen workflow contract: `Draft -> Validate -> Apply -> Rollback`.
- Runtime validation and rollback to last-known-good mapping.

### Out of Scope
- Advanced DAW-grade authoring interfaces.

### DoD
- Config changes apply without restart/redeploy.
- Invalid config does not break runtime audio path.
- Operators can complete `Draft -> Validate -> Apply -> Rollback` through control surface.
- Compatibility guardrail remains green.

### Evidence
- EVID-M4-001: API tests for reload success/failure and schema errors.
- EVID-M4-002: Runtime config update propagation test.
- EVID-M4-003: UI workflow test for mapping update.
- EVID-M4-004: Last-known-good fallback test.
- EVID-M4-005: Audio behavior change verification script.
- EVID-M4-006: Compatibility regression report.

### Rollback
- Revert to previous valid audio mapping at runtime; disable new control UI endpoint if needed.

### Release Train
- Canary: control UI limited to internal operator cohort.
- Monitoring: reload failures, config validation errors, audio update latency, workflow completion success rate.
- Rollback trigger: repeated reload failures or broken audible behavior.

---

## [M5] M5 — Enterprise Baseline Governance

### Reality Snapshot (as of 2026-02-22)
- Governance controls are not yet complete for enterprise onboarding.

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
- Deployment model disclosure (`single_org_multi_team`) across API docs/control UI/operator runbooks.

### Out of Scope
- Full multi-tenant isolation model and tenant-scoped RBAC depth.

### DoD
- Unauthorized writes are rejected.
- Quota/rate breaches are enforced predictably.
- All critical mutations are traceable in audit log.
- Deployment model boundary is explicitly visible and consistent in user-facing artifacts.
- Compatibility guardrail remains green.

### Evidence
- EVID-M5-001: Auth rejection tests for protected endpoints.
- EVID-M5-002: Rate-limit and quota enforcement tests.
- EVID-M5-003: Audit log integrity tests.
- EVID-M5-004: Security smoke test checklist run.
- EVID-M5-005: Operator runbook update with governance procedures.
- EVID-M5-006: Compatibility regression report.
- EVID-M5-007: Deployment-model boundary disclosure consistency check.

### Rollback
- Disable governance middleware only in controlled emergency mode; restore last stable policy set.

### Release Train
- Canary: governance enabled for internal consumers first.
- Monitoring: auth failures, throttling rates, audit pipeline health.
- Rollback trigger: governance outage affecting critical operations.

## 4. Cross-Milestone Release Train Rules

### Reality Snapshot (as of 2026-02-22)
- Prior planning did not enforce one consistent release discipline.

For every milestone:
1. **Build:** all milestone tests + compatibility gate MUST pass.
2. **Canary:** deploy to limited operator cohort with scoped dataset.
3. **Observe:** collect milestone-specific KPIs for at least one full operational window.
4. **Promote:** full rollout only if no blocker in canary window.
5. **Fallback:** execute documented rollback immediately on trigger conditions.
6. **Boundary check:** verify milestone ownership table still maps each API contract to exactly one owning milestone.

SLO gate staging (`REQ-PERF-001`):
- `M0`/`M1`: SLO metrics are observed and benchmarked, but do not block release promotion.
- `M2` exit onward: frozen SLO values become normative release gates and MUST block promotion on breach.

**Acceptance:** No milestone is considered done without canary evidence and rollback readiness.

## 5. Requirement Traceability Matrix

### Reality Snapshot (as of 2026-02-22)
- Requirement-to-evidence mapping was implicit and fragmented.

| Requirement | Implemented In | Primary Evidence |
| --- | --- | --- |
| REQ-COMPAT-001 | M0..M5 + M2-Prep (continuous gate) | EVID-M0-001..004 + each milestone `-006` |
| REQ-INGEST-001 | M1 | EVID-M1-001..008 |
| REQ-GRID-001 | M2-Prep + M2 | EVID-M2P-001..005 + EVID-M2-001..008 |
| REQ-ALERT-001 | M3 | EVID-M3-001..008 |
| REQ-STREAM-001 | M3 | EVID-M3-001..008 |
| REQ-AUDIO-001 | M4 | EVID-M4-001..006 |
| REQ-UX-001 | M4 | EVID-M4-001..006 |
| REQ-GOV-001 | M5 | EVID-M5-001..007 |
| REQ-DEPLOY-001 | M5 | EVID-M5-007 |
| REQ-PERF-001 | M0/M1 observe + M2 freeze gate | EVID-M0-004 + EVID-M2-007..008 |

**Acceptance:** Every REQ has explicit milestone ownership and objective evidence.

## 5.1 Milestone Boundary Ownership Table

This table enforces single ownership for each new API contract to prevent overlap across milestones.

| API / Contract | Owning Milestone | Notes |
| --- | --- | --- |
| `POST /api/import` | M1 | Static/batch data-carrying registration |
| `POST /api/sources` | M1 | Stream source pre-registration (`stream_poll`, `stream_push`) |
| `GET /api/sources` / `GET /api/channels` / `DELETE /api/sources/:id` | M1 | Source lifecycle control plane |
| Structural decoupling of `server/spatial.js` and `server/data-loader.js` | M2-Prep | Precondition stage before M2 |
| H3 query/merge/render semantics | M2 | Unified spatial language delivery |
| `POST /api/streams/push/:sourceId` | M3 | Push ingress contract, idempotency, backpressure |
| `GET /api/streams` expanded status contract | M3 | Poll + push operational health contract |
| `POST /api/audio-mapping/reload` + workflow `Draft -> Validate -> Apply -> Rollback` | M4 | Runtime audio control plane UX/behavior |
| Auth/quota/audit + deployment boundary disclosure | M5 | Governance and boundary clarity |

Milestone boundary check rule:
- Every new API MUST have exactly one owning milestone.
- A milestone MAY depend on prior APIs but MUST NOT re-own or redefine existing API contracts.

## 6. Risk Register and Mitigations

### Reality Snapshot (as of 2026-02-22)
- Core risks are known but must be tied to milestone controls.

1. **Spatial migration risk (M2):** incorrect H3 parity.  
Mitigation: dual-path verification + tolerance checks + rollback flag.
2. **Runtime import risk (M1):** malformed/oversized inputs.  
Mitigation: strict validators, size/row/column caps, safe parser behavior.
3. **Alert fatigue risk (M3):** noisy alerts.  
Mitigation: hysteresis/cooldown/dedup defaults and ops tuning runbook.
4. **Audio config risk (M4):** invalid mapping breaks output.  
Mitigation: schema validation + last-known-good fallback.
5. **Governance risk (M5):** auth misconfiguration blocks operations.  
Mitigation: staged canary, emergency bypass procedure, policy verification tests.
6. **Migration effort-underestimate risk (M2/M2-Prep):** `server/spatial.js` and `server/data-loader.js` split/migration scope is larger than conservative estimates.  
Mitigation: force `M2-Prep` stage, deliver split-prep before H3 semantics, and track scope as range-based estimates with parity checkpoints.
7. **API-boundary ambiguity risk (M1/M3):** `/api/import`, `/api/sources`, and push ingress responsibilities are interpreted inconsistently.  
Mitigation: freeze API responsibility matrix in SPEC and enforce milestone boundary ownership checks in every review.
8. **Total change-volume ratio risk (M1..M4):** current range estimate is roughly `~6,100-11,700 LOC` touched across new+modified code, which is large relative to current application code footprint (planning heuristic: ~50%-85% rewrite-equivalent).  
Mitigation: keep staged delivery (`M1` additive -> `M2-Prep` split -> `M2` semantic migration), enforce per-stage rollback gates, and require scope rebasing when realized change volume exceeds upper-range assumptions.

**Acceptance:** Each risk has explicit mitigation and rollback linkage.

## 7. Deferred / Future Work (Single Consolidated Chapter)

### Reality Snapshot (as of 2026-02-22)
- Deferred items are intentionally separated from V1 commitments.

- KML/GPX adapters and richer geospatial import workflows.
- AOI bucketed streaming for globally distributed concurrent clients.
- Full multi-tenant isolation and tenant-scoped RBAC.
- External producer WebSocket ingress path (beyond V1 HTTPS push scope).
- Compound alert expressions and advanced rule authoring.
- Extended compliance and observability tooling.

**Acceptance:** Deferred work does not block M0-M5 completion criteria.

## Appendix A: Historical Max/OSC Notes
- Historical Max/OSC references are preserved for context only.
- They do not define mainline V1 architecture or release priorities.
