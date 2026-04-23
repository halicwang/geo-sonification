# 2026-04-23 — Fix: Frontend Lifecycle & Asset Failure Hardening

Five small frontend changes picked from the same-day M3 tech debt audit.
Focuses on lifecycle resilience in the city announcer and user-visible
feedback when static assets (ambience WAVs, PMTiles grid tiles, the
cities database) fail to load — cases that previously produced either
silent failures or misleading "ready" states.

## Changes

### `frontend/city-announcer.js`

- **`setEnabled(false)` now internally calls `reset()`.** Previously
  `frontend/main.js:149` was the only caller clearing the dwell timer
  and in-flight audio after disabling the announcer. Moving that
  cleanup inside `setEnabled` turns the external reset call into
  defense-in-depth rather than a required protocol step. No visible
  behaviour change for current callers.
- **`loadCities()` gains a retry path with a 30 s backoff.** The
  initial module-init fetch fires unchanged. A new
  `maybeRetryLoadCities()` helper runs at the top of
  `checkAndAnnounce()` and `onViewportMove()` and re-issues the fetch
  once the backoff elapses while `citiesLoaded` is still `false`.
  Before: a single flaky network moment disabled city announcements
  for the remainder of the session. After: the feature self-heals on
  the next viewport activity.
- **Cache eviction comment corrected to FIFO.** The previous "LRU
  eviction" comment at the former line 217 did not match the
  insertion-order `bufferCache.keys().next().value` eviction. Because
  buffers are write-once and essentially never re-accessed, FIFO is
  sufficient — only the comment needed fixing.

### `frontend/main.js` — `renderLoadingUI()`

- **All-buses-failed branch.** When every ambience sample fails to
  load, status now reads `Audio init failed — check
  frontend/audio/ambience/` and a single toast explains the situation.
  Previously the UI settled on `Playing (7 failed)` even though
  nothing could play. Deduplication uses a module-scope flag reset on
  each audio-toggle start so repeated start / stop cycles can each
  surface the toast once.

### `frontend/map.js` — `addGridLayer` catch block

- **PMTiles failure now shows a toast.** The existing `try / catch`
  around `addGridLayer()` only logged to the console. A `showToast`
  call now tells the user to run `npm run build:tiles` when
  `PmTilesSource.getHeader()` rejects (the rejection path exercised
  when `data/tiles/grids.pmtiles` is missing).

## Follow-ups Deferred

Tracked in
[docs/devlog/M3/2026-04-23-M3-tech-debt-audit.md](./2026-04-23-M3-tech-debt-audit.md):

- **A.1** Zero frontend test coverage — needs a testing framework
  approval before progress is possible.
- **C.4** Server-side static asset warnings are still stdout-only; no
  browser channel yet.
- **D.3** `delta-state.js` cleanup / TTL paths lack dedicated tests.
- **E.2** `data/cities.json` has no schema or provenance file.

## Verification

- `npm run format:check` — clean.
- `npm run lint` — clean.
- `npm test` — 14 suites / 154 tests passing.
- Manual preview (`npm start`):
    - Audio toggle: normal start renders `Playing`; nothing else
      regressed in the loading bars.
    - Ambience directory temporarily renamed: status switches to the
      init-failure message and one toast fires per start cycle.
    - `/data/cities.json` blocked in DevTools: 30 s later the module
      attempts another fetch on the next viewport activity (confirmed
      via Network panel).
    - `data/tiles/grids.pmtiles` temporarily renamed: toast fires on
      map init, console warning unchanged.
    - City announcement still fires normally when assets are present
      (dwell + flyby).

## Files Changed

- **Modified**: `frontend/city-announcer.js` — `setEnabled` + retry +
  FIFO comment
- **Modified**: `frontend/main.js` — `renderLoadingUI` all-failed
  branch + dedupe flag
- **Modified**: `frontend/map.js` — grid layer catch toast + import
- **Modified**: `docs/DEVLOG.md` — add this devlog entry to the index
- **Added**:
  `docs/devlog/M3/2026-04-23-M3-frontend-lifecycle-and-asset-hardening.md`
  — this entry
