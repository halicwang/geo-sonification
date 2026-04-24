# 2026-04-23 — Fix: Audio Status Stuck on "Loading…" After Second Start

Pressing play → pause → play again would leave the audio-status
text pinned at `Loading…` forever, even though playback had
already resumed. Root cause: on the second start the bus buffers
are already cached, the engine never re-fires its loading
callback, and the "Loading…" string written by `main.js` at the
top of the toggle handler was therefore never overwritten by the
usual `renderLoadingUI` transition to `Playing`.

## Root Cause

Flow on the **first** start:

1. `main.js` sets `audio-status` text to `Loading…`.
2. Registers `renderLoadingUI` via
   `engine.setOnLoadingUpdate(...)`.
3. `engine.start()` kicks off WAV network fetches; each
   completion fires `notifyLoadingUpdate()` inside the engine,
   which calls `renderLoadingUI(states)`.
4. Once all seven buses resolve, the callback enters the
   `readyCount + errorCount === states.length` branch and writes
   `Playing`.

Flow on the **second** (or later) start:

1. Same `Loading…` write.
2. Same `setOnLoadingUpdate` call.
3. `engine.start()` returns without fetching anything — all seven
   `AudioBuffer`s are still in memory from the first start, so
   `notifyLoadingUpdate()` is not called at all. `setOnLoadingUpdate`
   itself just stores the reference
   (`audio-engine.js:1016-1018`); it does not re-emit the current
   state.
4. Nothing overwrites `Loading…` → UI bug.

## Fix

In `frontend/main.js`, immediately after registering the callback,
invoke `renderLoadingUI` once with the engine's current states.
The existing branch logic handles both cases:

- **First start** — all seven states are `pending`; none of the
  three branches in `renderLoadingUI` (all-failed / all-finalized /
  some-loading) match, so the function is effectively a no-op and
  the `Loading…` text from the previous line stays.
- **Second+ start** — all seven are `ready`;
  `readyCount + errorCount === states.length` matches, text
  flips to `Playing` before the `await engine.start()` even
  returns.

One extra `renderLoadingUI(engine.getLoadingStates())` call, no
engine-side changes, no new API surface.

## Changes

### `frontend/main.js`

- In the audio-toggle "enable" branch, right after the existing
  `engine.setOnLoadingUpdate(renderLoadingUI)`, call
  `renderLoadingUI(engine.getLoadingStates())` once. A short
  comment explains the second-start reason so a future reader
  doesn't mistake it for redundancy with the event callback.

## Verification

- `npm run format:check` — clean.
- `npm run lint` — clean.
- `npm test` — 14 suites / 154 tests pass (server-side only; no
  server changes).
- `curl http://localhost:3000/main.js` confirms the new
  `renderLoadingUI(engine.getLoadingStates())` line ships.
- Browser pass left to the user's reload on the running dev
  server: press play → wait for `Playing` → press pause → press
  play again → status should now flip to `Playing` without
  getting stuck on `Loading…`.

## Files Changed

- **Modified**: `frontend/main.js` — one extra call + inline
  comment.
- **Modified**: `docs/DEVLOG.md` — index entry.
- **Added**: this entry.
