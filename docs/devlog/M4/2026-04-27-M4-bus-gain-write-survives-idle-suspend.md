# 2026-04-27 — Fix: Bus Gain Writes Must Survive rAF Idle Suspend

P5-1 hotfix. Drop the `bufferCache.has(i)` gate on the per-bus `gain.value` write inside `frontend/audio/engine.js`'s rAF callback. The pre-fix gate was a no-op when rAF ran continuously (the original M2 design), but P5-1's idle suspension surfaced a latent bug: with the gate in place, the rAF can suspend itself before `bufferCache.loadAll` finishes, leaving every `gains[i].gain.value` frozen at 0 — and Web Audio plays silence through them when `startAllSources` finally connects the loop voices.

## The bug

User report: after starting audio post-P5-1, the seven ambience buses are silent; the city-name announcer (which connects directly to `audioCtx.destination`, bypassing `gains[i]`) is still audible.

Sequence:

1. `engine.start()` runs. `ensureCtx()` creates the master chain — every `gains[i].gain.value = 0` initially.
2. `resetEma(ema)` zeroes targets/smoothed (coverage stays at 1).
3. `update(pendingParams)` fires (or doesn't — depends on timing of the first WS stats response).
4. `startRaf()` schedules the first rAF tick.
5. `await bufferCache.loadAll(audioCtx)` begins (5–10 s of fetch + decode).
6. **Inside the load period**, the rAF tick advances `ema.busSmoothed` toward `ema.busTargets`. But the per-bus gain write was guarded by `if (gains[i] && bufferCache.has(i))` — and `bufferCache.has(i)` is `false` until the bus's buffer finishes decoding. So `gains[i].gain.value` is **not** written.
7. The EMA converges (busSmoothed within 0.001 of busTargets) ~500 ms in. P5-1's `isEmaIdle` returns true → `rafId = null` → rAF suspends. Final `gains[i].gain.value = 0`.
8. Buffers finish loading. `onAllLoaded` fires `startAllSources`. Voices connect into `gains[i]` (still at 0).
9. **Audio plays silence.** `gains[i].gain.value` only re-rises when an `engine.update()` arrives with different targets, which depends on user interaction.

Pre-P5-1 the rAF kept running, so step 6's "no write" was harmless: the very next tick after `bufferCache.has(i)` flipped to true would write the converged value. P5-1 broke that by suspending the rAF before the flip.

## The fix

Remove the `bufferCache.has(i)` half of the gate:

```js
for (let i = 0; i < NUM_BUSES; i++) {
    // No bufferCache.has(i) gate: P5-1 idle detection lets rAF suspend
    // before bufferCache.loadAll completes, so gating writes on
    // "buffer ready" would freeze gains[i].gain.value at 0 across the
    // whole load. Writing the EMA-derived value pre-load is harmless
    // (no source flows through that gain yet), and means startAllSources
    // connects each voice into a gain that is already at the correct
    // level — no startup transient.
    if (gains[i]) {
        const landValue = (shaped[i] / norm) * landMix;
        const value = i === WATER_BUS_INDEX ? Math.max(landValue, oceanMix) : landValue;
        gains[i].gain.value = value * BUS_PREAMP_GAIN[i];
    }
}
```

Writing to a `GainNode.gain` whose downstream has no source is a Web Audio no-op — the multiplier is just sitting in the graph. So the only observable effect of the change is that when `startAllSources` connects voices, the bus gain is **already at the right value** (whatever the EMA has converged to). Pre-fix this was a 0 → X transient at the moment `bufferCache.has(i)` flipped to true; the new behavior is also strictly an improvement on the original (no transient).

## Verification

- `npm run lint` / `format:check` — clean.
- `npm test` — 14 jest suites / 167 tests pass.
- `npm run test:frontend` — 5 suites / 69 tests pass (no test-suite changes needed; the gate removal is a single-line behavior tweak inside the rAF callback that the existing engine integration tests don't cover).
- `npm run smoke:wire-format` — ok.
- **Preview reproduction** on `npm run dev`:
    - With the patch active, click Start, send a known viewport via WebSocket, await 700 ms convergence.
    - Probe: `gains[3..9].gain.value` reflects the EMA-derived bus mix — forest 0.27, shrub 0.06, grass 0.23, crop 0.16, urban 0.012, bare 0.14, water 0.10. **All seven non-zero.**
    - Pre-fix the same sequence yielded all seven at 0 (via the same probe).

## Files changed

- **Modified**: `frontend/audio/engine.js` — drop the `bufferCache.has(i)` half of the per-bus gain write gate. Comment block in the rAF body explains the P5-1 interaction.
- **Added**: `docs/devlog/M4/2026-04-27-M4-bus-gain-write-survives-idle-suspend.md` — this entry.
- **Modified**: `docs/DEVLOG.md` — index this entry.
