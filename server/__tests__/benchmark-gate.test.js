/**
 * P0-B Provisional SLO benchmark gate.
 *
 * In-process benchmark using synthetic data (same spatial.init() pattern
 * as P0-A golden tests). Measures processViewport() latency across
 * canonical viewport scenarios and reports p50/p95/p99 percentiles.
 *
 * P0/P1 behavior: informational — logs percentiles but does NOT fail
 * on provisional target breach. Only catastrophic regressions (p99 > 5s)
 * are caught.
 *
 * P2+ behavior (future): tighten assertions to block on provisional
 * target breach after SLO freeze.
 *
 * Evidence:
 *   EVID-P0-004 — Baseline latency report
 *
 * Trace: REQ-PERF-001 + P0 + Implementation Guide §10.1 P0-B, §17.3
 */

const { performance } = require('node:perf_hooks');
const { init } = require('../spatial');
const { processViewport } = require('../viewport-processor');
const { createModeState } = require('../mode-manager');
const { createDeltaState } = require('../delta-state');
const { GOLDEN_VIEWPORTS, NORMALIZE_PARAMS } = require('./helpers/golden-viewports');
const { percentile } = require('./helpers/percentile');

const ITERATIONS = 80;

// Provisional targets from Spec §5.8 (informational in P0, normative from P2)
const PROVISIONAL_P95_MS = 250;
const PROVISIONAL_P99_MS = 500;

// Catastrophic regression threshold (hard fail in P0)
const CATASTROPHIC_P99_MS = 5000;

/**
 * Run processViewport N times and collect latencies.
 * @param {number[]} bounds
 * @param {number} zoom
 * @param {number} n
 * @returns {number[]} Sorted array of latencies in ms.
 */
function measureLatencies(bounds, zoom, n) {
    const latencies = [];
    for (let i = 0; i < n; i++) {
        const modeState = createModeState();
        const deltaState = createDeltaState();
        const t0 = performance.now();
        processViewport(bounds, modeState, deltaState, zoom);
        const t1 = performance.now();
        latencies.push(t1 - t0);
    }
    return latencies.sort((a, b) => a - b);
}

describe('P0-B Benchmark Gate: processViewport latency', () => {
    for (const scenario of GOLDEN_VIEWPORTS) {
        describe(`scenario: ${scenario.label}`, () => {
            beforeAll(() => {
                init(scenario.cells, NORMALIZE_PARAMS);
            });

            test(`${ITERATIONS} iterations complete without error`, () => {
                const sorted = measureLatencies(scenario.bounds, scenario.zoom, ITERATIONS);
                expect(sorted).toHaveLength(ITERATIONS);
            });

            test('p99 below catastrophic threshold (5000ms)', () => {
                const sorted = measureLatencies(scenario.bounds, scenario.zoom, ITERATIONS);
                const p99 = percentile(sorted, 99);
                expect(p99).toBeLessThan(CATASTROPHIC_P99_MS);
            });

            test('reports provisional SLO percentiles (informational)', () => {
                const sorted = measureLatencies(scenario.bounds, scenario.zoom, ITERATIONS);
                const p50 = percentile(sorted, 50);
                const p95 = percentile(sorted, 95);
                const p99 = percentile(sorted, 99);

                // Log for CI visibility — not a hard gate in P0
                console.log(
                    `[P0-B benchmark] ${scenario.label}: ` +
                        `p50=${p50.toFixed(3)}ms, ` +
                        `p95=${p95.toFixed(3)}ms (target <=${PROVISIONAL_P95_MS}ms), ` +
                        `p99=${p99.toFixed(3)}ms (target <=${PROVISIONAL_P99_MS}ms)`
                );

                // Informational assertions — warn but do not fail
                if (p95 > PROVISIONAL_P95_MS) {
                    console.warn(
                        `  ⚠ ${scenario.label} p95 (${p95.toFixed(3)}ms) exceeds provisional target (${PROVISIONAL_P95_MS}ms)`
                    );
                }
                if (p99 > PROVISIONAL_P99_MS) {
                    console.warn(
                        `  ⚠ ${scenario.label} p99 (${p99.toFixed(3)}ms) exceeds provisional target (${PROVISIONAL_P99_MS}ms)`
                    );
                }

                // Always passes in P0 — only catastrophic check is a hard gate
                expect(true).toBe(true);
            });
        });
    }
});
