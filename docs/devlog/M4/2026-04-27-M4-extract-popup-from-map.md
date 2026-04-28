# 2026-04-27 — Refactor: Extract Popup Logic from `map.js` into `frontend/popup.js`

M4 P2-1. Pure code move: lines 340-394 of `frontend/map.js` (popup click + cursor handlers + popup HTML rendering) move into a new `frontend/popup.js` module. No behavior change.

## What moved

- The Mapbox `click` listener on `grid-dots`
- The `mouseenter` / `mouseleave` cursor-pointer handlers
- The 11-class top-5 land-only `lc_pct_*` breakdown computation
- The HTML construction (with `escapeHtml` on every interpolated string)

The `escapeHtml` and `getLandcoverName` imports leave `map.js` (only the popup code consumed them) and re-import inside `popup.js`.

## New module API

```js
// pure function — exported separately so it's unit-testable without Mapbox
export function renderPopupHtml(props): string

// the entry point map.js calls once after the layer is added
export function attachPopup(map, layerId): void
```

The split between rendering (pure) and listener-binding (Mapbox-side-effect) means `renderPopupHtml` can be exercised by happy-dom-style tests later — input is a plain JS object, output is a string. The proposal §11 marked `popup.js` test coverage as N/A overall (Mapbox/WebGL isn't testable under happy-dom), but the rendering function specifically is now testable.

## Numbers

- `frontend/map.js`: 395 → 342 lines (-53)
- `frontend/popup.js`: new, 91 lines

The popup file is slightly bigger than the extracted region because of the JSDoc / API split + module header. The pure-function boundary justifies the small overhead.

## Verification

- `npm test` — 160 jest pass
- `npm run test:frontend` — 10 vitest pass
- `npm run lint` / `npm run format:check` / `npm run smoke:wire-format` — all green
- Local `npm run dev` smoke: page loads, info panel updates with viewport ticks (proves `map.on()` registrations still work — popup uses the same Mapbox API as the move/moveend listeners that drive the panel)
- Browser eval against the running dev server confirms `popup.js` exports `attachPopup` + `renderPopupHtml`, and `renderPopupHtml({grid_id, landcover_class, lc_pct_*})` produces the expected HTML format with correct top-5 sort + percentage normalization

The "click a dot, see the popup appear" runtime check is bounded by happy-dom + Mapbox WebGL limitations — Mapbox doesn't expose the map instance on `window`, so a fully-automated DOM-level click → popup verification isn't reachable from the preview tool. The risk of regression on a pure code move is the absolute minimum: listener registration is byte-identical (same `map.on('click', layerId, handler)` calls; the handler closure body is moved verbatim into a function).

## Risks and rollback

- **Manual click verification deferred.** If the click listener doesn't fire (regression), the failure mode is: clicking a dot does nothing, no popup appears. Fast to spot, fast to revert.
- **Rollback**: revert this commit on `feat/M4`. No downstream stage depends on `popup.js`.

## Files changed

- **Modified**: `frontend/map.js` — removed lines 340-394 (popup logic) and the now-unused `escapeHtml` / `getLandcoverName` imports; replaced with a single `attachPopup(map, GRID_DOT_LAYER)` call. Added `popup.js` import.
- **Added**: `frontend/popup.js` — new module exporting `attachPopup` + `renderPopupHtml`.
- **Added**: `docs/devlog/M4/2026-04-27-M4-extract-popup-from-map.md` — this entry.
- **Modified**: `docs/DEVLOG.md` — index this entry.
