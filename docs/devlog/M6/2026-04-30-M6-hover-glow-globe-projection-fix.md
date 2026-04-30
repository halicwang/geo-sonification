# 2026-04-30 — Fix: Hover-glow Globe Projection — ECEF radius + mix() order

User feedback after the GPU custom-layer rewrite shipped:

> 怎么变这样了？浮在上面 而且错位 而且光点还不是重叠在那些点上的

The user's screenshot showed the halo floating in empty space to
the **left of the globe** at zoom 2 (globe projection), with the
cursor visibly at the centre of Asia but the halo painting at
mercator-projected coords on the ortho slice. The grey grid-dots
rendered correctly via Mapbox's own pipeline; only the hover-glow
custom layer's vertices were wrong.

Three independent bugs in the original commit
([216bd88](https://github.com/anthropics/geo-sonification/commit/216bd88)):

## Bug 1 — ECEF used a unit sphere, not Mapbox's GLOBE_RADIUS-scaled space

`buildVertexBuffer` packed `aEcef = (cosLat·sinLng, -sinLat,
cosLat·cosLng)` — a unit-sphere vector. But Mapbox's
`globeToMercatorMatrix()` is built as
`(1/worldSize) × globeMatrix`, where `globeMatrix` operates on ECEF
coords scaled by `GLOBE_RADIUS = EXTENT / (2π) ≈ 1303.8` (per
`src/geo/projection/globe_constants.ts` and
`csLatLngToECEF` in `src/geo/lng_lat.ts`). Feeding unit-sphere ECEF
through the matrix produced mercator coords scaled down by ~1300×,
all clustering near the world origin (top-left of the visible
globe).

Fix: multiply each ECEF component by `MAPBOX_GLOBE_RADIUS = 8192 /
(2π)` at vertex-buffer build time.

## Bug 2 — `mix()` arguments were reversed

The vertex shader had:

```glsl
vec4 worldPos = mix(mercatorPos, globeAsMerc, uTransition);
```

But Mapbox's `globeToMercatorTransition(zoom)` returns **0 in pure
globe** and **1 in pure mercator** (smoothstep over [5, 6] zoom),
the opposite of how I'd written the mix. So at zoom 2 the shader
selected `mercatorPos` (mercator world coords) and ran them through
the camera matrix Mapbox's globe-mode camera was using to view a
sphere — the points landed nowhere near the visible globe.

Fix: swap the args:

```glsl
vec4 worldPos = mix(globeAsMerc, mercatorPos, uTransition);
```

## Bug 3 — Mercator-mode `transition` defaulted to 0, not 1

When Mapbox's `setProjection('mercator')` is active (we trip this at
zoom ≥ 5 in `frontend/map.js`), `draw_custom.ts` runs the
**mercator path** which calls `render(gl, customLayerMatrix)`
without the four extra globe-mode args. My `render()`
destructured `transition` and defaulted it to `0` via `transition || 0`
— but with bug 2 fixed, `t=0` means "pure globe", so the shader
went through the (now-identity) `uGlobeToMercator * (ECEF, 1)` path.
Result: `1303.8 × ECEF` got pushed through `customLayerMatrix`,
landing the points far outside clip space — the halo silently
disappeared in mercator mode.

Fix: detect mercator path by the absence of `globeToMercator` and
default `t=1` there:

```js
const inGlobeMode = !!globeToMercator;
const t = inGlobeMode ? transition || 0 : 1;
```

## Why the unit tests didn't catch it

`HoverGlowLayer` plumbing tests check that `setCursorLngLat` /
`setTunables` land at the right uniform location, but they don't
exercise `render()` and have no real GL context to sample
fragments. `parseGridIndex` / `cursorFactor` / `borderFactor`
tests verify the JS reference math, which is unaffected.

GPU-side correctness has no automatable check in happy-dom; the
verification flow has always been screenshot-based. The
projection-transition logic is exactly the kind of thing that
needs eyes — and got eyes (the user's). For future, the dev
preview verification list now needs to explicitly hit zoom 2 +
zoom 4 globe + zoom 5.5 transition + zoom 9 mercator before any
hover-glow ship.

## Verified post-fix

- **zoom 2, globe, center 110°E 30°N**: halo centred on cursor
  (113°E, 33°N — North China), border tube along China's east
  coast, no off-globe artefacts. Matches the user's expected
  behaviour.
- **zoom 5.5, mercator**: halo + border tube visible at
  `cursorFloor=0.9` (default 0.25 produces a soft lift that's
  hard to see at high zoom in low-contrast areas; that's a
  parameter-tuning question, not a bug).
- **zoom 7, mercator**: halo paints over all in-radius cells with
  the expected smoothstep falloff.

## Files changed

**Modified:**
- `frontend/hover-glow-layer.js` — define `MAPBOX_GLOBE_RADIUS`,
  scale the three ECEF components by it in `buildVertexBuffer`,
  add the `inGlobeMode` branch in `render()` for the
  transition-default fix.
- `frontend/hover-glow-shaders.js` — swap the `mix()` arguments
  and add a comment documenting Mapbox's transition semantics.
- `docs/devlog/M6/2026-04-30-M6-hover-glow-globe-projection-fix.md` —
  this entry.
- `docs/DEVLOG.md` — index entry.
