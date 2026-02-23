# P1-8 — Degraded End-to-End Demo

**Prerequisite:** P1-5 complete (minimum — `POST /api/import` operational); P1-7 recommended
**Trace:** Milestone 3 Phase 1 — Open Ingestion + Control Plane
**Covers original:** Packet P1-D (Migration Plan P1) — degraded end-to-end demo
**EVID coverage:** EVID-P1-009 (degraded demo walkthrough)

## Context

Validate the "upload → see → hear" loop at the earliest possible phase. Import a CSV file and verify that imported channels appear in the channel registry and source listing alongside WorldCover.

**Degraded aspects:** no hex rendering, no H3 alignment, no audio integration of imported data. Imported data uses the existing grid overlay (lon/lat bucket keys). Full spatial and audio integration is P2/P4 scope. This demo proves the import pipeline connects end-to-end through the registry.

## New Files

### `server/__tests__/fixtures/demo-air-quality.csv`

Sample CSV with ~5 rows of air quality data. Use coordinates in the Amazon region (approximate bounds `[-62, -7, -59, -4]`) — matches golden baseline viewport scenarios for easy testing. Include at least 3 numeric columns (e.g. pm25, temp_c, humidity).

### `scripts/demo-import-csv.sh`

Shell script demonstrating the full import lifecycle against a running server:
1. Import the demo CSV via `POST /api/import`
2. List sources via `GET /api/sources` — verify imported source appears
3. List channels via `GET /api/channels` — verify imported channels appear
4. (Optional) Query viewport covering the imported region
5. Cleanup: delete the imported source via `DELETE /api/sources/:id`

Each step should print results and verify expected output (PASS/FAIL).

## Changes to `server/viewport-processor.js`

Minimal addition: after computing the main stats, include a list of imported source IDs (any source in the registry that isn't `worldcover`) as a supplementary field in the stats payload. This proves the import pipeline connects through to viewport output.

Wrap in try/catch — if the registry isn't available, skip silently.

**Note:** This is metadata-only. Full spatial integration of imported data records into `calculateViewportStats()` is P2 scope.

## Tests

Create `server/__tests__/degraded-demo.test.js`. Should cover:
- Import demo CSV via adapter pipeline → records and channels produced
- Imported source channels appear in registry (namespaced keys)
- WorldCover channels still present after import (no regression)
- Full lifecycle: import → verify channels → delete → verify removed

## Exit

```bash
npm test && npx jest golden-baseline --verbose && npm run lint
```

All suites green. Golden baseline: no regression from viewport-processor change.

With running server: `bash scripts/demo-import-csv.sh` — all checks PASS.
