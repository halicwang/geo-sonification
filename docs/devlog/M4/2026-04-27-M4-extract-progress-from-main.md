# 2026-04-27 — Refactor: Extract Loop-Progress Bar from `main.js` into `frontend/progress.js`

M4 P2-2. Pure code move: lines 225-303 of `frontend/main.js` (loop-progress rAF poll, pointer-drag seek, hide/show lifecycle) move into a new `frontend/progress.js` module. No behavior change.

## What moved

- `updateProgressBar()` — the rAF callback that polls `engine.getLoopProgress()` and writes `width` / `left` styles
- `startProgressLoop()` / `stopProgressLoop()` — rAF lifecycle gates
- `progressFromPointerEvent()` / `setVisualProgress()` — small helpers
- All four pointer event listeners (`pointerdown` / `pointermove` / `pointerup` / `pointercancel`) on the loop-progress element
- The `progressRafId` + `isDragging` module-private state

## New module API

```js
const bar = attachProgressBar({
    progressEl, fillEl, handleEl, engine,
});
bar.start();   // when audio toggles on
bar.stop();    // when audio toggles off
```

`attachProgressBar` registers the pointer handlers immediately (idempotent — call once per page) and returns a `{ start, stop }` handle that gates the rAF loop. The pointer handlers gate themselves on `engine.isRunning()` so they're safe to leave attached when audio is off.

The polling-based fill (rAF reading `engine.getLoopProgress()`) is preserved as-is — the post-pivot proposal §6 dropped the event-bus rewrite that would have replaced polling with subscription. Keep it simple.

## main.js reduction

- Net **−71 lines** (304 → 233 by raw count after the import + `attachProgressBar({...})` instantiation are added).
- The DOMContentLoaded handler ends 30+ lines earlier; volume slider + `renderLoadingUI` now sit cleaner without the progress block between them.

## Verification

- `npm test` — 160 jest pass
- `npm run test:frontend` — 10 vitest pass
- `npm run lint` / `npm run format:check` / `npm run smoke:wire-format` — all green
- **Preview runtime cycle** confirmed end-to-end:
    - Click audio toggle → audio status `"Playing"`, `aria-pressed="true"`, progress bar **visible** with `width: 12.96%` / `left: 12.96%` (rAF loop is running, querying `engine.getLoopProgress()`, writing both styles in lockstep)
    - Click audio toggle again → audio status `"Audio off"`, `aria-pressed="false"`, progress bar **hidden** (`stop()` cancelled rAF + added `.hidden` class)
    - 0 console errors across the full start/stop cycle
- The pointer-drag-to-seek path is a pure code move (same DOM element, same listener registration, same `engine.seekLoop` call); not separately re-tested in preview but mechanically identical to pre-refactor.

## Risks and rollback

- happy-dom can't run Mapbox / WebGL / `AudioContext`, so progress.js doesn't get a vitest unit-test file (proposal §11 marks `progress.js` coverage at 0% but the preview cycle above is the runtime-equivalent gate).
- **Rollback**: revert this commit on `feat/M4`. No downstream stage depends on `progress.js`.

## Files changed

- **Modified**: `frontend/main.js` — 304 → 233 lines. Added `import { attachProgressBar } from './progress.js'`, instantiated `progressBar` before the audio toggle handler, replaced `startProgressLoop()` / `stopProgressLoop()` with `progressBar.start()` / `progressBar.stop()`, deleted the helper-functions + pointer-handler block at the bottom of `DOMContentLoaded`.
- **Added**: `frontend/progress.js` — new 121-line module exporting `attachProgressBar`.
- **Added**: `docs/devlog/M4/2026-04-27-M4-extract-progress-from-main.md` — this entry.
- **Modified**: `docs/DEVLOG.md` — index this entry.
