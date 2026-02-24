# 2026-02-23 — Fix: Audio Engine Code Review Fixes

Addressed five issues found during code review of the browser audio engine: removed dead `oceanTarget`/`oceanSmoothed` state, guarded against duplicate `start()` calls, reset `loadingStarted` on failure, fixed crossfade `setValueAtTime` scheduling collisions, and synced `proximitySmoothed` on visibility restore.

## What changed

- **`frontend/audio-engine.js`**: Removed unused `oceanTarget` / `oceanSmoothed` EMA variables and the `oceanLevel` parameter path — ocean mix is now derived entirely from `coverage`.
- **`frontend/audio-engine.js`**: Water bus gain calculation simplified from `Math.max(landValue, Math.max(oceanSmoothed, oceanMix))` to `Math.max(landValue, oceanMix)`.
- **`frontend/audio-engine.js`**: Added early-return guard in `start()` when audio is already running (`audioCtx && !suspended`), preventing duplicate context setup.
- **`frontend/audio-engine.js`**: Wrapped `loadAllSamples()` body in `try/finally` to reset `loadingStarted = false` on error, preventing retry lockout after transient fetch failures.
- **`frontend/audio-engine.js`**: Crossfade `setValueAtTime(1/0)` calls now schedule at `swapTime + overlapRemaining + VOICE_STOP_GRACE_SECONDS` instead of exactly `swapTime + overlapRemaining`, avoiding a scheduling collision with the tail of the preceding `setValueCurveAtTime` envelope.
- **`frontend/audio-engine.js`**: Visibility-restore path now resets `proximitySmoothed = proximityTarget` (was missing), matching the existing pattern for bus and coverage smoothing.

## Files changed

- `frontend/audio-engine.js` — dead code removal, start guard, loading resilience, crossfade timing, visibility restore fix (modified)
