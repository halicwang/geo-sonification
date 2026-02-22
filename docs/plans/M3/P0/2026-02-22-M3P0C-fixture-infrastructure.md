# P0C — Fixture Infrastructure

**Prerequisite:** P0B complete
**Trace:** Milestone 3 Phase 0 — Compatibility Guardrails

## Context

Create the golden test infrastructure: viewport scenario definitions, a deep-comparison helper, and a discovery script that dumps real `processViewport()` output to JSON files. The `expectedResponse` fields in the scenario file are left **empty** at this stage — they get frozen after human review (see Exit section).

## Files to Create

### 1. `server/__tests__/helpers/golden-compare.js`

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

### 2. `server/__tests__/helpers/golden-viewports.js`

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
 *     (populated after P0C discovery + human review)
 *
 * Theoretical grid count derivations (GRID_SIZE = 0.5):
 *   land-heavy:  lon [-65, -62] → 6 buckets, lat [-5, -4.5] → 1 bucket  → 6×1 = 6
 *   ocean:       lon [10, 20]   → 20 buckets, lat [-60, -50] → 20 buckets → 20×20 = 400
 *   coastal:     lon [-0.5, 2.5] → 6 buckets, lat [49.5, 51.0] → 3 buckets → 6×3 = 18
 *   urban:       lon [139, 141] → 4 buckets, lat [35, 35.5] → 1 bucket  → 4×1 = 4
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

### 3. `scripts/p0-discover-fixtures.js`

Discovery script that loads real data, runs `processViewport()` for each scenario, and writes JSON output to `data/cache/p0-discovery/`.

```js
/**
 * P0C Discovery Script — dumps processViewport() output for human review.
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
        console.log(`[${scenario.label}] → ${outPath}`);

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

1. Create `server/__tests__/helpers/golden-compare.js`.
2. Create `server/__tests__/helpers/golden-viewports.js` (with empty `expectedResponse: {}`).
3. Create `scripts/p0-discover-fixtures.js`.
4. Run `npm test` — existing tests still green (no new tests yet).
5. Run `node scripts/p0-discover-fixtures.js` — produces 4 JSON files in `data/cache/p0-discovery/`.
6. Print a summary of each JSON file for human review.

## Self-Check

```bash
npm test
```
**Expected:** 10 suites, 113 tests, all green (no new tests added in this step).

```bash
node scripts/p0-discover-fixtures.js
```
**Expected:** 4 JSON files created in `data/cache/p0-discovery/`:
- `land-heavy-amazon.json`
- `ocean-south-atlantic.json`
- `coastal-english-channel.json`
- `urban-tokyo.json`

**Verify files exist:**
```bash
ls data/cache/p0-discovery/*.json | wc -l
# Expected: 4
```

## Exit — HUMAN REVIEW GATE

**STOP HERE.** Do not proceed to P0D until the human has reviewed the discovery output.

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
- [ ] Ocean scenario: `oceanLevel` = 1.0 (prox=0 → pure ocean), `dominantLandcover` = 80
- [ ] Land-heavy: `oceanLevel` = 0.0 (zoom 8 → prox=1.0, high coverage)
- [ ] Coastal: `oceanLevel` follows three-level logic based on prox and coverage
- [ ] `mode` = 'aggregated' for all scenarios (default threshold = 50; ocean/land-heavy/coastal expected gridCount patterns)
- [ ] `landcoverDistribution` has no key `80` for non-ocean scenarios (Water excluded by `getCellLcDistribution`)
- [ ] Ocean scenario `landcoverDistribution` = `{ "80": 1 }` (from `emptyStats()`)

After human confirmation, the agent copies the verified values into `golden-viewports.js` `expectedResponse` fields — only the subset of fields that the human confirmed. This becomes the frozen golden baseline for P0D.

Report: "P0C complete. 4 discovery JSONs generated. Awaiting human review before freezing fixtures."
