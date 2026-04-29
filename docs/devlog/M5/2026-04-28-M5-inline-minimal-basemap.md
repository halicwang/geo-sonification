# 2026-04-28 — Fix: Inline Minimal Basemap to Drop Cold-Load Navy Flash

Cold loads of placeecho.com showed a brief grey/navy-blue flash before
the page settled into the all-black globe view. The cause was the
mapbox style fetch lifecycle:

1. `initMap()` configured `style: 'mapbox://styles/mapbox/dark-v10'`.
2. Mapbox created the WebGL canvas and rendered dark-v10's defaults
   (background `#08111f`, globe atmosphere fog) while it fetched the
   style JSON, sprite, and glyphs from the Mapbox CDN.
3. Once `style.load` fired, `applyMinimalBasemap()` painted the
   background pure black, hid every other dark-v10 layer, and
   `setFog(null)` killed the atmosphere — but only after the CDN
   round-trip resolved.
4. On a warm reload the style was cached, so the navy frame was a
   single blink and the user perceived an instant black canvas.

`applyMinimalBasemap` was already hiding every dark-v10 layer except
the background it overrode to `#000`, so dark-v10 contributed nothing
to the final view — the fetch was a pure tax.

## Change

Replaced the remote-style URL with an inline minimal v8 style: one
black `background` layer, empty `sources`, no sprite, no glyphs. The
canvas now renders black on the very first frame, and `applyMinimalBasemap`
becomes a no-op (everything it used to do is already encoded in the
inline style), so the helper is removed. `setFog(null)` is still called
in the `style.load` handler — `globe` projection adds its own halo
regardless of the style's fog config.

Side benefit: no Mapbox-style CDN round-trip on cold start, which
also helps users on slower networks beyond the visual fix.

## Files changed

- **modified** `frontend/map.js` — replace `style: 'mapbox://styles/mapbox/dark-v10'`
  with an inline v8 style; remove `applyMinimalBasemap()` and its
  call site; refresh comment about why `setFog(null)` is still needed.
- **modified** `frontend/style.css` — top-of-file comment now references
  the inline minimal basemap rather than a dark-v10 forced override.

## Verification

- `npm test`: 173/173 passed.
- `npm run lint` and `npm run format:check`: clean.
- Browser smoke (preview server on :3000):
  - Console produced zero errors during page load.
  - `map.getStyle().layers` after init returns exactly two entries:
    `background` (black) and our `grid-dots` overlay. No residual
    dark-v10 layers.
  - `map.isStyleLoaded()` is `true` immediately after the inline
    style parses (no remote fetch to wait on).
  - Visual: full-screen black canvas with the dot overlay, identical
    to the warm-reload appearance under the previous setup.
