# P3-4 — Collapse `audio-engine.js` to a Re-Export Shim, New `audio/engine.js`

**Prerequisite:** P3-3 (`audio/raf-loop.js` in place; `audio/utils.js`, `audio/constants.js`, `audio/context.js`, `audio/buffer-cache.js` already extracted)
**Trace:** Milestone 4 Phase 3 — Audio decomposition (final stage)
**Companion:** [M4 razor-refactor proposal](../2026-04-27-M4-razor-refactor-proposal.md) §7

## Context

P3-0 through P3-3 split the master chain, sample loading, and EMA driver into sibling modules under `frontend/audio/`. What's left in `frontend/audio-engine.js` (883 lines) is engine-glue: the AudioContext singleton, voice scheduling, swap timer, BusVoice / LoopSlot lifecycle, ducking, public methods (`start` / `stop` / `update` / `updateMotion` / `setVolume` / `duck` / `unduck` / etc.), and the `engine` named-export.

P3-4 moves all of this into a new `frontend/audio/engine.js` module, then collapses `frontend/audio-engine.js` to a single line:

```js
export { engine } from './audio/engine.js';
```

External callers (`frontend/main.js`, `frontend/city-announcer.js`, `frontend/map.js`) keep importing from `./audio-engine.js`. The shim is removed in P5-4 along with caller-side path updates.

## Why a shim, not a direct import path swap

P3-4 is the first stage that could rip up caller imports across `frontend/`. We don't, for two reasons spelled out in proposal §12 risk register:

1. **Bisect surface.** Any audio regression that lands during P3-4 needs to be bisectable to a single 1-stage change. Caller-import churn would diffuse blame across files.
2. **P5-4 deletion is the gate.** The shim is intentionally the single signal for "M4 audio refactor cleanly merged into prod" — P5-4 deletes it, every caller updates in one commit, no audio regression escapes onto `main` between stages.

## Move plan

### What goes into `frontend/audio/engine.js`

Verbatim move of the current contents of `frontend/audio-engine.js`, with one mechanical change: each `import` statement's path adjusts for the new directory depth.

| Old path (in `audio-engine.js`) | New path (in `audio/engine.js`) |
|---|---|
| `'./config.js'` | `'../config.js'` |
| `'./audio/utils.js'` | `'./utils.js'` |
| `'./audio/context.js'` | `'./context.js'` |
| `'./audio/buffer-cache.js'` | `'./buffer-cache.js'` |
| `'./audio/raf-loop.js'` | `'./raf-loop.js'` |
| `'./audio/constants.js'` | `'./constants.js'` |

No reordering, no rename, no internal-API changes. The `engine` named export, all its method bindings, and every closure-captured module-level state stay byte-identical.

### What goes into `frontend/audio-engine.js` (post-collapse)

```js
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Re-export shim. Audio engine implementation lives in `./audio/engine.js`
 * (M4 P3-4); this shim preserves the existing import path for callers
 * (main.js, city-announcer.js, map.js) until P5-4 retires it and updates
 * every caller in a single closing commit.
 *
 * @module frontend/audio-engine
 */

export { engine } from './audio/engine.js';
```

That's the entire file post-stage. ~10 lines.

## Tests (`frontend/__tests__/audio/engine.test.js`)

Coverage target ≥ 50% (proposal §11). The composition is integration-flavored: stub `globalThis.AudioContext` + `globalThis.fetch`, import the module fresh per test (`vi.resetModules()`), exercise the public surface, assert state.

Cases:

1. **Public surface present**: importing the module exposes `engine.start`, `stop`, `update`, `updateMotion`, `setVolume`, `getVolume`, `duck`, `unduck`, `isRunning`, `getContext`, `getLoadingStates`, `setOnLoadingUpdate`, `getLoopProgress`, `seekLoop`.
2. **Lazy AudioContext (M4 P3-0 invariant)**: importing the module does not call `new AudioContext`. Verified by spy on the stubbed constructor.
3. **`getLoadingStates` reports 7 pending before start**: matches the cache's initial state and the engine's forwarder.
4. **`isRunning` returns false before start**.
5. **`engine.start()` integration**: stubbed AudioContext + stubbed `fetch` (both succeed) → after the start promise resolves, `isRunning()` returns true, the AudioContext was constructed exactly once, and `fetch` was called 7 times.
6. **`engine.setVolume(0.5)` writes masterGain.gain.value**: requires post-start, reads the spied AudioContext's createGain() outputs.
7. **`engine.duck()` / `unduck()` schedule setTargetAtTime on duckGain**: requires post-start.
8. **`engine.stop()` after start**: ctx.suspend() called, isRunning() returns false.
9. **`engine.update(audioParams)` sets EMA targets**: pre-start (queues `pendingParams`); post-start (writes directly to `ema.busTargets`). The post-start assertion is via the rAF callback's behavior, which is hard to invoke synchronously from happy-dom; for this case, we settle for the pre-start path (calling update before start, then verifying the queued params are honored on start by checking the engine reaches isRunning state without errors).

The shared infrastructure (`createMockAudioContext`, `mockFetchOk`) is already in `frontend/__tests__/_helpers/audio-context-mock.js` (P0-1) and the buffer-cache test file. We import / re-derive as needed.

`vi.resetModules()` runs at the start of every test so module-level state (the EMA, the cache, the `audioCtx` singleton) is fresh — without it, test 4 (`isRunning` false before start) would fail after test 5 (which leaves `audioCtx` non-null and `state === 'running'`).

## Definition of Done

- `frontend/audio/engine.js` exists; its public surface is identical to the prior `frontend/audio-engine.js` (matching `engine.{start, stop, update, updateMotion, getLoadingStates, setOnLoadingUpdate, isRunning, getLoopProgress, seekLoop, setVolume, getVolume, getContext, duck, unduck}`).
- `frontend/audio-engine.js` is a one-line re-export shim (~10 lines including SPDX + module JSDoc).
- `grep -E "from '\\./audio-engine" frontend/` continues to match `main.js`, `city-announcer.js`, `map.js` (caller paths unchanged).
- `frontend/__tests__/audio/engine.test.js` covers all 9 cases; coverage on `audio/engine.js` ≥ 50%.
- `npm run lint` / `format:check` / `npm test` / `npm run test:frontend` / `npm run smoke:wire-format` — green.
- Preview verification: full audio cycle (page load → Start → 30 s of audio → Stop → Start again) clean, `__acCount === 1` across stop/start, `engine.getLoopProgress()` advances, 0 console errors.
- Devlog `docs/devlog/M4/2026-04-27-M4-collapse-engine-shim.md` + DEVLOG.md index entry. Per proposal §2.B this is a "significant stage" devlog with the §2.E "what nodes connect to what" review block.

## Risks and rollback

- **Risk**: an import-path adjustment misses a relative-path delta and yields a 404 at module load. **Mitigation**: every old import has a one-to-one new path (no deeper relative climbing required), enumerated in the table above; `npm run dev` page load smoke-tests the resolution.
- **Risk**: the re-export shim's `engine` reference is evaluated before the implementation module's module-init completes, due to circular import or load-order issue. **Mitigation**: there's no circularity (shim → audio/engine, audio/engine → audio/utils + audio/context + audio/buffer-cache + audio/raf-loop + audio/constants + ../config; none of those import from audio-engine). Standard ESM hoisting handles the rest.
- **Risk**: integration tests use module-level singletons and `vi.resetModules()` fails to fully isolate state. **Mitigation**: Each test imports fresh; assertions are stable per test in isolation. If a test interferes with another, the failure is local — Vitest's `test.concurrent: false` (default) keeps them sequential.
- **Risk**: the §2.E manual A/B listen catches an audible regression we missed. **Mitigation**: this stage moves bytes only — no logic change. A regression here would be an import-path bug, which the page-load smoke would catch first. `feat/M4` keeps the tag at the prior P3-3 commit so revert is one commit.
- **Rollback**: revert the P3-4 commit. Audio-engine.js returns to its 883-line form. No upstream callers change because the shim never published a new export.
