# P0-1 — Production Code Changes

**Prerequisite:** None (first step, independent of P0-2)
**Trace:** Milestone 3 Phase 0 — Compatibility Guardrails
**Covers original:** Packet P0-A (Migration Plan P0) — testability extraction

## Cross-Reference to Original Packets

| This sub-step | Original Packet (Migration Plan P0) | Relationship |
|---------------|-------------------------------------|-------------|
| P0-1 | P0-A (Golden baseline harness) | Testability extraction portion |
| P0-2 | P0-A (Golden baseline harness) | Test infrastructure + fixture discovery |
| P0-3 | P0-A (Golden baseline harness) | Golden regression gate |
| P0-4 | P0-B (Provisional SLO benchmark) | Benchmark + scripts |
| P0-5 | — | Final verification sweep |

## Context

Make two surgical changes to `server/index.js` to enable testing the HTTP and WebSocket transport layers without calling `startServer()` (which loads real CSV data and binds hardcoded ports).

These are the **only** production code changes in all of P0.

**Forward-looking note:** `attachWsHandler` and `_setDataLoaded` are not consumed by any P0 test. They are extracted here as a low-risk, small change to prepare testability hooks for P1 transport-layer tests. Placing them in P0 ensures the production code extraction is reviewed in isolation before the test infrastructure lands.

## Changes

### 1. Extract `attachWsHandler(wss)` from `startServer()`

Currently, `startServer()` (index.js:207-375) contains the entire WebSocket `wss.on('connection', ...)` handler inline (lines 233-343). This is pure code motion — move it to a standalone function.

All variables referenced by the WS handler are already module-level:
- `dataLoaded` (line 48)
- `parseViewportBounds` (line 71)
- `processViewport` (imported from viewport-processor)
- `createModeState`, `createDeltaState` (imported from mode-manager, delta-state)
- `_statsCounter` (line 53)
- `BROADCAST_STATS`, `WS_MAX_BUFFERED` (line 45-46, config)
- `WS_PING_INTERVAL_MS` (line 42)

Create the function **above** `startServer()`:

```js
/**
 * Attach viewport message handling to a WebSocket server.
 * Extracted from startServer() for testability — pure code motion.
 *
 * Must be called exactly once per wss instance.
 * @param {import('ws').WebSocketServer} wss
 */
function attachWsHandler(wss) {
    if (wss._handlerAttached) {
        throw new Error('attachWsHandler called twice on the same wss instance');
    }
    wss._handlerAttached = true;

    wss.on('connection', (ws) => {
        // ... entire existing handler body from lines 234-342 ...
    });
}
```

Then replace the inline handler in `startServer()` with:
```js
attachWsHandler(wss);
```

**Verification:** The `startServer()` function must still work identically. The only behavioral addition is the idempotency guard (`_handlerAttached`) which is a safety net — production code calls `attachWsHandler` exactly once.

### 2. Add `_setDataLoaded(value)` internal setter

The module-level `let dataLoaded = false` (line 48) is currently only set inside `startServer()`. Tests need to toggle it for HTTP 503 and transport testing without calling `startServer()`.

Add immediately below the `dataLoaded` declaration:

```js
/**
 * @internal @test-only
 * Allow tests to toggle the dataLoaded flag without calling startServer().
 * @param {boolean} value
 */
function _setDataLoaded(value) {
    dataLoaded = value;
}
```

### 3. Update `module.exports`

Add both new functions to the existing exports:

```js
module.exports = {
    app,
    parseViewportBounds,
    startHttpServer,
    startWsServer,
    startServer,
    gracefulShutdown,
    attachWsHandler,    // new
    _setDataLoaded,     // new
};
```

## Steps

1. Add `_setDataLoaded(value)` function below line 48 in `server/index.js`.
2. Create `attachWsHandler(wss)` function above `startServer()` by extracting the `wss.on('connection', ...)` block (lines 233-343).
3. Replace the inline handler in `startServer()` with a single call to `attachWsHandler(wss)`.
4. Add `attachWsHandler` and `_setDataLoaded` to `module.exports`.
5. Run `npm test && npm run lint`.

## Self-Check

```bash
npm test
```

**Expected:** 10 suites, 113 tests, all green.

```bash
npm run lint
```

**Expected:** No errors.

**Manual verification:**
```bash
node -e "const m = require('./server/index'); console.log(typeof m.attachWsHandler, typeof m._setDataLoaded)"
# Expected: function function
# (startServer() is gated by `if (require.main === module)` at line 392, so this is safe)
```

## Exit

Report: "P0-1 complete. `npm test`: 10/10 green. `npm run lint`: clean. `attachWsHandler` and `_setDataLoaded` exported."
