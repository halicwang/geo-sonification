# 2026-04-25 — Feature: PlaceEcho Brand Mark for Trademark Specimen

Restructure the info-panel header to surface **PlaceEcho** as the
parent brand above the **Geo-Sonification** service name, add a
copyright footer to the panel, and default-expand the panel on first
load so the brand is visible without a hamburger click. The change
exists to produce a USPTO Section 1(a) `use in commerce` specimen for
the `PlaceEcho` standard-character word mark, with Geo-Sonification
positioned as a sub-service under the parent brand (Adobe Photoshop
style — small uppercase parent above large service name).

## Why this layout

The first attempt put `<h2>PlaceEcho</h2>` as the main heading with
`Geo-Sonification` as the subtitle, which read cleanly as a service
mark but lost the editorial intent of treating Geo-Sonification as a
distinct sub-service. The footer-only alternative (PlaceEcho appears
only in `© 2026 PlaceEcho. All rights reserved.`) fails USPTO
[TMEP §1301.04(f)(ii)](https://tmep.uspto.gov/RDMS/TMEP/current#/current/TMEP-1300d1e1.html) —
a mark that appears only in a copyright notice is treated as a trade
name, not a service mark, because it is not directly associated with
the offered services.

The chosen layout (small uppercase `PLACEECHO` above large
`Geo-Sonification`) gives PlaceEcho a direct visual association with
the service while preserving the sub-service hierarchy. Two anchors
of the mark on the page — header brand mark + footer copyright —
strengthen the specimen.

## Changes

### `frontend/index.html`

- **`<title>`** — `Geo-Sonification | Interactive Sound Map` →
  `PlaceEcho | Geo-Sonification Sound Map`. Brings the parent brand
  into the browser tab, bookmarks, and search engine results.
- **`#info-panel` default state** — removed `class="hidden"`. The
  panel is now expanded on first paint so the brand is visible
  without user interaction. The hamburger toggle still works for
  collapsing.
- **Header block** — added `<p class="brand-mark">PlaceEcho</p>`
  above the existing `<h2>`. Restored `<h2>Geo-Sonification</h2>`
  and `<p class="subtitle">Interactive Sound Map</p>` to their
  original wording.
- **Copyright footer** — new `<div id="copyright-footer">` inside
  the panel, after `.data-attribution`, reading
  `© 2026 PlaceEcho. All rights reserved.` Placed inside the panel
  rather than as a viewport-fixed element to avoid colliding with
  the Mapbox attribution row in the bottom-left.

### `frontend/style.css`

- **`#info-panel .brand-mark`** — new rule. Small (`var(--fs-meta)`),
  weight 500, `letter-spacing: 0.18em`, uppercase, tier-3 color.
  Reads as a brand mark distinct from descriptive copy in the same
  panel (similar to the "Adobe" wordmark above "Photoshop").
- **`#copyright-footer`** — new rule. Sits at the panel bottom with
  a 12 px top border + padding to separate it from
  `.data-attribution`. Uses the same tier-3 meta color as the data
  attribution row — visually quiet, but carries the second
  trademark anchor.

## Verification

- `preview_start` + `preview_snapshot` confirm three PlaceEcho
  anchors on first paint: tab title, header brand mark, footer
  copyright.
- `preview_screenshot` at 1280×800 desktop: header reads
  `PLACEECHO` / `Geo-Sonification` / `Interactive Sound Map`,
  footer reads the copyright line, no overlap with Mapbox UI.
- Mobile (375×812): info-panel becomes a bottom drawer at 50 vh;
  brand mark + service name visible without scrolling, footer
  reachable by scrolling within the panel.
- Hamburger toggle: panel collapses and re-expands cleanly,
  preserving the new layout.
- No console errors.

## Out of scope

- A separate WebSocket stability issue surfaced during the visual
  pass: the panel briefly enters the `.stale` state during heavy
  drag-driven viewport updates. The behavior pre-dates this change
  (it was hidden by `class="hidden"` on the panel) and is tracked
  separately. This entry only lands the branding work.

## Files Changed

- **Modified**: `frontend/index.html` — `<title>`, panel default
  state, header restructure, copyright footer element.
- **Modified**: `frontend/style.css` — `.brand-mark` and
  `#copyright-footer` rules.
- **Modified**: `docs/DEVLOG.md` — index entry.
- **Added**: this entry.
