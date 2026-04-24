# 2026-04-23 — Fix: Info Panel Post-Audit Cleanup

Three small fixes picked up from a post-hoc audit of the info-panel
refresh series: a missing `:focus-visible` style on the floating
controls, the "Data may be stale" warning getting silently dimmed
along with the data it warns about, and a redundant bottom divider
on the (now very short) audio section.

## Changes

### `frontend/style.css`

- **`.floating-btn:focus-visible`** — new rule. The audio-toggle
  and panel-toggle buttons both use `.floating-btn`; the volume
  slider already had a `:focus-visible` ring, but these two
  buttons only had `:hover` and `:active`, leaving keyboard-only
  users with no focus indication. Rule matches the slider's
  style: `outline: none; box-shadow: 0 0 0 3px rgba(78, 205, 196, 0.25);`
  (cyan ring at 25% opacity, matching the buttons' own accent
  family rather than the slider's mint).
- **`#info-panel.stale` dim selector scope** — changed from
  `#info-panel.stale .stats-section, #info-panel.stale .landcover-list`
  to `#info-panel.stale .stats-section > *, #info-panel.stale
  .landcover-list > *`. Opacity on a parent establishes a
  stacking context and drags every descendant (including
  `::after` pseudo-elements) down with it, which was muting the
  "Data may be stale" red warning to 0.55 of its intended
  strength. Applying the opacity to direct children only leaves
  the `::after` generated on `.stats-section` rendering at full
  opacity. Visual result: data dims to 0.55, warning stays
  full-strength red.
- **`.audio-section` border removed** — the `border-bottom: 1px
  solid var(--color-divider)` was redundant after the per-bus
  loading list was removed. The audio section is now short
  (status text + 20 px slider hit-area), and `.connection-status`
  below it already carries a 12 px top margin. Dropped the
  border; kept `padding-bottom: 14px` so the vertical rhythm
  from stats → legend → audio → connection stays consistent.

## Verification

- `npm run format:check` — clean.
- `npm run lint` — clean.
- `npm test` — 14 suites / 154 tests pass (server-side only; no
  server changes).
- Served-asset `curl` confirms: new `.floating-btn:focus-visible`
  rule, stale selector now scoped with ` > *`, and
  `.audio-section` has no `border-bottom`.
- Browser pass left to the user's reload on the running dev
  server. Quick checklist:
    - Tab-focus the play button / hamburger: thin cyan ring
      around the button (mouse click → no ring).
    - Trigger stale state (e.g., kill WebSocket twice): data
      cells dim, "Data may be stale" stays red + legible.
    - The horizontal rule between audio row and connection row
      is gone; vertical spacing looks the same as before.

## Files Changed

- **Modified**: `frontend/style.css` — three targeted rule
  changes.
- **Modified**: `docs/DEVLOG.md` — index entry.
- **Added**: this entry.
