# P5-1 — rAF Idle Detection

**Prerequisite:** Phase 4 complete (server decomposition + state merger landed)
**Trace:** Milestone 4 Phase 5 — Performance + closing docs + milestone close
**Companion:** [M4 razor-refactor proposal](../2026-04-27-M4-razor-refactor-proposal.md) §9; resolves M3 audit item B.6 ("rAF loop runs unconditionally")

## Context

The audio engine's rAF callback fires every frame (~60 Hz on display) for as long as audio is playing. On every tick it runs the EMA advance, then writes to `lpFilter1/2/3.frequency.value`, `lpFilter1.Q.value`, and 7 × `gains[i].gain.value`. When the user stops moving the map, every EMA converges to its target within a few hundred milliseconds. After convergence, every subsequent tick re-writes the same values to the same AudioParams — pure waste.

The convergence boundary is well-defined: each smoothed value is within Δ of its target. The proposal §11 picks Δ = 0.001 (≈0.1% of the [0, 1] range) as the threshold.

P5-1 adds `isEmaIdle(state, threshold)` to `audio/raf-loop.js` and uses it in `audio/engine.js`'s rAF callback to suspend the loop when idle. `update()` and `updateMotion()` wake the loop on the next frame regardless of whether the value actually changed (the next idle check re-suspends if it has not — one frame of waste max).

## Design

### Idle detector — `audio/raf-loop.js`

```js
/**
 * @param {EmaState} state
 * @param {number} threshold - max |smoothed - target| per channel (0.001 in production)
 * @returns {boolean}
 */
export function isEmaIdle(state, threshold) {
    const numBuses = state.busTargets.length;
    for (let i = 0; i < numBuses; i++) {
        if (Math.abs(state.busSmoothed[i] - state.busTargets[i]) > threshold) return false;
    }
    if (Math.abs(state.coverageSmoothed - state.coverageTarget) > threshold) return false;
    if (Math.abs(state.proximitySmoothed - state.proximityTarget) > threshold) return false;
    if (Math.abs(state.velocitySmoothed - state.velocityTarget) > threshold) return false;
    return true;
}
```

The check is uniform across all four EMAs; the proposal's "velocity = 0" wording is just the colloquial form of "velocityTarget = 0 and velocitySmoothed has decayed under Δ" (the asymmetric decay τ = 600 ms means velocitySmoothed crosses Δ ≈ 0.001 about 6 seconds after the user stops dragging).

### Engine integration — `audio/engine.js`

Three changes to `audio/engine.js`:

1. **Add `IDLE_THRESHOLD` constant** = `0.001`. Keep alongside `EMA_TICK_OPTS`.

2. **rafLoop suspends on idle**. After writing AudioParams, call `isEmaIdle(ema, IDLE_THRESHOLD)`. If true, set `rafId = null` and return without rescheduling. The next `requestAnimationFrame` call only happens when the loop is woken.

3. **`startRaf` becomes the wake**. Currently it just guards on `rafId !== null` and schedules. Add `lastEmaTime = performance.now()` so the first tick after wake computes a normal-sized dt instead of treating the wake as a giant "stale time since last tick" snap.

4. **`update()` and `updateMotion()` call `startRaf()` at the end**. Idempotent — if rAF is already running, the call is a no-op; if it was suspended, we re-schedule.

```js
function rafLoop() {
    if (!audioCtx || suspended) return;

    const now = performance.now();
    const dt = lastEmaTime > 0 ? now - lastEmaTime : 0;
    lastEmaTime = now;

    tickEma(ema, dt, EMA_TICK_OPTS);

    // … existing AudioParam writes (cutoff, Q, per-bus gains) …

    if (isEmaIdle(ema, IDLE_THRESHOLD)) {
        rafId = null;  // suspend until wake
        return;
    }

    rafId = requestAnimationFrame(rafLoop);
}

function startRaf() {
    if (rafId !== null) return;
    lastEmaTime = performance.now();  // first tick after wake gets a normal dt
    rafId = requestAnimationFrame(rafLoop);
}
```

### Why `lastEmaTime = performance.now()` inside `startRaf`

When the loop suspends, `lastEmaTime` reflects the timestamp of the last tick. If the user idles for, say, 60 seconds and then nudges the viewport, the first wake-up tick would see `dt = 60_000 ms`. That's far above `snapThresholdMs` (2000 ms) → alpha = 1.0 → smoothed snaps to target.

For `update()`-triggered wakes that's wrong: the user just set a new target and wants smooth convergence, not a snap. Resetting `lastEmaTime` inside `startRaf` makes the first tick produce a normal-sized dt (~16 ms), so the alpha is `1 - exp(-16 / 500)` ≈ 3.2% per channel — gradual convergence preserved.

For visibility-resume the existing code already calls `lastEmaTime = performance.now()` before `startRaf()` (so the snap-via-`snapEmaToTargets` is intentional, not accidental via large dt). With the new `startRaf` that explicit assignment becomes redundant but harmless.

## Tests

Add to `frontend/__tests__/audio/raf-loop.test.js`:

1. `isEmaIdle` returns true on a freshly-created state (every smoothed = target = 0 except coverage = 1 = 1).
2. Returns false when one bus's smoothed differs from its target by more than `threshold`.
3. Returns false when proximity is mid-convergence.
4. Returns false when velocity is non-zero (smoothed > 0).
5. Returns true after enough ticks bring every EMA under the threshold.
6. Threshold is configurable: at threshold = 1.0, a state with smoothed at 0 and target at 0.5 is "idle"; at threshold = 0.1 it is not.

The engine integration is verified end-to-end via the preview path (next section); a unit test for engine.js's `rafLoop` is hard to construct in happy-dom because `requestAnimationFrame` is stubbed and the AudioParam writes target the audio-context mock. The proposal §11 only requires `audio/engine.js` ≥ 50% coverage, which is already at 70.78%.

## Verification

### Functional

- `npm run lint` / `format:check` — clean
- `npm test` — server jest still 167/167
- `npm run test:frontend` — vitest count grows by ~6 (the new `isEmaIdle` cases). Coverage on `raf-loop.js` stays at 100% statement / branch / function (the new function is covered by the new tests).
- `npm run smoke:wire-format` — unchanged

### Preview — idle suspension end-to-end

After the patch, on `npm run dev`:

1. Click Start. After audio begins, the rAF loop runs and EMAs advance.
2. After ~3-6 seconds with no map interaction, every EMA crosses the 0.001 threshold and the rAF loop suspends. **Verification:** `rafId === null` (read via DevTools eval). `audioCtx.currentTime` continues to advance (the underlying audio engine is still playing — the suspend only cuts the rAF callback).
3. Drag the map (triggers `update()` and `updateMotion()`). The rAF loop resumes within one frame. **Verification:** `rafId !== null` immediately after the next frame.
4. Stop dragging. After convergence, the loop suspends again.

### Performance — proposal §11 DoD

The proposal calls for "≥ 30% drop OR ≤ 3.5% absolute" main-thread CPU during 5 minutes of idle audio. Measuring with DevTools Performance Profile is out of scope for the automated harness, but the structural argument is:

- Pre-patch idle CPU = (rAF callback work) × 60 Hz = ~0.5 ms × 60 = ~3% of one core.
- Post-patch idle CPU = 0% (rAF callback not scheduled).

So in a strictly-idle 5 min window, CPU drops to ≈ 0%. The "≤ 3.5% absolute" target is met by construction.

We capture an indirect smoke metric in the preview verification: count rAF callbacks per 1000 ms before vs after idle. Active = ~60. Idle = 0.

## Definition of Done

- `frontend/audio/raf-loop.js` exports `isEmaIdle(state, threshold)`.
- `frontend/audio/engine.js` defines an `IDLE_THRESHOLD = 0.001` constant, calls `isEmaIdle` at the end of every rAF tick, and suspends the loop (sets `rafId = null` + `return`) when idle.
- `startRaf()` resets `lastEmaTime = performance.now()` before scheduling.
- `update()` and `updateMotion()` call `startRaf()` at the end.
- New raf-loop test cases: `isEmaIdle` covers initial state, mid-convergence, post-convergence, threshold variation. Coverage on `raf-loop.js` stays at 100%.
- Preview check: `rafId === null` after ~6 seconds of no interaction; `rafId !== null` within one frame of a viewport update.
- Preview metric: rAF callbacks counted over 1 second of idle = 0; over 1 second of active = ~60.
- Devlog `docs/devlog/M4/2026-04-27-M4-raf-idle-detection.md` indexed.

## Risks and rollback

- **Risk**: a code path mutates `ema.{busTargets, coverageTarget, proximityTarget, velocityTarget}` without going through `update()` / `updateMotion()`. The rAF would stay suspended past the change. **Mitigation**: cross-repo grep — only `update()`, `updateMotion()`, `start()` (via `pendingParams` replay through `update()`), `handleVisibilityChange()` (via `snapEmaToTargets` + `startRaf`), and `resetEma()` (called inside `start()` before `update()` / `startRaf` cascade) touch ema fields. All five paths terminate in a `startRaf()` call after the mutation.
- **Risk**: the idle threshold of 0.001 is too tight or too loose. **Mitigation**: configurable via `IDLE_THRESHOLD` constant; first-frame dt of ~16 ms with a 500 ms time constant produces 3.2% per-tick movement, so a target change of 0.01 takes ~3 frames to fall under the idle threshold (smooth, not jerky).
- **Risk**: a long-suspended loop has a stale `lastEmaTime` that, on wake, produces `dt > snapThresholdMs` and snaps. **Mitigation**: `startRaf` resets `lastEmaTime` (see "Why" section above).
- **Rollback**: `git revert` the commit. P5-2/3/4 not yet started.
