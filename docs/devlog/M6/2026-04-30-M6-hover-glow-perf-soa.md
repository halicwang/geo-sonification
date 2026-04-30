# 2026-04-30 — Refactor: Hover-glow Perf — SoA Candidates + KM_PER_DEG Hoist + Typedef

A no-behavior-change refactor of `frontend/hover-glow.js` that closes
the last allocation hole on the per-frame `tick()` path, tightens two
hot-loop inner loops, and fixes a typedef drift. All 33 hover-glow
unit tests + 79 other frontend tests pass; visual verification in
preview confirms identical halo shape and the diff-cleanup invariant.

## Why

The module already follows a "zero-allocation tick" design — bucket
arrays are `Uint32Array`, glowing-fid sets are double-buffered, and
`distKm` is inlined to skip the `sqrt` early. But the per-frame
`candidates = []` + `candidates.push({ fid, glow })` AoS form was
churning 200–1500 short-lived objects every tick (up to ~9 KB of
boxed pairs at the M6 P1 maxGlowing cap). That broke the same
invariant the rest of the module was written to honor and was the
single largest GC pressure source on the hot path.

Two smaller cleanups travel with it:

- `KM_PER_DEG = EARTH_RADIUS_KM × DEG_TO_RAD` is recomputed inside
  `tick()` and `enumerateNearbyEntries()` on every entry. Hoisting it
  to a module-level `const` is a trivial JIT/clarity win.
- `borderFactor()` and `rByZoom()` use array destructuring inside the
  per-cell hot loop (`const [x0, y0] = table[i]`). V8 can usually
  inline this, but explicit `table[i][0]` indexing is the more
  reliable shape and `borderFactor` runs hundreds of times per tick.
- `GridIndex` typedef listed `count / gridSize / u32 / f32` but
  `initHoverGlow()` mutates the object to add `spatialIndex`, which
  `tick()` then reads as `gridIndex.spatialIndex.buckets`. Adding
  `spatialIndex` to the typedef closes the static-type gap.

## SoA candidate buffer

Module-level parallel typed arrays + a length counter, reused across
ticks:

```js
const CANDIDATES_INITIAL_CAP = 4096;
let candFids  = new Uint32Array(CANDIDATES_INITIAL_CAP);
let candGlows = new Float32Array(CANDIDATES_INITIAL_CAP);
let candIdx   = new Uint32Array(CANDIDATES_INITIAL_CAP);
let candLen   = 0;
```

`tick()` resets `candLen = 0` on entry and writes
`candFids[candLen] = fid; candGlows[candLen] = g; candLen++` instead
of `candidates.push({ fid, glow })`. `ensureCandCapacity(n)` doubles
on overflow — initial 4096 covers the observed worst case (zoom 2 +
R = 1000 km gives ~1000 cells inside the cursor disc per the
[cursor-floor devlog](2026-04-30-M6-hover-glow-cursor-floor.md)
candidate-set growth section), so the grow path is reachable but
never hit in steady state.

The cap path that previously did `candidates.sort((a, b) => b.glow -
a.glow); candidates.length = maxGlowing;` becomes an indirect sort
on an index buffer:

```js
if (candLen > maxGlowing) {
    for (let i = 0; i < candLen; i++) candIdx[i] = i;
    candIdx.subarray(0, candLen).sort((a, b) => candGlows[b] - candGlows[a]);
    for (let k = 0; k < maxGlowing; k++) {
        const j = candIdx[k];
        // ... setFeatureState with candFids[j], candGlows[j]
    }
}
```

`Uint32Array.subarray` is a zero-allocation view; `.sort()` mutates
the underlying buffer in place. The cap path is rarely hit in
practice (typical 200–800 candidates vs. cap 1500) but stays
allocation-free when it is.

The non-cap path drops the `for (const c of candidates)` form (which
allocates an iterator object) for `for (let i = 0; i < candLen; i++)`,
removing one more per-frame alloc.

## What didn't change

- `currentGlowingFids` / `prevGlowingFids` Sets stay — they're already
  double-buffered + cleared, and Set is the right shape for the
  cleanup-diff `if (!current.has(fid))` membership check. Replacing
  them with sorted typed arrays would trade O(1) lookup for O(log n)
  binary search and complicate the swap.
- All glow math (`cursorFactor`, `borderFactor`, `glowFor`,
  `rByZoom`) is byte-identical. The 5-test `glowFor` suite added by
  the cursor-floor change still passes unchanged.
- `setFeatureState` call shape (source / sourceLayer / id / glow) is
  unchanged, so the GPU-upload cost the [drag-pause
  devlog](2026-04-30-M6-hover-glow-pause-during-drag.md) is built
  around stays exactly the same.

## Verification

- `npm run test:frontend` → 112 / 112 pass (33 hover-glow + 79
  other).
- `npm test` (server) → 194 / 194 pass.
- `npm run lint` → clean.
- Preview run (`npm run dev` → `__hg.forceTick()` after a synthetic
  `mousemove`): 468 / 381 / 496 cells glowing across three cursor
  positions, `feature-state.glow` written with values in
  `[0.024, 0.083]` for sample fids near the rim. Setting
  `cursorFloor: 1.0` produced the expected solid-circle halo (see
  visual check in conversation).

## Files changed

- `frontend/hover-glow.js` — MODIFY: add `KM_PER_DEG` module const,
  add `spatialIndex` to `GridIndex` typedef, add SoA candidate
  buffers + `ensureCandCapacity`, rewrite `tick()` body to use SoA
  and the hoisted constant, switch `enumerateNearbyEntries` to the
  module-level `KM_PER_DEG`, de-destructure the inner loops of
  `borderFactor` and `rByZoom`.
