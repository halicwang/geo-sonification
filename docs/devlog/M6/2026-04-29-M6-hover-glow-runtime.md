# 2026-04-29 — Feature: Hover-glow Runtime (M6 P1-1/P1-2/P1-3)

Phase 1 of M6: ship the runtime that brightens existing `grid-dots` near
both the cursor AND a country border or coastline. Implementation
fulfills the design from
[the M6 P0 entry](2026-04-29-M6-border-distance-pipeline.md) — the
sidecar produced there feeds `frontend/hover-glow.js` here.

This entry covers stages P1-1 (sidecar load), P1-2 (cursor tracking +
render-tick handler), and P1-3 (paint expression + cleanup invariant)
in one commit. P1-4 (lift constants into config + `window.__hg.tune`)
and P1-5 (unit tests) follow separately.

## What changed

| File | Change |
| --- | --- |
| `frontend/hover-glow.js` | NEW. Self-contained module: parses `grid_index.bin`, holds module-level cursor/glowingFids state, owns `mousemove`/`mouseleave`/`blur` handlers, and runs the per-render tick. |
| `frontend/map.js` | Imports `initHoverGlow`, calls it after `addGridLayer()` inside `style.load`. Replaces the `'circle-color': DOT_COLOR` literal with a feature-state-driven cubic-bezier interpolate. |
| `server/index.js` | Adds a missing-asset warning for `data/tiles/grid_index.bin` to mirror the existing `grids.pmtiles` warning. |

## The three runtime invariants

The previous attempt's failure modes are each addressed by one
specific design decision:

### 1. Drag-lag fix — drive everything from `map.on('render')`

`mousemove` does **not** fire during a Mapbox drag. The previous
attempt's runtime was `mousemove`-driven, so the lng/lat under the
cursor went stale during pan. This implementation tracks only the
*screen-space* cursor on `mousemove` (CSS pixels relative to the
canvas), then re-`unproject`s it on every `render` event using the
*current* transform.

```js
canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    cursor = { sx: e.clientX - rect.left, sy: e.clientY - rect.top };
});

map.on('render', () => {
    if (!cursor || !gridIndex || !mapRef) return;
    const lngLat = map.unproject([cursor.sx, cursor.sy]);
    // ...recompute glow against the cell index...
});
```

`render` fires every frame Mapbox composites — during drag, zoom
animation, and idle hover — so the world point under the cursor is
recomputed at full FPS without any per-mousemove work.

### 2. No square-shape leak — multiplicative radial scalars only

Glow is `cursorFactor(d) × borderFactor(borderDistKm)`. Both factors
are pure 1-D functions of distance, so the visible falloff is
geometrically a true circle, regardless of any iteration-time bbox
prefilter. The early-skip in the inner loop is a `dSq >= R²` check,
which only avoids work; it never touches the visible paint.

```js
function cursorFactor(dKm, R) {
    if (dKm >= R) return 0;
    if (dKm <= 0) return 1;
    const t = 1 - dKm / R;
    return t * t * (3 - 2 * t);          // smoothstep, C¹-continuous
}

function borderFactor(dKm) { /* hermite-blended piecewise over
    [0,1.0],[50,0.7],[150,0.1],[250,0] */ }

glow = cursorFactor(d, R(zoom)) * borderFactor(borderDistKm);
```

### 3. No progressive degradation — diff/cleanup every frame

Each tick: collect `newGlowingFids`, write `setFeatureState({glow:x})`
for each, then walk `prevGlowingFids \ newGlowingFids` and write
`setFeatureState({glow:0})` for the leavers. Critical: zero, don't
remove. Mapbox's coalesce path is faster on a present-zero entry than
on a re-walked absent one.

```
1. for cell in newCandidates: setFeatureState({glow: x})
2. for fid in (prevGlowingFids \ newGlowingFids):
       setFeatureState({glow: 0})       // not removeFeatureState!
3. prevGlowingFids = newGlowingFids
```

A hard `MAX_GLOWING = 1500` cap on per-frame writes is defense in
depth — realistic counts at maximum overlap (Europe at zoom 7) are
200–800. Truncated cells are the dimmest by design (sorted by glow
desc).

`mouseleave` and `window.blur` both call a single sweep that zeros
every fid in `prevGlowingFids`, then resets the set. So tab switch
followed by re-entry doesn't show stale highlights.

## Paint expression

The `circle-color` literal `'#606060'` becomes:

```js
'circle-color': [
    'interpolate',
    ['cubic-bezier', 0.4, 0.0, 0.2, 1.0],
    ['coalesce', ['feature-state', 'glow'], 0],
    0, '#606060',
    1, '#FFFFFF',
],
```

The `coalesce → 0` is load-bearing: features whose state has never
been written would otherwise resolve `['feature-state', 'glow']` to
null/undefined, which Mapbox treats as the first interpolate stop
indeterminately on some v3 builds. Cubic-bezier produces a smoother
perceptual ramp than linear at the same compute cost. Radius is
**not** modulated with glow — radius changes triggered the previous
attempt's progressive degradation regression; color-only by design.

## Hot-loop optimization

The 67k-cell scan runs every render frame. Inner-loop optimizations:

- Dual `Uint32Array` + `Float32Array` views over the same buffer
  slice — no per-iteration object allocation.
- `dSq >= R²` early-skip *without* `Math.sqrt` — ~95% of cells skip
  here on a typical hover. The full `sqrt` runs only on candidates.
- Equirectangular planar approximation with the cursor lat as the
  origin (cosine factor cached outside the loop). Inside the < 600 km
  radius we care about, error vs full geodesic is < 0.1%.
- The `borderFactor` lookup also short-circuits on the cap (returns 0
  when `dKm >= 250` km) before the multiplication.

End-to-end measurement at zoom 7 over Europe: 67,331 iterations
yielded 80 glowing candidates in roughly the 3–4 ms / frame budget
the user won't notice. P2-2 will record the formal numbers.

## Verified scenarios (browser testing)

Live `forceTick` probes against the running map:

| Center | Zoom | Cells glowing | Note |
| --- | ---: | ---: | --- |
| Germany/France border `(7.5°E, 49°N)` | 7 | 80 (max glow ≈ 0.96) | Dense border lattice ✓ |
| Siberian interior `(100°E, 62°N)` | 5 | 0 | No border within ring ✓ |
| Taymyr coast `(105°E, 76°N)` | 5 | 286 | Long Arctic coastline ✓ |
| Aleutians `(-178°E, 52°N)` | 5 | 15 | Antimeridian land ✓ |
| Mid-Pacific `(-150°E, 0°N)` | 5 | 0 | No land cells in range ✓ |

Cleanup invariant verified: cursor-shift from screen-center to
center+200,+100 → `setA \ setB` cells receive `{glow: 0}` in their
feature state (probed via `map.getFeatureState`).

## Module-level debug surface

`window.__hg` exposes the running module for DevTools introspection:

| Field | Purpose |
| --- | --- |
| `map` | Mapbox map handle |
| `getGridIndex()` | Returns `{count, gridSize, u32, f32}` views |
| `getCursor()` | Current screen-space cursor or null |
| `getGlowingFids()` | Snapshot of `prevGlowingFids` |
| `forceTick()` | Manually invoke the render-tick (testing) |

P1-4 will extend this with `__hg.tune({R, borderFalloff, ...})` for
live constant overrides.

## Files changed

- `frontend/hover-glow.js` — NEW (~440 lines)
- `frontend/map.js` — MODIFY (import `initHoverGlow`, call after
  `addGridLayer`, replace `circle-color` literal with feature-state
  interpolate)
- `server/index.js` — MODIFY (add `GRID_INDEX_PATH` constant +
  missing-asset warning)
