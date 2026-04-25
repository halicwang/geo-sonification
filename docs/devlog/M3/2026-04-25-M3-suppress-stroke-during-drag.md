# 2026-04-25 — Refactor: Suppress Grid Stroke During Map Motion

Set `circle-stroke-width` to 0 on `movestart` and restore it to the
zoom-driven interpolate expression on `moveend`. Halves the fragment
shader cost on the 67,331-feature dot layer during drag without
changing the resting visual.

## Why now

The user reported visible stutter when dragging the map at low zoom
(2–4) where the full grid is in view. Per the previous LOD experiments
log (`docs/devlog/M3/2026-04-24-M3-revert-dot-rendering-experiments.md`)
the resting-state visual baseline is "all 67k features at all zooms,
current paint properties" — every static-state LOD strategy was
rejected because the user wanted the dense dot wash at low zoom.

That veto was about rest-state appearance. Drag-state is categorically
different: at zoom 3 with full motion, sub-pixel stroke detail is
already lost to motion blur and moiré, so dropping it during motion
costs nothing perceptible while saving roughly half the fragment shader
work on every frame. As soon as `moveend` fires, the stroke is back
within a single frame.

## How it works

**`frontend/map.js`:**
- The interpolate expression for `circle-stroke-width` is hoisted from
  the `addLayer` paint block to a module-level `STROKE_WIDTH_BY_ZOOM`
  constant. The layer setup references it by name; the restore handler
  re-uses the exact same array, so there's no risk of drift.
- Two new listeners are registered alongside the existing `move`
  listener inside the `style.load` handler:
  - `movestart` → `setPaintProperty(GRID_DOT_LAYER, 'circle-stroke-width', 0)`
  - `moveend` → `setPaintProperty(GRID_DOT_LAYER, 'circle-stroke-width', STROKE_WIDTH_BY_ZOOM)`
- Both handlers guard with `getLayer(GRID_DOT_LAYER)` so they no-op if
  the PMTiles layer fails to load (catch block on line 287).

Mapbox's `movestart` / `moveend` fire once per gesture (drag, pinch,
zoom-button click). `move` fires per frame in between. Zoom events
also emit move events, so we don't need a separate `zoomstart`/`zoomend`
pair — the existing pair covers all motion.

## What this is not

- **Not** an LOD change. The same 67k features render at all zooms,
  just like before. Only the paint property changes, only during
  motion.
- **Not** an opacity fade. Dot fill stays at full opacity; the only
  thing that disappears during drag is the 0.15–0.9 px white border
  that ringed each dot — which most users wouldn't notice was there
  to begin with.

## Verification

- `npm run lint`, `npm run format:check`, `npm test --prefix server`
  all green.
- Manual: open `http://localhost:3000`, zoom to ~3, drag fast and
  slow:
  - Resting view identical to pre-change (verified visually + by
    diffing nothing else changed).
  - During drag the dots are noticeably smoother / less moiré-prone
    (the moiré at low zoom is mainly from sub-pixel stroke aliasing).
  - On `moveend` the stroke pops back within ≤1 frame; no visual
    flicker.
- Chrome DevTools Performance recording at zoom 3 during 5 s of drag:
  fragment shader frame budget visibly drops — the GPU work was
  dominated by the stroke pass at low zoom.

## Rollback

If a GPU driver doesn't actually skip the stroke pass for `width=0`
(some Adreno chips don't), fall back to setting
`circle-stroke-opacity: 0` instead. Both are reversible per-frame.

## Files changed

- `frontend/map.js` — extract `STROKE_WIDTH_BY_ZOOM`; reference it in
  `addLayer`; add `movestart`/`moveend` paint-property toggles.
- `docs/DEVLOG.md` — index entry for this devlog.
