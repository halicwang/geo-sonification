# P0-5 — Final Verification

**Prerequisite:** P0-4 complete
**Trace:** Milestone 3 Phase 0 — Compatibility Guardrails
**EVID coverage:** EVID-P0-002 (CI enforces compatibility gate), EVID-P0-003 (manual smoke walkthrough)

## Context

Final quality sweep: lint, format, smoke test, CI verification, and DEVLOG entry. This is the last step before P0 is considered complete and ready for merge.

## Steps

### 1. Lint and Format

```bash
npm run lint
npm run format:check
```

If either fails, fix the issues:
```bash
npm run lint:fix
npm run format
```

Then re-run checks to confirm they pass.

### 2. Full Test Suite

```bash
npm test
```

**Expected:** 12 suites, all green.

### 3. Smoke Test (requires running server)

In one terminal:
```bash
npm start
```

Wait for "Geo-Sonification Server Running" banner, then in another terminal:
```bash
npm run smoke
```

**Expected:** All checks pass, exit 0.

Stop the server after smoke test completes.

### 4. CI Enforcement Verification (EVID-P0-002)

Push the branch and confirm that CI runs `npm test` which now includes `golden-baseline.test.js` and `benchmark-gate.test.js`. The compatibility gate is enforced if:

- CI workflow (`.github/workflows/`) includes `npm test` in its job.
- `golden-baseline.test.js` is part of the Jest test discovery path.
- A CI failure on golden mismatch blocks the PR.

**Verify:**
```bash
grep -r "npm test" .github/workflows/
# Expected: at least one workflow step runs npm test
```

If CI does not yet include `npm test`, add it to the workflow as a required step. This satisfies EVID-P0-002.

### 5. DEVLOG Entry

Add an entry to `docs/DEVLOG.md` documenting the P0 work. Follow the existing entry format in the file.

Entry should cover:
- **What:** P0 Compatibility Guardrails — golden baseline tests locking processViewport() output
- **Why:** Regression safety net before Milestone 3 platform refactoring (P1+)
- **Key deliverables:**
  - Shared test helpers (`make-cell.js`, `close-server.js`, `golden-compare.js`)
  - Golden viewport scenarios with human-verified fixtures
  - Environment-pinned baseline tests (config constants guard)
  - Channel manifest guard (5-bus structure, control signals)
  - Performance benchmark gate (SLO: <100ms avg per processViewport call)
  - Smoke test script for full-stack validation
- **Production code changes:** `attachWsHandler()` extraction, `_setDataLoaded()` test helper (both in `server/index.js`)
- **Test count:** before -> after

### 6. Commit

Stage all new and modified files. Do **not** commit anything in `data/cache/` (should be in `.gitignore`).

Verify `.gitignore` excludes `data/cache/`:
```bash
grep 'data/cache' .gitignore
```

## Self-Check

```bash
npm run lint && npm run format:check && npm test
```

**Expected:** All three commands pass with zero errors.

**Verify file count:**
```bash
# New files created in P0:
ls server/__tests__/helpers/make-cell.js \
   server/__tests__/helpers/close-server.js \
   server/__tests__/helpers/golden-compare.js \
   server/__tests__/helpers/golden-viewports.js \
   server/__tests__/golden-baseline.test.js \
   server/__tests__/benchmark-gate.test.js \
   scripts/p0-discover-fixtures.js \
   scripts/benchmark-viewport.js \
   scripts/smoke-worldcover.js
# Expected: 9 files listed, all exist

# Modified files:
# server/index.js (attachWsHandler + _setDataLoaded)
# server/__tests__/spatial-coverage.test.js (makeCell -> import)
# server/__tests__/spatial-landcover.test.js (makeCell -> import)
# server/__tests__/index.startup.test.js (close helpers -> import)
# package.json (benchmark + smoke scripts)
# docs/DEVLOG.md (new entry)
```

## Exit

Report: "P0-5 complete. All checks green: lint, format, 12 test suites, smoke test, CI verified. DEVLOG updated. P0 ready for merge."

---

## P0 Complete Checklist

| Step | Gate | Covers Original | Status |
|------|------|-----------------|--------|
| P0-1 | `npm test && npm run lint` green | P0-A (testability) | |
| P0-2 | Helpers extracted, discovery JSONs generated, human review done | P0-A (infrastructure) | |
| P0-3 | `npm test` — 11 suites green (+ golden baseline + channel guard) | P0-A (regression gate) | |
| P0-4 | `npm test` — 12 suites green (+ benchmark gate) | P0-B (SLO benchmark) | |
| P0-5 | lint + format + test + smoke + CI verified, DEVLOG written | EVID-P0-001..004 | |

## EVID Traceability

| Evidence ID | Description | Delivered By |
|-------------|-------------|-------------|
| EVID-P0-001 | Golden payload fixture set committed and reviewed | P0-2 (discovery) + P0-3 (tests) |
| EVID-P0-002 | CI job enforces compatibility test gate | P0-5 (CI verification step) |
| EVID-P0-003 | Manual smoke walkthrough on WorldCover demo | P0-5 (smoke test) |
| EVID-P0-004 | Baseline latency report stored in docs/devlog | P0-4 (benchmark) + P0-5 (DEVLOG) |
