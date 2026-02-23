# 2026-02-22 — Feature: Provisional SLO Benchmark Gate (P0-B)

Established the P0-B provisional SLO benchmark infrastructure for `POST /api/viewport` latency. A standalone HTTP benchmark script and an in-process Jest gate capture p50/p95/p99 percentiles with environment metadata. First baseline run recorded below as the P2 freeze handoff input.

## Evidence

- **EVID-P0-003**: Smoke test script (`scripts/smoke-worldcover.js`) validates full server stack (HTTP + WebSocket) end-to-end.
- **EVID-P0-004**: Baseline latency report (this file) and `benchmark-gate.test.js` integrated into `npm test`.

## Provisional Targets (Spec 5.8)

These targets are informational in P0/P1 and become normative release gates from P2 exit onward.

| Metric | Provisional Target |
|---|---|
| `POST /api/viewport` p95 | <= 250ms |
| `POST /api/viewport` p99 | <= 500ms |

## First Baseline Run

**Environment:**

| Property | Value |
|---|---|
| Date | 2026-02-23T02:34:28Z |
| Node.js | v24.13.0 |
| Platform | darwin arm64 |
| CPU | Apple M1 Pro (10 cores) |
| Memory | 32.0 GB |
| Grid cells | 67,331 (WorldCover baseline) |
| Requests per scenario | 100 (+ 3 warmup) |

**HTTP benchmark results (against live server):**

| Scenario | p50 | p95 | p99 | Max |
|---|---|---|---|---|
| land-dense | 0.441ms | 0.747ms | 0.888ms | 0.967ms |
| ocean | 0.336ms | 0.469ms | 0.499ms | 0.519ms |
| coastal | 0.303ms | 0.492ms | 0.535ms | 0.540ms |
| wide-area | 0.895ms | 1.760ms | 4.396ms | 7.297ms |

**In-process benchmark results (Jest, synthetic data):**

| Scenario | p50 | p95 | p99 |
|---|---|---|---|
| land | 0.073ms | 0.084ms | 0.136ms |
| ocean | 0.039ms | 0.047ms | 0.135ms |
| coastal | 0.059ms | 0.067ms | 0.148ms |

All scenarios are well within provisional targets.

## P2 Freeze Handoff

- These baseline numbers serve as the input for the P2 SLO benchmark freeze gate (EVID-P2-012).
- At P2 exit, the H3-based spatial path replaces the legacy grid path. A new benchmark run on the H3 path will be compared against this baseline.
- If H3 path performance is within acceptable variance of these baseline numbers, provisional targets become normative release gates.

## Design Decisions

- **Dual benchmark approach**: standalone HTTP script (`scripts/benchmark-viewport.js`) measures real end-to-end latency including Express routing; Jest gate (`benchmark-gate.test.js`) measures pure computation via `processViewport()` for CI regression detection.
- **Informational gate in P0**: the Jest test logs percentiles and warns on breach but does not fail. Hard failure is reserved for catastrophic regressions (p99 > 5000ms).
- **Shared scenario definitions**: `helpers/golden-viewports.js` provides canonical viewport scenarios reusable across golden baseline and benchmark tests.

## Files changed

- NEW: `scripts/benchmark-viewport.js` -- Standalone HTTP benchmark runner
- NEW: `scripts/smoke-worldcover.js` -- End-to-end smoke test (HTTP + WebSocket) (EVID-P0-003)
- NEW: `server/__tests__/benchmark-gate.test.js` -- Jest CI benchmark gate (EVID-P0-004)
- NEW: `server/__tests__/helpers/golden-viewports.js` -- Shared viewport scenario definitions
- NEW: `server/__tests__/helpers/percentile.js` -- Percentile calculation utility
- MOD: `package.json` -- Added `benchmark` and `smoke` npm scripts
- MOD: `docs/DEVLOG.md` -- Added entry link
