# 2026-04-27 — Refactor: Extract `frontend/audio/context.js` (Master Chain Factory)

M4 P3-1. Lift the master signal chain (filters, ducking gain, optional makeup + limiter, per-bus gain summing) out of `frontend/audio-engine.js`'s `ensureCtx()` into a stateless factory `createMasterChain(audioCtx, opts)` under `frontend/audio/context.js`. `audio-engine.js` keeps its module-level node references and just populates them from the factory's return value.

## What moved

`createMasterChain` now owns the build of the chain:

```
busGains[i] → masterGain → duckGain → [makeup → limiter →]? lpFilter1 → lpFilter2 → lpFilter3 → destination
```

The function accepts an options bag (`masterVolume`, `loudnessNormEnabled`, `numBuses`, `makeupGainDb`, four limiter coefficients, `limiterKneeDb`) and returns `{ masterGain, duckGain, lpFilter1, lpFilter2, lpFilter3, busGains }`. Filter Q values, the 20 kHz cutoff, the `1.0` duck unity gain, and the dual loudness-on / loudness-off branches are byte-identical to before — this is pure code motion with parameterization.

`ensureCtx()` collapses to ~20 lines: create AudioContext, call `createMasterChain`, copy the returned references into module-level state. The `// 36 dB/oct low-pass`, `// duckGain is driven by ...`, and `// makeupGain offsets ...` rationales travel with the code into `context.js`.

## Why now

P3-2 (`audio/buffer-cache.js`) and P3-4 (`audio/engine.js`) will need the master chain wired before any sample plays. Pulling the build into a sibling module turns it into a unit-testable function — the P0-1 happy-dom AudioContext mock can verify routing topology and parameter assignments without spinning up a real browser. Going forward, P3-4 may pass an externally-built chain into engine setup; that path is open now.

## Tests added

`frontend/__tests__/audio/context.test.js` — 12 new vitest cases, covering both branches:

- **Loudness-on path (8 cases)**: returned-bag shape; chain topology `master → duck → makeup → limiter → lp1`; cascade `lp1 → lp2 → lp3 → destination`; bus loop `gains[i] → master`; total runtime edge count = 14; filter Q + frequency parameters; master volume + duck unity; makeup gain via `dbToLinear(12)`; limiter threshold/ratio/attack/release/knee; info-banner format.
- **Loudness-off path (3 cases)**: `createDynamicsCompressor` not called; topology routes `master → duck → lp1` directly; loudness-off banner.
- **Common (1 case)**: filter parameters block applies in both paths.

Vitest coverage on `frontend/audio/context.js`: 100% statement / branch (both opts branches exercised). Proposal §11 target was ≥ 70%.

## Connect-call accounting

| File | Before | After |
|---|---|---|
| `frontend/audio-engine.js` | 12 | 2 |
| `frontend/audio/context.js` | 0 | 10 |
| **Total source-line `.connect(`** | **12** | **12** |

The 2 remaining in `audio-engine.js` are loop-source connects in `startSlot()` — unrelated to the master chain. Runtime edge count for the loudness-on path is 14 (7 chain links + 7 bus → master); the loudness-off path is 12 (6 chain + 6 bus). The factory's mock-based tests verify both.

## File-size impact

- `frontend/audio-engine.js`: **1146 → 1103 lines** (-43). The full body of the prior chain build leaves; the new `createMasterChain` invocation + 6 reference assignments + bus-array copy stay.
- New `frontend/audio/context.js`: **121 lines**.
- Net repo: +78 lines, but the moved code is now under unit-test coverage instead of being unreachable from happy-dom.

## Verification

- `npm run lint` / `npm run format:check` — clean.
- `npm test` — 15 server suites / 160 jest pass.
- `npm run test:frontend` — 22 vitest pass (10 utils + **12 new context**).
- `npm run smoke:wire-format` — 3 routes / 3 WS types / 45 fields ok.
- **Preview runtime** on `npm run dev`:
    - Page load → `__acCount = 0` (instrumented `window.AudioContext` constructor) — no Audio creation at module-evaluation time.
    - Start click → `__acCount = 1`, status `"Playing"`, info-line `[audio] Loudness norm ON — makeup 12.0 dB, limiter threshold -3 dB` fires (now sourced from `context.js`, identical wording and values).
    - Stop click → status `"Audio off"`, count stays at `1`.
    - Start click again → status `"Playing"`, **count still `1`** — `ensureCtx()` returned the existing context and no chain rebuild occurred. End-to-end idempotency preserved.
    - 0 console errors across the full cycle.

## Risks and rollback

- **Risk**: a parameter assignment was dropped silently in the move. **Mitigation**: tests assert each parameter individually (Q, frequency, masterVolume, duck unity, makeup linear, limiter five fields). Preview banner additionally cross-checks the makeup-dB + threshold values at runtime.
- **Risk**: the factory's return shape is wrong. **Mitigation**: `ensureCtx()` references each field by name immediately on call; any miss would surface as a `TypeError` during the preview Start.
- **Rollback**: revert the commit on `feat/M4`. P3-2/3/4 not yet started, no downstream cascade.

## Files changed

- **Added**: `frontend/audio/context.js` — 121-line module exporting `createMasterChain`.
- **Added**: `frontend/__tests__/audio/context.test.js` — 12 vitest cases, mock-based topology + parameter assertions.
- **Added**: `docs/plans/M4/P3/2026-04-27-M4P3-1-extract-audio-context.md` — stage plan.
- **Added**: `docs/devlog/M4/2026-04-27-M4-extract-audio-context.md` — this entry.
- **Modified**: `frontend/audio-engine.js` — 1146 → 1103 lines. Removed inline chain build from `ensureCtx()`; added `import { createMasterChain }`; removed unused `dbToLinear` from the audio/utils import.
- **Modified**: `docs/DEVLOG.md` — index this entry.
