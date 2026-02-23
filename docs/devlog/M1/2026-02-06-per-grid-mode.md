# 2026-02-06 — Feature: Per-Grid Mode: Design & Initial Implementation

See `docs/devlog/2026-02-06-per-grid-design-rationale.md` for full design rationale.

**Core idea**: When the user zooms in far enough (≤50 grid cells visible), switch from aggregated (1 blended sound) to per-grid mode (N independent voices, spatially distributed). Threshold uses hysteresis (enter at 50, exit at 50) to avoid oscillation.

**Server changes** (`server/osc.js`, `server/index.js`):

- New `sendGridsToMax()` — sends `/grid/count`, `/viewport`, then N × `/grid` (lon, lat, lc, nl, pop, forest)
- New `processViewport()` shared helper — handles hysteresis-based mode switching for both WebSocket and HTTP clients
- Per-client mode state tracked separately (WS: per-connection, HTTP: per-IP with 5-min TTL expiry)
- `normalizeOscValues()` extracted to standalone `normalize.js` for reuse in both modes

**Max patch** (`sonification/max_wav_osc.maxpat`):

- Added `route /grid/count /grid /viewport` branch on per-grid `udpreceive`
- `print` objects for data verification (sound design deferred)
