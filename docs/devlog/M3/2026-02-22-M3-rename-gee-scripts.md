# 2026-02-22 — Refactor: Rename gee/ to gee-scripts/

Renamed the `gee/` directory to `gee-scripts/` so the folder name clearly communicates it contains Google Earth Engine export scripts. The abbreviation "gee" is opaque to contributors unfamiliar with the GEE ecosystem.

## Changes

- `git mv gee gee-scripts`
- Updated all path references in `CLAUDE.md`, `README.md`, `eslint.config.js`, `server/data-loader.js`, and `gee-scripts/README_EXPORT.md`.

## Files changed

- `gee/` → `gee-scripts/` (directory rename)
- `CLAUDE.md` — directory table updated
- `README.md` — quick-start instructions, file structure tree, troubleshooting section updated
- `eslint.config.js` — ignores pattern updated
- `server/data-loader.js` — error message path updated
- `gee-scripts/README_EXPORT.md` — self-referencing path updated
- `docs/DEVLOG.md` — new index entry
