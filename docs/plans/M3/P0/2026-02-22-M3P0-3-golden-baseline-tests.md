# P0-3 — Golden Baseline Tests

**Prerequisite:** P0-2 complete + human-reviewed fixtures frozen in `golden-viewports.js`
**Trace:** Milestone 3 Phase 0 — Compatibility Guardrails
**Covers original:** Packet P0-A (Migration Plan P0) — golden regression gate
**EVID coverage:** EVID-P0-001 (golden payload fixture set)

## Context

Create the golden baseline test suite that locks current `processViewport()` behavior. This is the core deliverable of P0 — any future refactoring that changes output values will break these tests, signaling a regression.

The tests use a `jest.mock('../normalize')` approach to replace `normalizeValues` with a controlled mock. Each scenario gets fresh `modeState` and `deltaState`. The `expectCloseDeep` helper does subset matching so tests only assert fields present in `expectedResponse`.

## Environment Pinning

Before any scenario runs, a guard suite asserts that configuration constants match the values used when fixtures were generated. If any of these change, all golden tests become invalid.

**Pinned values:**
| Constant | Expected | Source |
|----------|----------|--------|
| `GRID_SIZE` | `0.5` | `config.js` |
| `PROXIMITY_ZOOM_LOW` | `4` | `config.js` |
| `PROXIMITY_ZOOM_HIGH` | `6` | `config.js` |
| `PER_GRID_THRESHOLD_ENTER` | `50` | `config.js` |
| `PER_GRID_THRESHOLD_EXIT` | `50` | `config.js` |
| `USE_LEGACY_AGGREGATION` | `false` | `config.js` |
| `BROADCAST_STATS` | `false` | `config.js` |

## Channel Manifest Guard

Per Spec Appendix B, P0 must lock the WorldCover baseline channel set. Add an explicit assertion that the 11 distribution landcover classes and 5-bus audio fold are present:

- **11 distribution classes** (from `LANDCOVER_META` or equivalent): tree, shrub, grass, crop, urban, bare, snow, water, wetland, mangrove, moss.
- **5 audio buses**: verify `audioParams.busTargets` has length 5.
- **Control signals**: verify `audioParams` includes `oceanLevel` and `proximity`.

This catches silent channel removal that might not be detected by golden fixture comparison alone.

## File to Create

### `server/__tests__/golden-baseline.test.js`

```js
/**
 * Golden baseline tests — locks processViewport() output against
 * human-verified fixtures from P0-2 discovery.
 *
 * Mocking strategy:
 *   - normalizeValues is mocked to return deterministic values.
 *   - spatial.init() is called with real-ish cell data per scenario.
 *   - Each scenario gets fresh modeState + deltaState.
 *
 * IMPORTANT: These tests use real CSV data loaded via data-loader.
 * They require data/raw/ to be present.
 */

jest.mock('../normalize', () => ({
    normalizeValues: jest.fn(() => ({
        nightlightNorm: 0,
        populationNorm: 0,
        forestNorm: 0,
    })),
}));

const { normalizeValues } = require('../normalize');
const { loadGridData } = require('../data-loader');
const spatial = require('../spatial');
const { processViewport } = require('../viewport-processor');
const { createModeState } = require('../mode-manager');
const { createDeltaState } = require('../delta-state');
const { GOLDEN_VIEWPORTS } = require('./helpers/golden-viewports');
const { expectCloseDeep } = require('./helpers/golden-compare');

// Environment pins
const {
    GRID_SIZE,
    PROXIMITY_ZOOM_LOW,
    PROXIMITY_ZOOM_HIGH,
    PER_GRID_THRESHOLD_ENTER,
    PER_GRID_THRESHOLD_EXIT,
    USE_LEGACY_AGGREGATION,
    BROADCAST_STATS,
} = require('../config');

describe('environment guard', () => {
    test('config constants match fixture generation values', () => {
        expect(GRID_SIZE).toBe(0.5);
        expect(PROXIMITY_ZOOM_LOW).toBe(4);
        expect(PROXIMITY_ZOOM_HIGH).toBe(6);
        expect(PER_GRID_THRESHOLD_ENTER).toBe(50);
        expect(PER_GRID_THRESHOLD_EXIT).toBe(50);
        expect(USE_LEGACY_AGGREGATION).toBe(false);
        expect(BROADCAST_STATS).toBe(false);
    });
});

// Load real data once for all scenarios.
// spatial.init() depends on normalizeParams from data-loader.
beforeAll(async () => {
    const { gridData, normalizeParams } = await loadGridData();
    spatial.init(gridData, normalizeParams);
}, 30000);

afterEach(() => {
    normalizeValues.mockReset();
    normalizeValues.mockReturnValue({
        nightlightNorm: 0,
        populationNorm: 0,
        forestNorm: 0,
    });
});

describe('channel manifest guard (Spec Appendix B)', () => {
    test('land-heavy scenario produces expected audio structure', () => {
        const modeState = createModeState();
        const deltaState = createDeltaState();
        const result = processViewport([-65, -5, -62, -4.5], modeState, deltaState, 8);

        expect(result.error).toBeUndefined();

        // 5-bus audio fold (Spec Appendix B: nature, urban, crop, water, ocean)
        expect(result.stats.audioParams.busTargets).toHaveLength(5);

        // Control signals present
        expect(result.stats.audioParams).toHaveProperty('oceanLevel');
        expect(result.stats.audioParams).toHaveProperty('proximity');

        // landcoverDistribution keys are ESA class IDs (numeric strings)
        // Land-heavy scenario must have distribution entries
        expect(Object.keys(result.stats.landcoverDistribution).length).toBeGreaterThan(0);
    });
});

describe('golden baseline: processViewport', () => {
    for (const scenario of GOLDEN_VIEWPORTS) {
        // Skip scenarios with empty expectedResponse (not yet frozen)
        if (Object.keys(scenario.expectedResponse).length === 0) {
            test.skip(`${scenario.label} (expectedResponse empty)`, () => {});
            continue;
        }

        test(scenario.label, () => {
            const modeState = createModeState();
            const deltaState = createDeltaState();
            const result = processViewport(
                scenario.bounds,
                modeState,
                deltaState,
                scenario.zoom
            );

            expect(result.error).toBeUndefined();
            expectCloseDeep(result.stats, scenario.expectedResponse);
        });
    }
});
```

**Notes:**
- `beforeAll` loads real CSV data with a 30s timeout (data-loader reads from `data/raw/`).
- The `normalizeValues` mock returns deterministic zeros. `afterEach` resets + restores the mock to survive between tests.
- Scenarios with empty `expectedResponse` are auto-skipped so the suite doesn't fail before P0-2 review is done.
- `expectCloseDeep` only checks keys in `expectedResponse` — the test won't break if processViewport adds new fields in P1+.
- The `channel manifest guard` explicitly locks the audio structure shape (5 buses, control signals) per Spec Appendix B.

## Alternative: Synthetic Data Approach

If loading real CSV data in tests is too slow or fragile, an alternative approach uses synthetic cells via `makeCell()` + `spatial.init()`. This avoids the data-loader dependency but requires manually constructing cells that match each scenario's geographic region.

The real-data approach is preferred for P0 because:
1. It catches regressions in the full pipeline (data-loader -> spatial -> viewport-processor -> audio-metrics).
2. Fixture values were generated from the same real data during P0-2 discovery.

## Steps

1. Verify `golden-viewports.js` has non-empty `expectedResponse` for all 4 scenarios (from P0-2 human review).
2. Create `server/__tests__/golden-baseline.test.js`.
3. Run `npm test`.

## Self-Check

```bash
npm test
```

**Expected:** 11 suites (10 existing + 1 new), all green. The golden baseline suite should have:
- 1 environment guard test
- 1 channel manifest guard test
- 4 scenario tests (or fewer if some `expectedResponse` are still empty -> skipped)

**Verify golden tests specifically:**
```bash
npx jest golden-baseline --verbose
```

## Exit

Report: "P0-3 complete. `npm test`: 11 suites, N tests green (N = 113 + environment guard + channel manifest guard + scenario count). Golden baseline locked."
