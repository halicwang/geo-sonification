# P0-4 — Benchmark & Scripts

**Prerequisite:** P0-3 complete
**Trace:** Milestone 3 Phase 0 — Compatibility Guardrails
**Covers original:** Packet P0-B (Implementation Guide §10.1) — provisional SLO benchmark gate
**EVID coverage:** EVID-P0-003 (manual smoke walkthrough), EVID-P0-004 (baseline latency report)

## Context

Create the performance benchmark test (SLO gate), a standalone benchmark runner for manual profiling, and a smoke-test script that validates the full server stack (HTTP + WebSocket) end-to-end. These are the Packet P0-B deliverables: provisional SLO baselines.

## Files to Create

### 1. `server/__tests__/benchmark-gate.test.js`

Jest test that asserts `processViewport()` completes within a time budget. Uses real data.

```js
/**
 * Performance SLO gate — processViewport must complete within budget.
 *
 * Uses real CSV data. The time budget is intentionally generous
 * (100ms per call) to avoid flaky CI failures while still catching
 * order-of-magnitude regressions.
 */

jest.mock('../normalize', () => ({
    normalizeValues: jest.fn(() => ({
        nightlightNorm: 0,
        populationNorm: 0,
        forestNorm: 0,
    })),
}));

const { loadGridData } = require('../data-loader');
const spatial = require('../spatial');
const { processViewport } = require('../viewport-processor');
const { createModeState } = require('../mode-manager');
const { createDeltaState } = require('../delta-state');
const { GOLDEN_VIEWPORTS } = require('./helpers/golden-viewports');

beforeAll(async () => {
    const { gridData, normalizeParams } = await loadGridData();
    spatial.init(gridData, normalizeParams);
}, 30000);

describe('benchmark gate', () => {
    const ITERATIONS = 50;
    const MAX_AVG_MS = 100;

    for (const scenario of GOLDEN_VIEWPORTS) {
        test(`${scenario.label}: avg < ${MAX_AVG_MS}ms over ${ITERATIONS} iterations`, () => {
            const times = [];
            for (let i = 0; i < ITERATIONS; i++) {
                const modeState = createModeState();
                const deltaState = createDeltaState();
                const t0 = performance.now();
                const result = processViewport(
                    scenario.bounds,
                    modeState,
                    deltaState,
                    scenario.zoom
                );
                const elapsed = performance.now() - t0;
                expect(result.error).toBeUndefined();
                times.push(elapsed);
            }
            const avg = times.reduce((s, t) => s + t, 0) / times.length;
            const max = Math.max(...times);
            const p95 = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)];

            console.log(
                `  [${scenario.label}] avg=${avg.toFixed(2)}ms p95=${p95.toFixed(2)}ms max=${max.toFixed(2)}ms`
            );
            expect(avg).toBeLessThan(MAX_AVG_MS);
        });
    }
});
```

### 2. `scripts/benchmark-viewport.js`

Standalone benchmark runner for manual profiling outside of Jest.

```js
/**
 * Standalone viewport benchmark — run outside Jest for profiling.
 *
 * Usage: node scripts/benchmark-viewport.js [iterations]
 * Default: 100 iterations per scenario.
 */

const { loadGridData } = require('../server/data-loader');
const spatial = require('../server/spatial');
const { processViewport } = require('../server/viewport-processor');
const { createModeState } = require('../server/mode-manager');
const { createDeltaState } = require('../server/delta-state');
const { GOLDEN_VIEWPORTS } = require('../server/__tests__/helpers/golden-viewports');

const ITERATIONS = parseInt(process.argv[2], 10) || 100;

async function main() {
    console.log('Loading grid data...');
    const { gridData, normalizeParams } = await loadGridData();
    spatial.init(gridData, normalizeParams);
    console.log(`Loaded ${gridData.length} cells. Running ${ITERATIONS} iterations per scenario.\n`);

    for (const scenario of GOLDEN_VIEWPORTS) {
        const times = [];
        for (let i = 0; i < ITERATIONS; i++) {
            const modeState = createModeState();
            const deltaState = createDeltaState();
            const t0 = performance.now();
            processViewport(scenario.bounds, modeState, deltaState, scenario.zoom);
            times.push(performance.now() - t0);
        }
        times.sort((a, b) => a - b);
        const avg = times.reduce((s, t) => s + t, 0) / times.length;
        const p50 = times[Math.floor(times.length * 0.5)];
        const p95 = times[Math.floor(times.length * 0.95)];
        const p99 = times[Math.floor(times.length * 0.99)];
        const max = times[times.length - 1];

        console.log(`[${scenario.label}]`);
        console.log(`  avg=${avg.toFixed(2)}ms  p50=${p50.toFixed(2)}ms  p95=${p95.toFixed(2)}ms  p99=${p99.toFixed(2)}ms  max=${max.toFixed(2)}ms`);
    }

    process.exit(0);
}

main().catch((err) => {
    console.error('Benchmark failed:', err);
    process.exit(1);
});
```

### 3. `scripts/smoke-worldcover.js`

End-to-end smoke test: starts the real server, hits HTTP endpoints, opens a WebSocket connection, and verifies responses.

```js
/**
 * Smoke test — validates the full server stack (HTTP + WebSocket).
 *
 * Usage: node scripts/smoke-worldcover.js
 *
 * Starts the server, checks /health, /api/config, POST /api/viewport,
 * and a WebSocket viewport exchange. Exits 0 on success, 1 on failure.
 *
 * Timeout: configurable via SMOKE_TIMEOUT_MS env var (default: 30000ms).
 */

const WebSocket = require('ws');

const TIMEOUT_MS = parseInt(process.env.SMOKE_TIMEOUT_MS, 10) || 30000;
const HTTP_PORT = parseInt(process.env.HTTP_PORT, 10) || 3000;
const WS_PORT = parseInt(process.env.WS_PORT, 10) || 3001;
const BASE_URL = `http://localhost:${HTTP_PORT}`;
const WS_URL = `ws://localhost:${WS_PORT}`;

async function fetchJson(url, options = {}) {
    const resp = await fetch(url, options);
    if (!resp.ok) throw new Error(`${url} returned ${resp.status}`);
    return resp.json();
}

async function main() {
    const timer = setTimeout(() => {
        console.error(`Smoke test timed out after ${TIMEOUT_MS}ms`);
        process.exit(1);
    }, TIMEOUT_MS);
    timer.unref();

    let passed = 0;
    let failed = 0;

    function check(label, condition) {
        if (condition) {
            console.log(`  PASS: ${label}`);
            passed++;
        } else {
            console.error(`  FAIL: ${label}`);
            failed++;
        }
    }

    // 1. Health check
    console.log('\n[1] GET /health');
    const health = await fetchJson(`${BASE_URL}/health`);
    check('ok === true', health.ok === true);
    check('dataLoaded === true', health.dataLoaded === true);

    // 2. Config
    console.log('\n[2] GET /api/config');
    const config = await fetchJson(`${BASE_URL}/api/config`);
    check('wsPort is number', typeof config.wsPort === 'number');
    check('httpPort is number', typeof config.httpPort === 'number');
    check('gridSize is number', typeof config.gridSize === 'number');
    check('landcoverMeta exists', config.landcoverMeta != null);

    // 3. HTTP viewport
    console.log('\n[3] POST /api/viewport (land-heavy)');
    const viewport = await fetchJson(`${BASE_URL}/api/viewport`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bounds: [-65, -5, -62, -4.5], zoom: 8 }),
    });
    check('gridCount > 0', viewport.gridCount > 0);
    check('has audioParams', viewport.audioParams != null);
    check('has landcoverDistribution', viewport.landcoverDistribution != null);

    // 4. WebSocket viewport
    console.log('\n[4] WebSocket viewport exchange');
    await new Promise((resolve, reject) => {
        const ws = new WebSocket(WS_URL);
        const wsTimeout = setTimeout(() => {
            ws.terminate();
            reject(new Error('WebSocket timed out'));
        }, 10000);

        ws.on('open', () => {
            // Register message handler before sending
            ws.on('message', (data) => {
                clearTimeout(wsTimeout);
                try {
                    const msg = JSON.parse(data);
                    check('type === stats', msg.type === 'stats');
                    check('has gridCount', typeof msg.gridCount === 'number');
                    check('has audioParams', msg.audioParams != null);
                    ws.close();
                    resolve();
                } catch (err) {
                    ws.close();
                    reject(err);
                }
            });

            ws.send(JSON.stringify({
                type: 'viewport',
                bounds: [-65, -5, -62, -4.5],
                zoom: 8,
            }));
        });

        ws.on('error', (err) => {
            clearTimeout(wsTimeout);
            reject(err);
        });
    });

    // Summary
    console.log(`\n${'='.repeat(40)}`);
    console.log(`Smoke test: ${passed} passed, ${failed} failed`);
    console.log('='.repeat(40));

    clearTimeout(timer);
    process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error('Smoke test failed:', err);
    process.exit(1);
});
```

### 4. `package.json` script additions

Add to the root `package.json` scripts:

```json
"benchmark": "node scripts/benchmark-viewport.js",
"smoke": "node scripts/smoke-worldcover.js"
```

## Steps

1. Create `server/__tests__/benchmark-gate.test.js`.
2. Create `scripts/benchmark-viewport.js`.
3. Create `scripts/smoke-worldcover.js`.
4. Add `benchmark` and `smoke` scripts to root `package.json`.
5. Run `npm test`.

## Self-Check

```bash
npm test
```

**Expected:** 12 suites (11 from P0-3 + benchmark-gate), all green. Benchmark tests should log timing stats to console.

**Verify benchmark runs standalone:**
```bash
node scripts/benchmark-viewport.js 10
```
**Expected:** Prints timing stats for all 4 scenarios, exits 0.

**Smoke test** requires a running server — skip in this step's self-check. It will be verified in P0-5.

## Exit

Report: "P0-4 complete. `npm test`: 12 suites, all green. Benchmark and smoke scripts created. `npm run benchmark` runs clean."
