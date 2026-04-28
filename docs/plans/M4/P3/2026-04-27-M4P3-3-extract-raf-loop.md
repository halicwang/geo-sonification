# P3-3 — Extract `frontend/audio/raf-loop.js` (Pure EMA Driver)

**Prerequisite:** P3-2 (`audio/buffer-cache.js` factory in place)
**Trace:** Milestone 4 Phase 3 — Audio decomposition
**Companion:** [M4 razor-refactor proposal](../2026-04-27-M4-razor-refactor-proposal.md) §7

## Context

`frontend/audio-engine.js`'s `rafLoop()` is the per-frame brain of the audio engine. It mixes two concerns:

1. **Pure EMA math** — advance four families of smoothed values (per-bus targets, coverage, proximity, velocity) by a per-frame `dt` using time-constant-driven exponential smoothing, with branch arms for "snap" (dt outside the safe range) and "asymmetric" (velocity attack ≠ decay).
2. **Audio param writes** — read the smoothed values, derive cutoff / Q / per-bus mix gain / land-vs-ocean ramp, and write to `lpFilter*.frequency.value`, `lpFilter1.Q.value`, `gains[i].gain.value`.

P3-3 splits these. The pure-math half moves into `audio/raf-loop.js` and becomes the testability win that the rest of P3 was set up to enable. The audio-param writes stay in `audio-engine.js`'s rAF callback, which now reduces to "compute dt → call `tickEma` → derive scalars from the snapshot → write to audio params."

The proposal §7 phrasing was "Returns `{ proximity, velocity, coverage[8] }`." After re-reading the rAF body, the natural snapshot is the full smoothed state: `busSmoothed[7]`, `coverageSmoothed`, `proximitySmoothed`, `velocitySmoothed`. The engine derives every audio-param write from these four. The post-EMA shaping (`Math.pow(busSmoothed[i], 0.6)`, normalization, land/ocean ramp) is engine-side because it directly targets `gains[i].gain.value` writes — not part of the EMA driver.

## Design

```js
// frontend/audio/raf-loop.js — free functions over an explicit state object

export function createEmaState({ numBuses }) {
    return {
        busTargets:        new Float64Array(numBuses),
        busSmoothed:       new Float64Array(numBuses),
        coverageTarget:    1,   // matches engine reset default
        coverageSmoothed:  1,
        proximityTarget:   0,
        proximitySmoothed: 0,
        velocityTarget:    0,
        velocitySmoothed:  0,
    };
}

export function tickEma(state, dt, opts) {
    // opts: { smoothingTimeMs, proximitySmoothingMs, snapThresholdMs, velocityAttackMs, velocityDecayMs }
    // Mutates state.*Smoothed in place. Returns the same state object so callers
    // can chain `const snap = tickEma(state, dt, opts);` and read snap.busSmoothed.
}

export function snapEmaToTargets(state) {
    // Used on visibilitychange "visible" — collapse smoothed = target so the
    // user doesn't hear a long ramp from stale values when the tab returns.
    // Velocity is special-cased to 0 (matches existing engine behavior:
    // velocity is always drag-derived, snapping to current target would
    // produce a fake drag spike on resume).
}

export function resetEma(state) {
    // Used at start() — zero everything except coverageTarget / coverageSmoothed
    // which initialize to 1 (full land coverage, the engine's neutral default).
}
```

The state object is a plain mutable bag: engine code writes targets directly (`ema.coverageTarget = 0.7;` instead of `ema.setCoverageTarget(0.7)`). This is intentional — three reasons:

- Tests construct one state, mutate, tick, assert, repeat without setter ceremony.
- The engine's existing `update()` / `updateMotion()` already do field-by-field assignment to module-level scalars; switching to `ema.coverageTarget = ...` is a one-character change per line, not a redesign.
- Encapsulation buys nothing here — the EMA driver has no invariants that field writes can violate (every field is independently advanced by `tickEma`).

## Engine integration

| Old (in `audio-engine.js`) | New |
|---|---|
| `const busTargets = new Float64Array(NUM_BUSES);` (and 7 other `let *Target` / `let *Smoothed` lines) | `const ema = createEmaState({ numBuses: NUM_BUSES });` |
| `busTargets[i] = clamp01(...)` (in `update()`) | `ema.busTargets[i] = clamp01(...)` |
| `coverageTarget = clamp01(audioParams.coverage)` | `ema.coverageTarget = clamp01(audioParams.coverage)` |
| `proximityTarget = clamp01(audioParams.proximity)` | `ema.proximityTarget = clamp01(audioParams.proximity)` |
| `velocityTarget = clamp01(velocity)` | `ema.velocityTarget = clamp01(velocity)` |
| The 22-line EMA-advance block at the top of `rafLoop()` | `tickEma(ema, dt, EMA_OPTS);` |
| Filter cutoff / Q derivation reads `proximitySmoothed`, `velocitySmoothed` | reads `ema.proximitySmoothed`, `ema.velocitySmoothed` |
| Per-bus shaping / gain reads `busSmoothed[i]`, `coverageSmoothed` | reads `ema.busSmoothed[i]`, `ema.coverageSmoothed` |
| `handleVisibilityChange()` resume: 4-line snap block | `snapEmaToTargets(ema); lastEmaTime = performance.now();` |
| `start()` reset: 8-line zero block | `resetEma(ema);` |

`lastEmaTime` stays in `audio-engine.js` — it's the rAF orchestration timestamp, not part of the EMA math itself. The EMA driver receives `dt` as a parameter so tests can supply synthetic clocks without monkey-patching `performance.now`.

## Tests (`frontend/__tests__/audio/raf-loop.test.js`)

Coverage target ≥ 90% (proposal §11). Cases:

1. **Initial state**: `createEmaState` returns zero-filled targets/smoothed except `coverageTarget === 1` and `coverageSmoothed === 1`.
2. **Convergence (the headline DoD case)**: with `busTargets[0] = 0.7`, run `tickEma(ema, 16, OPTS)` 1000 times → `Math.abs(ema.busSmoothed[0] - 0.7) < 0.0007` (within ±0.1% of target).
3. **Snap on dt = 0**: `tickEma(ema, 0, OPTS)` immediately equalizes `busSmoothed[i] = busTargets[i]`. (Reproduces the `dt <= 0` arm of the alpha branch.)
4. **Snap on dt > snapThresholdMs**: with snap threshold 2000ms, `tickEma(ema, 5000, OPTS)` snaps. Verifies the long-pause-then-resume code path that the engine relies on after tab visibility recovery.
5. **EMA shape per call**: with `busTargets[i] = 1` and `busSmoothed[i] = 0`, single `tickEma(ema, 16, OPTS)` produces `busSmoothed[i] === 1 - Math.exp(-16 / 500)` (within 1e-9). Confirms the `1 - exp(-dt/τ)` formula across the bus, coverage, proximity slots.
6. **Asymmetric velocity (attack)**: `velocityTarget = 1`, `velocitySmoothed = 0`, `dt = 16ms` → uses `VELOCITY_ATTACK_MS = 50`, alpha = `1 - exp(-16/50)` ≈ 0.275. Asserts `velocitySmoothed ≈ 0.275`.
7. **Asymmetric velocity (decay)**: `velocityTarget = 0`, `velocitySmoothed = 1`, `dt = 16ms` → uses `VELOCITY_DECAY_MS = 600`, alpha = `1 - exp(-16/600)` ≈ 0.0263. Asserts `velocitySmoothed ≈ 1 - 0.0263 = 0.9737`.
8. **`snapEmaToTargets`**: set targets to non-default values and smoothed to zero; assert `busSmoothed[i] === busTargets[i]`, `coverageSmoothed === coverageTarget`, `proximitySmoothed === proximityTarget`, **`velocitySmoothed === 0`** (special-cased — not equal to `velocityTarget`).
9. **`resetEma`**: mutate every field; call `resetEma`; assert all targets/smoothed are 0 except `coverageTarget === 1`, `coverageSmoothed === 1`.
10. **Returns the state object** (so `const snap = tickEma(...)` semantics work for callers that want to chain). Asserts `tickEma(state, 16, OPTS) === state`.

## Definition of Done

- `frontend/audio/raf-loop.js` exists, exports `createEmaState`, `tickEma`, `snapEmaToTargets`, `resetEma`.
- `frontend/audio-engine.js` no longer holds `busTargets`, `busSmoothed`, four scalar Target/Smoothed `let`s; `update()` / `updateMotion()` / `rafLoop()` / `handleVisibilityChange()` / `start()` reroute through the EMA state object.
- `frontend/__tests__/audio/raf-loop.test.js` covers all 10 cases; coverage on `audio/raf-loop.js` ≥ 90%.
- `npm run lint` / `format:check` / `npm test` / `npm run test:frontend` / `npm run smoke:wire-format` — green.
- `wc -l frontend/audio-engine.js` strictly less than the post-P3-2 baseline (914); expect ~870–890.
- Preview verification: Start → audio plays as before; rAF-driven filter cutoff / Q / per-bus gains continue to advance smoothly during a viewport drag (qualitative — preview eval reads filter `frequency.value` mid-drag and confirms it moves toward the current proximity target). No console errors. `__acCount` stays at 1 across stop→start.
- Devlog `docs/devlog/M4/2026-04-27-M4-extract-raf-loop.md` + DEVLOG.md index entry.

## Risks and rollback

- **Risk**: a smoothed value is read before its target is set, producing an off-by-one frame. **Mitigation**: state object's initial values (zeros and the coverage = 1 default) match the prior module-level `let` initial values byte-identically. Test 1 enforces this.
- **Risk**: the rAF callback's filter cutoff / Q derivation reads `ema.foo` instead of `foo` and a typo silently reads `undefined → NaN → audio param accepts NaN`. **Mitigation**: the rewrite is mechanical and `npm run lint` flags any `undefined` access via `no-undef`. Preview Start verifies the cutoff actually advances on drag.
- **Risk**: asymmetric velocity branch picks the wrong tau when `velocityTarget === velocitySmoothed` (a brand-new edge that the original code also has). The original code uses `velocityTarget > velocitySmoothed ? attack : decay`, so equal → decay. Preserve that. Test 7's "decay when target=0, smoothed=1" implicitly anchors this branch direction.
- **Rollback**: revert this commit on `feat/M4`. P3-4 not yet started.
