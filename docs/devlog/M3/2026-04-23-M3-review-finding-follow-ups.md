# 2026-04-23 — Fix: Review Finding Follow-Ups

Fixed the actionable findings from the full-system review pass: fresh
checkouts now get clearer setup instructions for local-only audio and tile
assets, runtime startup warns about missing static assets, the moved audio
control is documented correctly, and stale city-announcer metadata is back in
sync with the implementation.

## What Changed

### Setup Documentation

- Added `tippecanoe` to prerequisites because `data/tiles/grids.pmtiles` is
  generated locally and ignored by git.
- Expanded Quick Start step 4 to validate CSVs, clear caches, and rebuild
  PMTiles before starting the server.
- Added explicit ambience WAV setup guidance and troubleshooting notes so a
  fresh checkout does not silently miss the seven required local loops.
- Updated README references to the top-right control strip now that the play
  button is no longer inside the info panel.

### Runtime Warnings

- Added a startup asset check that warns when any expected ambience WAV is
  missing.
- Added a startup warning when `data/tiles/grids.pmtiles` is missing, with the
  exact rebuild command.

### Accessibility and Drift Cleanup

- Added `aria-label` and `aria-pressed` state to the floating audio toggle, and
  update both when playback starts or stops.
- Updated README and architecture city database metadata to ~555 cities with
  population > 1M.
- Updated architecture TTS gain documentation to `masterVolume × 0.3`.
- Cleaned two stale implementation comments: city dwell is 500 ms, and the
  required CSV list is the configured six-continent set.

## Verification

- `npm run format` — completed with no additional rewrites after formatting
  the touched files
- `npm run lint` — clean
- `npm run format:check` — clean
- `npm test` — 14 suites / 154 tests passing
- Startup smoke check on `HTTP_PORT=3120`, `WS_PORT=3121` — `/health`
  returned `{"ok":true,"dataLoaded":true}`

## Files Changed

- **Modified**: `README.md` — local audio/PMTiles setup, troubleshooting, UI
  location, and city metadata
- **Modified**: `docs/ARCHITECTURE.md` — city metadata and TTS gain
- **Modified**: `frontend/index.html` — audio toggle ARIA defaults
- **Modified**: `frontend/main.js` — stateful audio toggle ARIA updates
- **Modified**: `frontend/city-announcer.js` — dwell-time comment sync
- **Modified**: `server/index.js` — startup warnings for local-only static
  assets
- **Modified**: `server/data-loader.js` — configured CSV comment sync
- **Modified**: `docs/DEVLOG.md` — add this devlog entry to the index
- **Added**: `docs/devlog/M3/2026-04-23-M3-review-finding-follow-ups.md` —
  this entry
