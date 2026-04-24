# 2026-04-23 — Refactor: Remove Per-Bus Audio Loading List

Delete the per-bus loading list (Forest / Shrub / Grass / Crop /
Urban / Bare / Water — each with a progress bar and ✓/✗ status icon)
from the info panel. The list was an always-visible diagnostic that
was useful only during the first ~1 s of audio startup; in the
post-`feat/M3-ui-ux-overhaul` layout it read as unrelated debug
output below the volume slider. Status text (`Loading (N/7)`,
`Playing`, `Audio init failed — check frontend/audio/ambience/`) and
the all-failed toast both remain, so loading progress and failure
paths are still surfaced — just without the per-bus breakdown.

## Changes

### `frontend/index.html`

- Removed the `<div id="audio-loading" class="audio-loading hidden">`
  placeholder from the audio section of the info panel. The section
  now contains only the status row and the volume control.

### `frontend/main.js`

- Removed the `audioLoading` element reference from
  `state.els`. The audio-toggle handler no longer flips the
  `.hidden` class on it.
- Removed the module-local `BUS_LABELS` constant; it had no remaining
  consumer after the list renderer was gutted.
- `renderLoadingUI(states)` reduced to what it actually does now:
  fold the per-bus states into a status-text update and, when every
  bus fails, surface the dedupe-gated toast. Signature and
  `engine.setOnLoadingUpdate(renderLoadingUI)` wiring are unchanged so
  the engine's contract with the UI is intact. Function name kept to
  avoid a cascade of unrelated churn.

### `frontend/style.css`

- Removed `.audio-loading`, `.audio-loading.hidden`, `.audio-load-item`
  (+ `.error` / `.ready` variants), `.audio-load-name`,
  `.audio-load-bar`, `.audio-load-fill`, and `.audio-load-status`.
  No other rules referenced them.

## Design Decisions

- **Kept error reporting intact.** The "all failed" toast
  (`showToast(...)`) and the `Playing (N failed)` / `Audio init
  failed — ...` status-text branches still run. The per-bus
  granularity is lost; in practice the devtools network panel is the
  place to look when one specific bus fails, and server-side stdout
  already logs the cause.
- **Kept `renderLoadingUI` name.** The function no longer renders UI,
  but renaming would touch every call site and doesn't help a reader
  as much as the shorter diff does.
- **No feature flag / toggle.** The list was an always-on diagnostic,
  not a user preference, so there's nothing to preserve behind a flag.

## Verification

- `npm run format:check` — clean.
- `npm run lint` — clean.
- `npm test` — 14 suites / 154 tests pass (server-side only; no
  server code touched).
- `curl http://localhost:3000/` and `/style.css` / `/main.js` —
  confirmed the `audio-loading` div, `BUS_LABELS` constant, and
  `.audio-load-*` rules no longer ship.
- Manual spot-check on the running dev server (`localhost:3000`)
  deferred to the user: start audio → expect no per-bus list, status
  text to cycle `Loading (N/7)` → `Playing`; stop → `Audio off`.

## Files Changed

- **Modified**: `frontend/index.html` — removed the `#audio-loading`
  placeholder.
- **Modified**: `frontend/main.js` — removed element ref, BUS_LABELS,
  and the per-bus HTML rendering inside `renderLoadingUI`.
- **Modified**: `frontend/style.css` — removed `.audio-load-*` and
  `.audio-loading` rules (52 lines).
- **Modified**: `docs/DEVLOG.md` — index entry for this refactor.
- **Added**:
  `docs/devlog/M3/2026-04-23-M3-remove-audio-bus-list.md` — this
  entry.
