# P0D — Golden Baseline Tests

**Prerequisite:** P0C complete + human-reviewed fixtures frozen in `golden-viewports.js`
**Trace:** Milestone 3 Phase 0 — Compatibility Guardrails

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

## File to Create

### `server/__tests__/golden-baseline.test.js`

```js
/**
 * Golden baseline tests — locks processViewport() output against
 * human-verified fixtures from P0C discovery.
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
- Scenarios with empty `expectedResponse` are auto-skipped so the suite doesn't fail before P0C review is done.
- `expectCloseDeep` only checks keys in `expectedResponse` — the test won't break if processViewport adds new fields in P1+.

## Alternative: Synthetic Data Approach

If loading real CSV data in tests is too slow or fragile, an alternative approach uses synthetic cells via `makeCell()` + `spatial.init()`. This avoids the data-loader dependency but requires manually constructing cells that match each scenario's geographic region.

The real-data approach is preferred for P0 because:
1. It catches regressions in the full pipeline (data-loader → spatial → viewport-processor → audio-metrics).
2. Fixture values were generated from the same real data during P0C discovery.

## Steps

1. Verify `golden-viewports.js` has non-empty `expectedResponse` for all 4 scenarios (from P0C human review).
2. Create `server/__tests__/golden-baseline.test.js`.
3. Run `npm test`.

## Self-Check

```bash
npm test
```

**Expected:** 11 suites (10 existing + 1 new), all green. The golden baseline suite should have:
- 1 environment guard test
- 4 scenario tests (or fewer if some `expectedResponse` are still empty → skipped)

**Verify golden tests specifically:**
```bash
npx jest golden-baseline --verbose
```

## Exit

Report: "P0D complete. `npm test`: 11 suites, N tests green (N = 113 + environment guard + scenario count). Golden baseline locked."
