# P0A — Helper Extraction

**Prerequisite:** None (first step)
**Trace:** Milestone 3 Phase 0 — Compatibility Guardrails

## Context

Extract duplicated test utilities into shared helper files under `server/__tests__/helpers/`. This is pure refactoring — no production code changes, no new tests. All 113 existing tests must remain green afterward.

## Helpers to Extract

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

## Steps

1. Create directory `server/__tests__/helpers/` (if it doesn't exist).
2. Create `server/__tests__/helpers/make-cell.js` with the factory function.
3. Create `server/__tests__/helpers/close-server.js` with the close helpers.
4. Update `spatial-coverage.test.js`: replace inline `makeCell` with `require('./helpers/make-cell')`.
5. Update `spatial-landcover.test.js`: replace inline `makeCell` with `require('./helpers/make-cell')`.
6. Update `index.startup.test.js`: replace inline `closeHttpServer`/`closeWsServer` with `require('./helpers/close-server')`.
7. Run `npm test`.

## Self-Check

```bash
npm test
```

**Expected outcome:** 10 test suites, 113 tests, all passing. Zero new tests, zero deleted tests — only moved code.

**Verify no leftover inline copies:**
```bash
grep -n "function makeCell" server/__tests__/spatial-coverage.test.js server/__tests__/spatial-landcover.test.js
# Expected: no matches

grep -n "function closeHttpServer\|function closeWsServer" server/__tests__/index.startup.test.js
# Expected: no matches
```

## Exit

Report: "P0A complete. `npm test`: 10 suites, 113/113 green. Helpers extracted: `make-cell.js`, `close-server.js`."
