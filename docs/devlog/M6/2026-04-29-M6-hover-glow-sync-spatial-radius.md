# 2026-04-29 — Fix: Hover-glow Synchronous Tick + Spatial Bucket + Wider Radius

User feedback after the M6 P2 ship (commit 4e1d29a "single-row border
glow + RAF-coalesced tick"):

> 拖动的时候还是会闪，会掉帧，而且范围还是太小。

Three remaining issues, three independent root causes, three local
fixes in one commit. None of the M6 invariants change (drag-lag fix,
anti-square-shape, anti-progressive-degradation, single-row border
line) — only the *phase*, *cost*, and *radius* of the existing tick.

## 1. Flicker during drag — `tick()` was one RAF frame behind the map

`scheduleTick()` deferred `tick()` to the next `requestAnimationFrame`.
During drag, Mapbox dispatches `'move'` from inside its own RAF
callback, so our handler queued a callback for the **next** frame —
Mapbox composited the current frame with feature-state from one
frame ago, and the glow rendered against a stale transform.

**Fix**: Run `tick()` synchronously inside `map.on('move')`. Mapbox
runs `move` listeners *before* compositing, so feature-state writes
inside the listener land in the same frame's render. RAF coalescing
is preserved on `mousemove` (idle hover) where we don't need
same-frame freshness and mousemove can fire faster than RAF.
`cancelScheduledTick()` clears any queued idle-hover tick before a
sync tick to avoid a redundant tick on the next frame.

```diff
- map.on('move', scheduleTick);
+ map.on('move', () => {
+     cancelScheduledTick();
+     tick();
+ });
```

## 2. Frame drops during drag — 67k-cell linear scan + Set churn

Per drag-frame the tick was scanning all 67,331 entries with an
inner-loop branch on every iteration, even though only the few
hundred cells near the cursor could possibly glow. It also allocated
a fresh `new Set()` per frame for the cleanup diff, producing GC
pressure under sustained drag.

**Fix A — spatial bucket index**: At sidecar load, bin entries into
a 5° lon/lat grid keyed by packed `lonIdx*100 + latIdx` → `Uint32Array`
of entry indices. Per tick, compute the cursor's km-bbox in degrees
and walk only buckets that intersect it (typically a 3×3 region near
the equator for the 600 km radius default). The inner-loop body
(equirectangular distance, cursorFactor, borderFactor) is unchanged.
Antimeridian wrap is handled by modular arithmetic on the lon
bucket index.

```js
const SPATIAL_BUCKET_DEG = 5;
const LON_BUCKET_COUNT = 72;
const LAT_BUCKET_COUNT = 36;
// init: gridIndex.spatialIndex = buildSpatialIndex(gridIndex);
// tick: for (let lonI = lonLoFloat; lonI <= lonHiFloat; lonI++) { ... }
```

**Fix B — double-buffered Sets**: `prevGlowingFids` and a new
`currentGlowingFids` are kept at module scope and swapped at the
end of each tick. The new "current" is `clear()`-ed on entry —
no allocation per frame.

Browser verification (zoom 5 over Europe, sustained 800 ms drag):

| Metric | Before | After |
| --- | --- | --- |
| Spatial buckets | n/a (linear scan) | 1027 |
| Per-frame inner iterations | 67,331 | a few hundred |
| Per-frame Set allocations | 1 | 0 |
| Frame samples during drag | n/a | 98 frames @ ~120 Hz sample rate |
| Glowing-set transition | 1-frame stale | tracks cursor frame-accurately |

## 3. Cursor radius felt too small along borders

After the previous fix tightened `HOVER_GLOW_BORDER_FALLOFF` from
250 km → 40 km (single-row line, not 5-row swath), the visible
"presence" of the lit tube along a coast/border was much shorter
than before — the user's "范围还是太小" complaint was specifically
about along-border reach, not perpendicular thickness (clarified
in chat).

**Fix**: bump `HOVER_GLOW_R_KM_BY_ZOOM` ~1.7x across the curve.
Live-tunable via `__hg.tune({ rByZoom: [...] })` for further
iteration without rebuild.

```diff
 export const HOVER_GLOW_R_KM_BY_ZOOM = [
-    [2, 600],
-    [5, 350],
-    [7, 250],
-    [10, 180],
+    [2, 1000],
+    [5, 600],
+    [7, 450],
+    [10, 320],
 ];
```

The bucket index keeps per-tick cost flat despite the larger radius
(more buckets touched, but still bounded by the same constant).

Browser verification (cursor at center, no drag):

| Zoom | R (old → new) | Glowing cells (old → new) |
| ---- | ------------- | ------------------------- |
| 5 (over Europe) | 350 km → 600 km | ~80 → 190 |
| 7 (over Germany) | 250 km → 450 km | 33 → 118 |

## Idle behavior unchanged

500 ms post-drag idle sample (10 reads × 50 ms): glowing-fid set
was identical across all 10 samples — no flicker between cells
hovering at the EPS threshold, no progressive degradation, no
spurious ticks.

## Tests

`frontend/__tests__/hover-glow.test.js` (24 → 28 tests):

- Updated `rByZoom` breakpoint expectations to the new radius curve
  (1000 / 600 / 450 / 320).
- Added 4 `buildSpatialIndex / enumerateNearbyEntries` cases:
  - Every entry lands in exactly one bucket.
  - A near point is in the candidate set; a far point isn't.
  - Antimeridian-wrap query at lon=179 with R=600 km finds entries
    at lon=-179.
  - 50-point random sample: every entry within R of the cursor
    (by exact distKm) appears in the bucket walk (superset
    invariant).

Full frontend suite: 107 passing. Server suite: 194 passing. Lint
and Prettier clean.

## Files changed

- `frontend/hover-glow.js` — MODIFY (add spatial bucket index, switch
  to synchronous tick on `map.on('move')`, double-buffer the
  glowing-fid Sets, drop unused `dirty` flag, refresh top-of-file
  docs)
- `frontend/config.js` — MODIFY (`HOVER_GLOW_R_KM_BY_ZOOM` defaults)
- `frontend/__tests__/hover-glow.test.js` — MODIFY (updated rByZoom
  expectations + 4 new spatial-index tests)
