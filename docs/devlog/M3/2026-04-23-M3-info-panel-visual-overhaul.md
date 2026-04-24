# 2026-04-23 — Feature: Info Panel Visual Overhaul

Upgrade the floating info panel from a functional prototype overlay to a
restrained "data instrument" visual register: introduce a typographic
system (Inter + JetBrains Mono), a three-tier text color palette,
section dividers replacing the nested card background, an inline
percentage micro-bar in the land cover legend, and tightened slider /
footer metrics. Pure CSS / markup work — the map, Web Audio engine, and
WebSocket pipeline are untouched.

## Motivation

The panel previously relied on the browser's default system font stack
and a flat layout where every section (title, live stats, land cover
legend, audio control, connection status, attribution) carried the same
visual weight. Reads as debug overlay rather than an artifact. The goal
is to bring the signal hierarchy up — titles and live values assertive,
metadata recessive — and to add a small visualization move (the inline
micro-bar on land cover rows) that makes the legend itself informative
instead of purely explanatory.

Reference points: Ryoji Ikeda's data installations, Ableton Live 12's UI
restraint, the functional-aesthetic class of NASA Worldview / Windy.com.

## Changes

### Typography & design tokens (`frontend/style.css`, `frontend/index.html`)

- Load **Inter** (UI, weights 300/400/500/600) and **JetBrains Mono**
  (numeric values, weights 400/500) from Google Fonts. Both are
  `display=swap` so the panel stays legible during load.
- Extend `:root` with `--font-sans` / `--font-mono` stacks, a three-tier
  text color system (`--color-text-tier1..3`), a v2 panel surface
  (`--color-panel-bg-v2` = `rgba(12, 12, 14, 0.85)`), a soft border
  (`--color-border-soft`), a divider (`--color-divider`), and a rem-based
  type scale (`--fs-title` / `-subtitle` / `-meta` / `-label` / `-value`
  / `-section`). Existing `--color-text-bright` / `-muted` / `-dim`
  tokens are intentionally left in place to keep the diff surgical;
  non-panel call sites still use them.
- Body `font-family` now resolves through `var(--font-sans)`.

### Info panel restructure (`frontend/index.html`, `frontend/style.css`)

- Panel background shifted from `rgba(0,0,0,0.55)` to the v2 surface,
  paired with `backdrop-filter: blur(16px) saturate(120%)` and a
  `0 8px 32px` drop shadow. Border softened to 6% white.
- Title block: `<h2>` picks up 600 weight + `letter-spacing: 0.04em`
  and tier1 color; `.subtitle` drops to 300 weight + tier2; `.vintage`
  moves out of `.stats-section` to sit directly under the subtitle at
  tier3, terminating the title block with a 1px divider.
- `.stats-section` loses its nested card background and padding.
  Separation is now carried by a 1px divider on each sibling section's
  bottom edge, so the panel reads as one surface with four quiet
  horizontal slices.
- New `.section-subheader` utility: uppercase mini-header with
  `letter-spacing: 0.12em` and tier3 color. Replaces the redundant
  "Land Cover:" stat row + "By land area" note with a single
  `LAND COVER — BY AREA`.

### Land cover legend (`frontend/style.css`, `frontend/ui.js`)

- `.landcover-item` switches from flex to a three-column grid
  (`12px 1fr auto`). Values sit right-aligned in `JetBrains Mono`
  with tabular numerals, labels in sans tier2.
- New **inline micro-bar**: each row gets a 2px tinted bar positioned
  at the bottom edge, width = the row's percentage, color = the
  ESA WorldCover class color (via `--bar-color`), opacity 0.35 so it
  reads as texture rather than a full bar chart. The "Other" row
  (`landcover-other`) and the "No data" row (`empty`) suppress the bar.
- `updateUI()` now passes `--pct` and `--bar-color` via the row's
  inline style. Percentages coming from the data pipeline are already
  run through `.toFixed(1)`, so only numeric content crosses into the
  custom property — no new injection surface. The "No data" fallback
  now emits three grid cells (blank swatch + name + blank percent) so
  the grid layout stays consistent.

### Numeric formatting (`frontend/ui.js`)

- Grid-count line picks up thousands separators via
  `Number.prototype.toLocaleString('en-US')`. A view showing
  `30325 / 67095 (45%)` now reads `30,325 / 67,095 (45%)`, which is
  substantially easier to eyeball at the size we're rendering it.

## Design Decisions / Tradeoffs

- **Accent color retained at `#4ecdc4`.** An upstream proposal suggested
  shifting to `#5CFFC8` under the label "lower saturation". In HSL, the
  proposed value is in fact _more_ saturated than the current one, so
  the swap would contradict its own intent. If further tuning is
  desired later, `#3FE8BC` preserves the hue while reducing saturation
  ~10%.
- **Panel `top` offset kept at 76 px.** A proposal to move the panel to
  `top: 16px` would collide with `#controls-bar` (the floating audio /
  panel-toggle buttons introduced in commit `8c97de8`). 76 px preserves
  the existing vertical relationship between the two overlays.
- **CSS variables extended rather than rewritten.** Existing
  `--color-text-bright / -muted / -dim` tokens are left in place. New
  tier variables (`--color-text-tier1..3`) are added alongside; newly
  authored rules reference the tier system, existing rules are migrated
  only where the diff already touches them. A full sweep is deferred to
  avoid a large unrelated diff.
- **Fonts loaded from Google Fonts CDN, not self-hosted.** Offline /
  restricted networks fall back to the existing `-apple-system` stack.
  Self-hosting via `@font-face` in `frontend/fonts/` is a future change
  if offline-first becomes a requirement.
- **Existing floating play / panel-toggle buttons untouched.** They
  already live outside the panel in `#controls-bar` and have their own
  visual register; duplicating them into a panel-internal redesign
  would regress the work from commit `8c97de8`.

## Verification

(Filled in after implementation — `npm run lint`, `npm run format:check`,
`npm test`, and a manual preview pass including desktop and mobile
widths plus the `.stale` connection state.)

## Files Changed

(Populated at close-out.)
