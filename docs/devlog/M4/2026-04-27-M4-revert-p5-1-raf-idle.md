# 2026-04-27 — Revert: P5-1 rAF Idle Detection Drops Audio in Production

P5-1 (`perf(M4/P5): suspend audio rAF when every EMA channel converges`, 224b1ca) and its follow-up hotfix (`fix(M4/P5): drop buffer-ready gate ...`, 151c56c) were both reverted after user testing on `start.command` revealed that the seven ambience buses go silent in real-world use, while the city-name announcer (which connects directly to `audioCtx.destination` and bypasses the master chain) remained audible. The revert restores the unconditional rAF loop that has been correct since M2.

## What happened

P5-1 added idle suspension: when every EMA channel was within 0.001 of its target, the rAF callback set `rafId = null` and returned without rescheduling. `update()` and `updateMotion()` were modified to call `startRaf()` to wake the loop. `isEmaIdle(state, threshold)` was added to `audio/raf-loop.js` with full unit-test coverage.

The unit tests passed. The vitest engine integration tests passed. A preview-environment dry-run showed gains converging to non-zero values on a forced `engine.update(...)` — by every metric the change looked correct.

In real use, audio went silent. We ran several DevTools probes:

- `engine.isRunning() === true`
- `audioCtx.state === 'running'`
- `engine.getLoopProgress()` advances normally (0.413 → 0.422 over 1 s)
- All seven `loadingStates` are `'ready'`
- `engine.getVolume() === 1`
- A forced `onViewportChange()` confirmed `engine.update` is called with non-zero `busTargets` (forest = 0.928 in one sample)

So: AudioContext alive, voices playing, buffers loaded, EMA targets set correctly, master volume at unity, no `console.error`. Yet no audible bus output. The hotfix (drop `bufferCache.has(i)` gate) addressed one symptom — `gain.value` being frozen at 0 across the buffer-load period — but did not restore audio in the user's environment.

The exact failure mode wasn't pinned down. Hypotheses we couldn't conclusively confirm:

- Race between WS `onOpen → onViewportChange` (line 107 in `main.js`, gated on `state.runtime.map`) and Mapbox `style.load → onViewportChange` (line 331 in `map.js`). If WS fires first while map style is loading, the initial viewport may not be sent, leaving `pendingParams` null at Start time. Pre-P5-1 the always-running rAF eventually picked up later updates; post-P5-1 the suspended loop relied on a wake that didn't always arrive in time.
- The `startRaf()` reset of `lastEmaTime` interacts badly with some flow we didn't enumerate.
- A sequencing bug between `startAllSources()` (which connects voices to bus gains) and the rAF wake that's supposed to write non-zero `gain.value`.

Diagnostic limitation: probes installed via DevTools after `engine.start()` couldn't see the gain-creation path, and probes installed before couldn't reproduce the bug because the act of typing introduced timing slack that the bug requires to be tight.

## The decision

P5-1 is a **performance optimization**, not a correctness fix. Proposal §11 targets ≥30% main-thread CPU drop during idle audio. The trade — opaque-cause audio dropouts in production for an unmeasured CPU saving on a non-bottleneck — is bad. Revert and defer.

`isEmaIdle` is a clean pure function with 100% test coverage; if/when P5-1 returns in M5, the function survives. The revert removes its export from `raf-loop.js`, but the test file's coverage of `tickEma` / `snapEmaToTargets` / `resetEma` is unchanged.

## State after revert

| | Before P5-1 | After revert |
|---|---|---|
| `frontend/audio-engine.js` shim | re-export | re-export |
| `frontend/audio/engine.js` rAF | runs unconditionally each frame | runs unconditionally each frame |
| `frontend/audio/raf-loop.js` exports | `createEmaState`, `tickEma`, `snapEmaToTargets`, `resetEma` | same (no `isEmaIdle`) |
| `frontend/__tests__/audio/raf-loop.test.js` | 12 cases | 12 cases |
| Frontend total vitest | 62 | 62 |

`npm run lint`, `format:check`, `npm test` (167/167), `npm run test:frontend` (62/62), `npm run smoke:wire-format` — all green post-revert.

## Defer to M5

Per proposal §11 the rAF idle target is now an **M5 candidate**. A proper retry should:

1. Build a deterministic reproduction first (probably driving the engine through synthetic update timings + a mocked `requestAnimationFrame`), so the failure mode is observable in CI rather than only in production.
2. Resolve the WS-onOpen / Mapbox-style.load race in `main.js` separately — that race exists pre-P5-1 too, just doesn't surface as silence because the always-running rAF masks it.
3. Re-introduce the suspension only after both the reproduction and the upstream race are addressed.

## Files changed

- **Reverted commit `35d6058`**: brings back the `bufferCache.has(i)` gate on the per-bus `gain.value` write in `frontend/audio/engine.js`'s rAF callback, removes the P5-1 hotfix devlog.
- **Reverted commit `bcb7ab2`**: removes `isEmaIdle` export from `frontend/audio/raf-loop.js`, removes `IDLE_THRESHOLD` constant from `frontend/audio/engine.js`, removes idle-suspend branch in `rafLoop`, removes `lastEmaTime` reset in `startRaf`, removes `startRaf()` calls at end of `update()` and `updateMotion()`, removes the 7 `isEmaIdle` test cases from `frontend/__tests__/audio/raf-loop.test.js`, removes the P5-1 stage plan and devlog.
- **Added**: `docs/devlog/M4/2026-04-27-M4-revert-p5-1-raf-idle.md` — this entry.
- **Modified**: `docs/DEVLOG.md` — index this entry.
