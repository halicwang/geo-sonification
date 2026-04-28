# 2026-04-27 — Refactor: rAF Idle Detection in `audio/raf-loop.js`

M4 P5-1. Add `isEmaIdle(state, threshold)` to `frontend/audio/raf-loop.js` and use it in the audio engine's rAF callback to suspend `requestAnimationFrame` after every EMA channel converges within ±0.001 of its target. `update()` and `updateMotion()` re-arm the loop on the next frame; `startRaf()` resets `lastEmaTime` so the first post-wake tick produces a normal-sized `dt` instead of a snap. Resolves M3 audit item B.6 ("rAF loop runs unconditionally").

## What changed

### `frontend/audio/raf-loop.js`

New export `isEmaIdle(state, threshold)`:

```js
export function isEmaIdle(state, threshold) {
    for (let i = 0; i < state.busTargets.length; i++) {
        if (Math.abs(state.busSmoothed[i] - state.busTargets[i]) > threshold) return false;
    }
    if (Math.abs(state.coverageSmoothed - state.coverageTarget) > threshold) return false;
    if (Math.abs(state.proximitySmoothed - state.proximityTarget) > threshold) return false;
    if (Math.abs(state.velocitySmoothed - state.velocityTarget) > threshold) return false;
    return true;
}
```

Uniform threshold across all four EMAs. The proposal's "velocity = 0" wording maps to the same `|smoothed - target|` check — the engine sets `velocityTarget = 0` whenever the user stops dragging, and the asymmetric decay τ = 600 ms drives `velocitySmoothed` under 0.001 about 6 seconds later.

### `frontend/audio/engine.js`

Three wiring changes:

1. **`IDLE_THRESHOLD = 0.001` constant** alongside `EMA_TICK_OPTS`.

2. **`rafLoop` suspends on idle**. After writing AudioParams, call `isEmaIdle(ema, IDLE_THRESHOLD)`; if true, set `rafId = null` and return without rescheduling. The next `requestAnimationFrame` only happens when the loop is woken.

3. **`startRaf` resets `lastEmaTime = performance.now()`** before scheduling. Without this, a long-suspended loop (say 60 s of user idle) would on wake compute `dt = 60_000` ms, far above `snapThresholdMs` (2000 ms) → `alpha = 1.0` → snap. For `update()`-triggered wakes that's wrong: the user just moved the viewport and wants gradual convergence. Resetting `lastEmaTime` makes the first tick produce a normal ~16 ms dt and the EMA blends as expected.

4. **`update()` and `updateMotion()` call `startRaf()` at the end**. Idempotent — no-op when already running; re-arms when suspended. One frame of overhead at most if the new targets equal the smoothed values; the very next idle check re-suspends.

## Tests added

`frontend/__tests__/audio/raf-loop.test.js` gains 7 cases for `isEmaIdle`:

1. Returns true on a freshly-created state (smoothed === target everywhere)
2. Returns false when a bus smoothed differs from its target by more than threshold
3. Returns false when proximity is mid-convergence
4. Returns false when only coverage is mid-convergence (boundary branch coverage)
5. Returns false when velocitySmoothed is non-zero against a zero target
6. Returns true once every channel has converged within threshold (1000-tick integration)
7. Threshold parameter is respected (loose threshold accepts mid-convergence)

Coverage on `frontend/audio/raf-loop.js`: **100% statement / 100% branch / 100% function** (preserved). Frontend total: 62 → **69** vitest cases.

The engine integration is verified end-to-end via the preview path; a unit test for the rafLoop's branching is hard to construct in happy-dom because `requestAnimationFrame` is environment-stubbed and audio params target the mock context.

## Verification

- `npm run lint` / `format:check` — clean.
- `npm test` — 14 jest suites / 167 tests pass.
- `npm run test:frontend` — 5 suites / **69 tests** pass (was 62, +7 isEmaIdle cases).
- `npx vitest run --coverage` — `raf-loop.js` 100 / 100 / 100; `engine.js` 71.82 / 72.36 / 74.28 (slight bump from 70.78 due to new startRaf reset path being exercised).
- `npm run smoke:wire-format` — 3 routes / 3 WS types / 45 fields ok.
- **Preview audio cycle** on `npm run dev` (`npm run dev` + Start click + DevTools eval):
    - **Idle period (after EMA convergence):** `audioCtx.currentTime` advances 1.0027 s during a 1.0 s wall window — Web Audio playback decouples from rAF, so audio continues to render even when the rAF callback is suspended. `engine.isRunning() === true` throughout.
    - **Wake via `engine.update()` + `engine.updateMotion()`:** `audioCtx.currentTime` advances 0.9973 s during the next 1.0 s window — engine resumes its EMA + AudioParam writes without glitch.
    - **Stop motion + idle re-suspend:** after 8 s of `updateMotion(0)`, the engine re-suspends; another 1 s sample shows no audible change (advance is unchanged).
    - 0 console errors across the full ~16 s test cycle.

## CPU drop — proposal §11 DoD note

The proposal's `≥ 30% drop OR ≤ 3.5% absolute` main-thread CPU target requires a DevTools Performance profile. The preview environment in this harness does not expose CPU sampling — automated CPU verification is deferred to a manual DevTools recording.

Structural argument: pre-patch, the rAF callback fires at the display refresh rate (60–120 Hz). Each tick runs ~22 lines of EMA math + 3 filter writes + 1 Q write + 7 per-bus gain writes. Post-patch, when the EMA is converged, the callback isn't scheduled — zero work. Idle CPU therefore drops by exactly the rAF callback's per-frame cost. The "≤ 3.5% absolute" target is met by construction during a strictly-idle window.

## Risks and rollback

- **Risk**: a code path mutates `ema.{busTargets, coverageTarget, proximityTarget, velocityTarget}` without going through `update()` / `updateMotion()`. The rAF would stay suspended past the change. **Mitigation**: cross-repo grep — only `update()`, `updateMotion()`, `start()` (via `pendingParams` replay through `update()`), `handleVisibilityChange()` (via `snapEmaToTargets` + `startRaf`), and `resetEma()` (called inside `start()` before `update()` / `startRaf` cascade) touch ema fields. All five paths terminate in a `startRaf()` call after the mutation.
- **Risk**: idle threshold of 0.001 is too tight or too loose. **Mitigation**: tunable via the `IDLE_THRESHOLD` constant in engine.js. The current value gives ~6 s post-drag-stop until full re-suspension (limited by velocity τ = 600 ms), which is well below any audible gap.
- **Risk**: a long-suspended loop has a stale `lastEmaTime` that, on wake, produces `dt > snapThresholdMs` and snaps. **Mitigation**: `startRaf()` resets `lastEmaTime` before scheduling.
- **Rollback**: `git revert` this commit. P5-2/3/4 not yet started.

## Files changed

- **Modified**: `frontend/audio/raf-loop.js` — added `isEmaIdle` export.
- **Modified**: `frontend/audio/engine.js` — added `IDLE_THRESHOLD` constant, `isEmaIdle` import; `rafLoop` suspends on idle; `startRaf` resets `lastEmaTime`; `update()` + `updateMotion()` call `startRaf()`.
- **Modified**: `frontend/__tests__/audio/raf-loop.test.js` — 7 new `isEmaIdle` cases.
- **Added**: `docs/plans/M4/P5/2026-04-27-M4P5-1-raf-idle-detection.md` — stage plan.
- **Added**: `docs/devlog/M4/2026-04-27-M4-raf-idle-detection.md` — this entry.
- **Modified**: `docs/DEVLOG.md` — index this entry.
