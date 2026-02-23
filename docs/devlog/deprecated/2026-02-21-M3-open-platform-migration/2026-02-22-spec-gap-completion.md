# 2026-02-22 — Design: Spec Gap Completion (Compound Alerts, API Surface, Format Roadmap, Scaling Boundary)

> **Deprecated (2026-02-23):** M3 Open Platform milestone was abandoned. Tooling, tests, and bugfixes introduced during this period are retained; the Open Platform feature set was not pursued.

Completed four spec-level decision locks across all three lighthouse documents after gap analysis review.

## Decisions Made

1. **Compound alerts added to V1 scope (M3):** Basic AND/OR compound rules with 2-3 channel conditions (flat, no nesting) are now V1 deliverables. AND fires when all conditions enter, clears when any exits. OR fires when any enters, clears when all exit. Cooldown/dedup at compound rule level. Advanced DSL (nested trees, N-of-M, temporal correlation) remains deferred.

2. **Audio control surface locked to API + JSON for V1:** V1 `Draft -> Validate -> Apply -> Rollback` workflow delivered via REST API endpoints only. GUI is explicitly future scope. All "control UI" references across documents updated to "control API".

3. **Format roadmap prioritized in Future Work:** Post-V1 format priority: Shapefile (P1) → Parquet/GeoParquet (P2) → KML/GPX (P3) → NetCDF/HDF5 (P4). Future dependency table in GUIDE expanded accordingly.

4. **V1 scaling boundary confirmed as hard limit:** Single-instance, 200 concurrent viewport clients, 500K cells per source. Horizontal scaling is post-V1 architecture work. New risk register entry and monitoring hook recommendations added.

## Impact Summary

- M3-A effort estimate updated: ~370 LOC → ~470-600 LOC (compound rule evaluation + validator).
- Cumulative LOC estimate updated: ~6,500-12,420 → ~6,610-12,570.
- New evidence: EVID-M3-009 (compound alert evaluation tests).
- New pitfall checklist items: #11 (no nested compounds), #12 (cooldown at rule level).
- New compatibility gate item: #6 (scaling boundary check).

## Files changed

- `docs/plans/M3/2026-02-21-M3-open-platform-spec.md` — REQ-ALERT-001, AlertRule type, alert_rules.json, M3/M4 scope, decision locks, future work, performance envelope (10 edit zones)
- `docs/plans/M3/2026-02-21-M3-migration-plan.md` — M3 scope/DoD/evidence, M4 UI→API, risk register, future work, traceability matrix (15 edit zones)
- `docs/plans/M3/2026-02-22-M3-implementation-guide.md` — Section 9 compound semantics, M3-A/M4-B packets, effort matrix, pitfall checklist, scaling boundary, dependencies (11 edit zones)
