# 2026-04-28 — Feature: Mobile UX Redesign — Info Panel as Bottom Sheet

Independent post-M5 task (no milestone framing per the user's "直接 main 上搞" directive). On mobile (≤ 600 px viewport) the right-sidebar info panel becomes a bottom sheet that defaults to collapsed, exposing the full globe + the floating audio/hamburger controls. Tapping the hamburger or the in-sheet drag handle toggles the sheet between collapsed and expanded. Mobile expanded state is content-stripped: the five debug-leaning stats (Zoom / Grids in View / Mode / Land Type / Proximity) and the "Interactive Sound Map" subtitle are removed. Desktop layout is byte-identical — all changes are isolated under `@media (max-width: 600px)`.

## Why

The pre-redesign mobile UI was the desktop layout shoved into a narrow viewport via four lines of CSS (top: auto / bottom: 20px / width: 100% / max-height: 50vh). Default state was open, so a first-time mobile user saw 50% of the screen consumed by debug stats before they ever touched the map. User screenshot (iPhone Safari, captured 2026-04-28 ~20:11) confirmed: globe rendering ~40% of the viewport, info panel ~55%, audio toggle relegated to a corner. The panel content was identical to desktop — branding + 5 stats rows + landcover list + audio controls + connection status + attribution + copyright — none of which had been triaged for mobile relevance.

User assessment after seeing the screenshot: "手机版第二种详细 state 也不要保留 Zoom grids mode 这种调试元素" — drop the technical stats from the mobile expanded view; keep only what relates to listening (landcover percentages = the actual sonification mapping) and audio controls.

Pre-redesign collapsed state didn't exist. Pre-redesign expanded state was the default and consumed the screen.

## What changed

### HTML (`frontend/index.html`)

Added a drag-handle button as the first child of `#info-panel`:

```html
<button id="sheet-handle" class="sheet-handle" type="button" aria-label="Collapse panel">
    <span class="sheet-handle-bar" aria-hidden="true"></span>
</button>
```

Visible only on mobile (CSS `display: none` on desktop). Click toggles the same panel `hidden` class as the existing top-right hamburger ≡ button. Two affordances for the same toggle — the hamburger is reachable from anywhere (always at top-right), the drag handle is the iOS-native bottom-sheet dismiss gesture and lives at the top edge of the sheet itself.

The existing `#controls-bar` (audio toggle + hamburger) was already a sibling of `#info-panel`, so it stays at top-right whether the sheet is collapsed or expanded. No HTML restructure needed beyond the new drag handle.

### CSS (`frontend/style.css`)

Rewrote the `@media (max-width: 600px)` block. Major changes:

- **Sheet anchored flush at viewport bottom** (`bottom: 0`, no 20 px gap) — the gap was a desktop-borrowed instinct that wastes mobile screen.
- **Slide-off-screen on hidden** (`transform: translateY(100%)`) replacing the previous `translateY(20 px)` half-measure. Cubic-bezier easing matches iOS bottom-sheet feel.
- **`60dvh` not `50vh`** — `dvh` (dynamic viewport height) doesn't jump when iOS Safari's URL bar shows / hides. Pre-redesign `50vh` would resize the panel mid-scroll.
- **`env(safe-area-inset-bottom)` padding** — protects content from iPhone home-indicator gesture area on notched devices.
- **`#info-panel .stats-section { display: none }`** — drops the 5 debug rows.
- **`#info-panel .subtitle { display: none }`** — drops "Interactive Sound Map" tagline; redundant after the title.
- **Drag handle (`.sheet-handle` + `.sheet-handle-bar`)** — small grey horizontal pill, 36×5 px, centered above branding. iOS-native affordance for "dismissable sheet".
- **Tightened branding spacing** (`.brand-mark`, `h2`, `.vintage` margins) to compensate for the removed subtitle.
- **`.landcover-list` `max-height: none`** — let the scrollable sheet container handle overflow rather than clipping the list at 120 px.

Outside the media query, two new selectors: `.sheet-handle` (default `display: none`) and `.sheet-handle-bar` styling. Both are mobile-affordance pieces; on desktop they're inert.

Net CSS change: the existing 22-line mobile block grew to ~60 lines. Desktop selectors not touched.

### JS (`frontend/main.js`)

Three changes inside the existing `DOMContentLoaded` flow:

1. **Extracted `togglePanel()` from inline arrow** so both the hamburger and the new drag handle can share one handler:
    ```js
    function togglePanel() {
        const hidden = state.els.infoPanel.classList.toggle('hidden');
        state.els.panelToggle.classList.toggle('open', !hidden);
    }
    state.els.panelToggle.addEventListener('click', togglePanel);
    ```
2. **Wired the drag handle**:
    ```js
    const sheetHandle = document.getElementById('sheet-handle');
    if (sheetHandle) sheetHandle.addEventListener('click', togglePanel);
    ```
3. **Initial-collapse on mobile**:
    ```js
    if (window.matchMedia('(max-width: 600px)').matches) {
        state.els.infoPanel.classList.add('hidden');
        state.els.panelToggle.classList.remove('open');
    }
    ```
    `matchMedia` instead of `innerWidth` so the breakpoint stays in one place (CSS) and the JS reads it back.

No state machine, no swipe gesture handlers, no resize listener (rotation / orientation change is a known follow-up — see "Deferred" below). 12 LOC net JS change.

### What I deliberately didn't do

- **No swipe-to-dismiss / swipe-to-expand gesture.** Touch event handling, momentum, edge cases (interaction with map pan, native scroll bubbling) — that's a half-day of work for an affordance the hamburger + drag-handle already covers. Tap is enough.
- **No three-state Apple-Maps-style detents** (collapsed → mid → full). Doubles the implementation cost and adds gesture/state machine complexity. Two states are sufficient for "show / hide".
- **No resize listener for portrait↔landscape rotation.** If a user rotates from mobile portrait to landscape (>600 px), the media query flips but the JS-applied `hidden` class stays. Acceptable: in landscape they can tap the hamburger to expand. Adding a resize handler is a 2-line follow-up if it ever becomes painful.
- **No mobile-specific touch-target audit.** The zoom +/- buttons are slightly under Apple HIG's 44 pt recommendation, but they're Mapbox-rendered, not ours. Out of scope.
- **No landcover-bar visualization redesign** (could become horizontal progress bars instead of percentages). User didn't ask. Left as-is.

## Verification

DevTools emulation, server on port 57183 from `preview_start`:

- **Mobile 375×812 (iPhone X-class portrait):**
    - On load: `panel.classList.contains('hidden') === true`, drag handle `display: block`, stats section `display: none`. ✅
    - Screenshot: full-screen globe, top-right has play ▶ and ≡, no panel intruding. ✅
    - Tap ≡ → panel slides up, height ~476 px (within 60 dvh of 812 viewport), drag handle visible at top, branding + 6 landcover rows + audio + attribution rendered. Hamburger rotates to ✕. ✅
    - Tap drag handle → panel slides back down, ≡ returns. ✅
    - Tap ≡ again → re-expands. ✅

- **Desktop 1280×800:**
    - On load: panel visible (no `hidden` class), drag handle `display: none`, stats section `display: block`. ✅
    - Screenshot: right-side panel as before, all debug stats present, subtitle visible. **Byte-identical to pre-change desktop layout.** ✅

Gates:
- `npm run lint` clean
- `npm run format:check` clean
- `npm run test:frontend` 71/71 (vitest unchanged — no JS interface changed)
- `npm run smoke:wire-format` ok
- `npm test` not run (no server change in this commit; jest unaffected)

Real-device iPhone Safari test still pending — DevTools emulation simulates touch events but not the iOS-specific URL bar dynamics or the actual `env(safe-area-inset-bottom)` rendering. User verification on real hardware is the final gate.

## Files changed

- **Modified** `frontend/index.html` — added drag-handle button as first child of `#info-panel` (~9 LOC).
- **Modified** `frontend/style.css` — added `.sheet-handle` + `.sheet-handle-bar` outside the media query; rewrote `@media (max-width: 600px)` block from ~20 LOC to ~60 LOC.
- **Modified** `frontend/main.js` — extracted `togglePanel()`, wired drag handle, added initial-collapse on mobile (~12 LOC net).
- **Added** `docs/devlog/2026-04-28-mobile-bottom-sheet.md` — this entry. (No `M*/` subfolder — independent post-M5 task; pre-commit hook regex `^docs/devlog/` matches root-level paths too.)
- **Modified** `docs/DEVLOG.md` — index this entry.

## Deferred

If real-device testing surfaces issues:

1. **Rotation handler** — add `window.matchMedia('(max-width: 600px)').addEventListener('change', ...)` to re-apply collapsed-default on rotation into mobile.
2. **Animation polish** — the cubic-bezier easing is a guess; iterate against real iOS Safari feel.
3. **Touch-target sizing** — if zoom buttons are hard to tap, override Mapbox's default sizing.
4. **Real swipe-to-dismiss** — only if tap proves insufficient.

None of these block landing the current change.
