# 2026-02-19 — Milestone: Server-Side Foundation

## Scope completed

- Task 6: sample directory structure under `sonification/samples/`
- Task 2: new `/proximity` OSC message
- Task 1: new `/delta/*` OSC messages and per-client delta state
- Task 3: standalone `scripts/osc_simulator.js`

## Key architecture decisions

1. **Global ordering update (insert-only)**:
    - `/mode` -> `/proximity` -> `/delta/*` -> existing messages
    - Existing aggregated payload ordering remains unchanged.
    - Existing per-grid payload logic remains unchanged.
2. **Client-state separation preserved**:
    - Existing mode hysteresis state remains in `mode-manager.js` (no behavior change).
    - Delta state is managed independently in `delta-state.js`.
3. **Delta keying strategy**:
    - WebSocket: per-connection state
    - HTTP: `clientId` from request body first, fallback to IP
    - HTTP delta state uses 5-minute TTL cleanup
4. **Schema single source of truth**:
    - `server/osc_schema.js` centralizes OSC addresses, class order, canonical sequence, and packet builders
    - Both `server/osc.js` and `scripts/osc_simulator.js` import this schema

## New config knobs

- `PROXIMITY_ZOOM_LOW` / `PROXIMITY_ZOOM_HIGH` (originally `PROXIMITY_LOWER` / `PROXIMITY_UPPER` with grid-count mapping; later switched to zoom-level mapping — see 2026-02-20 entry)
- `DT_MIN_MS` / `DT_MAX_MS`
- `DELTA_RATE_CEILING`

All added to `server/config.js` with validation and documented in `.env.example`.

## Formula notes (implemented)

- `proximity` from zoom level (updated 2026-02-20, originally grid-count based):
    - `zoom <= PROXIMITY_ZOOM_LOW` -> `0` (distant/ocean)
    - `zoom >= PROXIMITY_ZOOM_HIGH` -> `1` (zoomed in)
    - linear interpolation in between
- `delta`:
    - `magnitude = clamp(0.5 * sum(abs(current_i - prev_i)), 0, 1)`
    - `dt` clamped to `[DT_MIN_MS, DT_MAX_MS]`
    - `rate = clamp((magnitude / (dt/1000)) / DELTA_RATE_CEILING, 0, 1)`
    - First frame emits all-zero deltas

## Simulator behavior

- Supports:
    - `static-forest`
    - `static-mixed`
    - `gradual-transition`
    - `abrupt-switch`
    - `zoom-sweep`
    - `world-tour`
- CLI:
    - `node scripts/osc_simulator.js <scenario>`
    - No args + TTY -> interactive selection
    - No args + non-TTY -> print usage and exit
- Graceful shutdown on Ctrl+C

## Validation and regression coverage

- Expanded OSC unit tests:
    - `/proximity` send + clamp
    - `/delta` send + canonical addresses
- Added schema tests:
    - class order, address ordering, canonical sequence
- Added pure metrics tests:
    - proximity edge/linear mapping
    - delta magnitude/rate formulas and dt clamping
- Added delta-state tests:
    - clientId-first key derivation and state persistence
