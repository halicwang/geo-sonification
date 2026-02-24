# 2026-02-24 — Feature: Loop Cycle Progress Bar

Added a YouTube-style progress bar at the bottom of the screen that tracks playback position within the audio loop cycle. Supports click-to-seek and drag-to-seek via pointer events. The bar appears automatically during playback and hides when audio is stopped or samples are still loading.

## What changed

- **`frontend/audio-engine.js`**: Added `getLoopProgress()` — returns `{ progress, cycleSeconds }` computed from `nextGlobalSwapTime` and `loopCycleSeconds`, or `null` when loop is not active.
- **`frontend/audio-engine.js`**: Added `seekLoop(progress)` — stops all current voices, restarts them at the target buffer offset, and reschedules the global swap timer for the remaining cycle portion.
- **`frontend/index.html`**: Added progress bar DOM structure (`#loop-progress`, `#loop-progress-fill`, `#loop-progress-handle`) between the map and the info panel.
- **`frontend/main.js`**: Added `rAF`-driven polling loop that reads `getLoopProgress()` and updates bar width / handle position. Continues polling during sample loading (returns `null` until `startAllSources()` fires). Pointer event handlers implement drag-to-seek with `setPointerCapture` for reliable tracking outside the bar bounds.
- **`frontend/style.css`**: Progress bar styling — 3px line expanding to 5px on hover, circular drag handle with opacity transition, fixed position at viewport bottom with `z-index: 500`.

## Files changed

- `frontend/audio-engine.js` — added `getLoopProgress()` and `seekLoop()` exports (modified)
- `frontend/index.html` — progress bar DOM structure (modified)
- `frontend/main.js` — progress polling loop and seek interaction handlers (modified)
- `frontend/style.css` — progress bar and handle styles (modified)
