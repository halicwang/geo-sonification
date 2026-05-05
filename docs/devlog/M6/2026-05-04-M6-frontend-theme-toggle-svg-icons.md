# 2026-05-04 — Refactor: Theme Toggle Glyphs → SVG Icon Set with Rotate-Fade Animation

The theme toggle button previously cycled three Unicode glyphs
(`◐ ☀ ☾`) by rewriting `textContent` in `refreshThemeButton`. Replace
those with three stacked SVG icons whose visibility is controlled by
`:root[data-theme-mode]` selectors, so the active icon fades and
scales in while the previous one rotates + scales out. Visual style
matches the Lucide-family stroked iconography used elsewhere and
removes the font-rendering inconsistency the Unicode glyphs had
across browsers.

## Why

- Unicode glyphs render very differently per platform — `◐` and `☾`
  on Safari sit at a different baseline than on Chrome, and `☀` on
  some Linux fallbacks renders as a black-and-white emoji. Visual
  mass and hairline weight did not match the rest of the icon row.
- A `textContent` swap also gave zero spatial feedback on click —
  pre-press and post-press states were indistinguishable except for
  the glyph itself, with no animation that confirmed the click
  registered.
- SVGs sized in `currentColor` follow the existing accent / text
  token swap on theme flip, so no per-icon color rules are needed.

## How it works

### Markup — `frontend/index.html`

Three SVGs share the `.theme-icon` class plus a per-mode modifier
`.theme-icon-{auto,light,dark}`. All three live inside `#theme-toggle`
simultaneously, stacked at `position: absolute; top: 10; left: 10`
(centered in the 40×40 button minus the 20×20 SVG).

- Auto: outline circle + half-filled path — conveys the
  "follow OS" semantics by being half-each visually.
- Light: 8-spoke sun (Lucide-style stroked).
- Dark: crescent outline (Lucide-style stroked).

### CSS — `frontend/style.css`

Default state hides every `.theme-icon`:

```css
.theme-icon {
    position: absolute;
    top: 10px;
    left: 10px;
    opacity: 0;
    transform: rotate(90deg) scale(0);
    transition:
        transform 0.25s cubic-bezier(0.4, 0, 0.2, 1),
        opacity 0.2s ease-out;
    pointer-events: none;
}
```

A higher-specificity rule keyed on `data-theme-mode` activates the
matching icon:

```css
:root[data-theme-mode='auto'] .theme-icon-auto,
:root[data-theme-mode='light'] .theme-icon-light,
:root[data-theme-mode='dark'] .theme-icon-dark {
    opacity: 1;
    transform: rotate(0deg) scale(1);
}
```

Because `applyTheme()` writes `dataset.themeMode` synchronously
inside the click handler, the activator rule swaps in the same paint
frame and the transition runs smoothly. `pointer-events: none` on
hidden icons keeps the stacked siblings from intercepting clicks.

### Transition-suppression exemption

Theme flips that also change the resolved theme set
`[data-theme-switching]` for one paint frame to suppress every panel
and button color transition (avoids a tinted flash). Without an
exemption that suppression would also freeze the icon swap. The rule
now skips `.theme-icon`:

```css
[data-theme-switching] *:not(.theme-icon),
[data-theme-switching] *::before,
[data-theme-switching] *::after {
    transition: none !important;
}
```

The icon animates `transform` + `opacity` only — both are
compositor-only and do not participate in the color flash the
suppression rule targets, so exempting them is safe.

`prefers-reduced-motion: reduce` zeroes the icon transition.

### JS — `frontend/main.js`

`refreshThemeButton(mode)` no longer touches a DOM glyph; it only
updates `title` and `aria-label`. The element handle
`state.els.themeIcon` and the `THEME_ICON` glyph map are removed. CSS
is now the single source of truth for the icon visual state.

## Files changed

- `frontend/index.html` — replace the single `<span id="theme-icon">`
  with three stacked SVGs (auto / light / dark) inside
  `#theme-toggle`.
- `frontend/style.css` — add `.theme-icon` default-hidden state, three
  `:root[data-theme-mode]` activators, and a
  `prefers-reduced-motion` no-transition fallback. Exempt
  `.theme-icon` from the `[data-theme-switching]` transition-
  suppression rule.
- `frontend/main.js` — drop `state.els.themeIcon` and the
  `THEME_ICON` glyph map; `refreshThemeButton` keeps only the a11y
  text refresh.

## Verification

- `npm run lint` clean.
- `npm run test:frontend` → 13 files, 167 tests pass (no test code
  changed; `theme.test.js` covers config-side logic which is
  unaffected by the icon rewrite).
- Browser preview (light + dark + auto cycle):
    - Cold load with empty storage and OS `prefers-color-scheme: dark`
      → `data-theme-mode=auto`, only `.theme-icon-auto` rendered
      (`opacity: 1`, others `0`).
    - Cycle Auto → Light → Dark → Auto: `data-theme-mode`,
      `data-theme`, `title`, `aria-label`, and the visible icon all
      swap together; rotate-and-fade animation is visible at every
      step. No console errors across the full cycle.
