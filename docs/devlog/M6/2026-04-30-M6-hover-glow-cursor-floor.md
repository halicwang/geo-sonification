# 2026-04-30 — Feature: Hover-glow Cursor-Floor Halo

User request:

> 加功能：cursor悬浮的地方 dot 也泛有一点白色的光晕

The M6 P1 hover-glow only brightens cells that are simultaneously near
the cursor AND near a country border / coastline (`g = cursorFactor ×
borderFactor`). Cells in the open ocean or deep continental interior
never glow, even when the cursor is right on top of them. The user
asked for those cells to glow softly too — not to replace the bright
"tube" along borders, but to add a subtle white trail wherever the
cursor goes ("也" = also, "一点" = a little).

## Implementation

One-line per-cell formula change inside `tick()`, plus one new
live-tunable constant. The paint expression in `frontend/map.js` is
unchanged — it still interpolates `circle-color` from `#606060` →
`#FFFFFF` over the existing `glow ∈ [0, 1]` feature-state, so the
GPU-upload budget that the drag-pause fix was built around stays
exactly the same. No second feature-state, no extra
`setFeatureState` calls per frame.

```diff
  const cf = cursorFactor(dKm, R);
  if (cf <= 0) continue;

  const borderDist = f32[off + 3];
  const bf = borderFactor(borderDist, borderTable);
- if (bf <= 0) continue;

- const g = cf * bf;
+ const g = glowFor(cf, bf, cursorFloor);
  if (g < eps) continue;
```

The math now lives in an exported helper alongside `cursorFactor`,
`borderFactor`, and `rByZoom`:

```js
export function glowFor(cf, bf, cursorFloor) {
    return cf * Math.min(1, bf + cursorFloor);
}
```

Default `HOVER_GLOW_CURSOR_FLOOR = 0.25` (in `frontend/config.js`).
Live-tunable via `window.__hg.tune({ cursorFloor: x })` in DevTools;
setting `0` recovers the M6 P1 baseline exactly.

## Why additive, not max

The first sketch was `Math.max(bf, cursorFloor)` — clamp the border
penalty up to a floor. That introduces a visible kink at the crossover
point (~30 km from a border with the default
`HOVER_GLOW_BORDER_FALLOFF`): cells just inside the band sit on the
Hermite curve, cells just outside jump straight to the floor. The whole
point of the M6 P1 design's `borderFactor` Hermite blending was C¹
continuity (the [P1 runtime
devlog](2026-04-29-M6-hover-glow-runtime.md) calls this out as
invariant #2 — "no square-shape leak"; the same spirit applies to any
discontinuity in the falloff).

Additive blending `min(1, bf + floor)` lifts the entire curve uniformly
without breaking smoothness:

| `borderDist` | `bf` | legacy `cf*bf` | new `cf*min(1, bf+0.25)` (cf=1) |
| --- | --- | --- | --- |
| 0 km | 1.00 | 1.00 | 1.00 (clamped) |
| 15 km | 0.70 | 0.70 | 0.95 |
| 30 km | 0.10 | 0.10 | 0.35 |
| 40 km | 0.00 | 0.00 | 0.25 |
| 100 km | 0.00 | 0.00 | 0.25 |

Border-center cells already glow at the cap (the `min` clamp prevents
over-bright); border-band cells gain a smooth lift; deep-interior cells
get a flat 0.25-strength floor that's modulated only by `cursorFactor`.

## Why 0.25 default

The dot color paint uses `cubic-bezier(0.4, 0, 0.2, 1)` over `#606060
→ #FFFFFF`, which has a deliberately shallow start. Linear changes in
`cursorFloor` produce non-linear visual changes:

| `cursorFloor` | Bezier `y` at `x=floor` | Brightness lift on `#606060` |
| --- | --- | --- |
| 0.10 | ≈ 0.02 | ~3 RGB units |
| 0.25 | ≈ 0.13 | ~21 RGB units (visible glance) |
| 0.40 | ≈ 0.30 | ~48 RGB units (noticeably bright) |
| 0.50 | ≈ 0.50 | half-way to white |

0.25 produces a "barely there" trail that doesn't compete with the
border tube. Recommended live-tune range `[0, 0.5]`.

## Why a single feature-state, not two

A separate `cursorGlow` feature-state would let the paint expression
`max(glow, cursorGlow * 0.25)` give the same visual effect with no
formula-side change in JS. Rejected because:

- Doubles `setFeatureState` calls per frame (writing two state keys
  per cell). The drag-pause fix from earlier today exists specifically
  because per-frame GPU upload churn was the bottleneck. Adding more
  writes against the same upload budget would re-open the regression.
- Adds a paint-expression branch (`max` of two state lookups) that
  every frame's compositor evaluates per-feature. Single-state
  interpolate is the cheapest path.
- The math is not actually two superimposed effects — it's one
  per-cell scalar with a floor. The floor belongs in the formula, not
  the renderer.

## Candidate-set growth

Removing the `bf <= 0` early-skip means every cell inside the cursor
radius now becomes a candidate, not just the border-band ones. The
existing `MAX_GLOWING = 1500` cap with sort-by-glow-desc truncation
absorbs this: at zoom 2 with `R = 1000 km`, the cursor circle covers
~3.1M km² → at 0.5° grid (~3000 km²/cell, ~1000 cells max inside the
disc). At higher zooms the radius is smaller and the count is far
lower. The cap rarely bites and when it does it drops the dimmest
edge-of-radius cells, which are sub-pixel anyway.

## Tests

Five new tests in `frontend/__tests__/hover-glow.test.js`:

1. `cursorFloor=0` reproduces the legacy `cf*bf` formula exactly (so
   the live-tune escape hatch is honest).
2. `bf=0` returns `cf*cursorFloor` (the new behavior — deep-interior
   soft glow).
3. `bf=1` clamps to `cf*1.0` (the `min` guard against over-bright
   border centers).
4. **Continuity guard**: glow is monotonically non-increasing as
   `borderDist` grows from 0 → 100 km at fixed `cf=1` and
   `cursorFloor=0.25`. Catches anyone reintroducing the `Math.max`
   form.
5. `cf=0` returns 0 regardless of `bf` and `cursorFloor` — outside the
   cursor radius the floor must not leak in.

All 33 hover-glow unit tests + 79 other frontend tests pass; server
suite (194 tests) is untouched.

## Files changed

- `frontend/config.js` — ADD `HOVER_GLOW_CURSOR_FLOOR` constant.
- `frontend/hover-glow.js` — MODIFY: import the new constant, extend
  `tunables`, add exported `glowFor` helper, swap the per-cell formula
  in `tick()`, accept `cursorFloor` patches in `__hg.tune`, refresh
  module-header docs.
- `frontend/__tests__/hover-glow.test.js` — ADD `describe('glowFor')`
  block with 5 tests.
- `docs/ARCHITECTURE.md` — UPDATE the per-cell formula line.
- `docs/DEVLOG.md` — APPEND index entry for this devlog.
