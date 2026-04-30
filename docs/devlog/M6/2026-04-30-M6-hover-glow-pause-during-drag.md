# 2026-04-30 — Fix: Hover-glow Pause During Drag

User feedback after the previous-day sync-tick + spatial-bucket
+ wider-radius ship:

> 还是会卡 是为什么

JS-side instrumentation (in browser preview, eval'd):

| Stage | Cost |
| --- | --- |
| `tick()` total | avg 0.13 ms / p95 0.30 ms / max 0.60 ms |
| 177 × `setFeatureState` | avg 0.10 ms / p95 0.30 ms |
| Combined sync per-frame work | < 1 ms |

So the sync `tick` is *not* the bottleneck on the JS side — its
total cost is well under 1 ms, deep inside the 16.7 ms frame budget.
The remaining jank is GPU-side: each `setFeatureState` call queues a
tile vertex-buffer state update that lands during the next paint.
At ~150–200 changes per drag-frame × 60 fps, the GPU upload churn
compounds and stalls compositing on lower-tier hardware in a way
that JS-side timing cannot see.

The user picked the "pause during drag" trade-off (asked in chat)
over throttling or hiding — accepting that the glow visually
disconnects from the cursor during drag in exchange for a
butter-smooth drag motion.

## Implementation

A module-level `dragging` flag, set at `movestart`, cleared at
`moveend` followed by one catchup `tick()`:

```diff
+ let dragging = false;
+
  function tick() {
+     if (dragging) return;
      if (!cursor || !gridIndex || ...) return;
      ...
  }

+ map.on('movestart', () => { dragging = true; });
+ map.on('moveend', () => {
+     dragging = false;
+     cancelScheduledTick();
+     tick();
+ });
  map.on('move', () => {
+     if (dragging) return;
      cancelScheduledTick();
      tick();
  });
```

The check inside `tick()` itself is load-bearing — without it, a
`mousemove`-queued RAF callback that happens to fire mid-drag would
still run a full tick. With it, every entry path (RAF-coalesced or
synchronous) honors the pause.

The `dragging = false` reset on `window.blur` covers the edge case
of the user alt-tabbing mid-drag (no `moveend` fires).

## Why pause and not throttle / hide?

We considered three trade-offs:

| Strategy | Drag smoothness | Visual continuity | Resume cost |
| -------- | --------------- | ----------------- | ----------- |
| **Pause** (chosen) | best | glow drifts geographically, snaps back at moveend | one tick |
| Throttle to 30 Hz | better | glow tracks cursor with sub-frame jitter | continuous |
| Hide layer entirely | best | dot grid invisible during drag (looks broken) | full repaint |

Pause is the cleanest cure for the GPU-upload bottleneck while
keeping the dot grid itself visible at rest values during drag. The
"glow drifts away from cursor while map slides under it" effect is
acceptable because the user explicitly chose the smoother drag.

## Programmatic camera changes

`movestart` / `moveend` also fire for `jumpTo`, `easeTo`,
`flyTo`, and `fitBounds`. So those programmatic transitions are
also paused — desirable, since they're typically short and the
catchup tick on moveend lands the glow at the final position.

## Verification (Claude Preview)

1.5 s programmatic `easeTo` from `(10, 50)` → `(25, 50)` at zoom 6,
with `setFeatureState` wrapped to count writes:

| Phase | Writes |
| --- | --- |
| 10 samples during drag (every 130 ms) | 0 |
| moveend catchup tick | 311 (134 new + 177 cleanup) |
| Subsequent idle frames | 0 |

Glow was 177 cells at start, 134 cells at end (cursor over a
slightly less border-dense region). Sets differ as expected
(different fid ranges).

## Files changed

- `frontend/hover-glow.js` — MODIFY (add `dragging` flag, wire
  `movestart`/`moveend`, gate `tick()` with the flag, refresh
  top-of-file docs)
