# 2026-04-27 — Refactor: Make `audio-engine.js` Context Init Lazy via `ensureCtx()`

M4 P3-0. Extract the master-graph build (lines 857-925 of `frontend/audio-engine.js`) from inside `start()` into a private idempotent `ensureCtx()` helper. Pure code motion — no public-API change, no behavior change. Prepares P3-1..P3-4 to call `ensureCtx()` from sibling modules under `frontend/audio/` without risking double `AudioContext` instantiation.

## What changed

A new `// Context Initialization` section above the `// Public API` banner now hosts:

```js
function ensureCtx() {
    if (audioCtx) return audioCtx;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
    masterGain = audioCtx.createGain();
    // ... full master chain build (filters, duckGain, makeup+limiter when loudness norm is on, per-bus gains)
    return audioCtx;
}
```

The body is byte-identical to the previous `if (!audioCtx) { ... }` block, with the leading guard formalized and a trailing `return audioCtx`. `start()` now calls `ensureCtx()` and the rest of its logic (visibility-listener attach, EMA reset, pendingParams replay, `loadAllSamples`) is unchanged.

## Why

Before this stage, the only place that knew how to construct the master chain was the `start()` body. As soon as P3-1 pulls the master-chain creation into `audio/context.js` and P3-2 pulls sample loading into `audio/buffer-cache.js`, those modules will need to access an already-initialized `AudioContext`. Without a shared idempotent helper, each module either has to (a) re-create the chain on first use (doubling everything) or (b) trust an opaque "did `start()` run yet?" flag.

`ensureCtx()` is the shared single point of truth. The `if (audioCtx) return audioCtx;` guard at the top is the structural protection against double instantiation that proposal §7 / Risk register call out (mitigation for "Double `AudioContext` instantiation during P3-0..P3-4").

## Audio graph review

Before/after `grep -c "\.connect(" frontend/audio-engine.js` = **12** (unchanged). The connect order is preserved verbatim:

```
masterGain → duckGain
duckGain   → makeupGain    (loudness norm on)
makeupGain → limiter
limiter    → lpFilter1
duckGain   → lpFilter1     (loudness norm off)
lpFilter1  → lpFilter2
lpFilter2  → lpFilter3
lpFilter3  → audioCtx.destination
gains[i]   → masterGain    (×7 buses)
```

Total = 4 (loudness-on chain) + 1 (alt loudness-off path) + 3 (lpFilter cascade + destination) + 7 (per-bus) = **12**. Both branches are still present; runtime path selection by `getLoudnessNormEnabled()` is unchanged.

## Verification

- `npm run lint` / `npm run format:check` — green
- `npm test` — 15 suites, 160 jest pass
- `npm run test:frontend` — 10 vitest pass
- `npm run smoke:wire-format` — 3 routes, 3 WS types, 45 fields verified
- **Preview runtime cycle** on `npm run dev`:
    - On page load, instrumented `window.AudioContext` constructor counter `__acCount = 0` after page load completes — confirms no `AudioContext` is created at module-evaluation time.
    - Click audio toggle (Start) → `__acCount` becomes `1`, `[audio] Loudness norm ON — makeup 12.0 dB, limiter threshold -3 dB` logs once, audio status `"Playing"`, 0 console errors.
    - Click audio toggle (Stop) → status `"Audio off"`, `__acCount` stays at `1`.
    - Click audio toggle (Start, second cycle) → status `"Playing"` again, `__acCount` **stays at `1`** — `ensureCtx()` returned the existing context and rebuilt nothing. Idempotency confirmed end-to-end.

## File-size impact

- `frontend/audio-engine.js`: **1124 → 1146 lines** (+22 for the new section banner, JSDoc, function signature, opening guard, and closing return). The eventual P5-4 deletion still hits a single file; the +22 vanishes when the shim is removed.

## Risks and rollback

- The move could in theory drop a connect call. Pre/post grep at 12 each guarantees not. The §2.E preview verification additionally proves the loudness-norm branch executes its 4 chain connects (audible signal → audio status `Playing`).
- Subscriber-side null checks (`if (!audioCtx) return` in `scheduleGlobalSwap`, `triggerLoopSwap`, `loadSample`, `handleVisibilityChange`, `setMasterVolume`, `getEngineState`, etc.) are intentionally preserved; they will be replaced by `ensureCtx()`-based access only when their owning logic moves into a sibling module in P3-1..P3-4.
- **Rollback**: revert this commit on `feat/M4`. No downstream stage has shipped yet.

## Files changed

- **Modified**: `frontend/audio-engine.js` — extracted `ensureCtx()` (1124 → 1146 lines). `start()` now calls `ensureCtx()` and removes the inline `if (!audioCtx) { ... }` block.
- **Added**: `docs/plans/M4/P3/2026-04-27-M4P3-0-audio-engine-lazy-init.md` — stage plan.
- **Added**: `docs/devlog/M4/2026-04-27-M4-audio-engine-lazy-init.md` — this entry.
- **Modified**: `docs/DEVLOG.md` — index this entry.
