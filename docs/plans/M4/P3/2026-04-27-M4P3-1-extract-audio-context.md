# P3-1 — Extract `frontend/audio/context.js`

**Prerequisite:** P3-0 (`ensureCtx()` lazy-init helper in place)
**Trace:** Milestone 4 Phase 3 — Audio decomposition
**Companion:** [M4 razor-refactor proposal](../2026-04-27-M4-razor-refactor-proposal.md) §7

## Context

P3-0 collapsed the master-graph build inside `ensureCtx()`. P3-1 lifts that build into a pure factory under `frontend/audio/context.js` so it can be unit-tested against the P0-1 audio-context mock and reused later from `audio/engine.js` (P3-4).

The factory is **stateless**: it receives an `AudioContext` and a small options bag (`masterVolume`, `loudnessNormEnabled`, limiter coefficients, bus count) and returns the freshly wired nodes. It does not own them. `audio-engine.js` continues to keep its module-level node references (`masterGain`, `duckGain`, `lpFilter1..3`, `gains[]`) and just populates them from the factory's return value.

## Non-goals

- The factory does not own the chain. After it returns, the calling module owns the references. P3-4 may revisit ownership when `audio/engine.js` is fleshed out.
- No changes to bus count (`NUM_BUSES` stays 7), no changes to filter Q values, no changes to the dual loudness-on / loudness-off branches.
- No new public API on `audio-engine.js`. The shape of `start` / `stop` / `update` / `duck` / `unduck` is unchanged.

## Design

```js
// frontend/audio/context.js
export function createMasterChain(audioCtx, opts) {
    // builds: masterGain → duckGain → [makeup → limiter →]? lpFilter1 → lpFilter2 → lpFilter3 → destination
    //         busGains[i] → masterGain  (×opts.numBuses)
    return { masterGain, duckGain, lpFilter1, lpFilter2, lpFilter3, busGains };
}
```

`opts` shape:

| Field | Source in audio-engine.js |
|---|---|
| `masterVolume` | module-level `let masterVolume` |
| `loudnessNormEnabled` | `getLoudnessNormEnabled()` from `config.js` |
| `numBuses` | `NUM_BUSES` |
| `makeupGainDb` | `MAKEUP_GAIN_DB` |
| `limiterThresholdDb` / `Ratio` / `AttackSec` / `ReleaseSec` / `KneeDb` | `LIMITER_*` from `audio/constants.js` |

`ensureCtx()` becomes:

```js
function ensureCtx() {
    if (audioCtx) return audioCtx;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
    const chain = createMasterChain(audioCtx, {
        masterVolume,
        loudnessNormEnabled: getLoudnessNormEnabled(),
        numBuses: NUM_BUSES,
        makeupGainDb: MAKEUP_GAIN_DB,
        limiterThresholdDb: LIMITER_THRESHOLD_DB,
        limiterRatio: LIMITER_RATIO,
        limiterAttackSec: LIMITER_ATTACK_SEC,
        limiterReleaseSec: LIMITER_RELEASE_SEC,
        limiterKneeDb: LIMITER_KNEE_DB,
    });
    masterGain = chain.masterGain;
    duckGain = chain.duckGain;
    lpFilter1 = chain.lpFilter1;
    lpFilter2 = chain.lpFilter2;
    lpFilter3 = chain.lpFilter3;
    for (let i = 0; i < NUM_BUSES; i++) gains[i] = chain.busGains[i];
    return audioCtx;
}
```

## Tests (`frontend/__tests__/audio/context.test.js`)

Mock-based assertions, using `_helpers/audio-context-mock.js`:

1. **Loudness-on path** — when `loudnessNormEnabled: true`, the chain has 12 connect calls in this order:
    - `masterGain → duckGain → makeupGain → limiter → lpFilter1 → lpFilter2 → lpFilter3 → destination`
    - 7 × `gains[i] → masterGain`
2. **Loudness-off path** — when `loudnessNormEnabled: false`:
    - `masterGain → duckGain → lpFilter1 → lpFilter2 → lpFilter3 → destination`
    - 7 × `gains[i] → masterGain`
    - Total = 10 connect calls (one fewer per branch since makeup+limiter is skipped).
3. **Filter parameters** — Q values 0.5176 / 0.7071 / 1.9319 and frequency 20000 are written.
4. **Master volume** — `masterGain.gain.value === opts.masterVolume`.
5. **Bus gains** — all 7 are created and start at gain 0.
6. **Limiter parameters** — threshold / ratio / attack / release / knee match the passed-in opts.

Assertions use `vi.fn` introspection: `node.connect.mock.calls` returns `[[destination], ...]`. Order is verified by mapping each call's destination back to the named local.

## Definition of Done

- `frontend/audio/context.js` exists, exports `createMasterChain`.
- `frontend/audio-engine.js` `ensureCtx()` no longer constructs filters / gains / limiter inline — it calls `createMasterChain`.
- `frontend/__tests__/audio/context.test.js` covers both branches; coverage ≥ 70% on `audio/context.js` (proposal §11 target).
- `npm run lint`, `npm run format:check`, `npm test`, `npm run test:frontend`, `npm run smoke:wire-format` — green.
- Pre/post `grep -c "\.connect("` runtime path = 12 (8 chain + 7 bus, with one chain entry overlapping in the loudness-on counting; recount carefully).
- Preview verification: clicking Start triggers exactly one AudioContext, `[audio] Loudness norm ON ...` log appears, no console errors, idempotent across stop→start.
- Devlog `docs/devlog/M4/2026-04-27-M4-extract-audio-context.md` + DEVLOG.md index entry.

## Risks and rollback

- **Risk:** the mock topology test passes but real Web Audio diverges (e.g., a parameter assignment is dropped silently).
    - **Mitigation:** preview Start path verified end-to-end, plus the §2.E preview log check that `Loudness norm ON` info-line still fires with the right makeup-dB / threshold values.
- **Rollback:** revert this commit on `feat/M4`. P3-2/3/4 not yet started so no downstream cascade.
