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

(Filled in as commits land — see "Files Changed" for the final list.)

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
