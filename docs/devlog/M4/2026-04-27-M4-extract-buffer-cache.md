# 2026-04-27 — Refactor: Extract `frontend/audio/buffer-cache.js`

M4 P3-2. Lift the sample-loading subsystem out of `audio-engine.js` into a self-contained cache module. The cache owns the seven decoded `AudioBuffer`s, the per-bus loading state machine, the priority-phased `Promise.all` kickoff, the generation token system that lets stop() invalidate any in-flight fetch / decode / progress, and the public progress-update callback. `audio-engine.js` accesses buffers exclusively via `cache.get(i)` / `cache.has(i)`.

## What moved

From `audio-engine.js` into the cache:

- the `buffers[]` array (was a 7-slot module-level `const`)
- `loadingStates[]` and the `BusLoadingState` typedef
- `loadingGenerations[]` (per-bus cancel tokens)
- `loadingStarted` (re-entry guard for `loadAll`)
- `loadGeneration` (monotonic counter)
- `onLoadingUpdate` callback + `notifyLoadingUpdate()`
- `resetLoadingIfOwned()` and `isStaleGeneration()` helpers
- `loadSample()` (streaming fetch + content-length progress + 4 generation guards + decode + status notification)
- `loadAllSamples()` (priority-phased `Promise.all`, calls `onAllLoaded` on clean completion)
- the `BUS_NAMES`, `PRIORITY_FIRST`, `PRIORITY_SECOND` constants

## API

```js
const cache = createBufferCache({
    busNames: ['forest', 'shrub', 'grass', 'crop', 'urban', 'bare', 'water'],
    assetBase: ASSET_BASE,
    priorityFirst: [0, 6],
    prioritySecond: [1, 2, 3, 4, 5],
    onAllLoaded: () => startAllSources(),
});
cache.get(i)            // AudioBuffer | null
cache.has(i)            // boolean
cache.getStates()       // deep-copied BusLoadingState[]
cache.setOnUpdate(cb)   // forwarded by engine.setOnLoadingUpdate
cache.loadAll(audioCtx) // Promise<void>; bumps generation, runs both phases
cache.cancelAndReset()  // bumps generation, resets loading/error → pending, clears loadingStarted
```

`cancelAndReset` mirrors the pre-extraction behavior of `stop()`: it only fires the update callback when at least one bus actually changed (the original `loadingStateChanged` flag), so UI render fidelity is preserved.

## Engine integration

| Old | New |
|---|---|
| `buffers[i]` (read, 6 sites) | `bufferCache.get(i)` |
| `if (buffers[i])` (4 sites) | `if (bufferCache.has(i))` |
| `notifyLoadingUpdate()`, `loadSample(i, gen)`, `loadAllSamples(gen)` | _moved into cache_ |
| `start()`: `loadGeneration++; await loadAllSamples(loadGeneration);` | `await bufferCache.loadAll(audioCtx);` |
| `stop()`: 12-line cleanup block | `bufferCache.cancelAndReset();` |
| `getLoadingStates()` body | `return bufferCache.getStates();` |
| `setOnLoadingUpdate(cb)` body | `bufferCache.setOnUpdate(cb);` |

Public API surface (`engine.{start, stop, update, getLoadingStates, setOnLoadingUpdate, …}`) is unchanged. `frontend/main.js` calls `engine.setOnLoadingUpdate(renderLoadingUI)` and `engine.getLoadingStates()` — both still work, now via the forwarder.

## Why now

`loadSample` was the single hairiest piece of `audio-engine.js`: streaming `fetch` with progress, content-length parsing, four `isStaleGeneration` checkpoints around async boundaries, decode, status notification, error path. All of it was unreachable from happy-dom (no `fetch` body streaming, no `decodeAudioData`) and so had 0% coverage on `feat/M4` HEAD pre-stage. Pulling it into a sibling module gives it a real test surface against `vi.stubGlobal('fetch', …)` + the P0-1 audio-context mock.

The cache also makes the `loadSample` → `startAllSources` coupling explicit. Previously `loadAllSamples` reached into the same file to call `startAllSources`. The factory takes `onAllLoaded` at construction, so the dependency is named at the call site (`onAllLoaded: () => startAllSources()`), not buried in the function body. P3-4 will revisit this when `audio/engine.js` lands.

## Tests added

`frontend/__tests__/audio/buffer-cache.test.js` — 11 new vitest cases:

1. Empty cache: `get` returns `null`, `has` returns `false`, `getStates` reports all pending
2. Successful `loadAll` populates every buffer, marks every state ready, calls `decodeAudioData` 7 times
3. `onAllLoaded` fires exactly once on clean completion
4. Priority phases run in order: every priority-first URL is fetched before any priority-second URL
5. `setOnUpdate` callback fires through the pending → loading → ready transitions for bus 0
6. `getStates()` returns a deep-copied snapshot — mutating it does not leak back into the cache
7. Re-entry guard: a second `loadAll` while the first is in flight is a no-op (verified by `fetch` call count = 7 not 14)
8. `cancelAndReset` mid-flight aborts the kickoff: `onAllLoaded` never fires
9. After `cancelAndReset` + a fresh `loadAll`, the new run completes cleanly and fires `onAllLoaded`
10. A single failing bus (HTTP 503) does not block the rest; that bus's state is `'error'` with the HTTP code; other buses load normally; `onAllLoaded` still fires (mirrors prior behavior — errors don't block startup)
11. Common pending-state assertion shared across the empty-state group

Coverage on `frontend/audio/buffer-cache.js`: **94.94% statement / 75.92% branch / 100% function** (proposal §11 target ≥ 70%). Uncovered lines (89, 91-94, 113-117) are inside the "stale generation reset on a previously-loading bus" path — reachable only via interleaved concurrent loadSample calls, not worth synthesizing.

Total frontend vitest count: 22 → **33** (10 utils + 12 context + 11 buffer-cache).

## File-size impact

- `frontend/audio-engine.js`: **1103 → 914 lines** (-189). The full WAV-loading section, the loading-state block, three helpers, and three constants depart.
- New `frontend/audio/buffer-cache.js`: **230 lines** (factory + JSDoc + private state + 7 public methods).
- Net: +41 lines repo-wide, but the ~190 moved LOC went from 0% covered to 95% covered.

Cumulative P3 progress on `audio-engine.js`: 1186 → 914 (-272 lines, -23% so far across P3-0/1/2 with P3-3/4 still pending). Proposal §11 target: ≤ 800 lines on the largest single audio module.

## Verification

- `npm run lint` / `format:check` — clean.
- `npm test` — 15 server suites / 160 jest pass.
- `npm run test:frontend` — **33 vitest pass** (22 prior + 11 new).
- `npx vitest run --coverage` — see coverage table above.
- `npm run smoke:wire-format` — 3 routes / 3 WS types / 45 fields ok.
- **Preview runtime cycle** on `npm run dev`:
    - Page load → `__acCount = 0` (no AudioContext at module-eval time).
    - Start → `__acCount = 1`, status `Playing`, loop-progress fill 10.78% (proves: cache fetched all 7 buses, decoded, onAllLoaded → startAllSources fired, rAF loop is ticking off real audio time).
    - Stop → status `Audio off`, `__acCount` stays 1.
    - Start again → status `Playing`, fill 3.67%, **count still 1** — buffers reused (cache.get returns the prior AudioBuffers), no re-fetch, idempotent across the cycle.
    - 0 console errors throughout.

## Risks and rollback

- **Risk**: `cache.get(i)` returns `null` at one of the 9 rewritten call sites where the prior code expected an empty placeholder. **Mitigation**: prior code already null-checked `buffers[i]` in every read site; tests 1 and 2 verify cache.get returns null pre-load and the AudioBuffer post-load.
- **Risk**: `cancelAndReset` notifies subtly differently from the prior inline block. **Mitigation**: cache preserves the `loadingStateChanged` conditional fire; tests 8 + 9 cover the cancel/reload roundtrip.
- **Risk**: `onAllLoaded: () => startAllSources()` captures the function reference at module load, when `startAllSources` is hoisted but its closure not yet ready. **Mitigation**: `startAllSources` is a function declaration, hoisted to module-init time; the arrow-function indirection guarantees lazy resolution at call time, not at construction. Preview Start verifies the actual call fires correctly.
- **Rollback**: revert the commit on `feat/M4`. P3-3 (`raf-loop.js`) and P3-4 (`engine.js`) not yet started.

## Files changed

- **Added**: `frontend/audio/buffer-cache.js` — 230-line module exporting `createBufferCache`.
- **Added**: `frontend/__tests__/audio/buffer-cache.test.js` — 11 vitest cases (94.94% statement / 75.92% branch coverage on `buffer-cache.js`).
- **Added**: `docs/plans/M4/P3/2026-04-27-M4P3-2-extract-buffer-cache.md` — stage plan.
- **Added**: `docs/devlog/M4/2026-04-27-M4-extract-buffer-cache.md` — this entry.
- **Modified**: `frontend/audio-engine.js` — 1103 → 914 lines. Removed `BUS_NAMES`, `PRIORITY_FIRST`, `PRIORITY_SECOND`, `buffers[]`, `loadingStates[]`, `loadingGenerations[]`, `loadingStarted`, `loadGeneration`, `onLoadingUpdate`, `notifyLoadingUpdate`, `resetLoadingIfOwned`, `isStaleGeneration`, `loadSample`, `loadAllSamples`. Added `import { createBufferCache }` and the cache instantiation. Replaced 9 `buffers[i]` read sites with `cache.get(i)` / `cache.has(i)`. Updated `start()` / `stop()` / `getLoadingStates()` / `setOnLoadingUpdate()` to forward to the cache.
- **Modified**: `docs/DEVLOG.md` — index this entry.
