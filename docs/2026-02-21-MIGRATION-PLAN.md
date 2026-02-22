# Geo-Sonification Migration Plan

**Status:** Milestone Execution Plan v1.0-preview  
**Date:** 2026-02-22  
**Baseline Reality Date:** 2026-02-22  
**Paired Spec:** `docs/2026-02-21-OPEN-PLATFORM-SPEC.md`

## Executive Intro (Execution Lighthouse)
This document is the second lighthouse and defines the execution order for delivering the North Star.  
It is no longer a loose phase narrative; it is a deliverable M0-M5 milestone execution plan.  
Each milestone binds requirement IDs (`REQ-*`), acceptance definitions (DoD), evidence IDs (`EVID-*`), and rollback plans.  
Execution principle: protect WorldCover compatibility first, then progressively deliver open ingestion, unified H3, alerting loop closure, audio configurability, and governance baseline.  
Every release must include observability metrics and rollback triggers to avoid \"implemented but not operational\" outcomes.  

## Companion Detailed Docs
- Normative requirement source: `docs/2026-02-21-OPEN-PLATFORM-SPEC.md`
- Technical rationale and invariants: `docs/2026-02-22-TECHNICAL-DESIGN.md`
- Engineering execution packets and scripts: `docs/2026-02-22-ENGINEERING-REFERENCE.md`

## 0. Execution Conventions

### Reality Snapshot (as of 2026-02-22)
- Existing codebase is stable for the current WorldCover demo.
- Open platform capabilities exist mainly as design intent and partial implementation.
- This plan converts intent into decision-complete delivery milestones.

This plan uses RFC 2119 terms and traceability IDs:
- Requirement IDs: `REQ-*` (defined in the paired SPEC).
- Evidence IDs: `EVID-*` (objective proof artifacts per milestone).

No milestone is considered complete without all of: `DoD + Evidence + Rollback readiness`.

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
- Runtime audio configurability for non-audio specialists.
- Enterprise baseline governance (auth/quota/audit).

**Acceptance:** Baseline is explicit enough to define non-regression and migration scope.

## 2. Milestone Map (M0-M5)

### Reality Snapshot (as of 2026-02-22)
- Previous plan mixed phase and future items.
- This map is now milestone-driven and business-demonstrable.

| Milestone | Goal | Covered Requirements | Exit Evidence |
| --- | --- | --- | --- |
| M0 | Compatibility Guardrails | REQ-COMPAT-001 | EVID-M0-001..004 |
| M1 | Open Ingestion + Control Plane | REQ-INGEST-001, REQ-COMPAT-001 | EVID-M1-001..006 |
| M2 | Unified H3 Spatial Core | REQ-GRID-001, REQ-COMPAT-001 | EVID-M2-001..006 |
| M3 | Monitoring + Alerting Loop | REQ-ALERT-001, REQ-COMPAT-001 | EVID-M3-001..006 |
| M4 | Configurable Audio Runtime | REQ-AUDIO-001, REQ-COMPAT-001 | EVID-M4-001..006 |
| M5 | Enterprise Baseline Governance | REQ-GOV-001, REQ-COMPAT-001 | EVID-M5-001..006 |

**Acceptance:** Every V1 requirement is covered by at least one milestone and evidence set.

## 3. Milestone Details

## M0 — Compatibility Guardrails First

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

## M1 — Open Ingestion + Control Plane

### Reality Snapshot (as of 2026-02-22)
- Runtime import/control-plane contract is not complete.

### Objective
Enable self-service runtime data onboarding without code edits/redeploy.

### Covers
- REQ-INGEST-001
- REQ-COMPAT-001

### In Scope
- `POST /api/import` for CSV + GeoJSON.
- `GET /api/sources`, `GET /api/channels`, `DELETE /api/sources/:id`.
- Import persistence with `data/imports/manifest.json` (atomic write/recovery).
- Runtime channel registry updates and frontend notifications.
- Source replacement behavior for duplicate `sourceId`.

### Out of Scope
- Full H3 query migration and hex frontend rendering.
- Alerting and governance features.

### DoD
- New source can be imported and used in same session.
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

### Rollback
- Feature flag off for runtime imports; fallback to WorldCover-only mode.

### Release Train
- Canary: enable import for internal sample datasets only.
- Monitoring: import failure rate, parse/ingest latency, memory delta per import.
- Rollback trigger: import corruption, manifest recovery failure, compatibility regression.

---

## M2 — Unified H3 Spatial Core

### Reality Snapshot (as of 2026-02-22)
- Legacy grid semantics still influence runtime behavior.

### Objective
Establish H3 as the single internal spatial language across ingest/query/render.

### Covers
- REQ-GRID-001
- REQ-COMPAT-001

### In Scope
- H3 encoder/core utilities.
- Spatial index/query migration to H3 cell model.
- Cross-source merge via `CellSnapshot` namespaced channels.
- Frontend hex rendering path aligned with server output.
- Coordinate validation and coordinate-order safety checks.

### Out of Scope
- Advanced AOI bucketed stream strategies.

### DoD
- Viewport query produces merged H3-aligned snapshots.
- Frontend displays hex-based overlays from H3 output.
- Existing WorldCover behavior remains non-regressed in compatibility path.

### Evidence
- EVID-M2-001: Unit tests for encoding/parent lookup/dateline cases.
- EVID-M2-002: Query parity report (legacy vs H3 tolerance bounds).
- EVID-M2-003: Integration tests for multi-source merge semantics.
- EVID-M2-004: Frontend visual verification across zoom ranges.
- EVID-M2-005: Coordinate-order regression tests.
- EVID-M2-006: Compatibility regression report.

### Rollback
- Keep fallback switch to legacy query path until H3 path is verified stable.

### Release Train
- Canary: H3 path for internal users behind runtime flag.
- Monitoring: query latency p95/p99, memory footprint, rendering errors.
- Rollback trigger: query correctness drift beyond tolerance or severe frontend rendering defects.

---

## M3 — Monitoring + Alerting Operational Loop

### Reality Snapshot (as of 2026-02-22)
- Alerting and real-time monitoring semantics are not yet fully operationalized for production monitoring.

### Objective
Deliver operator-grade alerting and real-time stream-driven monitoring from spatial channel signals.

### Covers
- REQ-ALERT-001
- REQ-COMPAT-001

### In Scope
- `alert_rules.json` loader/validator.
- Alert engine state machine (`idle -> active -> cooldown -> idle`).
- Hysteresis, cooldown, dedup by `(ruleId, cellId)`.
- Alert event dispatch (`alert` WebSocket event).
- Stream scheduler and lifecycle management for at least one production stream adapter.
- Sliding time-window aggregation (`windowMs`, `windowAggregate`) with expiry cleanup.
- Dual push triggers: viewport-driven updates and data-change-driven incremental updates.
- Per-client viewport cache (`lastViewport`) for data-change routing.
- Stream memory safeguards (for example `MAX_EVENTS_PER_CELL`, `MAX_STREAM_CELLS`).
- `GET /api/streams` status contract with health and last-fetch metadata.

### Out of Scope
- Full compound rule DSL (future scope).

### DoD
- Alert fire/clear lifecycle works with deterministic transitions.
- Duplicate storms are prevented.
- Alert events are observable by frontend and test harness.
- Stream adapter status and health are observable via `GET /api/streams`.
- Stream time-window expiry and incremental push behavior are test-verified.
- Compatibility guardrail remains green.

### Evidence
- EVID-M3-001: Unit tests for state transitions and hysteresis.
- EVID-M3-002: Cooldown suppression tests.
- EVID-M3-003: Dedup tests for repeated updates.
- EVID-M3-004: WebSocket alert payload contract tests.
- EVID-M3-005: Stream scheduler + time-window integration tests.
- EVID-M3-006: Compatibility regression report.

### Rollback
- Disable alert engine and fall back to non-alerting stats path while preserving data flow.

### Release Train
- Canary: alert rules and stream ingestion enabled for curated channels/sources only.
- Monitoring: false-positive rate, event throughput, dispatch latency, stream fetch error rate.
- Rollback trigger: alert storms, high false positives, broken frontend handling, or unstable stream health.

---

## M4 — Configurable Audio Runtime (No Redeploy)

### Reality Snapshot (as of 2026-02-22)
- Web Audio is active, but runtime configurability for business users is not complete.

### Objective
Allow non-audio engineers to tune mapping and trigger behavior safely at runtime.

### Covers
- REQ-AUDIO-001
- REQ-COMPAT-001

### In Scope
- `audio_mapping.json` schema enforcement.
- `POST /api/audio-mapping/reload` hot reload path.
- WebSocket `bus_config_update` event.
- Minimum control UI/workflow for channel-to-bus mapping and threshold tuning.
- Runtime validation and rollback to last-known-good mapping.

### Out of Scope
- Advanced DAW-grade authoring interfaces.

### DoD
- Config changes apply without restart/redeploy.
- Invalid config does not break runtime audio path.
- Operators can complete core mapping workflow through control surface.
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
- Monitoring: reload failures, config validation errors, audio update latency.
- Rollback trigger: repeated reload failures or broken audible behavior.

---

## M5 — Enterprise Baseline Governance

### Reality Snapshot (as of 2026-02-22)
- Governance controls are not yet complete for enterprise onboarding.

### Objective
Provide minimum enterprise gatekeeping and traceability required for production adoption.

### Covers
- REQ-GOV-001
- REQ-COMPAT-001

### In Scope
- Authentication for write/control endpoints.
- Rate limits/quotas for import and control-plane mutation endpoints.
- Audit logging for import/delete/config/rule changes.
- Governance visibility in ops runbooks.

### Out of Scope
- Full multi-tenant isolation model and tenant-scoped RBAC depth.

### DoD
- Unauthorized writes are rejected.
- Quota/rate breaches are enforced predictably.
- All critical mutations are traceable in audit log.
- Compatibility guardrail remains green.

### Evidence
- EVID-M5-001: Auth rejection tests for protected endpoints.
- EVID-M5-002: Rate-limit and quota enforcement tests.
- EVID-M5-003: Audit log integrity tests.
- EVID-M5-004: Security smoke test checklist run.
- EVID-M5-005: Operator runbook update with governance procedures.
- EVID-M5-006: Compatibility regression report.

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

**Acceptance:** No milestone is considered done without canary evidence and rollback readiness.

## 5. Requirement Traceability Matrix

### Reality Snapshot (as of 2026-02-22)
- Requirement-to-evidence mapping was implicit and fragmented.

| Requirement | Implemented In | Primary Evidence |
| --- | --- | --- |
| REQ-COMPAT-001 | M0..M5 (continuous gate) | EVID-M0-001..004 + each milestone `-006` |
| REQ-INGEST-001 | M1 | EVID-M1-001..006 |
| REQ-GRID-001 | M2 | EVID-M2-001..006 |
| REQ-ALERT-001 | M3 | EVID-M3-001..006 |
| REQ-AUDIO-001 | M4 | EVID-M4-001..006 |
| REQ-GOV-001 | M5 | EVID-M5-001..006 |

**Acceptance:** Every REQ has explicit milestone ownership and objective evidence.

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

**Acceptance:** Each risk has explicit mitigation and rollback linkage.

## 7. Deferred / Future Work (Single Consolidated Chapter)

### Reality Snapshot (as of 2026-02-22)
- Deferred items are intentionally separated from V1 commitments.

- KML/GPX adapters and richer geospatial import workflows.
- AOI bucketed streaming for globally distributed concurrent clients.
- Full multi-tenant isolation and tenant-scoped RBAC.
- Compound alert expressions and advanced rule authoring.
- Extended compliance and observability tooling.

**Acceptance:** Deferred work does not block M0-M5 completion criteria.

## Appendix A: Historical Max/OSC Notes
- Historical Max/OSC references are preserved for context only.
- They do not define mainline V1 architecture or release priorities.
