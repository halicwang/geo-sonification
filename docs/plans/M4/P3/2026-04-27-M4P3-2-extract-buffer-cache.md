# P3-2 — Extract `frontend/audio/buffer-cache.js`

**Prerequisite:** P3-1 (`audio/context.js` factory in place)
**Trace:** Milestone 4 Phase 3 — Audio decomposition
**Companion:** [M4 razor-refactor proposal](../2026-04-27-M4-razor-refactor-proposal.md) §7

## Context

P3-2 lifts the sample-loading subsystem out of `audio-engine.js` into a self-contained cache module. The cache owns:

- the seven decoded `AudioBuffer`s
- the per-bus `loadingStates` (status / progress / error)
- the per-bus `loadingGenerations` (cancellation tokens)
- the global `loadGeneration` counter
- the `loadingStarted` re-entry guard
- `notifyLoadingUpdate` and the `onUpdate` callback
- `loadSample` (fetch + decode + 4-point generation guard)
- `loadAllSamples` (priority-phased `Promise.all`)
- the `BUS_NAMES` / `ASSET_BASE` / `PRIORITY_FIRST` / `PRIORITY_SECOND` config

Engine call sites for `buffers[i]` (9 of them) become `cache.get(i)` / `cache.has(i)`. Engine call sites for `loadingStates[i]` (only inside `stop()`) become `cache.cancelAndReset()`.

## Why

`loadSample` is the hairiest piece of `audio-engine.js`: streaming `fetch` with progress, content-length parsing, four `isStaleGeneration` checks, decode, status notification, error path. None of it has a unit test today (proposal §11 baseline: 0%). Pulling it into its own module gives it a real test surface against `vi.stubGlobal('fetch', ...)` + the P0-1 `decodeAudioData` mock — proposal §11 target ≥ 70%.

`loadAllSamples` and `startAllSources` are coupled by a callback in the current code. The cache exposes that coupling explicitly: callers pass `onAllLoaded` at construction time. The cache calls it iff the priority phases complete on a non-stale generation. Engine assigns `onAllLoaded: () => startAllSources()` and the call flow is unchanged.

## API

```js
import { createBufferCache } from './audio/buffer-cache.js';

const cache = createBufferCache({
    busNames: ['forest', 'shrub', 'grass', 'crop', 'urban', 'bare', 'water'],
    assetBase: ASSET_BASE,
    priorityFirst: [0, 6],
    prioritySecond: [1, 2, 3, 4, 5],
    onAllLoaded: () => startAllSources(),  // fires on clean completion
});

cache.get(busIndex)           // AudioBuffer | null
cache.has(busIndex)           // boolean
cache.getStates()             // BusLoadingState[] (deep-copied snapshot)
cache.setOnUpdate(callback)   // null to clear
await cache.loadAll(audioCtx) // bumps generation, runs priority phases, fires onAllLoaded
cache.cancelAndReset()        // bumps generation; resets loading/error → pending; clears loadingStarted
```

`get` / `has` / `getStates` / `setOnUpdate` are sync. `loadAll` returns the promise that the existing `loadAllSamples` already returned. `cancelAndReset` is sync.

## Engine integration

Call sites:

| Old (in `audio-engine.js`) | New |
|---|---|
| `buffers[i]` (read, 6 sites) | `bufferCache.get(i)` |
| `if (buffers[i])` (4 sites) | `if (bufferCache.has(i))` (or unchanged via `if (bufferCache.get(i))`) |
| `notifyLoadingUpdate()` | _moved into cache_ |
| `loadSample(i, gen)` | _moved into cache_ |
| `loadAllSamples(gen)` | `bufferCache.loadAll(audioCtx)` |
| `loadGeneration++; loadingStarted = false; reset error states` (`stop()`) | `bufferCache.cancelAndReset()` |
| Public `getLoadingStates` | forwards to `bufferCache.getStates()` |
| Public `setOnLoadingUpdate(cb)` | forwards to `bufferCache.setOnUpdate(cb)` |

The engine no longer keeps `loadingStates`, `loadingGenerations`, `loadingStarted`, `loadGeneration`, `onLoadingUpdate`, `notifyLoadingUpdate`, `resetLoadingIfOwned`, `isStaleGeneration`, `loadSample`, `loadAllSamples`, `BUS_NAMES`, `PRIORITY_FIRST`, `PRIORITY_SECOND`. The local `BUS_NAMES` constant moves into the cache instantiation site (engine still passes it to the cache and to `audioParams` typedefs as needed); `ASSET_BASE` is already imported from `./config.js` and stays.

## Tests (`frontend/__tests__/audio/buffer-cache.test.js`)

`vi.stubGlobal('fetch', mock)` returns a `Response`-like object whose `body.getReader()` yields one chunk and reports `Content-Length`. `audioCtx.decodeAudioData` is the mock from P0-1. Cases:

1. **Empty cache**: `get(i)` returns `null` for every bus before `loadAll`.
2. **Successful load**: after `loadAll` resolves, `get(i)` returns the mock AudioBuffer for every bus and `getStates()[i].status === 'ready'`.
3. **Priority order**: `priorityFirst` buses' loading state transitions from pending → loading before any `prioritySecond` bus is touched. (Spy on `setOnUpdate` callback.)
4. **`onAllLoaded` fires once on clean completion**.
5. **Generation guard — cancel mid-load**: kick off `loadAll`, immediately `cancelAndReset`, await; `onAllLoaded` was **not** called; `get(i)` returns `null`.
6. **Re-entry guard**: two parallel `loadAll` calls on the same audioCtx — second is a no-op (verified by `fetch` call count).
7. **Error path**: a fetch returns `ok: false`; that bus's state is `'error'`; other buses still complete; `onAllLoaded` still fires (mirrors current behavior — errors don't block startup).
8. **Update callback**: progressive updates fire (pending → loading → loading-with-progress → ready) for at least one bus.
9. **`getStates()` returns deep-copied snapshot**: mutating the snapshot doesn't change subsequent `getStates()` returns.

Coverage target: ≥ 70% on `audio/buffer-cache.js`. The error-path test pushes coverage past the bare happy path.

## Definition of Done

- `frontend/audio/buffer-cache.js` exists, exports `createBufferCache`.
- `frontend/audio-engine.js` no longer holds any of the listed loading state or helpers; cache is instantiated once at module init alongside the other audio module wiring.
- `frontend/__tests__/audio/buffer-cache.test.js` covers all 9 cases; `npm run test:frontend` green; coverage ≥ 70%.
- `npm run lint` / `format:check` / `npm test` / `npm run smoke:wire-format` — all green.
- `wc -l frontend/audio-engine.js` strictly less than the post-P3-1 baseline (1103); expect ~950–1000 after this stage.
- Preview verification: Start → audio plays as before, both priority phases load in observed order, `__acCount = 1`, no console errors. Stop → idempotent. Start again → audio resumes (existing buffers reused, no re-fetch).
- Devlog `docs/devlog/M4/2026-04-27-M4-extract-buffer-cache.md` + DEVLOG.md index entry.

## Risks and rollback

- **Risk**: `cache.get(i)` mismatches `buffers[i]` semantics at one of the 9 call sites.
    - **Mitigation**: each rewrite is mechanical; pre/post compare `grep -n "buffers\["` (audio-engine.js drops to 0) and `grep -n "cache.get\|cache.has"` (audio-engine.js gains 9). Preview Start path then verifies the integrated chain.
- **Risk**: `cancelAndReset` resets state slightly differently from the inline stop() block.
    - **Mitigation**: cache state is identical to the prior inline state (same fields, same lifecycle); test 5 (cancel mid-load) verifies.
- **Risk**: `setOnUpdate` callback semantics differ from the prior `onLoadingUpdate` (e.g. firing too eagerly).
    - **Mitigation**: cache calls the callback at the same points as the old `notifyLoadingUpdate` — preserved by code motion. Test 8 verifies progressive transitions.
- **Rollback**: revert this commit on `feat/M4`. P3-3 / P3-4 not yet started.
