# 2026-02-23 — Fix: Low-Pass Floor and Ocean Boost Logic Tuning

Adjusted distant-view audio behavior to reduce uncomfortable low-frequency rumble and remove forced ocean boosting when proximity is zero. The low-pass floor was raised so distant mode keeps more mid/upper content, and the filter slope was increased for stronger high-frequency roll-off. Ocean level now only uses the coastal gate instead of a hard `proximity<=0` branch.

## Changes

- **`frontend/audio-engine.js`**: raised low-pass minimum cutoff from `100Hz` to `500Hz` (`proximity: 0→500Hz, 1→20kHz`) and changed the low-pass chain from 2 cascaded biquads (`24 dB/oct`) to 3 cascaded biquads (`36 dB/oct`).
- **`server/audio-metrics.js`**: removed the `proximity<=0 => oceanLevel=1.0` rule; ocean level now returns `0.7` only for coastal condition (`coverage < 0.1 && proximity > 0.7`), otherwise `0.0`.
- **`server/__tests__/audio-metrics-bus.test.js`**: updated ocean-level expectations for `proximity=0`, NaN proximity, and undefined inputs.
- **`server/__tests__/golden-baseline.test.js`**: updated pure-ocean viewport expectation from `oceanLevel=1.0` to `0.0`.
- **`server/__tests__/fixtures/golden-viewport-ocean.json`**: aligned fixture `audioParams.oceanLevel` to `0`.

## Verification

- `node --check frontend/audio-engine.js`
- `node --check server/audio-metrics.js`
- `npm --prefix server test -- audio-metrics-bus.test.js golden-baseline.test.js`
- `npm test`

## Files changed

- **Modified**: `frontend/audio-engine.js` — low-pass floor raised to `500Hz` and slope increased to `36 dB/oct`
- **Modified**: `server/audio-metrics.js` — removed forced ocean branch at low proximity
- **Modified**: `server/__tests__/audio-metrics-bus.test.js` — updated computeOceanLevel assertions
- **Modified**: `server/__tests__/golden-baseline.test.js` — updated ocean-level assertion
- **Modified**: `server/__tests__/fixtures/golden-viewport-ocean.json` — fixture expectation updated
- **Modified**: `docs/DEVLOG.md` — added entry link
