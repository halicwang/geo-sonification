# 2026-04-27 — Refactor: Extract `frontend/audio/raf-loop.js` (Pure EMA Driver)

M4 P3-3. Lift the per-frame EMA math out of `audio-engine.js`'s `rafLoop()` into a pure module under `frontend/audio/raf-loop.js`. The new module exports `createEmaState`, `tickEma`, `snapEmaToTargets`, `resetEma` — free functions over an explicit `EmaState` object. Audio param writes (filter cutoff/Q, per-bus gain) stay in the engine; the engine's rAF callback now reduces to "compute dt → call `tickEma` → derive scalars → write to AudioParams."

## What moved

From `audio-engine.js` into the new module:

- `busTargets` / `busSmoothed` (`Float64Array(NUM_BUSES)` pair)
- `coverageTarget` / `coverageSmoothed` (scalars, default 1)
- `proximityTarget` / `proximitySmoothed` (scalars, default 0)
- `velocityTarget` / `velocitySmoothed` (scalars, default 0)
- The 22-line EMA-advance block at the top of `rafLoop()` (per-bus blend, coverage blend, proximity blend with its own time constant, asymmetric velocity blend with attack/decay tau switching)
- The 4-line snap block in `handleVisibilityChange()` "visible" branch
- The 8-line zero block at the start of `start()` (pre-pendingParams replay reset)

The EMA driver is dependency-free: no `AudioContext`, no `AudioParam`, no `requestAnimationFrame`. Tests construct an `EmaState` directly and feed synthetic `dt` values.

## API

```js
// frontend/audio/raf-loop.js
createEmaState({ numBuses })            // → EmaState (zeros except coverage = 1)
tickEma(state, dt, opts)                // mutates state.*Smoothed; returns state
snapEmaToTargets(state)                 // smoothed = target; velocity → 0 (special-cased)
resetEma(state)                          // all 0 except coverage = 1
```

`opts` shape:
- `smoothingTimeMs` — τ for buses + coverage
- `proximitySmoothingMs` — τ for proximity (faster, drives master cutoff)
- `snapThresholdMs` — dt outside [0, threshold] → snap (alpha = 1.0)
- `velocityAttackMs` — τ when target > smoothed
- `velocityDecayMs` — τ when target ≤ smoothed (equal preserves prior engine behavior of using decay)

Snapshot is the state itself: callers read `ema.busSmoothed[i]`, `ema.proximitySmoothed`, etc. — no separate snapshot object. The `tickEma → state` return is for chain-callable ergonomics.

## Engine integration

```js
const ema = createEmaState({ numBuses: NUM_BUSES });
const EMA_TICK_OPTS = Object.freeze({
    smoothingTimeMs: SMOOTHING_TIME_MS,
    proximitySmoothingMs: PROXIMITY_SMOOTHING_MS,
    snapThresholdMs: SNAP_THRESHOLD_MS,
    velocityAttackMs: VELOCITY_ATTACK_MS,
    velocityDecayMs: VELOCITY_DECAY_MS,
});

// update():           ema.busTargets[i] = clamp01(...)
//                     ema.coverageTarget = ...
//                     ema.proximityTarget = ...
// updateMotion():     ema.velocityTarget = clamp01(velocity)
// rafLoop():          tickEma(ema, dt, EMA_TICK_OPTS); cutoff = 500 * pow(40, ema.proximitySmoothed); ...
// visibility resume:  snapEmaToTargets(ema)
// start() reset:      resetEma(ema)
```

The EMA driver doesn't track `lastEmaTime` — that's the rAF orchestration timestamp, not part of the math. Engine continues to own it. Tests pass synthetic dt values directly.

## Why now

Pre-P3-3, the rAF body was the engine's least-testable region: every line touched a module-level mutable scalar or a Web Audio AudioParam. The 22-line EMA block had 0% coverage on `feat/M4` HEAD because happy-dom can't run `requestAnimationFrame`-driven Web Audio.

Pulling the math out gives it the highest-coverage testbed in P3 (proposal §11 target ≥ 90%, achieved 100% statement / branch / function). The engine's rAF callback is now ~20 lines of "read state → write AudioParam," a shape that can be eyeballed without unit tests.

## Tests added

`frontend/__tests__/audio/raf-loop.test.js` — 12 vitest cases:

1. `createEmaState`: zero-filled with coverage = 1
2. `tickEma` returns the state object (chain semantics)
3. EMA blend formula `1 - exp(-dt/τ)` per call (anchors bus + coverage with τ = 500 ms)
4. Proximity uses its own τ = 120 ms (faster than buses)
5. Snap when dt = 0 (first-frame case after start)
6. Snap when dt > snapThresholdMs (resume-from-hidden-tab case)
7. Velocity attack: target > smoothed → τ = 50 ms
8. Velocity decay: target ≤ smoothed → τ = 600 ms
9. **Convergence (proposal §11 DoD)**: 1000 ticks of 16 ms dt → bus values within ±0.1% of target
10. `snapEmaToTargets`: smoothed = target except velocity → 0
11. `snapEmaToTargets` velocity special case asserted independently
12. `resetEma`: all zero except coverage = 1

Coverage on `frontend/audio/raf-loop.js`: **100% statement / 100% branch / 100% function** (proposal §11 target ≥ 90%).

Total frontend vitest count: 33 → **45**.

## File-size impact

- `frontend/audio-engine.js`: **914 → 883 lines** (-31). The 22-line rAF math block, 8-line scalar declarations, 4-line snap block, 8-line reset block all leave; replaced with `tickEma(...)`, `snapEmaToTargets(ema)`, `resetEma(ema)` and a single `createEmaState({...})` instantiation.
- New `frontend/audio/raf-loop.js`: **156 lines** (4 exports + JSDoc + a private `emaAlpha` helper).

Cumulative P3 progress on `audio-engine.js`: 1186 → 883 (-303 lines, **-25.5%** across P3-0/1/2/3). Proposal §11 target: ≤ 800 lines on the largest single audio module — currently at 883, P3-4 will close the gap when audio-engine.js becomes a re-export shim.

## Verification

- `npm run lint` / `format:check` — clean.
- `npm test` — 15 server suites / 160 jest pass.
- `npm run test:frontend` — **45 vitest pass** (10 utils + 12 context + 11 buffer-cache + **12 raf-loop**).
- `npx vitest run --coverage` — `audio/raf-loop.js`: 100% / 100% / 100%.
- `npm run smoke:wire-format` — 3 routes / 3 WS types / 45 fields ok.
- **Preview runtime cycle** on `npm run dev`:
    - Page load → `__acCount = 0` (no AudioContext at module-eval time).
    - Click Start → `__acCount = 1`, status `Playing`, loop-progress fill 3.79%.
    - DevTools eval: `engine.isRunning() === true`, `audioCtx.currentTime` advances 0.2027 s in 200 ms wall time, `engine.getLoopProgress()` reports `progress: 0.171` over a 120s cycle — proves the rAF loop is alive, calling `tickEma` every frame, and writing real AudioParam values (otherwise the loop progress wouldn't advance smoothly).
    - 0 console errors throughout.

## Risks and rollback

- **Risk**: a smoothed value is read before its target is set, producing an off-by-one frame. **Mitigation**: state object's initial values match the prior module-level `let` initial values byte-identically. Test 1 enforces this.
- **Risk**: the rAF callback's filter cutoff / Q derivation reads `ema.foo` instead of `foo` and a typo silently reads `undefined → NaN → audio param accepts NaN`. **Mitigation**: `npm run lint` flags `no-undef`; preview verification confirms loop progress advances smoothly.
- **Risk**: asymmetric velocity branch picks the wrong tau for the equal-target edge case. **Mitigation**: tests 7 + 8 anchor both directions; the existing `>` comparison is preserved literally.
- **Risk**: `snapEmaToTargets` accidentally snaps velocity to its target instead of 0. **Mitigation**: tests 10 + 11 anchor the special case independently.
- **Risk**: floating-point precision in toBe-equality test cases for snap branches. **Mitigation**: discovered + corrected during this stage — tests use `toBeCloseTo(value, 12)` for any value computed via subtraction or multiplication.
- **Rollback**: revert this commit on `feat/M4`. P3-4 (`audio/engine.js` integration + audio-engine.js shim) not yet started.

## Files changed

- **Added**: `frontend/audio/raf-loop.js` — 156-line module exporting `createEmaState`, `tickEma`, `snapEmaToTargets`, `resetEma`.
- **Added**: `frontend/__tests__/audio/raf-loop.test.js` — 12 vitest cases (100% / 100% / 100% coverage on `raf-loop.js`).
- **Added**: `docs/plans/M4/P3/2026-04-27-M4P3-3-extract-raf-loop.md` — stage plan.
- **Added**: `docs/devlog/M4/2026-04-27-M4-extract-raf-loop.md` — this entry.
- **Modified**: `frontend/audio-engine.js` — 914 → 883 lines. Removed module-level EMA scalars and bus-target/smoothed arrays. Added `import` from `audio/raf-loop.js` and the `ema` instantiation. Routed `update()` / `updateMotion()` / `rafLoop()` / `handleVisibilityChange()` / `start()` through the EMA state object.
- **Modified**: `docs/DEVLOG.md` — index this entry.
