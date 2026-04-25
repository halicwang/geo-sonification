# 2026-04-25 — Refactor: Tighten Viewport Debounce 200 → 120 ms

Drop `VIEWPORT_DEBOUNCE` from 200 ms to 120 ms (`frontend/config.js`).
The hybrid leading+trailing throttle in `frontend/map.js`
`onViewportChange` uses this constant for both ends, so the change
cuts drag-stop feedback latency by 80 ms and raises the per-drag
message rate from ~5 Hz to ~8 Hz.

## Why now

Drag-stop feedback latency on the grid overlay is the sum of debounce
+ WS RTT (~50–100 ms in practice) + server compute (~1–2 ms). The
debounce was the largest stationary term and the cheapest one to
trim. The server's `_statsCounter` instrumentation
(`server/index.js:80-89`) shows avg compute well under 2 ms, so the
new 8 Hz upper bound is far inside the envelope — `WS_MAX_BUFFERED =
64 KB` backpressure won't fire under any plausible solo-client drag.

This is paired with the gzip/perMessageDeflate stage
(`docs/devlog/M3/2026-04-25-M3-server-response-compression.md`); the
two together cut the user-perceived feedback loop by ~110 ms (80 ms
debounce + ~30 ms wire from smaller payloads).

## Why not lower

Below ~80 ms the leading-fire window starts to land repeated viewport
updates inside a single ws frame's deflate context, and concurrent
clients (BROADCAST_STATS=1 mode) can push `bufferedAmount` toward
the 64 KB skip threshold. 120 ms is the sweet spot — clearly under
"perceptible lag" while keeping a generous buffer over the backpressure
edge case.

## Changes

**`frontend/config.js`:**
- `VIEWPORT_DEBOUNCE` 200 → 120.
- JSDoc updated to document the upper-bound rationale and the 80 ms
  floor below which backpressure becomes a real risk.

## Verification

- `npm run lint`, `npm run format:check`, `npm test --prefix server`
  all green.
- Manual: open `http://localhost:3000`, drag the map. Stop dragging —
  the info-panel stats and audio bus targets settle visibly faster.
- `[Stats] N viewport updates in 30s, avg X ms` in server log: N rises
  proportionally during drags, avg ms stays unchanged (the spatial
  index doesn't care about call frequency).

## Files changed

- `frontend/config.js` — `VIEWPORT_DEBOUNCE` 200 → 120 with rationale
  comment.
- `docs/DEVLOG.md` — index entry for this devlog.
