# 2026-04-25 — Fix: Defer Panel Stale Warning Until Disconnect Persists Past Grace Window

The info-panel's `.stale` red-text warning was triggered by an indirect
proxy — the WebSocket reconnect-backoff counter — rather than by any
real measure of how long data had actually been stale. As soon as
`state.runtime.wsReconnectDelay >= 4000`, the warning fired, even when
the underlying disconnect was a transient flap that recovered in a
second or two. With the panel now expanded by default for the trademark
specimen, this over-eager logic became user-visible: short reconnect
cycles (e.g. browser tab refocus, dev `node --watch` restart) painted
the warning for users who actually had fresh data.

Switch the trigger to a **grace window** — disconnect → start a 5 s
timer → mark stale only if the connection is still down when the timer
fires. Any successful reconnect inside the window cancels the timer.

## Why the old logic was wrong

`updateConnectionStatus(false)` ran inline checks against
`wsReconnectDelay`. The backoff counter doubles per `onclose`
(1 s → 2 s → 4 s → 8 s → ... up to `WS_RECONNECT_MAX = 30 s`) and
resets to 1 s on `onopen`. Two close events without a successful open
between them put the counter at 4 s — enough to trip the stale
indicator regardless of actual data age.

The real signal users care about is "has data stopped flowing for long
enough that I should distrust what's on screen?" That's a wall-clock
question about the disconnect duration, not a question about how many
times we've doubled an exponential backoff.

## Changes

### `frontend/config.js`

- New constant `STALE_GRACE_MS = 5000`. JSDoc explains the tradeoff:
  long enough to absorb a normal reconnect cycle (typically <2 s on
  healthy networks), short enough that a real outage surfaces quickly.

### `frontend/ui.js`

- New module-level `_staleTimerId` (mirrors the existing
  `_toastTimerId` pattern).
- `updateConnectionStatus(connected)` rewritten:
    - On `connected = true`: clear the `.stale` class and cancel any
      pending stale timer.
    - On `connected = false`: schedule a stale timer for
      `STALE_GRACE_MS` (only if no timer is already pending — the
      function may be called multiple times during a flap, but we
      want only one timer per disconnect window).
    - When the timer fires, double-check `state.runtime.ws.readyState
      !== WebSocket.OPEN` before applying the class. This guards
      against the rare case where the timer fires during a successful
      `onopen` callback chain that hasn't yet bubbled up to call
      `updateConnectionStatus(true)`.
- Add `STALE_GRACE_MS` to the `./config.js` import.

### `frontend/websocket.js`

- Drop the `// Bump delay before status check so stale indicator
  triggers sooner` comment above the `wsReconnectDelay` doubling line.
  The exponential backoff itself stays — it's the right behavior for
  reconnect pacing — but it no longer drives the stale UI, so the
  comment was misleading.

## What's intentionally preserved

- The exponential reconnect backoff (1 s → 2 s → 4 s → ... → 30 s
  cap). It's the right shape for a reconnect schedule (avoids
  hammering a flapping server) and is independent of the stale UI.
- `state.runtime.wsReconnectDelay` itself, even though no UI code
  consumes it anymore — it's read in the `setTimeout` call at the
  bottom of `onclose` to compute the next reconnect delay.
- The `WS_RECONNECT_MAX = 30000` constant.

## Verification

1. **Healthy reload** — `Cmd + Shift + R` in the browser. Console shows
   the usual `WebSocket disconnected, reconnecting in 2s...` →
   `WebSocket connected` cycle. Panel stays in "Connected to server",
   no red text.
2. **Real outage** — `kill -TERM <server PID>` to drop the listener.
   After ~5 s the panel switches to "Reconnecting..." with the red
   "Data may be stale" warning. Restart the server, reload the page;
   warning clears.
3. **Transient flap** — short SIGSTOP/SIGCONT cycles on the server (or
   network throttling in DevTools) produce reconnect logs in console
   but no stale warning, because the disconnect resolves inside the
   5 s window.
4. `npm run lint` — clean.
5. `npm run format:check` — clean.
6. No server changes; `npm test` not re-run.

## Files Changed

- **Modified**: `frontend/config.js` — `STALE_GRACE_MS` constant.
- **Modified**: `frontend/ui.js` — `updateConnectionStatus` rewritten
  around the grace timer.
- **Modified**: `frontend/websocket.js` — drop misleading comment
  about `wsReconnectDelay` driving stale UI.
- **Modified**: `docs/DEVLOG.md` — index entry.
- **Added**: this entry.
