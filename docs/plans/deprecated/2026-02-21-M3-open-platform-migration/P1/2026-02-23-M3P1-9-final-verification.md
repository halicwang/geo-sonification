# P1-9 — Final Verification

**Prerequisite:** P1-8 complete
**Trace:** Milestone 3 Phase 1 — Open Ingestion + Control Plane
**EVID coverage:** EVID-P1-006 (full — compatibility regression report after all P1 changes)

## Context

Final quality sweep before P1 is considered complete and ready for merge. No new production code — only verification, cleanup, and documentation.

## Steps

1. **Lint and format:** `npm run lint && npm run format:check`. Fix any issues.
2. **Full test suite:** `npm test` — all P0 + P1 suites green.
3. **Compatibility regression (EVID-P1-006):** `npx jest golden-baseline --verbose` — all golden scenarios pass.
4. **Smoke test (requires running server):** `npm start` then `npm run smoke` — all checks pass.
5. **Import demo (requires running server):** `bash scripts/demo-import-csv.sh` — all checks PASS.
6. **`.gitignore` audit:** Verify `data/imports/` is excluded (should have been added in P1-4). Verify no runtime-generated files are tracked.
7. **DEVLOG entry:** Create entry in `docs/devlog/M3/` and add to `docs/DEVLOG.md` index. Cover what was built, why, key deliverables, production code changes, new modules, new dependency, test count delta.
8. **Commit:** Stage all new/modified files. Do NOT commit anything in `data/cache/` or `data/imports/`.

## Exit

All checks green: lint, format, tests, smoke, golden baseline, demo. DEVLOG updated. P1 ready for merge.

---

## P1 Complete Checklist

| Step | Gate | Covers Original | Status |
|------|------|-----------------|--------|
| P1-1 | `npm test && npm run lint` green | P1-A (adapter interface) | |
| P1-2 | `npm test` green, registry + CSV adapter tested | P1-A (registry + CSV) | |
| P1-3 | Golden baseline green, `GET /api/channels` works | P1-A (wiring) | |
| P1-4 | EVID-P1-003, 004, 005 tests pass | P1-B (import manager) | |
| P1-5 | EVID-P1-001, 002 tests pass, multer installed | P1-B (API + GeoJSON) | |
| P1-6 | EVID-P1-008 tests pass | P1-B (stream descriptors) | |
| P1-7 | EVID-P1-007 tests pass | P1-C (boundary) | |
| P1-8 | EVID-P1-009 demo verified | P1-D (degraded demo) | |
| P1-9 | lint + format + test + smoke + golden + DEVLOG | All EVID-P1 | |

## EVID Traceability

| Evidence ID | Description | Delivered By |
|-------------|-------------|-------------|
| EVID-P1-001 | CSV import API success path | P1-5 |
| EVID-P1-002 | GeoJSON import API success path | P1-5 |
| EVID-P1-003 | Imported source persists across restart | P1-4 |
| EVID-P1-004 | Duplicate sourceId replacement | P1-4 |
| EVID-P1-005 | Delete imported source + reject builtin | P1-4 |
| EVID-P1-006 | Compatibility regression (P0 gate green) | P1-3 (partial) + P1-9 (full) |
| EVID-P1-007 | API boundary test (`/api/import` vs `/api/sources`) | P1-6 (partial) + P1-7 (full) |
| EVID-P1-008 | Stream source descriptor persistence/reload | P1-6 |
| EVID-P1-009 | Degraded demo walkthrough | P1-8 |
