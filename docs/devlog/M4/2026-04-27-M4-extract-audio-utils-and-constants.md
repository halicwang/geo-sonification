# 2026-04-27 — Refactor: Extract `frontend/audio/utils.js` and `frontend/audio/constants.js`

Pure code move from the head of `frontend/audio-engine.js` into two
new modules under `frontend/audio/`. This is M4 P0-3 — the first stage
that actually starts decomposing the 1186-line audio-engine module.
Zero audible behavior change; all numeric constants and helper outputs
are byte-identical to their pre-refactor values.

## Why now

P0-3 has no dependencies beyond P0-1 (the vitest scaffold). It seeds
the `frontend/audio/` directory that P3 will fill out — once `utils`
and `constants` exist as importable modules, the next P3 stages
(`audio/context.js`, `audio/buffer-cache.js`, `audio/raf-loop.js`,
etc.) all consume them. Doing this extraction before P3 is the
cheapest possible way to delete dead-weight from `audio-engine.js`
without touching any actual audio routing or scheduling logic.

## What moved

### `frontend/audio/utils.js` (new, 77 lines)

Four pure functions, all exercised at 100% coverage by the new
`frontend/__tests__/audio/utils.test.js`:

- `clamp01(v)` — verbatim move of the existing helper at
  `audio-engine.js:288`. `[0,1]` clamp; non-finite → 0.
- `lerp(a, b, t)` — new, seeded for P3-3's EMA driver. Currently
  unused in production code; covered by tests.
- `dbToLinear(db)` — extracts the `Math.pow(10, x / 20)` expression
  that previously appeared inline at `audio-engine.js:957` (the
  `MAKEUP_GAIN_DB → linear` conversion for the master makeup gain
  node). The single call site now reads `dbToLinear(MAKEUP_GAIN_DB)`.
- `equalPowerCurves(points)` — extracts the inline `for (let i…)`
  loop that previously built `FADE_IN_CURVE` and `FADE_OUT_CURVE` at
  module-top-level. `audio-engine.js` now destructures the two
  Float32Arrays from `equalPowerCurves(XF_CURVE_POINTS)`. Same
  shape, same values.

`lerp` is included now because the proposal §4 P0-3 lists it as a
deliverable; it would otherwise have been added by P3-3. Adding it
here keeps the future P3-3 diff strictly scoped to the rAF loop.

### `frontend/audio/constants.js` (new, 90 lines)

Eighteen exports, grouped per the proposal:

- **12 timing constants** — `SMOOTHING_TIME_MS`,
  `PROXIMITY_SMOOTHING_MS`, `SNAP_THRESHOLD_MS`,
  `VELOCITY_ATTACK_MS`, `VELOCITY_DECAY_MS`, `LOOP_OVERLAP_SECONDS`,
  `LOOP_START_LOOKAHEAD_SECONDS`, `LOOP_TIMER_LOOKAHEAD_SECONDS`,
  `VOICE_STOP_GRACE_SECONDS`, `LATE_SWAP_LOOKAHEAD_SECONDS`,
  `RECOVERY_FADE_SECONDS`, `SWAP_LATE_WARN_SECONDS`.
- **`BUS_PREAMP_GAIN`** — the 7-element per-bus preamp table; now
  `Object.freeze`'d to make the immutability explicit (was a bare
  array at module scope before, which JavaScript happily mutates).
- **5 limiter knobs** — `LIMITER_THRESHOLD_DB`, `LIMITER_RATIO`,
  `LIMITER_ATTACK_SEC`, `LIMITER_RELEASE_SEC`, `LIMITER_KNEE_DB`.

Other constants stay in `audio-engine.js` for now and will move when
their consumer modules land:

- `NUM_BUSES` / `BUS_NAMES` / `WATER_BUS_INDEX` /
  `LAND_FULL_COVERAGE_THRESHOLD` — bus topology, owned by P3 bus
  module.
- `BASE_Q1` / `MAX_Q1` — filter Q range; owned by P3 context module.
- `XF_CURVE_POINTS` — the curve resolution number; passed as a
  parameter into `equalPowerCurves()` from `audio-engine.js`.
- `GAIN_CURVE_EXPONENT` — gain shaping; owned by P3 raf-loop.
- `PRIORITY_FIRST` / `PRIORITY_SECOND` — loading order; owned by P3
  buffer-cache.
- `MAKEUP_GAIN_DB` — owned by P3 context (limiter/master setup).
- `DUCK_DEPTH` / `DUCK_ATTACK_TC` / `DUCK_RELEASE_TC` — ducking
  config; owned by the announcer-bus path.

## Numeric verification

Browser eval against the running dev server confirms identical
behavior:

- `dbToLinear(12) === Math.pow(10, 12 / 20)` → exact equality
  (3.9810717055349722).
- `equalPowerCurves(128)` produces a 128-sample Float32Array pair
  with `fadeIn[0] = 0`, `fadeIn[127] = 1`, `fadeOut[0] = 1`,
  `fadeOut[127] ≈ 6e-17` (float epsilon at cos(π/2)).
- `clamp01(-0.5) = 0`, `clamp01(2) = 1`.
- All 12 timing constants are present and typed `number`.
- `BUS_PREAMP_GAIN[4] === 0.316` (urban bus preamp).
- `audio-engine.js` engine surface (`start`, `stop`, `update`,
  `duck`, `unduck`, `setVolume`, `getVolume`, `isRunning`,
  `seekLoop`, `getLoopProgress`, `getLoadingStates`,
  `setOnLoadingUpdate`, `getContext`, `updateMotion`) unchanged.

## What changed

- **Added**: `frontend/audio/utils.js` — `clamp01`, `lerp`,
  `dbToLinear`, `equalPowerCurves`. JSDoc-typed.
- **Added**: `frontend/audio/constants.js` — 18 exports listed above.
- **Added**: `frontend/__tests__/audio/utils.test.js` — 13 tests
  hitting 100% statements/branches/functions/lines on `utils.js`.
- **Modified**: `frontend/audio-engine.js` — replaces 110 lines of
  declarations / inline fade-curve loop / inline `Math.pow` with two
  named imports and a `dbToLinear()` call site. File length 1186 → 1124
  (−62 net; the proposal's earlier estimate of −145 didn't account
  for the import block needed to consume the extracted symbols, but
  the line goal will continue to drop in P3 as more of the module
  moves out).
- **Modified**: `.gitignore` — add `coverage/` (vitest's v8 reporter
  produces an HTML report directory; not source-of-record).
- **Modified**: `.prettierignore` — match.
- **Modified**: `eslint.config.js` — add `coverage/` and `dist/` to
  the global ignores block.
- **Added**: `docs/devlog/M4/2026-04-27-M4-extract-audio-utils-and-constants.md` —
  this entry.
- **Modified**: `docs/DEVLOG.md` — index this entry.

## Verification

- `npm run test:frontend -- --coverage` — 17 tests pass; coverage on
  `frontend/audio/utils.js`: 100% / 100% / 100% / 100%.
- `npm test` — 153 jest tests still green.
- `npm run smoke:wire-format` — passes (45 field names verified;
  audio refactor doesn't touch the WS protocol).
- `npm run lint` / `npm run format:check` — green after `coverage/`
  added to ignore lists.
- Local `npm run dev` smoke at `http://localhost:3000`: page loads,
  Mapbox dot overlay renders, info panel shows
  Zoom 4 / 1581 grids / Aggregated. WebSocket connects. Audio engine
  module exports unchanged; numeric verification above run via DevTools
  eval.

## Risks and rollback

- **`Object.freeze` on `BUS_PREAMP_GAIN`** is a behavior delta in the
  tightest sense: any code that tried to mutate the array would now
  throw in strict mode. No code currently mutates it; this is a
  deliberate hardening. If a future P3 stage needs a runtime-tunable
  preamp curve it'll need to copy the frozen array first.
- **`equalPowerCurves` allocates two Float32Arrays per call** vs the
  inline loop. `audio-engine.js` calls it exactly once (at module
  load), so the per-call allocation cost is unchanged.
- **Rollback**: revert this commit on `feat/M4`. No downstream stage
  has consumed the new modules yet; rollback is non-cascading.

## Files changed

- **Added**: `frontend/audio/utils.js`
- **Added**: `frontend/audio/constants.js`
- **Added**: `frontend/__tests__/audio/utils.test.js`
- **Added**: `docs/devlog/M4/2026-04-27-M4-extract-audio-utils-and-constants.md` —
  this entry.
- **Modified**: `frontend/audio-engine.js` — replace inlined
  declarations with imports; switch to `equalPowerCurves()` and
  `dbToLinear()`.
- **Modified**: `.gitignore` — add `coverage/`.
- **Modified**: `.prettierignore` — add `coverage/`.
- **Modified**: `eslint.config.js` — add `coverage/` and `dist/` to
  global ignores.
- **Modified**: `docs/DEVLOG.md` — index this entry.
