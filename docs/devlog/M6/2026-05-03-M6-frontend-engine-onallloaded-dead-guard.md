# 2026-05-03 — Refactor: Drop Dead `scheduler &&` Guard in onAllLoaded

Follow-up to the voice-scheduler split (`2cae574`). Removed a stray `scheduler &&` short-circuit from the `bufferCache.onAllLoaded` callback in `frontend/audio/engine.js` — by the time the callback fires, `scheduler` is always non-null.

## Why

The callback wired at module-init time:

```js
onAllLoaded: () => scheduler && scheduler.startAllSources(),
```

`onAllLoaded` is invoked exclusively from inside `bufferCache.loadAll(audioCtx)`, which is only called from `engine.start()`. `start()` calls `ensureCtx()` synchronously first, and `ensureCtx` assigns `scheduler = createVoiceScheduler(...)` before returning. By the time `loadAll`'s priority phases finish and the callback fires, `scheduler` is therefore guaranteed to be non-null. The `scheduler &&` short-circuit was dead defensive code I introduced during the split.

The three remaining `if (scheduler)` guards in `stop()`, `getLoopProgress()`, and `seekLoop()` are kept — they preserve the original "callable before `start()` = no-op / null" semantics that those entry points already had (the previous module-level `stopAllSources()` ran no-ops over pre-initialised empty slots; the previous `getLoopProgress` / `seekLoop` short-returned on `!audioCtx`).

## What changed

### `frontend/audio/engine.js`

- Single line edit:
    ```js
    -    onAllLoaded: () => scheduler && scheduler.startAllSources(),
    +    onAllLoaded: () => scheduler.startAllSources(),
    ```

## Verification

- `npm run test:frontend` → 125 passed.
- `npm run lint` clean.
- Browser smoke: clicked the audio toggle in `npm run dev`, status flipped to "Playing", no console errors. The full `start() → ensureCtx → loadAll → onAllLoaded → scheduler.startAllSources()` chain runs without the guard.

## Files changed

- **Modified** `frontend/audio/engine.js` — drop dead `scheduler &&` short-circuit in `bufferCache.onAllLoaded` (1 LOC).
- **Added** `docs/devlog/M6/2026-05-03-M6-frontend-engine-onallloaded-dead-guard.md` — this entry.
- **Modified** `docs/DEVLOG.md` — index this entry.
