# 2026-05-04 — Refactor: Raise Map `minZoom` 2 → 2.5

Tighten the lower bound on map zoom so the user cannot back the camera
out beyond `zoom = 2.5`. At `zoom = 2` on a tall portrait viewport the
globe started to look small relative to the chrome and the surrounding
empty canvas dominated the frame; `2.5` keeps the silhouette filling
most of the viewport at the most-zoomed-out position while still leaving
~1 step of headroom under the zoom-4 default center.

## Files changed

- `frontend/map.js` — `Map(...)` initializer `minZoom: 2 → 2.5`. No other
  knobs touched; the `circle-radius` zoom stops in the dot paint already
  start at `zoom = 2` and degrade gracefully past `2.5` with no rendering
  artifacts. `maxZoom: 12` unchanged.

## Verification

- `npm run test:frontend` — 13 files, 167 tests pass.
- Browser preview: `map.getMinZoom()` returns `2.5`; calling
  `map.jumpTo({ zoom: 1.5 })` clamps to `2.5` as expected. No console
  errors at the new floor.
