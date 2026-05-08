# 2026-05-03 — Feature: Mobile Info Panel Rework — Content Reflow, State Colors, Toggle-Driven Transitions

Continues the mobile UX work from 2026-04-28. The pre-rework expanded sheet was dominated by static chrome (brand block, attribution, copyright, generously-spaced distribution list) while hiding three pieces of high-value live information: the volume slider, the audio status text, and the debug stats. This rework keeps the same expandable bottom-sheet mechanism but rewrites its contents to surface those controls + state. Adds a state-color encoding (Playing → accent green, errors → danger red) shared across desktop and mobile via `data-state`. Gates the toggle transition behind an `.animating` class so viewport resizes can no longer animate the panel between desktop and mobile hidden styles. Removes Mapbox NavigationControl + ScaleControl and shifts the mobile panel up 29 px to keep the (TOS-mandatory) Mapbox logo unobstructed at the bottom-left.

## Why

User flagged after 2026-04-28 landed:

> 但是这个展开后确实有点大了吧 感觉有很多空间的冗余但是没好好地被利用上

The expanded sheet at ~440 px tall consumed half the viewport but the contents were mostly things you read once (brand line, attribution, copyright) plus a six-row distribution list. Three of the most useful pieces of information were `display: none` on mobile: the **volume slider** (the only way to change audio level on a phone), the **audio status text** (so the user knows whether they're in Loading vs Playing vs Off — the floating ▶/■ button only encodes play/paused), and the **live stats** (zoom, grids in view, mode, land type at cursor, proximity). The original mobile decision was based on "Vol on mobile is rarely worth the space" (`style.css:710` comment). That assumption was wrong when the expanded sheet is the only mobile control surface.

Subsequent iterations addressed cosmetic and behavioral issues that surfaced once the new layout was on screen:

- Brand-mark letter-spacing collapsed from desktop's tracked-out 0.18em to 0.04em on mobile when the combined `.brand-mark, h2, .vintage` rule applied. User: "PLACEECHO 的字体比全屏状态下更紧 请统一至全屏状态下的那样的字间间距"
- "Audio off" sat ~5 px above "Vol" because `.audio-status` (11.5 px) and `.volume-label` (10.4 px) have different baselines and `align-items: center` aligns by box center.
- Cross-breakpoint resize triggered an `opacity 0 → 1, translateX → translateY` transition flicker on the panel.
- Mapbox bottom-left logo poked out below the panel's 12 px bottom margin.

## What changed

### Content reflow (mobile only — `@media (max-width: 600px)`)

Visual order driven entirely by CSS `order` so DOM order stays as-is for screen readers:

| order | Element | Before | After |
|---|---|---|---|
| 1 | `.sheet-handle` | top of sheet | unchanged |
| 2 | `.brand-block` (new wrapper) | 4 stacked elements (~90 px) | single inline row, `·` separators (~29 px) |
| 3 | `.audio-section` | `display: none` | un-hidden; status pill + slider in one inline-flex row |
| 4 | `.stats-section` | `display: none` | un-hidden; flex-wrapped pairs (Mode + Land Type labels dropped via `:has()`) |
| 5 | `.landcover-list` | 6×~32 px rows | 6×~22 px rows (swatch 10→8, grid col 12→10, line-height 1.2, padding 2→1, gradient bar 2→1) |
| 6 | `.panel-footer` (new wrapper) | 3 stacked blocks (~110 px) | block layout: dot + attribution inline, copyright on its own line |

HTML changes: two new wrapper divs (`.brand-block`, `.panel-footer`) and the (CC BY 4.0) tags wrapped in `<span class="license-tag">` so they hide on mobile while staying visible on desktop. The data-attribution block is annotated with `<!-- prettier-ignore -->` to preserve the no-whitespace `<a>...</a><span>...</span>` structure (without that, hidden spans leave a stray space before each comma).

Net panel content height when expanded: ~485 px → ~330 px with substantially more useful information per pixel. Section dividers (border-bottom + padding-bottom + margin-bottom) inherited from desktop are reset on mobile — the panel's flex `gap: 10px` already provides separation.

### State-color encoding (`data-state` attribute)

`main.js` now writes one of `loading | playing | error | off` to `state.els.audioStatus.dataset.state` at every site that sets `audioStatus.textContent`. CSS reacts:

```css
.audio-status[data-state='playing'] { color: var(--color-accent); }
.audio-status[data-state='error']   { color: var(--color-danger); }
```

Both rules live at global scope so desktop and mobile share the encoding. The `loading` pill background (`background: var(--color-border-soft)` + 2/6 padding + 4 px radius) is mobile-only — it's a layout-specific affordance for the compact panel where a pill helps the eye find the small status text; on desktop the existing layout doesn't need the chrome.

Initial HTML state: `<span data-state="off">Audio off</span>` so first paint is correct without waiting for JS.

### Toggle-gated transitions (`.animating` class)

Replaces an earlier "suppress on resize" approach (which listened to every `resize` event and toggled `body.resizing` for 200 ms). Cleaner inversion: transitions are now off by default and only enabled while the user is explicitly toggling the panel.

```js
function togglePanel() {
    state.els.infoPanel.classList.add('animating');
    clearTimeout(panelAnimatingTimer);
    panelAnimatingTimer = setTimeout(() => {
        state.els.infoPanel.classList.remove('animating');
    }, 400);
    // ... existing class toggle + ARIA update
}
```

CSS:
```css
#info-panel.animating { transition: opacity 0.25s ease, transform 0.25s ease; }
@media (max-width: 600px) {
    #info-panel.animating {
        transition: transform 0.28s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.18s ease;
    }
}
```

Result: dragging the window across the 600 px breakpoint never interpolates between the desktop hidden state (opacity 0 + translateX 20 px) and the mobile hidden state (opacity 1 + translateY 100% + offset). User-driven toggles keep their original feel because `togglePanel` is the one entry point for all toggle paths (panel-toggle button click, sheet-handle click, sheet-drag dismiss).

### Map controls removed (`map.js`)

```js
// removed:
state.runtime.map.addControl(new mapboxgl.NavigationControl(), 'top-left');
state.runtime.map.addControl(new mapboxgl.ScaleControl(), 'bottom-left');
```

Pinch-zoom, double-tap, and scroll-wheel cover the same interactions and the canvas is now chrome-free. The Mapbox logo (mandatory under TOS) stays in the bottom-left corner — separate from the controls we removed.

### Mobile panel bottom offset (`--sheet-bottom-offset`)

To keep the Mapbox logo (29 px tall, flush with viewport bottom) visible below the panel rather than poking through it:

```css
@media (max-width: 600px) {
    #info-panel {
        --sheet-bottom-offset: max(41px, calc(env(safe-area-inset-bottom) + 29px));
        bottom: var(--sheet-bottom-offset);
    }
    #info-panel.hidden {
        transform: translateY(calc(100% + var(--sheet-bottom-offset) + 12px));
    }
}
```

41 px = 29 px logo + 12 px breathing room. The hidden translateY uses the same variable + 12 px overshoot so iOS notched devices still slide the panel fully past the rounded-corner-peek-back zone.

### Smaller fixes bundled in

- **Brand-mark letter-spacing**: combined rule sets 0.04em for all three brand items; `#info-panel .brand-block .brand-mark { letter-spacing: 0.18em }` overrides to match the desktop tracking that is part of the wordmark identity.
- **Audio row baseline alignment**: `.audio-section { align-items: baseline }` (was `center`) — aligns the "Audio off" / "Vol" text baselines despite their different font-sizes, instead of centering each box independently.
- **Stale-state `::after`**: when `#info-panel.stale` is set, `.stats-section::after` shows "Data may be stale". Now that `.stats-section` is `display: flex; flex-wrap: wrap`, the pseudo-element became a flex item with width-of-content, defeating its `text-align: center`. Added `flex-basis: 100%` inside the mobile media query so it occupies a full row and centers correctly. Desktop is unaffected (block layout there).
- **Volume slider `touch-action: manipulation`**: defensive — without it the parent's `touch-action: pan-y` could swallow horizontal drags on the slider thumb on mobile.
- **Footer attribution comma whitespace**: the hidden `(CC BY 4.0)` spans previously left a stray space before each comma. Restructured the HTML so anchor and span are adjacent (no whitespace between), with the leading space inside the span content — desktop renders `WorldCover 2021 (CC BY 4.0),` cleanly, mobile renders `WorldCover 2021,`.
- **Desktop `#info-panel > .vintage` → `#info-panel .vintage`**: the direct-child combinator stopped matching after `.vintage` was wrapped in `.brand-block`. Dropping the `>` keeps desktop layout byte-identical.

## Verification

Preview server, dev mode, mobile preset (375 × 812):

- Initial load: panel hidden behind hamburger (`.hidden` class via inline boot-script). Mapbox logo visible at bottom-left, no panel chrome. ✅
- Tap ≡: panel slides up via mobile transition (cubic-bezier 280 ms transform + 180 ms opacity). Visual order matches the table above. `scrollHeight === clientHeight` (485 px) → no internal scroll. ✅
- Audio toggle: `data-state` cycles `off → loading → playing` (verified via MutationObserver); pill background appears only during `loading`; "Playing" text turns accent green via global rule (also confirmed on desktop 1280 × 800). ✅
- Drag volume slider: `engine.setVolume()` updates audio level; sheet does NOT dismiss. ✅
- Resize across 600 px breakpoint (`window.dispatchEvent(new Event('resize'))` while panel hidden): `panel.getAnimations().length === 0`, opacity / transform values jump instantly, no flicker. Confirmed in both directions (1280 → 375 and 375 → 1280). ✅
- Toggle on mobile during `.animating` window: `transition-property: transform, opacity`, `transition-duration: 0.28s, 0.18s`, one `CSSTransition` in flight. After 400 ms, `.animating` removed, transition back to `none`. ✅
- Stale state on mobile: `panel.classList.add('stale')` → "Data may be stale" appears centered as its own row above the distribution. ✅
- Mapbox logo rect: top at y=783, panel bottom at y=771 → 12 px gap, no overlap. ✅
- Desktop 1280 × 800 byte-identical to pre-rework: vintage `border-bottom` present, h2 16.8 px / weight 600, `.license-tag` `display: inline`, all dividers preserved, "Playing" still gets the new accent color (the only intentional desktop-side change). ✅

Gates:
- `npm run lint` clean
- `npm run format:check` clean
- `npm test` (jest, server) 193/193
- `npm run test:frontend` (vitest) 91/91

## Files changed

- **Modified** `frontend/index.html` — `.brand-block` + `.panel-footer` wrappers, `data-state="off"` initial attribute, `<span class="license-tag">` for license tags, `<!-- prettier-ignore -->` on data-attribution.
- **Modified** `frontend/style.css` — `#info-panel > .vintage` → `#info-panel .vintage`; transitions moved to `#info-panel.animating` (both desktop default and mobile media query); global `.audio-status[data-state='playing'|'error']` color rules; mobile media query rewritten with content reflow, state-pill, baseline alignment, brand letter-spacing override, stat label `:has()` hiding, distribution row tightening, panel-footer block layout, license-tag hide, stale-state `flex-basis: 100%`, `--sheet-bottom-offset` variable wiring; removed unused `body.resizing` attempt.
- **Modified** `frontend/main.js` — `togglePanel` adds `.animating` class with 400 ms timeout removal; 5 sites set `audioStatus.dataset.state`.
- **Modified** `frontend/map.js` — removed `addControl(new mapboxgl.NavigationControl(), 'top-left')` and `addControl(new mapboxgl.ScaleControl(), 'bottom-left')`.
- **Added** `docs/devlog/2026-05-03-mobile-panel-rework.md` — this entry.
- **Modified** `docs/DEVLOG.md` — index this entry at the top of `## Entries`.

## Deferred

- **`textContent` write-on-change guard in `ui.js` / `map.js`**: with `.stats-section` now visible on mobile, every WS stats tick and every map move writes to its `.stat-value` spans, which causes text reflow inside the new flex-wrap container. Modern phones absorb this fine but adding a last-value comparison before each `textContent` assignment is a cheap follow-up if profiling shows it matters.
- **Mapbox logo relocation**: still at bottom-left, panel offset to clear it. Moving it to top-left (now empty after NavigationControl removal) would let the panel reclaim the 29 px back, but logo placement is a brand decision the project owner can make separately.
- **License-tag a11y**: hidden via `display: none` on mobile, which removes from the screen-reader tree. CC BY 4.0 attribution stays satisfied via the desktop layout, but if mobile-only screen-reader users need the license info, switch to a visually-hidden technique (off-screen `clip-path`) instead.

