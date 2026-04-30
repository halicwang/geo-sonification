# 2026-04-30 — Refactor: Hover-glow GPU Custom-Layer Rewrite

User feedback after the same-day pause-during-drag ship:

> 现在感觉整个前端的实现都有点卡卡的 这是为什么 有没有什么彻底换实现思路的方法但是是很流畅很流畅的那种呢？

The previous `2026-04-30-M6-hover-glow-pause-during-drag.md` entry
established that JS-side per-frame tick cost is sub-millisecond and
that the real bottleneck is the GPU vertex-buffer upload churn each
`setFeatureState({glow})` call queues. The drag-pause workaround
froze the glow geographically while the user dragged — eliminating
the upload churn, but visibly disconnecting glow from cursor. That
pause is the source of the "卡卡的" feel during interaction.

This rewrite replaces the CPU per-cell tick with a single Mapbox
**custom WebGL layer**. The 67k cell positions and border distances
are uploaded **once** as a vertex buffer; per frame, only a `vec2`
cursor uniform is touched. Glow is computed entirely in the
fragment shader. There is no `setFeatureState` call, no spatial
bucket walk, no candidate buffer, and no `dragging` flag anywhere.

`hover-glow.js` shrinks from 819 lines to ~150.

## Architecture

```
                                  ┌────────────────────────────┐
                                  │ data/tiles/grid_index.bin  │
                                  │ 67k × {fid,lng,lat,distKm} │
                                  └─────────────┬──────────────┘
                                                │ fetch + parse on init
                                                ▼
┌──────────────────────────────────┐    ┌────────────────────────┐
│ frontend/hover-glow.js (entry)   │───▶│ HoverGlowLayer (custom)│
│ - fetch sidecar                  │    │ - VBO uploaded once    │
│ - mousemove → setCursorLngLat    │    │ - per-frame: 2 uniforms│
│ - __hg.tune({...}) → setTunables │    │ - draws gl.POINTS      │
└──────────────────────────────────┘    └────────────────────────┘
                                                │
                                                ▼
                                  ┌─────────────────────────────┐
                                  │ Mapbox grid-dots (unchanged)│
                                  │ Grey base layer underneath  │
                                  │ Popup hit-test target       │
                                  └─────────────────────────────┘
```

Strict superposition: the grey base renders through Mapbox's normal
vector-tile pipeline; the glow rides on top as a premultiplied-alpha
additive white point-sprite overlay. Each is debuggable in isolation.

## Vertex buffer format

Single interleaved VBO, stride 32 B per vertex (8 × float32):

| Field | Offset | Bytes | Source |
|---|---|---|---|
| `aLngLat.x` (lng) | 0 | 4 | `gridIndex.f32[4i+1]` |
| `aLngLat.y` (lat) | 4 | 4 | `gridIndex.f32[4i+2]` |
| `aMerc.x` | 8 | 4 | `MercatorCoordinate.fromLngLat(...).x` |
| `aMerc.y` | 12 | 4 | `MercatorCoordinate.fromLngLat(...).y` |
| `aEcef.x` | 16 | 4 | `cos(lat)·sin(lng)` |
| `aEcef.y` | 20 | 4 | `-sin(lat)` |
| `aEcef.z` | 24 | 4 | `cos(lat)·cos(lng)` |
| `aBorderDist` | 28 | 4 | `gridIndex.f32[4i+3]` |

67k × 32 B = ~2.1 MB, uploaded once with `gl.STATIC_DRAW`. Negligible
relative to the existing tile/sprite payload Mapbox pages around.

## Projection (globe + mercator)

Mapbox v3.11 `draw_custom.ts` invokes the custom layer's `render()`
with extra positional args in globe mode (verified against
`raw.githubusercontent.com/mapbox/mapbox-gl-js/v3.11.0/src/render/draw_custom.ts`):

```
globe:    render(gl, customLayerMatrix, projection, globeToMercatorMatrix,
                 globeToMercatorTransition(zoom),
                 [centerX, centerY], pixelsPerMeterRatio)
mercator: render(gl, customLayerMatrix)
```

We use a **single shader program** that handles both via a `mix()`
blend in the vertex shader:

```glsl
vec4 mercatorPos = vec4(aMerc, 0.0, 1.0);
vec4 globeAsMerc = uGlobeToMercator * vec4(aEcef, 1.0);
vec4 worldPos = mix(mercatorPos, globeAsMerc, uTransition);
gl_Position = uMatrix * worldPos;
```

In pure mercator mode, `uTransition = 0` and `uGlobeToMercator =
identity` — globe branch contributes nothing. In globe mode,
`uTransition = 1` makes the shader pick the ECEF→merc-via-G2M path,
matching Mapbox's own globe→mercator transition factor across the
zoom-5 swap.

## Fragment shader math

Reproduces the JS reference (`cursorFactor`, `borderFactor`, `glowFor`)
bit-for-bit:

```glsl
float d = distKmToCursor(uCursorLngLat, vLngLat);  // antimeridian-safe
float cf = cursorFactor(d, uR);                    // smoothstep falloff
if (cf < uEps) discard;
float bf = borderFactor(vBorderDist);              // 4-stop Hermite
float g = cf * min(1.0, bf + uCursorFloor);
if (g < uEps) discard;

vec2 q = gl_PointCoord - vec2(0.5);
float discMask = smoothstep(1.0, 0.6, length(q) * 2.0);
float a = g * discMask;
fragColor = vec4(a, a, a, a);  // premultiplied additive white
```

`borderFactor` reads a `uniform vec2 uFalloff[4]`; the 4-stop limit
is set at `MAX_FALLOFF_STOPS = 4` in `hover-glow-shaders.js`. The JS
helper `packBorderFalloff(stops)` pads or truncates the user-provided
table to length-8 `Float32Array` for `gl.uniform2fv`. Live tuning of
the table works without shader recompile.

## Per-frame state

Two uniforms touched per frame:

- `uCursorLngLat` — set when `mousemove` fires (one `vec2` upload)
- `uR`, `uPointSize` — recomputed inside `render()` from
  `map.getZoom()`. `uR` follows `HOVER_GLOW_R_KM_BY_ZOOM`;
  `uPointSize` mirrors the `circle-radius` zoom interpolation in
  `frontend/map.js` × `2 × HOVER_GLOW_HALO_SCALE × devicePixelRatio`.

Mousemove → `layer.setCursorLngLat(lng, lat) + map.triggerRepaint()`.
Mapbox de-duplicates `triggerRepaint` calls per frame; no own RAF
coalescing is needed.

## What gets deleted

- `tick()` body, ~145 lines
- `prevGlowingFids` / `currentGlowingFids` Sets and the diff-based
  cleanup machinery
- Candidate SoA buffers: `candFids`, `candGlows`, `candIdx`,
  `ensureCandCapacity`
- `buildSpatialIndex`, `enumerateNearbyEntries`, all bucket-key math
- `distKm` JS function (lives only in GLSL now)
- `dragging` flag, `clearAllGlow`, `scheduleTick`, `cancelScheduledTick`
- `movestart` / `moveend` / `move` listeners that drove the tick
- All `setFeatureState` calls
- `HOVER_GLOW_MAX_GLOWING` constant — no per-frame cap on the GPU path
- The `circle-color` interpolate-coalesce-feature-state expression in
  `frontend/map.js`; the layer paints a fixed `DOT_COLOR`

## API surface changes

`window.__hg.tune({...})` keeps working, with two breaking changes
to its accepted patch fields:

| Field | Status |
|---|---|
| `rByZoom` | Kept — table flows into `uR` per frame |
| `borderFalloff` | Kept — pushed to `uFalloff[4]` uniform |
| `cursorFloor` | Kept — `uCursorFloor` uniform |
| `eps` | Kept — `uEps` uniform |
| `haloScale` | **NEW** — multiplies `uPointSize`, default 3.0 |
| `maxGlowing` | **REMOVED** — no per-frame cap on the GPU path |
| `pauseOnDrag` | **NOT INTRODUCED** — drag-pause is gone entirely |

`getGlowingFids()` and `forceTick()` debug helpers are also removed
(no per-frame "set" exists any more, and there is no JS tick to force).

## Tests

Dropped (functions deleted from the JS module):

- `distKm` (5 tests)
- `buildSpatialIndex` / `enumerateNearbyEntries` (4 tests)

Added:

- `packBorderFalloff` (3 tests: pad short, truncate long, identity for length-4)
- `HoverGlowLayer` plumbing smoke test (asserts CustomLayerInterface
  shape; mocks `gl` to verify uniform writes land at the right location)

Kept (curve definitions still live in JS as the GLSL spec):
`parseGridIndex`, `cursorFactor`, `borderFactor`, `glowFor`, `rByZoom`.

`vitest.config.mjs` adds `frontend/hover-glow-layer.js` and
`frontend/hover-glow-shaders.js` to the coverage `exclude` list —
WebGL-bound, untestable in happy-dom (same rationale as
`frontend/map.js` and `frontend/popup.js`).

## Landed in two commits

Originally planned as five staged commits, then consolidated to two
to satisfy the project's commit-msg hook (`feat`/`fix`/`refactor`
commits touching `frontend/server/scripts` must include a
`docs/devlog/` change in the same commit) and the
`feedback_occam_single_commit` memory ("bundle all sub-items into
one commit + one devlog"):

1. **`feat(frontend): add hover-glow custom WebGL layer skeleton`** —
   landed the new `HoverGlowLayer` class with a `discard`
   placeholder fragment shader + the new shader module + this
   devlog. Layer registered above `grid-dots` but invisible; CPU
   tick still drove the visible glow. Verified zero behavioral drift
   in dev preview at zoom 4 globe.
2. **`refactor(frontend): land hover-glow GPU math, drop CPU tick`** —
   filled in the fragment shader (cursorFactor × min(1, borderFactor
   + cursorFloor) + soft round disc), wired mousemove ↔
   `setCursorLngLat`, simplified `grid-dots` `circle-color` to fixed
   grey, deleted the entire CPU tick path (~600 lines), trimmed
   `hover-glow.test.js` of distKm / spatial-bucket cases, and added
   `packBorderFalloff` + `HoverGlowLayer` plumbing tests.
   `frontend/hover-glow.js` shrank from 819 → ~250 lines.

Verified live in dev preview after commit 2:

- Halo tracks cursor at zoom 3 globe / zoom 4 globe / zoom 6
  mercator with no setFeatureState writes (`getGlowingFids` no
  longer exposed; drag-pause flag gone).
- `__hg.tune({ cursorFloor: 0.6 })` immediately brightened the halo
  on the next render — no reload, no rebuild.
- Border-near cells visibly brighter than open-ocean cells
  (cursorFloor + borderFactor still composing as expected).

## Risk and rollback

Each of the 5 stages leaves the app working:

1. Skeleton — invisible GPU layer alongside CPU tick
2. GPU math + plumbing — both glows visible (overlap)
3. Drop `feature-state` paint expression — only GPU glow contributes
4. Gut CPU tick — remove dead code
5. Trim tests — bring suite in line with the new module

Rollback before stage 4 is a one-commit revert. After stage 4 the
CPU tick is gone; rolling back means restoring the deleted code,
which is why stages 3 and 4 split — stage 3 is the safe drop-out
point.

Known risks:

- `gl_PointSize` driver cap. Plan assumes 256 px (most desktop
  drivers); at zoom 12 / 4K we paint ~99 px sprites — inside the cap.
  If a Windows driver caps at 64, fall back to instanced quads in a
  contained shader change.
- Globe → mercator transition shimmer. The plan uses Mapbox's smooth
  `transition ∈ [0,1]` `mix()` factor, matching how Mapbox itself
  blends. If shimmer appears at zoom 5, swap to `step(0.5, transition)`
  for a one-frame snap.

## Obsoleted entries

[`2026-04-30-M6-hover-glow-pause-during-drag.md`](2026-04-30-M6-hover-glow-pause-during-drag.md):
the `dragging` flag, `movestart`/`moveend` handlers, and the GPU
upload churn this fix worked around are all gone in this rewrite.

## Files changed

**New:**
- `frontend/hover-glow-layer.js` — `HoverGlowLayer` class implementing
  `mapboxgl.CustomLayerInterface`. Owns the GL program, VBO, attribute
  and uniform locations, and exposes `setCursorLngLat`/`setVisible`/
  `setTunables`.
- `frontend/hover-glow-shaders.js` — `VERTEX_SHADER_SRC`,
  `FRAGMENT_SHADER_SRC`, `MAX_FALLOFF_STOPS`, `packBorderFalloff`.
- `docs/devlog/M6/2026-04-30-M6-hover-glow-gpu-custom-layer.md` — this entry.

**Modified:**
- `frontend/hover-glow.js` — gut body (819 → ~150 lines); keep public
  API, `parseGridIndex`, curve helpers, `__hg.tune` debug surface.
- `frontend/map.js` — `circle-color` becomes fixed `DOT_COLOR`.
- `frontend/config.js` — drop `HOVER_GLOW_MAX_GLOWING`; add
  `HOVER_GLOW_HALO_SCALE = 3.0`.
- `frontend/__tests__/hover-glow.test.js` — drop `distKm` /
  `buildSpatialIndex` / `enumerateNearbyEntries` tests; add
  `packBorderFalloff` / `HoverGlowLayer` plumbing tests.
- `vitest.config.mjs` — add `hover-glow-layer.js` and
  `hover-glow-shaders.js` to coverage `exclude`.
- `docs/DEVLOG.md` — index entry for this devlog.
