# 2026-04-30 — Fix: Hover-glow Halo Zoom Curve

User feedback after the GPU projection fix shipped:

> 放大的时候大小是对应上的 怎么缩小之后 dot 没跟着缩小 搞得非常 thick

The halo radius was a **fixed 3× the dot radius** at every zoom. At
high zoom the dots are far apart in screen pixels (e.g. ~90 px
between cells at zoom 8) and a 3× halo per dot reads as a soft
well-defined glow. At low zoom the dots crowd together (~1.4 CSS
px spacing at zoom 2 globe) but the dot radius itself shrinks more
slowly than the spacing — a halo with diameter 6× the dot radius
overlaps several neighbours and the cursor area becomes a uniform
fog. That's the "thick" the user saw.

The ratio between halo and dot looked the same at every zoom; the
ratio between halo and **dot spacing** did not.

## Fix

Replace the single-scalar `HOVER_GLOW_HALO_SCALE = 3.0` with a
zoom-stops table:

```js
export const HOVER_GLOW_HALO_SCALE_BY_ZOOM = [
    [2, 1.5],   // tight at globe overview — halos don't overlap
    [5, 1.8],
    [8, 2.2],
    [12, 2.8],  // soft bloom at street level
];
```

The GPU layer's `_computePointSize` now type-checks `tunables.haloScale`:
a `number` keeps the legacy constant-multiplier behavior, an array is
linearly interpolated by `lerpStops(zoom, table)`. `__hg.tune({
haloScale })` accepts either form.

## Why a curve and not just a smaller scalar

Tried `haloScale = 1.0` first — at zoom 5+ the halo collapsed onto
the dot and produced no visible cursor signal. Tried `1.5` — zoom 2
looked clean but zoom 8 lost the soft-glow character the user had
called out as the "right" look at high zoom. A curve that starts
tight (low zoom) and blooms wider (high zoom) hits both: dots stay
distinguishable when zoomed out, soft halos at street zoom.

The breakpoints aren't precious — they were dialed visually against
zoom 2/3/5/8 screenshots. `__hg.tune({ haloScale: [...] })` makes
further tuning a one-line DevTools patch.

## Verified

- **Zoom 2 globe (China centre)**: cursor halo a clear bright
  region in North China, border tube along the east coast still
  visible, no fog overlap with neighbouring dots.
- **Zoom 3 globe**: same shape as zoom 2, slightly larger viewport
  span.
- **Zoom 5 mercator (Italy)**: border tube along the Adriatic /
  Tyrrhenian coasts paints crisply, halo size matches the user's
  earlier "good" reference.
- **Zoom 8 mercator**: each in-radius dot has its own soft halo,
  no thick-blob feel.

## Files changed

**Modified:**
- `frontend/config.js` — replace `HOVER_GLOW_HALO_SCALE` (number)
  with `HOVER_GLOW_HALO_SCALE_BY_ZOOM` (stops table).
- `frontend/hover-glow.js` — import the new constant, default
  `tunables.haloScale` to it, accept array or number in
  `__hg.tune` patch path.
- `frontend/hover-glow-layer.js` — `_computePointSize` interpolates
  `haloScale` by zoom when it's an array; `setTunables` accepts
  array or number.
- `docs/devlog/M6/2026-04-30-M6-hover-glow-halo-zoom-curve.md` —
  this entry.
- `docs/DEVLOG.md` — index entry.
