# 2026-04-27 — Feature: P5-1 rAF Idle Detection (Redo with Buffer-Load Wake)

Re-implement P5-1 (suspend the audio rAF loop when every EMA channel converges) after the original (224b1ca) was reverted for causing seven-bus silence in production. The redo identifies the missing wake path that caused the dropout — `bufferCache.loadAll()` resolution — and adds it as a sixth wake trigger. The structural CPU win of the original (zero per-frame cost while idle) is preserved; the production silence is fixed.

## Why the original P5-1 dropped audio

The original P5-1 added five wake triggers covering every external EMA target mutation: `update()`, `updateMotion()`, `handleVisibilityChange('visible')`, `start()`'s initial arm, and the `audioCtx.state === 'suspended'` resume branch inside `update()`. That enumeration was complete with respect to **target writes**, but the rAF callback's effect on `gain.value` is gated by a separate readiness condition the proposal didn't account for:

```js
for (let i = 0; i < NUM_BUSES; i++) {
    if (gains[i] && bufferCache.has(i)) {   // ← per-bus buffer must be loaded
        gains[i].gain.value = value * BUS_PREAMP_GAIN[i];
    }
}
```

`busGains[i].gain.value` starts at 0 (created in `context.js:116`). On a fresh `start()`:

1. WS pushes audioParams → cached in `pendingParams`.
2. User clicks Start audio → `start()` runs.
3. `update(pendingParams)` writes `ema.busTargets` to non-zero values.
4. `lastEmaTime = performance.now(); startRaf();`
5. `await bufferCache.loadAll(audioCtx)` — async, can take 1–5 seconds on a hard reload.
6. While `loadAll` awaits, rafLoop ticks every 16 ms. `tickEma` advances `busSmoothed` toward `busTargets`, but `bufferCache.has(i) === false` so `gain.value` is not written. Each tick is a no-op against the audio output.
7. After ~3 seconds (τ = 500 ms, threshold 0.001 ⇒ exp(−t/500) < 0.0025 ⇒ t > 3000 ms), every channel is within `IDLE_THRESHOLD`. `isEmaIdle(ema, 0.001) === true`. **rAF self-suspends.**
8. `bufferCache.loadAll` resolves. `onAllLoaded → startAllSources()` connects sources to bus gains.
9. **Nothing wakes rAF.** No external call to `update()` or `updateMotion()` has happened (the user clicked Start and is waiting silently). `gain.value` stays frozen at the initial 0 forever. Seven-bus output silent.

Pre-P5-1 the unconditional rAF loop masked this: by the time buffers were ready, the next tick (which would have happened in 16 ms regardless) wrote `gain.value` to the converged `busSmoothed` value and audio became audible.

The hotfix (151c56c, also reverted) tried removing the `bufferCache.has(i)` gate. That didn't help: writing `gain.value` to a bus whose source isn't yet connected has no audible effect, and the rAF still self-suspended before sources connected, so subsequent gain writes that *would* matter never happened.

The intermittent "刷新一下又有声了" pattern was a race outcome: warm HTTP cache → buffers load fast → rafLoop ticks while buffers ready and writes `gain.value` *before* idle suspend → audio works. Hard reload → cold buffer fetch → idle suspend wins → silence. Pure timing.

The "装好探针就有声音" pattern was the same race seen from the user side: any external EMA write (mouse hover triggering `updateMotion`, late WS audioParams) called `startRaf()`, the wake tick had buffers ready, `gain.value` finally got written. The probe install itself didn't matter — it was the activity around it.

## The fix

**Sixth wake trigger.** Add `startRaf()` immediately after `await bufferCache.loadAll(audioCtx)` in `start()`:

```js
await bufferCache.loadAll(audioCtx);

// Wake rAF after buffers finish loading. While loadAll() was awaiting,
// EMAs may have converged within IDLE_THRESHOLD and the rAF callback
// suspended itself — but bufferCache.has(i) was still false, so the
// per-bus gain.value writes never happened. By the time we reach this
// line, onAllLoaded → startAllSources() has already connected sources
// to busGains, so a single wake tick will write the converged
// gain.value through and audio becomes audible.
startRaf();
```

This single line closes the race. After the wake:

- Frame 1 post-wake: `bufferCache.has(i) === true`, `gain.value` is written to the converged value, `isEmaIdle` re-evaluates to `true` → rAF re-suspends. One tick of work; CPU cost negligible.
- Audio is audible because `gain.value` now holds the right value, and Web Audio playback decouples from rAF (the AudioParam value persists indefinitely without further writes).

**`startRaf()` no-ops when no audioCtx.** Add a guard at the top of `startRaf()` to fix a sibling latent bug exposed by P5-1's new wake calls in `updateMotion()`:

```js
function startRaf() {
    if (!audioCtx || suspended) return;
    if (rafId !== null) return;
    lastEmaTime = performance.now();
    rafId = requestAnimationFrame(rafLoop);
}
```

Without this guard, `engine.updateMotion(...)` called before `engine.start()` (e.g. user drags map before clicking Start audio) would `requestAnimationFrame(rafLoop)` against a null `audioCtx`. The scheduled `rafLoop` would early-return on `!audioCtx`, leaving `rafId` pointing to a stale handle that the browser had already consumed. Subsequent `startRaf()` calls inside `start()` would then no-op on `if (rafId !== null) return`, and the engine would never tick — a different silent-killer with the same root cause class.

This guard is symmetrically defensive: pre-P5-1, `updateMotion` didn't call `startRaf` at all, so the stale-handle path didn't exist; post-P5-1 it does, so we close it.

## Why the original test suite missed this

The vitest `audio-context-mock` is synchronous: `mockFetchOk` returns a resolved Response, `decodeAudioData` returns immediately, `bufferCache.loadAll` resolves on the same microtask. There is no scenario where rAF can converge *during* `loadAll` because `loadAll` doesn't actually take time. The bug requires `loadAll` to take >3 seconds — only reproducible in real-browser cold-load conditions.

The structural CPU verification the original devlog cited ("post-patch the idle callback isn't scheduled") was correct in isolation; the silence was a separate functional defect that required a longer real-time window to surface than any unit test exercises.

A proper deterministic reproduction would need a fixture that drives `bufferCache.loadAll` through a controlled async delay (e.g. `await new Promise(r => setTimeout(r, 4000))` between sample loads) and asserts `gain.value` becomes non-zero by the time `start()` resolves. Building that is M5 work; for M4 we rely on the manual preview verification documented below.

## Files changed

- **Modified `frontend/audio/raf-loop.js`**: re-add `isEmaIdle(state, threshold)` export. Pure function, returns `true` when every EMA channel (buses, coverage, proximity, velocity) is within `threshold` of its target.
- **Modified `frontend/audio/engine.js`**:
  - import `isEmaIdle` alongside the existing EMA helpers.
  - add `IDLE_THRESHOLD = 0.001` module constant with documentation pointing here.
  - `update()`: append `startRaf()` to wake on target change.
  - `updateMotion()`: append `startRaf()` to wake on velocity change.
  - `rafLoop()`: at the end of the per-bus loop, check `isEmaIdle(ema, IDLE_THRESHOLD)` → on true, set `rafId = null` and return without rescheduling.
  - `startRaf()`: add `if (!audioCtx || suspended) return;` guard; reset `lastEmaTime = performance.now()` on wake.
  - `start()`: append `startRaf()` after `await bufferCache.loadAll(audioCtx)` — the missing sixth wake trigger.
- **Modified `frontend/__tests__/audio/raf-loop.test.js`**: add 7 `isEmaIdle` cases (fresh state, single-bus mismatch, coverage, proximity, velocity, threshold parameter, post-1000-tick convergence). Frontend total 62 → 69 vitest cases.
- **Added** `docs/devlog/M4/2026-04-27-M4-raf-idle-detection-redo.md` — this entry.
- **Modified** `docs/DEVLOG.md` — index this entry.

## Verification

- `npm run lint` clean
- `npm run format:check` clean
- `npm test` 167/167 backend
- `npm run test:frontend` 69/69 (was 62)
- `npm run smoke:wire-format` 3 routes / 3 WS types / 45 field names ok

Manual preview verification: hard reload, click Start audio, do not move the map. Seven-bus ambience audible within ~5 seconds. Confirmed.

## Defer to M5

- A deterministic CI reproduction of the loadAll/idle race (synthetic timing harness) is the right long-term backstop. Track in `docs/plans/M5/`.
- The CPU-drop ≥30% measurement target from proposal §11 still requires a manual DevTools Performance recording. Structural argument unchanged: the idle callback is not scheduled while idle, so per-frame cost is zero by construction.
- The `main.js` WS-onOpen vs. Mapbox style.load race noted in the original revert devlog is unrelated to this fix; it remains an open M5 item.
