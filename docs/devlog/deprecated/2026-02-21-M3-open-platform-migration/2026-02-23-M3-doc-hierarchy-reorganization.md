# 2026-02-23 — Refactor: M3 Documentation Hierarchy Reorganization

> **Deprecated (2026-02-23):** M3 Open Platform milestone was abandoned. Tooling, tests, and bugfixes introduced during this period are retained; the Open Platform feature set was not pursued.

Reorganized the three M3 lighthouse documents so each has one clear, non-overlapping role. The Implementation Guide (916 lines) had been mixing frozen contracts, sequencing content, and design rationale in one document, making it unclear what was normative vs advisory.

## What Changed

**Principle:** Frozen contracts belong in the Spec. Sequencing belongs in the Migration Plan. Only design rationale and engineering guidance belong in the Implementation Guide.

### Spec Additions (~210 lines)

Moved frozen contracts from Implementation Guide to their normative home:

- **§3.2.1** Coordinate-Order Safety Rules (from IG §4.2)
- **§3.3.1** Channel Index Assignment Policy (from IG §8.2)
- **§3.5** Frozen Adapter & Extension Types — DataAdapter, StreamAdapter, PushAdapter, SourceDescriptor, CellEncoder (from IG §6.1-6.4, §4.5)
- **§3.6** Frozen Stream Ingestion Types — PushEvent, PushIngestAck (from IG §9.1)
- **§3.7** Multi-Resolution Query Strategy (from IG §4.4)
- **§4.1.1** Import Format Contracts — CSV minimal contract, sourceId rules, manifest persistence (from IG §7.1, §7.3)
- **§4.1.2** Push Ingestion Normative Semantics — idempotency, dedup, backpressure (from IG §9.2)
- **§5.8** expanded with V1 Scaling Boundary table (from IG §4.7)
- **Appendix B** WorldCover Baseline Manifest — 14 channels (from IG §14)
- **Appendix C** Glossary — updated with new type cross-references

### Implementation Guide Restructure (916 → ~400 lines)

Removed all content that now lives elsewhere:

- **Removed §10-13** (Phase Work Packets, Effort Matrix, Sequencing, Delivery Paths) — stage files and Migration Plan cover this
- **Removed §14** (WorldCover Manifest) → now Spec Appendix B
- **Removed §16** (Compatibility Gate Checklist) → already in Spec §6
- **Removed §8.1, 8.2, 8.3, 8.4, 8.6** (contract content) → already/now in Spec
- **Removed §9.0.1, 9.0.2, 9.1** (contract content) → already/now in Spec
- **Removed §6 typedefs** → now in Spec §3.5 (kept engineering intent paragraphs)
- **Renumbered** remaining sections contiguously (0-11 + Appendix A)

Kept all design rationale (why H3, why dual channels, why separate APIs, etc.) and engineering guidance (pitfall checklist, validation checks, demo scripts).

### Migration Plan Updates

- Updated Cross-Document Phase Alignment Matrix with new IG section numbers and stage file references
- Added Appendix B: Shortest Delivery Paths (moved from IG §13)

### Stage File Reference Updates (14 files)

All `Implementation Guide §10.x` references → `Migration Plan P*`
All `Implementation Guide §6` references → `Spec §3.5`
All `Implementation Guide §14` references → `Spec Appendix B`
All `Implementation Guide §8` namespace references → `Spec §3.3`

### Test File Update

`server/__tests__/benchmark-gate.test.js` — updated trace comment to reference new section numbers.

## Files Changed

### Modified
- `docs/plans/M3/2026-02-21-M3-open-platform-spec.md` — added §3.2.1, §3.3.1, §3.5, §3.6, §3.7, §4.1.1, §4.1.2, expanded §5.8, added Appendix B, updated Glossary
- `docs/plans/M3/2026-02-22-M3-implementation-guide.md` — full restructure (916 → ~400 lines)
- `docs/plans/M3/2026-02-21-M3-migration-plan.md` — updated alignment matrix, added Appendix B
- `docs/plans/M3/P0/2026-02-22-M3P0-1-production-code-changes.md` — ref updates
- `docs/plans/M3/P0/2026-02-22-M3P0-2-fixture-infrastructure.md` — ref updates
- `docs/plans/M3/P0/2026-02-22-M3P0-3-golden-baseline-tests.md` — ref updates (§14 → Spec Appendix B)
- `docs/plans/M3/P0/2026-02-22-M3P0-4-benchmark-and-scripts.md` — ref updates
- `docs/plans/M3/P1/2026-02-23-M3P1-1-adapter-interface-and-worldcover-adapter.md` — ref updates
- `docs/plans/M3/P1/2026-02-23-M3P1-2-channel-registry-and-csv-generic-adapter.md` — ref updates
- `docs/plans/M3/P1/2026-02-23-M3P1-3-worldcover-integration-wiring.md` — ref updates
- `docs/plans/M3/P1/2026-02-23-M3P1-4-import-manager-and-validator.md` — ref updates
- `docs/plans/M3/P1/2026-02-23-M3P1-5-import-api-and-geojson-adapter.md` — ref updates
- `docs/plans/M3/P1/2026-02-23-M3P1-6-source-control-plane-and-stream-descriptors.md` — ref updates
- `docs/plans/M3/P1/2026-02-23-M3P1-7-api-boundary-hardening.md` — ref updates
- `docs/plans/M3/P1/2026-02-23-M3P1-8-degraded-end-to-end-demo.md` — ref updates
- `server/__tests__/benchmark-gate.test.js` — trace comment update

### New
- `docs/devlog/M3/2026-02-23-M3-doc-hierarchy-reorganization.md` — this entry
