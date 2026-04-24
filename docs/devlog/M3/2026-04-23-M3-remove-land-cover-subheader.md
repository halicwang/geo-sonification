# 2026-04-23 — Refactor: Remove "Land Cover — by area" Subheader

The `<h3 class="section-subheader">LAND COVER — BY AREA</h3>` row
that was added in the info-panel visual overhaul
(`dd342f7`) turned out to be redundant — the land-cover list
underneath it is self-explanatory (class swatches + names +
percentages read as a legend without any caption). Remove the
subheader and the two CSS classes that were created only for it.

## Changes

### `frontend/index.html`

- Delete the `<h3 class="section-subheader">…</h3>` block that sat
  between the stats section and the `#landcover-list` div. The
  list now follows the stats section's bottom divider directly.

### `frontend/style.css`

- Delete the `.section-subheader` and `.section-subheader-note`
  rules (the only consumer was the removed `<h3>`).
- Delete the `--fs-section: 0.62rem` design-token line from
  `:root` — it was only referenced by `.section-subheader`, so
  with the rule gone the token has no remaining reader. Other
  type-scale tokens (`--fs-title`, `--fs-subtitle`, `--fs-meta`,
  `--fs-label`, `--fs-value`) stay.

## Verification

- `npm run format:check` — clean.
- `npm run lint` — clean.
- `npm test` — 14 suites / 154 tests pass (server-side; no server
  changes).
- `curl http://localhost:3000/` confirms the served HTML no
  longer contains `section-subheader`; `curl /style.css` confirms
  neither the rules nor the `--fs-section` token ship.
- Visual pass left to the user's browser reload on the running
  dev server.

## Files Changed

- **Modified**: `frontend/index.html` — removed `<h3>` block.
- **Modified**: `frontend/style.css` — removed two rules and the
  unused token.
- **Modified**: `docs/DEVLOG.md` — index entry.
- **Added**: this entry.
