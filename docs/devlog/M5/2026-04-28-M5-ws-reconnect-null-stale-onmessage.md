# 2026-04-28 — Fix: Null Stale WebSocket `onmessage` During Reconnect

`connectWebSocket()` already nulled `onclose` on the previous socket
before calling `close()` (to suppress recursive reconnects), but it left
`onmessage` attached. A frame already in the receive pipeline at the
moment of `close()` can still fire `onmessage` on the old socket during
the closing handshake, which then calls `callbacks.onStats(data)` and
writes "ghost" `busTargets` into the audio engine even though
`state.runtime.ws` now points to the new socket. The next frame from the
fresh connection overwrites it, so the audible artefact is bounded by
one EMA tick (~16 ms), but the asymmetric handler-nulling was a code
smell — fix it by silencing the stale socket completely.

## Change

`frontend/websocket.js` — null both `onclose` and `onmessage` before
calling `close()` on the previous socket. `onerror` is left attached
because its handler only logs; `onopen` will not fire on a socket that
is already being closed.

## Why this surfaced now

A self-audit pass over the recent frontend churn (mobile bottom sheet,
panel a11y, deploy pipeline) flagged the asymmetric handler clearing.
Most of the other "potential bugs" found in the same audit turned out
to be false positives once cross-checked against the actual code (e.g.
`audioCtx.close()` is never called, so the suspended-vs-closed gate is
unreachable; `httpClientCleanupTimer` is restarted by every
`saveHttpClientState`, so the "stopped timer" race cannot occur). This
one was real, even if narrow.

## Files changed

- **modified** `frontend/websocket.js` — null `onmessage` alongside
  `onclose` when tearing down the previous socket; expand the comment
  to name both reconnect-recursion and in-flight-stats hazards.
