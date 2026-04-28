# 2026-04-27 — Refactor: Collapse `audio-engine.js` to a Re-Export Shim, New `audio/engine.js`

M4 P3-4 (final stage of P3). Move the entire remaining contents of `frontend/audio-engine.js` (883 lines) into a new `frontend/audio/engine.js` module, then replace `frontend/audio-engine.js` with a 13-line re-export shim. External callers (`frontend/main.js`, `frontend/city-announcer.js`, `frontend/map.js`) continue to import `engine` from `./audio-engine.js`; the shim delegates to `./audio/engine.js`. P5-4 will retire the shim and update every caller in a single closing commit.

## What moved

Every line of `frontend/audio-engine.js` from the prior P3-3 commit (883 lines) shifts into `frontend/audio/engine.js` verbatim, with one mechanical change: relative import paths adjust for the new directory depth.

| Old path (in `audio-engine.js`) | New path (in `audio/engine.js`) |
|---|---|
| `'./config.js'` | `'../config.js'` |
| `'./audio/utils.js'` | `'./utils.js'` |
| `'./audio/context.js'` | `'./context.js'` |
| `'./audio/buffer-cache.js'` | `'./buffer-cache.js'` |
| `'./audio/raf-loop.js'` | `'./raf-loop.js'` |
| `'./audio/constants.js'` | `'./constants.js'` |

No reordering, no rename, no internal-API change. The `engine` named export, all its method bindings, and every closure-captured module-level state are byte-identical to the prior commit.

## Audio graph review (per §2.E)

The engine still owns the same chain that P3-1 wired up via `createMasterChain`:

```
busGains[i]  →  masterGain  →  duckGain  →  [makeup → limiter →]?  lpFilter1  →  lpFilter2  →  lpFilter3  →  destination
```

7 chain-source bus gains feeding masterGain, then a 3-stage 36 dB/oct lowpass into destination. The `[makeup → limiter →]?` insertion is gated by `getLoudnessNormEnabled()`. Connect topology and AudioParam writes (master volume, ducking, low-pass cutoff, lpFilter1 Q, per-bus gain) match the pre-stage byte-for-byte — this is pure code motion.

## The shim

```js
// frontend/audio-engine.js (post-P3-4) — 13 lines including SPDX + JSDoc

/**
 * Re-export shim. Audio engine implementation lives in `./audio/engine.js`
 * (M4 P3-4); this shim preserves the existing import path for callers
 * (main.js, city-announcer.js, map.js) until P5-4 retires it and updates
 * every caller in a single closing commit.
 */
export { engine } from './audio/engine.js';
```

`grep -E "from '\\./audio-engine" frontend/` continues to match `main.js`, `city-announcer.js`, `map.js`. None of the caller-side import paths change.

## Why a shim instead of caller-import churn now

Two reasons spelled out in proposal §12 risk register:

1. **Bisect surface**: any audio regression that lands during P3-4 needs to be locally bisectable. Caller-import churn would diffuse blame across files.
2. **P5-4 deletion is the gate**: the shim is the single signal for "M4 audio refactor cleanly merged into prod." P5-4 deletes the shim and updates every caller in one commit, so no audio regression escapes onto `main` between intermediate stages.

## Tests added

`frontend/__tests__/audio/engine.test.js` — 17 vitest cases. The tests use `vi.resetModules()` per case so the module-level singletons (`audioCtx`, `bufferCache`, `ema`) start fresh. `vi.stubGlobal('AudioContext', constructorSpy)` and `vi.stubGlobal('fetch', mock)` are set up before each `await import(...)`.

Cases by group:

- **Module-level invariants (5)**: public surface present (`start`, `stop`, `update`, `updateMotion`, `getLoadingStates`, `setOnLoadingUpdate`, `isRunning`, `getLoopProgress`, `seekLoop`, `setVolume`, `getVolume`, `getContext`, `duck`, `unduck`); lazy AudioContext (P3-0 invariant — no construction at module-load time); 7 pending loading states pre-start; `isRunning() === false` pre-start; `getContext()` null pre-start, mock ctx post-start.
- **Start lifecycle (4)**: AudioContext constructed exactly once; `fetch` called 7 times (one per bus); `isRunning() === true` post-start; every bus reaches `'ready'` status.
- **Public surface mutations (5)**: `setVolume(0.42)` schedules `setTargetAtTime(0.42, ...)` on masterGain.gain (P3 ducking-style click-free transition); `setVolume` clamps to [0, 1]; `duck()` and `unduck()` each schedule one `setTargetAtTime` call on the same node; `update(audioParams)` is callable pre-start (queues `pendingParams`); `updateMotion(velocity)` clamps and is callable pre-start.
- **Stop lifecycle (2)**: `stop()` calls `audioCtx.suspend()` and `isRunning()` returns false; `stop()` is idempotent.
- **Shim path (1)**: `import('./audio-engine.js').engine === import('./audio/engine.js').engine` — the shim re-exports the same singleton.

Coverage on `frontend/audio/engine.js`: **70.78% statement / 66.17% branch / 74.28% function** (proposal §11 target ≥ 50%, exceeded by ~21 percentage points). The shim `frontend/audio-engine.js`: **100% / 100% / 100%** (it's one re-export line).

Total frontend vitest count: 45 → **62**.

## File-size impact

- `frontend/audio-engine.js`: **883 → 13 lines** (-870, the full body shifts into the new module). Now a pure re-export shim.
- New `frontend/audio/engine.js`: **883 lines** (the moved body).
- Net: zero LOC change for the moved code; +13 lines for the shim's SPDX + JSDoc + re-export.

Cumulative P3 progress on the file at `frontend/audio-engine.js` (the path callers import from): **1186 → 13 lines** (-99% across P3-0 through P3-4). The actual engine implementation went from one 1186-line file to 5 testable modules (`utils.js`, `constants.js`, `context.js`, `buffer-cache.js`, `raf-loop.js`) plus a 883-line `engine.js` glue layer. Proposal §11 target: ≤ 800 lines on the largest single audio module — `engine.js` at 883 still exceeds this, but P5-4 may revisit if any cohesive chunk pulls out cleanly (proposal §12 risk-register mitigation).

## Coverage summary across `frontend/audio/`

| Module | Statement | Branch | Function |
|---|---|---|---|
| `utils.js` | 100% | 100% | 100% |
| `context.js` | 100% | 100% | 100% |
| `buffer-cache.js` | 94.94% | 76.36% | 100% |
| `raf-loop.js` | 100% | 100% | 100% |
| `engine.js` | **70.78%** | 66.17% | 74.28% |
| `audio-engine.js` (shim) | 100% | 100% | 100% |

Proposal §11 audio coverage targets: utils ≥ 90%, raf-loop ≥ 90%, buffer-cache ≥ 70%, context ≥ 70%, engine ≥ 50%. **Every target met or exceeded.**

## Verification

- `npm run lint` / `format:check` — clean.
- `npm test` — 15 server suites / 160 jest pass.
- `npm run test:frontend` — 62 vitest pass (10 utils + 12 context + 11 buffer-cache + 12 raf-loop + **17 new engine**).
- `npm run smoke:wire-format` — 3 routes / 3 WS types / 45 fields ok.
- **Preview runtime cycle** on `npm run dev`:
    - Page load → `__acCount = 0` (lazy AudioContext invariant preserved).
    - Click Start → `__acCount = 1`, status `Playing`, ctx.state `running`, ctx.currentTime advances 0.2027 s in 200 ms wall time, loop progress 6.52% over a 120 s cycle, `engine.isRunning() === true`. Audio path is fully alive through the shim.
    - Stop → status `Audio off`, `__acCount` stays 1.
    - Start again → status `Playing`, fill 4.36%, count still 1. Idempotency preserved end-to-end.
    - 0 console errors throughout.
- **Shim resolution**: `await import('./audio-engine.js')` from the page successfully returns the same engine object as a direct import of `./audio/engine.js` would (confirmed via the engine.test.js shim-path case + preview eval).

## Risks and rollback

- **Risk**: an import-path adjustment misses a relative-path delta and yields a 404 at module load. **Mitigation**: every old import has a one-to-one new path enumerated in the table above; preview page-load smoke-tests resolution; the engine test file imports both paths explicitly.
- **Risk**: re-export shim's `engine` reference is evaluated before the implementation module's module-init completes (circular import / load-order issue). **Mitigation**: there's no circularity (shim → audio/engine, audio/engine → audio/utils + audio/context + audio/buffer-cache + audio/raf-loop + audio/constants + ../config; none of those import from audio-engine). Standard ESM hoisting handles the rest.
- **Risk**: integration tests use module-level singletons and `vi.resetModules()` fails to fully isolate state. **Mitigation**: each test imports fresh; the engine test file's 17 cases are stable in isolation (full pass). If a test interferes with another, the failure is local — Vitest runs them sequentially by default.
- **Risk**: the §2.E manual A/B listen catches an audible regression we missed. **Mitigation**: this stage moves bytes only — no logic change. A regression here would be an import-path bug, which the page-load smoke catches first.
- **Rollback**: revert this commit on `feat/M4`. Audio-engine.js returns to its 883-line form. No upstream callers change because the shim never published a new export.

## Files changed

- **Added**: `frontend/audio/engine.js` — 883 lines (moved body of the prior `frontend/audio-engine.js`, with 6 import paths adjusted).
- **Added**: `frontend/__tests__/audio/engine.test.js` — 17 vitest cases (70.78% statement coverage on `audio/engine.js`).
- **Added**: `docs/plans/M4/P3/2026-04-27-M4P3-4-collapse-engine-and-shim.md` — stage plan.
- **Added**: `docs/devlog/M4/2026-04-27-M4-collapse-engine-shim.md` — this entry.
- **Modified**: `frontend/audio-engine.js` — 883 → 13 lines. Now a re-export shim: `export { engine } from './audio/engine.js';`.
- **Modified**: `docs/DEVLOG.md` — index this entry.
