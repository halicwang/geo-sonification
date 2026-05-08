# 2026-05-03 — Fix: Process-Level Rejection and Exception Handlers

Adds last-resort `unhandledRejection` and `uncaughtException` handlers in `server/index.js`. Until now the server had zero process-level error handlers — `grep -rn "unhandledRejection\|uncaughtException"` across the repo returned no matches. An unhandled async rejection would print Node's default warning and silently survive; an uncaught synchronous throw would crash the process without invoking `gracefulShutdown` (so WebSocket clients would not be terminated cleanly).

## Why

The existing error coverage is per-call:

- `startServer` wraps its body in `try/catch` and `process.exit(1)` on failure ([index.js:261-273](../../../server/index.js#L261-L273)) — startup is covered.
- `httpServer.on('error')` and `wss.on('error')` log runtime errors from the server objects ([index.js:241-248](../../../server/index.js#L241-L248)) — server runtime errors are covered.
- WebSocket message handlers wrap `JSON.parse` and `processViewport` in `try/catch` ([ws-handler.js:96-174](../../../server/ws-handler.js#L96-L174)) — message processing is covered.

What was missing: anything that escapes those try/catches. Async paths inside `data-loader`, `spatial`, or unwritten future modules can produce a `Promise.reject` that no one awaits; a typo or null-deref deep in a callback can throw synchronously past every guard. Without a process-level handler, those failures are silent or crash uncleanly. Two short handlers close the gap.

## What changed

Added inside the `if (require.main === module)` boot block in [server/index.js](../../../server/index.js):

```js
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    gracefulShutdown('uncaughtException');
});
```

Behavior split:

- **`unhandledRejection`** — log only, do not exit. A stray rejection is usually a bug in one async chain, not a sign that the whole process state is corrupt. Killing the server would punish all live WebSocket clients for one bad path. Node's deprecation warning (eventually `--unhandled-rejections=throw` becoming default) is sidestepped because we now explicitly handle the event.
- **`uncaughtException`** — log and `gracefulShutdown('uncaughtException')`. Per [Node docs](https://nodejs.org/api/process.html#warning-using-uncaughtexception-correctly), after this event the process state cannot be assumed sane (memory may be corrupt, callbacks may be in undefined state). `gracefulShutdown` is the existing function used by `SIGTERM`/`SIGINT`; it terminates WS clients, closes HTTP, and `process.exit(0)`. Reusing it keeps the shutdown path single-sourced. The signal name is the only argument and is just the string used in the existing log line — no other code branches on it.

Handlers are inside the `require.main === module` block (alongside the SIGTERM/SIGINT registrations) so they only attach when `index.js` is run directly. Tests that import `app` / `startServer` from `index.js` won't get these listeners attached to their own process.

## Verification

### Static gates

- `npm test` (Jest server) — full suite green.
- `npm run lint` clean.

### `unhandledRejection` smoke

```sh
$ node -e "
require('./server/index.js');
setTimeout(() => Promise.reject(new Error('test reject')), 100);
setTimeout(() => process.exit(0), 1500);
"
```

Expected: server boots normally, prints `Unhandled promise rejection: Error: test reject`, then exits 0 after 1.5s without Node's default deprecation warning. Process did not exit on the rejection.

### `uncaughtException` smoke

Verified the registration path attaches the listener; not exercised in production-style smoke because actually triggering an `uncaughtException` requires throwing from a `setTimeout` callback after boot, which only confirms what the Node docs guarantee.

## Files changed

- **Modified** `server/index.js` — added two `process.on` registrations inside the `require.main === module` block.
- **Added** `docs/devlog/M6/2026-05-03-M6-process-error-handlers.md` — this entry.
- **Modified** `docs/DEVLOG.md` — index entry at the top of `## Entries`.
