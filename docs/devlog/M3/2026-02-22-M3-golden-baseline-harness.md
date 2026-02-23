# 2026-02-22 — Feature: Golden Baseline Harness (P0-A)

Implemented the P0-A golden regression harness that locks current WorldCover demo behavior before M3 refactoring begins. Four canonical viewport scenarios (dense land, open ocean, coastal mixed, dense urban) are tested against golden fixture files with float-tolerant recursive comparison. An environment pinning guard locks 7 config constants to detect drift that would invalidate fixtures.

## Evidence

- **EVID-P0-001**: Golden payload fixture set committed in `server/__tests__/fixtures/golden-*.json`.
- **EVID-P0-002**: Tests run as part of `npm test`, enforced by existing CI gate (`.github/workflows/ci.yml`).

## Design Decisions

- **Module-level tests via `processViewport()`** with synthetic grid data injected through `spatial.init()` — no HTTP server needed, no `normalizeValues` mocking. Tests the full computation pipeline: spatial query, normalization, hysteresis, audio fold-mapping.
- **Separate JSON fixture files** instead of Jest snapshots — prevents accidental `jest -u` from silently accepting regressions. Fixture edits require deliberate, reviewable changes.
- **Custom `expectDeepCloseTo` helper** — recursive float-tolerant comparison (precision=5) avoids verbose field-by-field assertions across the deeply nested stats object.
- **Jest `testPathIgnorePatterns`** added to `server/package.json` to exclude `helpers/` and `fixtures/` from test discovery.
- **Shared `makeCell` helper** — extracted from 4 duplicate inline definitions into `server/__tests__/helpers/make-cell.js`. All test files that build synthetic cell data import from this single source of truth.
- **Environment pinning guard** — 7 config constants (`GRID_SIZE`, `PROXIMITY_ZOOM_LOW/HIGH`, `PER_GRID_THRESHOLD_ENTER/EXIT`, `USE_LEGACY_AGGREGATION`, `BROADCAST_STATS`) are asserted at the top of the golden baseline suite. A config change that invalidates fixtures will fail here first with a clear message.

## Scenarios

| Scenario | Cells | Key assertions |
|----------|-------|----------------|
| Dense forest | 4 cells, tree-dominant continuous LC | Full distribution, 3 metric norms, 5 bus targets, proximity=1, oceanLevel=0 |
| Open ocean | No cells in query bounds | emptyStats path, dominantLandcover=80, water bus=1, oceanLevel=1 |
| Coastal mixed | 1 full-land + 1 partial-land cell | Mixed distribution, partial coverage, cropland-dominant |
| Dense urban | 3 cells, lc_pct_50 55–60% | dominantLandcover=50, urban bus dominant, high nightlight/population norms |

## 14-Channel Manifest Locked

- 11 distribution channels: tree, shrub, grass, crop, urban, bare, snow, water, wetland, mangrove, moss
- 3 metric channels: nightlightNorm, populationNorm, forestNorm
- Derived proximity control signal (0–1)

## Files changed

- NEW: `server/__tests__/golden-baseline.test.js` — P0-A golden regression tests (25 test cases)
- NEW: `server/__tests__/helpers/deep-close-to.js` — recursive float-tolerant comparison helper
- NEW: `server/__tests__/helpers/make-cell.js` — shared synthetic cell factory
- NEW: `server/__tests__/fixtures/golden-config.json` — `/api/config` golden fixture
- NEW: `server/__tests__/fixtures/golden-viewport-land.json` — land scenario fixture
- NEW: `server/__tests__/fixtures/golden-viewport-ocean.json` — ocean scenario fixture
- NEW: `server/__tests__/fixtures/golden-viewport-coastal.json` — coastal scenario fixture
- NEW: `server/__tests__/fixtures/golden-viewport-urban.json` — urban scenario fixture
- MOD: `server/index.js` — extracted `attachWsHandler(wss)` from `startServer()` for testability; added `_setDataLoaded(value)` test-only setter; both exported
- MOD: `server/__tests__/helpers/golden-viewports.js` — added URBAN_CELLS, import shared makeCell
- MOD: `server/__tests__/spatial-coverage.test.js` — import shared makeCell
- MOD: `server/__tests__/spatial-landcover.test.js` — import shared makeCell
- MOD: `server/package.json` — added Jest `testPathIgnorePatterns`
- MOD: `docs/DEVLOG.md` — added entry link
