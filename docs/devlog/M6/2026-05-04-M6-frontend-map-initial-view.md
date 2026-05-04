# 2026-05-04 — Refactor: Retarget Initial Map View to Libya-Chad Border

Move the startup camera from `[-55, -10] zoom 4` (Amazon region) to
`[19.5, 21.75] zoom 2.5` — the geometric midpoint of the Libya-Chad
border, sitting at the tripoint extents `15°E/23.5°N`
(Libya-Niger-Chad) and `24°E/20°N` (Libya-Sudan-Chad). The new zoom
matches the `minZoom: 2.5` floor set in the prior commit, so the app
opens at the most-zoomed-out position with the globe silhouette
filling the viewport and Africa centered as the dominant landmass.

## Files changed

- `frontend/map.js` — `Map(...)` initializer `center` and `zoom` only;
  `minZoom`, `maxZoom`, `projection`, and all paint stops untouched.

## Verification

- `npm run test:frontend` — 13 files, 167 tests pass.
- Browser preview: `map.getCenter()` returns `{ lng: 19.5, lat: 21.75 }`,
  `map.getZoom()` returns `2.5`. Console clean at startup.
