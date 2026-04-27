# P3-0 — Audio-Engine Lazy Initialization

**Prerequisite:** P0-3 (audio/utils.js + audio/constants.js extracted), P2-2 complete
**Trace:** Milestone 4 Phase 3 — Audio decomposition
**Companion:** [M4 razor-refactor proposal](../2026-04-27-M4-razor-refactor-proposal.md) §7

## Context

P3-1..P3-4 will pull master-chain creation, buffer-cache, and the rAF loop out of `frontend/audio-engine.js` into separate modules under `frontend/audio/`. Once those modules exist, every one of them needs the same `AudioContext` instance — but only after the user has clicked Start (browser autoplay policy forbids creating an `AudioContext` at module load).

Today the entire master-graph build is inlined in `start()` (lines 857-925), guarded by `if (!audioCtx) { ... }`. That works while everything lives in one file. As soon as a sibling module (e.g. `audio/buffer-cache.js`) tries to call `audioCtx.decodeAudioData(...)`, it has no way to know whether the graph is already built — and naively creating its own would yield a second `AudioContext`, doubling CPU and breaking routing.

P3-0 prepares for the split by extracting the graph-build block into a private idempotent helper, **without changing any external behavior**. After this stage, every future call site (current `start()`, future `audio/context.js` consumers) takes the same path: `ensureCtx()` → returns the singleton `audioCtx` and guarantees the master chain is wired.

## Non-goals

- No new exports. The shape of the public API (`start`, `stop`, `update`, `duck`, `unduck`, `getLoadingStates`, `setOnLoadingUpdate`, etc.) does not change.
- No file moves. `frontend/audio-engine.js` stays as one file. The module split happens in P3-1..P3-4.
- No behavior change. The graph-build block is moved verbatim; idempotency was already provided by the existing `if (!audioCtx)` guard, which `ensureCtx()` simply formalizes.

## Changes

### 1. Add private `ensureCtx()` helper

Insert above `start()` (around line 845):

```js
/**
 * Idempotently create the AudioContext + master chain. Safe to call
 * multiple times — second and later calls are a no-op and return the
 * existing context. Must be invoked from a user gesture on first call
 * (browser autoplay policy).
 *
 * @returns {AudioContext}
 */
function ensureCtx() {
    if (audioCtx) return audioCtx;

    audioCtx = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 48000,
    });

    masterGain = audioCtx.createGain();
    masterGain.gain.value = masterVolume;

    // 36 dB/oct low-pass: three cascaded 12 dB/oct biquads.
    lpFilter1 = audioCtx.createBiquadFilter();
    // ... (the existing block from lines 868-924, verbatim) ...

    return audioCtx;
}
```

The body is the existing `if (!audioCtx) { ... }` content from `start()` lines 857-925, moved unchanged.

### 2. Replace inline block in `start()`

```js
async function start() {
    if (audioCtx && !suspended) return;
    ensureCtx();

    document.addEventListener('visibilitychange', handleVisibilityChange);
    // ... rest of start() unchanged ...
}
```

### 3. No change to other call sites

Other functions (`scheduleGlobalSwap`, `triggerLoopSwap`, `loadSample`, etc.) already null-check `audioCtx` before use — those guards are correct and stay. They will be replaced by `ensureCtx()`-based access only when their owning logic moves into a sibling module in P3-1..P3-4.

## Definition of Done

- `frontend/audio-engine.js` has a private `ensureCtx()` function. Body is byte-identical to the prior inline block, except for the `if (audioCtx) return audioCtx;` guard at the top and a closing `return audioCtx;`.
- `start()` no longer contains an inline `new AudioContext(...)` or master-chain build — it calls `ensureCtx()`.
- `npm run lint`, `npm run format:check`, `npm test`, `npm run test:frontend`, `npm run smoke:wire-format` — all green.
- `wc -l frontend/audio-engine.js` shows roughly the same total LOC (±5 lines for the wrapper).
- DevTools: load `npm run dev`, reload the page, confirm in the Network/Performance panels that **no `AudioContext` is created until the Start button is clicked**. (This was already true; we re-verify.)
- §2.E manual A/B listen: 30-second continuous playback on `npm run dev`, no clicks/pops/gain steps relative to `main`.
- Devlog entry `docs/devlog/M4/2026-04-27-M4-audio-engine-lazy-init.md` lands and is indexed in `docs/DEVLOG.md`.

## Risk

- **Risk:** the move accidentally drops one of the connect calls.
- **Mitigation:** before/after `grep -c "\.connect(" frontend/audio-engine.js` must be identical. The §2.E A/B listen catches any missing wiring as silence on a bus.

## Rollback

Single-commit revert on `feat/M4`. No production impact (M4 doesn't ship to `main` until P5-4).
