# 2026-05-03 — Refactor: Extract voice-scheduler from audio/engine.js

`frontend/audio/engine.js` had grown to 1009 LOC by absorbing every layer of the audio stack: master chain, EMA smoothing, RAF loop, lifecycle, ducking, volume — and the per-bus double-buffered voice scheduler with its own global swap clock and loop slots. The voice scheduler is the largest, most self-contained sub-system inside it and was the natural fault line. Extract it into `frontend/audio/voice-scheduler.js` as a factory `createVoiceScheduler({ audioCtx, busGains, bufferCache, isSuspended })` that the engine binds inside `ensureCtx()`. Engine drops to 649 LOC; the scheduler stands at 461 LOC behind a small public API.

## Why

The voice scheduler had clean boundaries: it owns 5 pieces of mutable state (`busLoops`, `loopCycleSeconds`, `nextGlobalSwapTime`, `loopClockOrigin`, `loopCycleCount`, `globalSwapTimerId`), a tight set of internal helpers (slot lifecycle, voice creation, swap planning), and exposes only what the engine needs at lifecycle boundaries (`startAllSources`, `stopAllSources`, `scheduleGlobalSwap`, `clearGlobalSwapTimer`, `getLoopProgress`, `seekLoop`). Nothing in this set touches the EMA state, the master chain, or ducking. Pulling it out collapses engine.js into "lifecycle + EMA + master chain + ducking" without changing a single byte of audio routing or scheduling math.

Concretely:

- engine.js dropped from 1009 → 649 LOC (−360, ~36% reduction).
- voice-scheduler.js stands at 461 LOC, of which ~180 LOC is JSDoc + factory plumbing and ~280 LOC is the original scheduler logic verbatim.
- engine.js no longer imports any of the LOOP_* / VOICE_STOP / LATE_SWAP / RECOVERY / SWAP_LATE constants from `./constants.js`; those move with the code that uses them.
- Equal-power crossfade curves (FADE_IN/OUT) move with `swapBusVoice`.

The factory pattern matches what `audio/buffer-cache.js` and `audio/context.js` already do, and uses an `isSuspended()` getter rather than a flag-push so engine.js stays the single owner of the `suspended` state — the scheduler reads it on every scheduleGlobalSwap / performGlobalSwap entry.

## What changed

### `frontend/audio/voice-scheduler.js` (new, 461 LOC)

- `createVoiceScheduler(deps)` factory returning `{ startAllSources, stopAllSources, scheduleGlobalSwap, clearGlobalSwapTimer, getLoopProgress, seekLoop }`.
- Holds private state per instance: `busLoops`, `loopCycleSeconds`, `nextGlobalSwapTime`, `loopClockOrigin`, `loopCycleCount`, `globalSwapTimerId`.
- Module-level pure helpers (`createEmptyLoopSlot`, `disconnectVoice`, `stopSlotImmediately`, `scheduleVoiceStop`) live outside the factory — they don't depend on instance state.
- The `XF_CURVE_POINTS` constant + the precomputed `FADE_IN_CURVE` / `FADE_OUT_CURVE` (via `equalPowerCurves`) move here too — they're only used by `swapBusVoice`.
- The `console` log prefix becomes `[audio/voice-scheduler]` (was `[audio/engine]`) so future late-swap warnings attribute correctly.

### `frontend/audio/engine.js` (1009 → 649 LOC)

- New `import { createVoiceScheduler } from './voice-scheduler.js';`
- Imports trimmed: dropped `equalPowerCurves` from `utils.js` and seven LOOP_/VOICE_/LATE_/RECOVERY_/SWAP_ constants from `constants.js`.
- Module state additions: `let scheduler = null;` slot.
- `ensureCtx()` now also instantiates `scheduler = createVoiceScheduler({ audioCtx, busGains: gains, bufferCache, isSuspended: () => suspended })` immediately after the master chain is built. The lifetime invariant in the JSDoc is updated to include `scheduler`.
- All call sites that used to invoke local helpers now dispatch through `scheduler`:
    - `update()`'s suspended-resume branch calls `scheduler.scheduleGlobalSwap()`.
    - `handleVisibilityChange()` calls `scheduler.clearGlobalSwapTimer()` and `scheduler.scheduleGlobalSwap()`.
    - `stop()` calls `scheduler.stopAllSources()` (guarded by `if (scheduler)` for the never-started edge case).
    - `getLoopProgress()` and `seekLoop()` delegate to scheduler.
    - `bufferCache.onAllLoaded` now calls `() => scheduler && scheduler.startAllSources()` — the closure resolves `scheduler` at call time, by which point `ensureCtx()` has set it.
- Deleted from engine.js: `XF_CURVE_POINTS`, `FADE_IN_CURVE`/`FADE_OUT_CURVE`, the `LoopSlot`/`BusLoopState` typedefs, and 14 voice/loop helper functions (`createEmptyLoopSlot`, `disconnectVoice`, `stopSlotImmediately`, `clearGlobalSwapTimer`, `clearLoopClockState`, `resetBusLoop`, `resetAllBusLoops`, `createVoice`, `computeLoopCycleSeconds`, `scheduleVoiceStop`, `swapBusVoice`, `scheduleGlobalSwap`, `performGlobalSwap`, `stopAllSources`, `startAllSources`).
- Public surface of the exported `engine` is byte-identical: 16 entries, same names, same shapes.

### `frontend/__tests__/audio/voice-scheduler.test.js` (new, 12 cases)

Focused on the factory's externally observable contract:

- Public surface shape (returns the documented six methods).
- `startAllSources` creates one buffer source per bus when buffers are cached, skips uncached buses, arms a swap timer.
- `stopAllSources` drives `getLoopProgress` back to `null` and clears the timer.
- `getLoopProgress` returns `null` before start, a `[0, 1]` progress + positive cycle once running, `null` while suspended.
- `scheduleGlobalSwap` does not arm a timer while `isSuspended()` returns `true`.
- `seekLoop` is a no-op when no loop is running and creates a fresh voice per bus when one is.

## Verification

- `npm run test:frontend` → 103 passed (was 91; +12 new voice-scheduler tests). Existing 16 engine tests pass unchanged — the public surface contract is preserved.
- `npm run lint` clean.
- Browser smoke (`npm run dev`, headless preview):
    - Click audio toggle → status flips to "Loading…" then "Playing", icon `▶` → `■`. ✓
    - `engine.getLoopProgress()` returns `{ cycleSeconds: 120, progress: 0.085…0.091 }` over 1 s — increment of ~0.00208 per 250 ms matches `0.25 / 120 = 0.002083`, so the loop clock advances at the expected rate. ✓
    - Stop → "Audio off" + `▶`. Re-start → "Playing" + `■`. No errors across the toggle cycle. ✓
    - No console errors during start / play / stop / restart.

## Files changed

- **Added** `frontend/audio/voice-scheduler.js` — factory + scheduler logic (461 LOC).
- **Modified** `frontend/audio/engine.js` — wires scheduler in `ensureCtx`, delegates all voice/loop calls, drops 14 helpers + 7 constants imports (1009 → 649 LOC).
- **Added** `frontend/__tests__/audio/voice-scheduler.test.js` — 12 cases covering the factory's public surface.
- **Added** `docs/devlog/M6/2026-05-03-M6-frontend-engine-voice-scheduler-split.md` — this entry.
- **Modified** `docs/DEVLOG.md` — index this entry.
