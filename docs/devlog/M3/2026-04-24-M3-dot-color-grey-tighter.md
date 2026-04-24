# 2026-04-24 — Refactor: Nudge Dot Fill One More Step to `#606060`

Follow-up to `e9db2ff`. `#707070` (~44% white) was closer but
still read a touch bright on the pure-black basemap. One more
step darker:

- `DOT_COLOR`: `#707070` → `#606060` (~38% white). Noticeably
  more saturated mid-grey without crossing into "barely
  visible" territory.

Stroke alpha stays at `0.18` from the previous tune — with a
darker fill, any more aggressive stroke reduction would wash
out the dot edges at higher zoom.

## Changes

### `frontend/map.js`

- `DOT_COLOR` constant: `'#707070'` → `'#606060'`. Single-value
  tweak; nothing else touched.

## Verification

- `npm run format:check` — clean.
- `npm run lint` — clean.
- `npm test` — 14 suites / 154 tests pass.
- Browser A/B left to user reload (`Cmd+Shift+R`).

## Rollback

- Back one step: `#707070`.
- Back two steps: `#b0b0b0` (the `c45e905` bump).
- Original before any of this: `#d0d0d0`.

## Files Changed

- **Modified**: `frontend/map.js` — `DOT_COLOR` constant.
- **Modified**: `docs/DEVLOG.md` — index entry.
- **Added**: this entry.
