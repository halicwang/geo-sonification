# 2026-04-24 — Refactor: Push Dot Overlay Further Into Mid-Grey

Follow-up to `c45e905`. That commit moved `DOT_COLOR` from
`#d0d0d0` to `#b0b0b0` but the overlay still read as "white dots
on black" — two reasons: `#b0b0b0` is still ~69% white, and the
white stroke ring at `rgba(255, 255, 255, 0.32)` pulled the dots
back toward a bright appearance regardless of fill colour.

Two-part fix in the same commit so the change is uniform across
zoom levels:

- **Fill** drops another step, `#b0b0b0` → `#707070` (~44%
  white). Solid mid-grey on the pure-black basemap.
- **Stroke alpha** drops from `0.32` to `0.18`. Still enough to
  define edges at zoom 6+, but no longer adds a bright white
  halo around darker fill at low zoom.

## Changes

### `frontend/map.js`

- `DOT_COLOR` constant: `'#b0b0b0'` → `'#707070'`.
- `circle-stroke-color`: `'rgba(255, 255, 255, 0.32)'` →
  `'rgba(255, 255, 255, 0.18)'`.

Everything else (radius, opacity, stroke-width, stroke-opacity,
blur, source / layer setup) unchanged.

## Verification

- `npm run format:check` — clean.
- `npm run lint` — clean.
- `npm test` — 14 suites / 154 tests pass (unaffected).
- Browser A/B left to user reload (`Cmd+Shift+R`). Expected: the
  overlay reads as mid-grey on black, not white. Moiré / stutter
  behaviour at low zoom is unchanged from the rollback baseline
  (`335c739`).

## Rollback

- **Lighter fill**: set back to `#b0b0b0` or `#8a8a8a`.
- **Brighter edge**: set stroke alpha back to `0.25` — mid step
  between old 0.32 and new 0.18.

## Files Changed

- **Modified**: `frontend/map.js` — `DOT_COLOR` +
  `circle-stroke-color`.
- **Modified**: `docs/DEVLOG.md` — index entry.
- **Added**: this entry.
