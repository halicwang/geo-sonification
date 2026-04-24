# 2026-04-16 — Fix: Globe Dot Overlay + UI Overhaul

Fixed a frontend map rendering bug where zooming past level 5 in the globe
projection made all grid dots disappear (the circle layer rendered black /
culled at assorted zoom levels around 5.5, 6.0, 6.44 in globe mode; the
tile data and `landcover_class` properties themselves were fine). In the
same pass, migrated the tile schema from polygons to centroid points,
collapsed the old multi-layer grid overlay down to a single circle layer,
and reshaped the floating UI (controls bar + hideable info panel, pure
black theme).

## What Changed

### Map rendering (`frontend/map.js`)

- Kept the `globe` projection at low zoom, but auto-switch to `mercator`
  once the user crosses `GLOBE_ZOOM_CUTOFF = 5`. Globe's circle-layer
  renderer culls to invisible at mid zoom; mercator does not. Switching
  back when the user zooms out preserves the overview "sphere" look.
- Replaced the old grid overlay (fill + outline + crosshair-source + border
  glow) with a single `circle` layer (`grid-dots`) bound to the PMTiles
  source.
- Left `circle-pitch-alignment` and `circle-pitch-scale` at their Mapbox
  defaults — explicitly setting both to `viewport` reproduced the same
  "dots vanish" bug at the globe→mercator transition.
- Added `circle-blur: 0` and a faint `circle-stroke-*` so dots stay crisp
  against the black basemap.
- Replaced the style-specific `dark-v11` basemap with the older v8
  `dark-v10` plus `applyMinimalBasemap()`, which walks every non-background
  layer and sets `visibility: none`, then paints the background pure black.
  Pinning to v8 keeps the layer stack stable against future style updates.
- Removed `buildLandcoverFillColor`, `addBorderGlowLayers`, the crosshair
  system, and the now-unused `crosshair-source`. The dots use a fixed
  neutral grey (`#d0d0d0`); landcover detail is still surfaced via the
  click popup and the side panel.

### Tile schema (`scripts/build-tiles.js`)

- `gridToFeature` now emits a `Point` at the cell centroid
  (`lon + gridSize/2`, `lat + gridSize/2`) instead of a five-vertex
  `Polygon`. Circle layers require point geometry.
- **Deployment note**: existing `data/tiles/grids.pmtiles` generated before
  this change will render empty. Run `npm run clean:cache` and rebuild
  tiles after pulling.

### UI shell (`frontend/index.html`, `frontend/main.js`, `frontend/style.css`)

- New `#controls-bar` in the top-right with two floating buttons:
  - `#audio-toggle` — moved out of the info panel so playback is reachable
    when the panel is hidden. Keeps the same `.active` class hook used by
    `main.js` for the play/stop state swap.
  - `#panel-toggle` — hamburger button that toggles a `.hidden` class on
    `#info-panel` (opacity + translate transition, `pointer-events: none`
    when hidden). Responsive override slides the panel down instead of
    right on narrow screens.
- Info panel now starts hidden (`class="hidden"` on initial render) so the
  globe/map is the first thing the user sees.
- Theme darkened from `#1a1a2e` to pure `#000000` for `--color-bg` and the
  two translucent panel backgrounds, matching the all-black basemap.
- Removed the in-panel `.audio-controls` / `.audio-btn` rules (dead after
  the button moved out).

### Tests (`server/__tests__/build-tiles.test.js`)

- Updated both fixtures to assert the new centroid `Point` geometry.

## Verification

- `npm run lint` — clean (the previously flagged `buildLandcoverFillColor`
  warning is gone since the function is removed).
- `npm run format:check` — clean.
- `npm test` — all suites pass including the updated build-tiles test.
- Manual smoke test: dots visible from zoom 2 through 12, no gaps at the
  zoom-5 projection switch, info panel toggles without layout shift.

## Files changed

- **Modified**: `frontend/map.js` — single-layer dot overlay, projection
  auto-switch, minimal basemap helper
- **Modified**: `frontend/index.html` — floating controls bar + panel
  toggle; info panel starts hidden
- **Modified**: `frontend/main.js` — wire up `#panel-toggle`
- **Modified**: `frontend/style.css` — pure black theme, floating
  controls, panel hide/show transition; dropped dead audio-btn rules
- **Modified**: `scripts/build-tiles.js` — emit centroid points instead of
  polygons
- **Modified**: `server/__tests__/build-tiles.test.js` — assert Point
  geometry
- **Modified**: `docs/DEVLOG.md` — add the new devlog entry to the index
- **Added**: `docs/devlog/M3/2026-04-16-M3-globe-dot-overlay-fix.md` —
  this entry
