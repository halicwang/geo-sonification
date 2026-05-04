# 2026-05-04 — Fix: Tighten Limb-Vignette Mask

The globe limb-vignette mask introduced in the same-day theme switching
work paints a feathered alpha mask in the theme background color over
the band just inside and around the silhouette. The outer falloff was
ratcheted from `+0.04` to `+0.08` during that commit's late tweak so the
silhouette-outside band would "fully absorb" the viewport-aligned
`grid-dots` sprite overshoot. In practice the actual overshoot in
normalized globe-radius units is well under `0.005` at globe-mode zooms
(z<5), so the `0.08` pad sat roughly 16× wider than necessary — the
silhouette boundary blurred ~30–40 px into the canvas background and
the sphere edge stopped reading as a defined arc.

This entry tightens the mask in two places, calibrated in successive
passes against the live preview:

- **Outer falloff** `+0.08 → +0.02`. Promoted from a hardcoded shader
  constant to a `uOuterFade` uniform with a matching
  `__lv.tune({ outerFade })` knob, mirroring the existing `band`
  tunable. Future calibration no longer needs shader edits.
- **Inner ramp** `[0.94, 1.0] → [0.96, 1.0]`. Trims another 2% off the
  inner band so more dots remain visible just inside the silhouette,
  reading more clearly as the sphere outline. Peak alpha still lands
  at `dNorm = 1.0`, so the actual rim pile-up is still wiped out.

## Why 0.02 is enough

Worst case for the outer pad is the largest screen-space overshoot of a
`grid-dots` circle past the silhouette in `dNorm` units. The circle's
center sits at some `dNorm ≤ 1`; the sprite extends `circle-radius`
pixels outward from the center in screen space.

- `circle-radius` paint stops in `frontend/map.js`:
  `[zoom 2 → 1.1px, 5 → 2.8px, 8 → 4.9px, 12 → 8.2px]`. Globe mode is
  z<5, so the relevant cap is ~2.8px (and at the most-zoomed-out end
  z=2 it's just 1.1px).
- On-screen globe radius at z=2 ranges from a few hundred to ~1000+ px
  depending on viewport. The smallest plausible value at hidden-panel
  fullscreen is ~400 px.
- `dNorm` overshoot ≈ `circle-radius / R_screen` ≤ 2.8 / 400 ≈ 0.007 at
  the worst boundary case (transition zone), and ≤ 1.1 / 400 ≈ 0.003
  at z=2 where most globe-mode rendering happens.

`0.02` therefore leaves ~3–7× margin over the actual overshoot — wide
enough that no dot sprite peeks past the mask, narrow enough that the
silhouette reads as a defined edge rather than fading into the
background. The value was reached in three live A/B passes
(`0.08 → 0.04 → 0.03 → 0.02`) against the preview, each step verified
to tighten visibly without reintroducing any sprite leakage past the
silhouette.

## Diagnosis trail

User report (Chinese, paraphrased): the outer blur layer is too soft,
making it hard to see the globe boundary. Specifically the silhouette-
outside fade (`球体外的渐变`), not the inner ramp.

- Re-derived the actual sprite-overshoot bound from the
  `circle-radius` zoom stops and reasonable globe-radius values; the
  `0.08` pad in the predecessor commit was set conservatively, not
  measured.
- First tightened outer fade to `+0.04`, then to `+0.03`, then to
  `+0.02` after successive live A/B passes in the preview each
  confirmed the boundary still read slightly soft.
- Follow-up user note: inner side could come in a touch too. Trimmed
  the inner ramp from `[0.94, 1.0]` to `[0.96, 1.0]` — same peak
  position at the silhouette, narrower attenuation strip inside.
- Promoting the outer-fade constant to a uniform with a `__lv.tune`
  knob keeps the same shader-side smoothstep shape but lets the next
  round of empirical tuning happen without shader edits.

## Behavior after change

- Globe mode (z<5): silhouette reads as a defined edge against the
  canvas background. No soft halo extending well past the limb. The
  visible dot ring just inside the silhouette is denser than before
  (inner ramp narrowed from 0.06 to 0.04), so the sphere outline
  reads more clearly on the light theme.
- Inner-side rim ring stays gone — peak alpha still lands at
  `dNorm = 1.0`, so the per-pixel pile-up at the silhouette is still
  fully erased.
- Theme tracking is unchanged — `LimbVignetteLayer.setBgColor()` still
  flips the mask color via `subscribeTheme()`.
- Globe → mercator transition (z ∈ [5, 6]) still fades the mask via
  `(1 − transition)`; the new pads live inside that fade window on
  the same schedule.

## Verification

- `npm run test:frontend` — 13 files, 167 tests pass (165 → 167 with
  two new `outerFade` tunable cases). The `limb-vignette.test.js`
  suite intentionally does not pin the default band / falloff values
  (see comment at the top of that file), so the inner-band default
  shift needs no test changes.
- `npm run lint` and `npm run format:check` clean.
- Browser preview at globe zoom (z=2):
    - Light theme — silhouette boundary now sharp, sphere outline
      reads against the near-white canvas; dot ring just inside the
      limb is denser than before.
    - Dark theme — mirror behavior.
    - Auto theme — toggle still flips the mask color via the existing
      `subscribeTheme` subscriber.
    - Live tunable surface verified: `__lv.tune({ outerFade: x })`
      round-trips; non-finite and negative patches are ignored. Used
      to A/B `0.04 → 0.03 → 0.02` without shader edits.

## Files changed

- `frontend/limb-vignette-shaders.js` — fragment shader outer falloff
  constant replaced with a `uOuterFade` uniform; inline comments in
  the docblock updated to describe the new pad width and the
  underlying overshoot bound.
- `frontend/limb-vignette-layer.js` — adds `DEFAULT_OUTER_FADE = 0.02`,
  uploads the value as `uOuterFade` each frame, and accepts an
  `outerFade` field in `setTunables(...)` (mirrors the existing `band`
  field; non-finite or negative values are ignored). `DEFAULT_BAND`
  shifted from `[0.94, 1.0]` to `[0.96, 1.0]`; docblock rewritten to
  reflect both new defaults and the live-tunable surface.
- `frontend/__tests__/limb-vignette.test.js` — adds two cases for the
  `outerFade` tunable: one happy-path patch + repaint, one that
  asserts non-finite / negative values are ignored.
- `docs/devlog/M6/2026-05-04-M6-frontend-limb-vignette-tighten-outer-fade.md`
  — this entry.
- `docs/DEVLOG.md` — index row added.
