# 2026-02-23 — Fix: Grid-Coverage Land/Ocean Mix Rule

Implemented a coverage-driven mix rule based on viewport grid coverage (`coverage`). When coverage is 0%, playback is pure ocean; when coverage is between 0% and 20%, land/ocean mix follows coverage dynamically (`land=coverage`, `ocean=1-coverage`); above 20%, a short fade band is applied and reaches pure land at 22% to avoid abrupt threshold jumps. This matches the desired "grid-percentage" behavior while keeping transitions smooth.

## Changes

- **`frontend/audio-engine.js`**: Added coverage-driven piecewise mix weights (`coverage=0` => land `0`, ocean `1`; `0<coverage<0.2` => land `coverage`, ocean `1-coverage`; above `0.2`, smooth fade to land-only by `0.22`).
- **`frontend/audio-engine.js`**: Added EMA state for `coverage` and applied the rule to all land buses plus Water bus ocean flooring.
- **`server/audio-metrics.js`**: Updated `computeOceanLevel()` to a coverage-threshold rule with fade (`<0.2` => `1-coverage`, then smooth fade to `0` by `0.22`), independent of proximity.
- **`server/__tests__/audio-metrics-bus.test.js`**: Rewrote ocean-level expectations for the new threshold semantics.
- **`server/__tests__/fixtures/golden-viewport-ocean.json`** and **`server/__tests__/golden-baseline.test.js`**: Updated pure-ocean fixture/assertion to `oceanLevel=1.0`.
- **`README.md`**: Updated sound-mapping description to document the dynamic 0–20% coverage mix rule and 20% threshold.

## Verification

- `node --check frontend/audio-engine.js`
- `node --check server/audio-metrics.js`
- `npm --prefix server test -- audio-metrics-bus.test.js golden-baseline.test.js`
- `npm test`

## Files changed

- **Modified**: `frontend/audio-engine.js` — coverage-threshold land/ocean mix in gain application path
- **Modified**: `server/audio-metrics.js` — ocean level now driven by coverage threshold only
- **Modified**: `server/__tests__/audio-metrics-bus.test.js` — updated computeOceanLevel tests
- **Modified**: `server/__tests__/fixtures/golden-viewport-ocean.json` — ocean fixture level updated
- **Modified**: `server/__tests__/golden-baseline.test.js` — baseline assertion updated
- **Modified**: `README.md` — sound mapping docs updated for coverage-threshold rule
- **Modified**: `docs/DEVLOG.md` — added entry link
