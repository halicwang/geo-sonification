# 2026-04-24 — Refactor: Darken Dot Overlay from `#d0d0d0` to `#b0b0b0`

Subjective tone adjustment on the grid dot color after the
rollback to pre-LOD rendering (`335c739`). The previous `#d0d0d0`
(~82% white) read a touch bright against the pure-black basemap
and the cyan/mint accent ring on the volume slider. Stepping to
`#b0b0b0` (~69% white) pulls the overlay toward "data annotation"
feel and lets the UI accent stand out more clearly.

## Changes

### `frontend/map.js`

- `DOT_COLOR` constant: `'#d0d0d0'` → `'#b0b0b0'`. One-line
  change; no layer topology, no paint expressions, no stroke
  styling affected.

## Verification

- `npm run format:check` — clean.
- `npm run lint` — clean.
- `npm test` — 14 suites / 154 tests pass (unaffected).
- Browser A/B left to user reload (`Cmd+Shift+R`).

## Rollback

One-line revert: restore `'#d0d0d0'` if the new shade reads too
muted.

## Files Changed

- **Modified**: `frontend/map.js` — `DOT_COLOR` constant.
- **Modified**: `docs/DEVLOG.md` — index entry.
- **Added**: this entry.
