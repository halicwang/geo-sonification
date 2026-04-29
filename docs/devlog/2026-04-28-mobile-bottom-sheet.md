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

---

## Iteration 2 — drag gesture + floating card + drop audio section

User feedback after the initial DevTools screenshots:

> 1. 手机版上不要有 Audio Off 和 Volume 这种控制旋钮,这样太多余了
> 2. (a) 顶上应该增加拖动动作。现在的浮窗上面虽然有一个小灰条,但不能往下滑动或往上拖动
>    (b) 建议搞成悬浮式的设计。四个角采用弯曲的曲线,而不是直接贴着边。它应该是悬浮在上面,跟四周的 edge 有一个夹缝

Three independent changes packaged into one iteration commit because they're tightly coupled to the same mobile code paths.

### 2.1 — Drop the audio section on mobile

The `.audio-section` (Audio Off / On status label + Vol slider + percentage readout) is redundant on mobile: the always-visible top-right ▶/■ floating button already conveys play/stop, and Vol on a phone is rarely worth the screen real estate. One CSS line:

```css
@media (max-width: 600px) {
    #info-panel .audio-section { display: none; }
}
```

Desktop keeps the audio section as before. No HTML / JS change.

### 2.2 — Real drag-to-dismiss gesture

The previous "drag handle" was a tap-only target — the user noticed it visually suggests dragging but didn't actually respond to drag input. Implemented proper pointer-event drag in a new module so it's testable in isolation.

**`frontend/sheet-drag.js`** — `attachSheetDrag({ handle, panel, onDismiss, dismissThreshold = 80 })`:

- `pointerdown` on handle → start tracking, capture pointer, add `dragging` class to panel (CSS suppresses transition during the live drag so movement follows the finger 1:1).
- `pointermove` → update `panel.style.transform = translateY(N)` where `N = max(0, clientY - startY)`. Drag-up is rubber-banded to zero — no further-expanded state in the two-state design, and a negative translate would just lift the sheet into nowhere.
- `pointerup` → reset state, decide based on `lastDelta > dismissThreshold` (80 px) whether to call `onDismiss()`. Inline transform is cleared so the CSS transition takes over for the snap.
- `pointercancel` → reset state but never dismiss. OS / browser interruption isn't a deliberate release; let the snap spring the sheet back to fully open.
- `click` (in capture phase) → suppressed if `lastDelta` exceeded `tapMovementThreshold` (6 px) so a real drag doesn't double-fire as a tap.

**`frontend/__tests__/sheet-drag.test.js`** — 8 vitest cases:

| Case | Verifies |
| --- | --- |
| `does nothing while the sheet is collapsed` | drag is a no-op when `panel.classList.contains('hidden')` |
| `translates the panel during drag and clears on release below threshold` | live transform follows finger; sub-threshold release springs back |
| `calls onDismiss when release passes the threshold` | over-threshold release fires the callback |
| `rubber-bands drag-up to zero` | upward drag produces `translateY(0px)`, not negative |
| `pointercancel resets state without firing onDismiss` | system-interrupted gesture is not a dismiss (caught a real bug — initial impl fired `onDismiss` from a shared `release()`; refactored to split `reset()` from the dismiss-firing `pointerup` path) |
| `suppresses the post-drag click` | a real drag (>6 px) doesn't trigger the handle's click listener |
| `lets a clean tap reach the click handler` | no movement → click fires normally → `togglePanel()` runs |
| `detach() removes every listener and clears state` | hot-reload / cleanup contract |

**`frontend/main.js`** — wired the drag attach beside the existing click listener:

```js
attachSheetDrag({
    handle: sheetHandle,
    panel: state.els.infoPanel,
    onDismiss: togglePanel,
});
```

Two affordances now toggle the sheet: tap ≡ at top-right, tap or drag-down the in-sheet handle. Drag-up does nothing visible (resists at 0).

### 2.3 — Floating card style

The previous mobile sheet was edge-flush (`bottom: 0`, `left: 0`, `right: 0`, top corners rounded only) — looked stuck against the viewport edges. User wanted true floating: gaps on all four sides + all four corners rounded.

Changes inside `@media (max-width: 600px)`:

```diff
-    bottom: 0;
-    left: 0;
-    right: 0;
-    width: 100%;
-    border-radius: 14px 14px 0 0;
+    bottom: max(12px, env(safe-area-inset-bottom));
+    left: 12px;
+    right: 12px;
+    width: auto;
+    border-radius: 18px;
```

- 12 px gap on left and right.
- Bottom gap is `max(12px, env(safe-area-inset-bottom))` — the larger of "12 px aesthetic gap" or "iPhone home-indicator safe area", so on notched devices the sheet sits above the gesture zone naturally.
- All four corners 18 px (was 14 px on top-only) — slightly more pronounced curve to match the floating affordance.
- `width: auto` so left/right offsets actually take effect (was `width: 100%` overriding them).

The hidden-state translate also moved from `translateY(100%)` to `translateY(calc(100% + 24px))` — without the overshoot, the rounded bottom corners would peek back into the safe-area gap when the sheet was supposed to be off-screen.

### Iteration 2 verification

DevTools, port 57183, mobile 375×812:

- Floating card geometry: `panelLeft: 12, panelRightGap: 12, panelBottomGap: 12, borderRadius: 18px` ✅
- Audio section hidden: `audioSectionDisplay: 'none'` ✅
- Drag 30 px → release → panel still expanded (springback) ✅
- Drag 50, 120 px → live `translateY(N px)` updates ✅
- Drag 120 px → release → panel collapsed (over-threshold dismiss) ✅
- Tap ≡ to re-expand → works (sheet-drag's click suppression doesn't interfere with the hamburger) ✅

Desktop 1280×800:

- `audioSectionDisplay: 'block'` ✅ (visible as before)
- `statsDisplay: 'block'` ✅
- `sheetHandleDisplay: 'none'` ✅
- `borderRadius: '12px'` ✅ (desktop's original 12 px, mobile-only `18 px` did not bleed)

Gates: lint clean, format clean, vitest **71 → 79** (+8 sheet-drag cases), smoke ok.

### Iteration 2 files

- **Modified** `frontend/style.css` — floating card layout + `.audio-section` hidden + drag-state CSS class for transition suppression.
- **Added** `frontend/sheet-drag.js` — pointer-event drag handler module (~110 LOC including JSDoc).
- **Added** `frontend/__tests__/sheet-drag.test.js` — 8 vitest cases (~160 LOC).
- **Modified** `frontend/main.js` — import + `attachSheetDrag` wiring (3 LOC net).
- **Modified** `docs/devlog/2026-04-28-mobile-bottom-sheet.md` — this iteration section.

---

## Iteration 3 — fix the boot-time flash-of-visible-then-jumps-down

User feedback after iteration 2: "怎么第一次启动的时候,能清晰目视到一个页面从上面往下蹦下去?"

### Diagnosis

The mobile-collapsed-by-default behavior was being applied by `main.js` inside DOMContentLoaded:

```js
if (window.matchMedia('(max-width: 600px)').matches) {
    state.els.infoPanel.classList.add('hidden');
}
```

`main.js` is a deferred ES module — it runs **after** the browser has already parsed the HTML, applied CSS, performed layout, and painted the first frame. Sequence on first mobile load:

1. HTML + CSS parsed → panel computed at default mobile position (visible at bottom).
2. Browser performs first layout → panel laid out at `bottom: 12 px, left: 12 px, right: 12 px`, fully visible.
3. Browser paints → user sees the panel rendered in expanded state.
4. (~100–300 ms later, depending on device speed) DOMContentLoaded fires → `main.js` runs → adds `.hidden` → CSS transition fires → 280 ms slide-off animation plays.

Total visible time: 400–600 ms of "panel briefly here" + an animated slide-down. That's the "蹦下去" the user saw.

### Fix

Add a small **inline `<script>` in the body, immediately after the panel element**:

```html
<div id="info-panel">…</div>
<script>
    if (window.matchMedia('(max-width: 600px)').matches) {
        document.getElementById('info-panel').classList.add('hidden');
    }
</script>
```

Inline scripts (no `type="module"`, no `async`/`defer`) execute **synchronously during HTML parsing**, before the browser performs any layout / paint. By the time the first paint happens, `#info-panel` already carries `.hidden` and CSS computes its translate at the off-screen position. The transition property is set, but no transition fires because the property never changed — the panel was created at its final off-screen state in one step.

`main.js`'s `matchMedia` check still runs later and re-applies `.hidden` idempotently, so a hotfix that removes the inline script can't strand the panel mistakenly visible.

### Verification

DevTools mobile 375 × 812, hard reload + screenshot taken at first frame after CSS load: full-screen globe, no panel visible, only the top-right ▶ + ≡ buttons and the zoom controls. No flash. ✅

After the boot-collapse, tapping ≡ to expand still triggers the normal 280 ms slide-up transition (verified live: mid-transition transform was `translateY(57px)`, fully expanded was `translateY(0)`). The inline script doesn't break the toggle path. ✅

### Iteration 3 files

- **Modified** `frontend/index.html` — added 5-line inline `<script>` after `#info-panel` close tag.
- **Modified** `docs/devlog/2026-04-28-mobile-bottom-sheet.md` — this iteration section.

The redundant `matchMedia` check in `main.js` is **kept on purpose** for defense in depth — the inline script can vanish through a future HTML rewrite, and the JS-side check survives that.

---

## Iteration 4 — restore desktop branding spacing on mobile

User feedback after iteration 3 reload: "PLACEECHO 和 Geo-Sonification 这个空隙更紧凑了…不要这样子紧凑".

### Diagnosis

Iteration 2's mobile media block had explicitly tightened branding spacing on the theory that removing the subtitle left the title-block looking too airy:

```css
@media (max-width: 600px) {
    #info-panel .brand-mark { margin-bottom: 2px; }   /* desktop: 6px */
    #info-panel h2          { margin-bottom: 4px; }   /* same as desktop */
    #info-panel .vintage    { margin-bottom: 14px; }  /* same as desktop */
}
```

The 2 px override on `.brand-mark` collapsed the gap between the all-caps "PLACEECHO" tag and the "Geo-Sonification" title to almost zero, which read as cramped in side-by-side comparison with the desktop's 6 px.

### Fix

Removed all three overrides. Mobile now inherits the desktop values verbatim:

- `.brand-mark` → 6 px
- `h2` → 4 px
- `.vintage` → 14 px (with the existing border-bottom)

Net visual change: roughly +4 px of breathing room between the brand mark and the title; rest of the panel unchanged. No HTML or JS edit.

### Verification

DevTools mobile 375 × 812: computed `brand-mark margin-bottom` is back to `6 px`, brand-block-bottom to title-top gap is `6 px` (was `2 px`). Screenshot shows the title block with the same proportions as the desktop right-sidebar version. ✅

### Iteration 4 files

- **Modified** `frontend/style.css` — deleted three `@media (max-width: 600px)` rules.
- **Modified** `docs/devlog/2026-04-28-mobile-bottom-sheet.md` — this section.
