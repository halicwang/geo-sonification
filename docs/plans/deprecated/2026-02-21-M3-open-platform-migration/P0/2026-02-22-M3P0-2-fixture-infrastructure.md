# P0-2 — Fixture Infrastructure

**Prerequisite:** None (independent of P0-1)
**Trace:** Milestone 3 Phase 0 — Compatibility Guardrails
**Covers original:** Packet P0-A (Migration Plan P0) — test helpers and fixture discovery

## Context

Set up all test infrastructure for golden baseline testing in one step:

1. Extract duplicated test utilities into shared helper files (was P0A).
2. Create golden viewport scenario definitions and a deep-comparison helper.
3. Build a discovery script that dumps real `processViewport()` output for human review.

The `expectedResponse` fields in the scenario file are left **empty** — they get frozen after human review (see Exit section).

---

## Part 1: Shared Test Helpers

### 1. `server/__tests__/helpers/make-cell.js`

The `makeCell(overrides)` factory is duplicated verbatim in:
- `server/__tests__/spatial-coverage.test.js` (lines 12-29)
- `server/__tests__/spatial-landcover.test.js` (lines 18-35)

Create `server/__tests__/helpers/make-cell.js`:

```js
/**
 * Factory for test grid cells.
 * Default fields match the area-weighted aggregation path
 * (land_area_km2 > 0, land_fraction = 1, identity weight mode).
 *
 * Does NOT include lc_pct_* defaults — tests that need continuous
 * distribution must add those explicitly via overrides.
 *
 * @param {Object} [overrides]
 * @returns {import('../../types').GridCell}
 */
function makeCell(overrides) {
    return {
        grid_id: 'test',
        lon: 0,
        lat: 0,
        landcover_class: 10,
        land_area_km2: 100,
        cell_area_km2: 100,
        land_fraction: 1,
        nightlight_mean: 0,
        nightlight_p90: 0,
        forest_pct: 0,
        forest_area_km2: 0,
        population_total: 0,
        population_density: 0,
        ...overrides,
    };
}

module.exports = { makeCell };
```

Then update both test files to:
```js
const { makeCell } = require('./helpers/make-cell');
```
Remove the inline `makeCell` function from each file.

### 2. `server/__tests__/helpers/close-server.js`

The `closeHttpServer(server)` and `closeWsServer(wss)` helpers are defined inline in `server/__tests__/index.startup.test.js` (lines 4-14).

Create `server/__tests__/helpers/close-server.js`:

```js
/**
 * Async close helpers for test servers.
 * Wraps the callback-based server.close() in a Promise.
 */

function closeHttpServer(server) {
    return new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
    });
}

function closeWsServer(wss) {
    return new Promise((resolve, reject) => {
        wss.close((err) => (err ? reject(err) : resolve()));
    });
}

module.exports = { closeHttpServer, closeWsServer };
```

Then update `index.startup.test.js` to:
```js
const { closeHttpServer, closeWsServer } = require('./helpers/close-server');
```
Remove the inline helper functions from the file.

---

## Part 2: Golden Comparison Helper

### 3. `server/__tests__/helpers/golden-compare.js`

Subset-matching deep comparator. Only checks keys present in `expected`, ignoring extras in `actual`. Numeric values use `toBeCloseTo` tolerance. Recursively handles nested objects and arrays.

```js
/**
 * Subset deep-compare for golden baseline tests.
 *
 * Only iterates keys in `expected`; extra keys in `actual` are ignored.
 * Numeric values use Jest's toBeCloseTo (5 decimal digits by default).
 *
 * @param {*} actual
 * @param {*} expected
 * @param {string} [path='root'] - Dot-path for error messages
 * @param {number} [precision=5] - toBeCloseTo decimal digits
 */
function expectCloseDeep(actual, expected, path = 'root', precision = 5) {
    if (expected === null || expected === undefined) {
        expect(actual).toEqual(expected);
        return;
    }
    if (Array.isArray(expected)) {
        expect(Array.isArray(actual)).toBe(true);
        expect(actual.length).toBe(expected.length);
        expected.forEach((item, i) => {
            expectCloseDeep(actual[i], item, `${path}[${i}]`, precision);
        });
        return;
    }
    if (typeof expected === 'object') {
        for (const key of Object.keys(expected)) {
            expectCloseDeep(
                actual[key],
                expected[key],
                `${path}.${key}`,
                precision
            );
        }
        return;
    }
    if (typeof expected === 'number') {
        expect(typeof actual).toBe('number');
        expect(actual).toBeCloseTo(expected, precision);
        return;
    }
    expect(actual).toEqual(expected);
}

module.exports = { expectCloseDeep };
```

---

## Part 3: Golden Viewport Scenarios

### 4. `server/__tests__/helpers/golden-viewports.js`

Four viewport scenarios with bounds, zoom, and **empty** `expectedResponse` placeholders.

```js
/**
 * Golden baseline viewport scenarios.
 *
 * Each scenario defines:
 *   - bounds: [west, south, east, north]
 *   - zoom: map zoom level (used by computeProximityFromZoom)
 *   - label: human-readable name
 *   - expectedResponse: subset of processViewport().stats to verify
 *     (populated after P0-2 discovery + human review)
 *
 * Theoretical grid count derivations (GRID_SIZE = 0.5):
 *   land-heavy:  lon [-65, -62] => 6 buckets, lat [-5, -4.5] => 1 bucket  => 6x1 = 6
 *   ocean:       lon [10, 20]   => 20 buckets, lat [-60, -50] => 20 buckets => 20x20 = 400
 *   coastal:     lon [-0.5, 2.5] => 6 buckets, lat [49.5, 51.0] => 3 buckets => 6x3 = 18
 *   urban:       lon [139, 141] => 4 buckets, lat [35, 35.5] => 1 bucket  => 4x1 = 4
 */

const GOLDEN_VIEWPORTS = [
    {
        label: 'land-heavy (Amazon)',
        bounds: [-65, -5, -62, -4.5],
        zoom: 8,
        expectedResponse: {},
    },
    {
        label: 'ocean (South Atlantic)',
        bounds: [10, -60, 20, -50],
        zoom: 3,
        expectedResponse: {},
    },
    {
        label: 'coastal (English Channel)',
        bounds: [-0.5, 49.5, 2.5, 51.0],
        zoom: 5,
        expectedResponse: {},
    },
    {
        label: 'urban (Tokyo)',
        bounds: [139, 35, 141, 35.5],
        zoom: 10,
        expectedResponse: {},
    },
];

module.exports = { GOLDEN_VIEWPORTS };
```

---

## Part 4: Discovery Script

### 5. `scripts/p0-discover-fixtures.js`

Discovery script that loads real data, runs `processViewport()` for each scenario, and writes JSON output to `data/cache/p0-discovery/`.

```js
/**
 * P0-2 Discovery Script — dumps processViewport() output for human review.
 *
 * Usage: node scripts/p0-discover-fixtures.js
 *
 * Output: data/cache/p0-discovery/{label-slug}.json (one per scenario)
 *
 * This script requires the real CSV data in data/raw/.
 * It loads data the same way the server does (via data-loader + spatial.init),
 * then calls processViewport() with fresh mode/delta state per scenario.
 */

const fs = require('fs');
const path = require('path');
const { loadGridData } = require('../server/data-loader');
const spatial = require('../server/spatial');
const { processViewport } = require('../server/viewport-processor');
const { createModeState } = require('../server/mode-manager');
const { createDeltaState } = require('../server/delta-state');
const { GOLDEN_VIEWPORTS } = require('../server/__tests__/helpers/golden-viewports');

const OUTPUT_DIR = path.join(__dirname, '../data/cache/p0-discovery');

function slugify(label) {
    return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function main() {
    console.log('Loading grid data...');
    const { gridData, normalizeParams } = await loadGridData();
    spatial.init(gridData, normalizeParams);
    console.log(`Loaded ${gridData.length} cells.`);

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    for (const scenario of GOLDEN_VIEWPORTS) {
        // Fresh state per scenario — each is independent
        const modeState = createModeState();
        const deltaState = createDeltaState();
        const result = processViewport(
            scenario.bounds,
            modeState,
            deltaState,
            scenario.zoom
        );

        const slug = slugify(scenario.label);
        const outPath = path.join(OUTPUT_DIR, `${slug}.json`);
        fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
        console.log(`[${scenario.label}] -> ${outPath}`);

        // Quick summary for terminal review
        if (result.error) {
            console.log(`  ERROR: ${result.error}`);
        } else {
            const s = result.stats;
            console.log(`  gridCount=${s.gridCount}, coverage=${s.landCoverageRatio?.toFixed(4)}`);
            console.log(`  oceanLevel=${s.audioParams?.oceanLevel}, proximity=${s.audioParams?.proximity?.toFixed(4)}`);
            console.log(`  mode=${s.mode}, dominant=${s.dominantLandcover}`);
        }
    }

    console.log('\nDone. Review JSON files in:', OUTPUT_DIR);
    process.exit(0);
}

main().catch((err) => {
    console.error('Discovery failed:', err);
    process.exit(1);
});
```

## Steps

1. Create directory `server/__tests__/helpers/` (if it doesn't exist).
2. Create `server/__tests__/helpers/make-cell.js` with the factory function.
3. Create `server/__tests__/helpers/close-server.js` with the close helpers.
4. Update `spatial-coverage.test.js`: replace inline `makeCell` with `require('./helpers/make-cell')`.
5. Update `spatial-landcover.test.js`: replace inline `makeCell` with `require('./helpers/make-cell')`.
6. Update `index.startup.test.js`: replace inline `closeHttpServer`/`closeWsServer` with `require('./helpers/close-server')`.
7. Create `server/__tests__/helpers/golden-compare.js`.
8. Create `server/__tests__/helpers/golden-viewports.js` (with empty `expectedResponse: {}`).
9. Create `scripts/p0-discover-fixtures.js`.
10. Run `npm test` — existing tests still green (no new tests yet).
11. Run `node scripts/p0-discover-fixtures.js` — produces 4 JSON files.
12. Print a summary of each JSON file for human review.

## Self-Check

```bash
npm test
```
**Expected:** 10 suites, 113 tests, all green (no new tests added in this step).

**Verify no leftover inline copies:**
```bash
grep -n "function makeCell" server/__tests__/spatial-coverage.test.js server/__tests__/spatial-landcover.test.js
# Expected: no matches

grep -n "function closeHttpServer\|function closeWsServer" server/__tests__/index.startup.test.js
# Expected: no matches
```

**Verify discovery output:**
```bash
node scripts/p0-discover-fixtures.js
```
**Expected:** 4 JSON files created in `data/cache/p0-discovery/`:
- `land-heavy-amazon.json`
- `ocean-south-atlantic.json`
- `coastal-english-channel.json`
- `urban-tokyo.json`

```bash
ls data/cache/p0-discovery/*.json | wc -l
# Expected: 4
```

## Exit — HUMAN REVIEW GATE

**STOP HERE.** Do not proceed to P0-3 until the human has reviewed the discovery output.

The agent must:
1. Print the key fields from each JSON file for human inspection:
   - `gridCount`
   - `landCoverageRatio`
   - `theoreticalGridCount` (if present in stats)
   - `audioParams.oceanLevel`
   - `audioParams.proximity`
   - `audioParams.coverage`
   - `dominantLandcover`
   - `landcoverDistribution` (top keys)
   - `mode`
2. Wait for human to confirm: "Fixtures look correct, freeze them."

**Human review checklist:**
- [ ] `gridCount` > 0 for land-heavy, coastal, urban; `gridCount` = 0 for ocean
- [ ] `landCoverageRatio` sensible (land-heavy ~1.0, ocean = 0.0, coastal < 1.0, urban ~1.0)
- [ ] Ocean scenario: `oceanLevel` = 1.0 (prox=0 -> pure ocean), `dominantLandcover` = 80
- [ ] Land-heavy: `oceanLevel` = 0.0 (zoom 8 -> prox=1.0, high coverage)
- [ ] Coastal: `oceanLevel` follows three-level logic based on prox and coverage
- [ ] `mode` = 'aggregated' for all scenarios (default threshold = 50; ocean/land-heavy/coastal expected gridCount patterns)
- [ ] `landcoverDistribution` has no key `80` for non-ocean scenarios (Water excluded by `getCellLcDistribution`)
- [ ] Ocean scenario `landcoverDistribution` = `{ "80": 1 }` (from `emptyStats()`)

After human confirmation, the agent copies the verified values into `golden-viewports.js` `expectedResponse` fields — only the subset of fields that the human confirmed. This becomes the frozen golden baseline for P0-3.

Report: "P0-2 complete. Helpers extracted, 4 discovery JSONs generated. Awaiting human review before freezing fixtures."
