# 2026-04-24 — Refactor: Bump Low-Zoom Dot Radius So the Wash Reads Clearly

Follow-up tune to `e29ada8` (sub-pixel anti-moiré). That commit
set the low-zoom `circle-radius` interpolate to `0: 0.2, 2: 0.4,
4: 1.2`. Subjectively the wash came out "有点太淡" (a bit too
faint) — continent outlines registered but the overall gray
reading was weaker than intended.

## Math

Per-dot pixel coverage at each stop (area = πr²):

| zoom | old r | old area | new r  | new area | cell spacing (px) |
| ---- | ----- | -------- | ------ | -------- | ----------------- |
| 0    | 0.20  | 0.13     | 0.35   | 0.38     | 0.35              |
| 2    | 0.40  | 0.50     | 0.60   | 1.13     | 1.4               |
| 4    | 1.20  | 4.5      | 1.50   | 7.1      | 5.7               |

At zoom 2 the cell spacing is about 1.4 screen pixels. A radius
of 0.6 gives a diameter of 1.2 px — still 0.2 px short of the
spacing, so dots don't merge into each other and there's no
coherent pixel-wide stripe to set up moiré. But per-pixel
coverage moves from ~18 % to ~40-50 %, which is enough for the
eye to read continent shapes at a glance.

Zoom 5+ stops stay unchanged — past that point each cell is
well beyond one pixel and the radius is chosen for "look like
a dot", not "build a wash".

## Changes

### `frontend/map.js`

- `circle-radius` interpolate stops at zoom `0 / 2 / 4`
  adjusted from `0.2 / 0.4 / 1.2` to `0.35 / 0.6 / 1.5`.
  Everything else in the layer (stroke, opacity, blur,
  feature source) unchanged.

No tile rebuild needed — this is a pure paint tweak, the
already-shipped 151 MB PMTiles still serves every feature at
every zoom.

## Verification

- `npm run format:check` — clean.
- `npm run lint` — clean.
- `npm test` — 14 suites / 154 tests pass (unaffected; no
  server code touched).
- Browser A/B deferred to user reload. Expected: same globe /
  zoom-in behavior as the previous commit, but the low-zoom
  gray wash is noticeably denser. Moiré should still be absent
  because dots at zoom 2 still don't touch.

## Rollback

One-line revert: change the three stops back to `0.2 / 0.4 /
1.2` if the new curve looks too hot or reintroduces any
banding.

## Files Changed

- **Modified**: `frontend/map.js` — radius stops.
- **Modified**: `docs/DEVLOG.md` — index entry.
- **Added**: this entry.
