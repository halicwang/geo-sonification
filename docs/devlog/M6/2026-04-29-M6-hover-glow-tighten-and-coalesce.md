# 2026-04-29 — Fix: Hover-glow Single-Row Border + RAF Coalescing

User feedback after the M6 P1 ship:

> 挪动的时候还是会一卡一卡、一闪一闪的。而且边界的地方是直接亮一大片，
> 而不是只亮一个点。

Two distinct problems addressed in one commit. No new code paths,
just two small but high-impact changes.

## 1. Border lights up a "swath" instead of a "line"

**Root cause**: `HOVER_GLOW_BORDER_FALLOFF` had a 250 km cap. With
`GRID_SIZE = 0.5°` (~55 km cell spacing), cells whose centroid is
0–28 km from a border are the ones the border line actually passes
through; the next ring out is 28–83 km away; the ring after that is
83–138 km; etc. At a 250 km cap, **5 rings of cells** all glowed
together, painting a wide swath. The user wants the line one cell
wide, not five.

**Fix**: drop the cap to 40 km (just past the corner-to-centroid
diagonal of a 0.5° cell, which is ~39 km at the equator). Cells
beyond that get glow=0 from the multiplicative `borderFactor`,
regardless of how close the cursor is.

```diff
 export const HOVER_GLOW_BORDER_FALLOFF = [
     [0, 1.0],
-    [50, 0.7],
-    [150, 0.1],
-    [250, 0.0],
+    [15, 0.7],
+    [30, 0.1],
+    [40, 0.0],
 ];
```

Browser verification at zoom 7 over the Germany/France border:

| Old (250 km cap) | New (40 km cap) |
| --- | --- |
| 80 cells glowing, max 0.96 | 33 cells glowing, max 0.99 |
| 3–5 rings wide swath | single row tracing the border line |

The cell count drops to ~40% of the old number; the visible
"swath" collapses to a single line of dots that follows the country
border.

## 2. "卡 + 闪" — flicker / jitter while moving

**Root cause**: tick was wired via `map.on('render', tick)`. Mapbox's
`render` event fires every frame the painter composites — which
includes idle frames where nothing has changed. So we ran the
67k-cell scan at full FPS even when the user wasn't doing anything,
burning ~4M iterations/sec sustained. The "flicker" was cells near
the EPS=0.005 threshold bouncing in/out of the active set as
floating-point cursor coords drifted slightly between frames.

**Fix**: event-driven RAF coalescing. Tick is no longer wired to
`render`. Instead:

- `mousemove` on the canvas → `scheduleTick()` (sets dirty + queues RAF)
- `map.on('move')` → `scheduleTick()` (covers drag, zoom, rotate)
- The single RAF callback runs `tick()` once and clears dirty

Multiple events within the same frame coalesce into one tick. When
nothing is moving, zero ticks run.

```js
let rafId = null;
let dirty = false;

function scheduleTick() {
    dirty = true;
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!dirty) return;
        dirty = false;
        tick();
    });
}
```

Browser verification:

| Scenario | Before (render-driven) | After (event-driven) |
| --- | --- | --- |
| Idle hover, 2 s static cursor | ~120 ticks (60 Hz × 2 s) | 1 tick (initial mousemove only) |
| Drag at full speed | ~120 ticks/2 s | ~120 ticks/2 s (matches `move` rate) |
| Set membership stability while idle | small flicker near EPS | no changes (verified by hash of glowing fids over 2 s) |

The drag-lag fix from P1 is preserved: `map.on('move')` fires once
per frame during pan/zoom animations, so the cursor's lng/lat is
re-`unproject`ed via the *current* transform on every drag frame.
The only difference is we no longer waste cycles when the map is
idle.

## Test updates

`borderFactor` test breakpoints updated to match the new defaults:

```diff
-        // Breakpoints: 0→1.0, 50→0.7, 150→0.1, 250→0
-        expect(borderFactor(50)).toBeCloseTo(0.7, 5);
-        expect(borderFactor(150)).toBeCloseTo(0.1, 5);
+        // Breakpoints: 0→1.0, 15→0.7, 30→0.1, 40→0
+        expect(borderFactor(15)).toBeCloseTo(0.7, 5);
+        expect(borderFactor(30)).toBeCloseTo(0.1, 5);
```

Frontend suite still 103 passing.

## Files changed

- `frontend/config.js` — MODIFY (`HOVER_GLOW_BORDER_FALLOFF` defaults)
- `frontend/hover-glow.js` — MODIFY (add `scheduleTick`, replace
  `map.on('render', tick)` with `map.on('move', scheduleTick)`)
- `frontend/__tests__/hover-glow.test.js` — MODIFY (breakpoint values)
