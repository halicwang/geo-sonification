# 2026-02-23 — Fix: Coverage 0–40 Linear Land/Ocean Mapping

Adjusted land/ocean loudness mixing to a single linear mapping over coverage `0% → 40%`. The previous threshold-centered behavior was replaced so that mixing is continuous and easier to reason about: `0%` coverage is pure ocean, `40%` coverage is pure land, and intermediate values interpolate linearly.

## Changes

- **`frontend/audio-engine.js`**: replaced threshold+fade coverage logic with linear mapping: `landMix = clamp(coverage / 0.4)`, `oceanMix = 1 - landMix`.
- **`server/audio-metrics.js`**: aligned `computeOceanLevel()` to the same linear rule: `oceanLevel = clamp(1 - coverage / 0.4)`.
- **`server/__tests__/audio-metrics-bus.test.js`**: updated ocean-level expectations for linear 0–40 mapping.
- **`server/__tests__/fixtures/golden-viewport-coastal.json`** and **`server/__tests__/fixtures/golden-viewport-urban.json`**: updated fixture `audioParams.oceanLevel` values to match the new mapping.
- **`README.md`**: updated sound-mapping documentation to describe linear 0–40 behavior.

## Verification

- `node --check frontend/audio-engine.js`
- `node --check server/audio-metrics.js`
- `npm --prefix server test -- audio-metrics-bus.test.js golden-baseline.test.js`
- `npm test`

## Files changed

- **Modified**: `frontend/audio-engine.js` — coverage mix now linear from 0% to 40%
- **Modified**: `server/audio-metrics.js` — ocean level now linear inverse of coverage/0.4
- **Modified**: `server/__tests__/audio-metrics-bus.test.js` — updated computeOceanLevel tests
- **Modified**: `server/__tests__/fixtures/golden-viewport-coastal.json` — updated coastal fixture ocean level
- **Modified**: `server/__tests__/fixtures/golden-viewport-urban.json` — updated urban fixture ocean level
- **Modified**: `README.md` — updated mapping description
- **Modified**: `docs/DEVLOG.md` — added entry link
