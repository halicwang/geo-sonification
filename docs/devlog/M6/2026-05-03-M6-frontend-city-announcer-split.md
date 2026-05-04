# 2026-05-03 — Refactor: Split city-announcer into spatial + cache + orchestrator

`frontend/city-announcer.js` had grown to 476 LOC mixing four concerns: pure spatial math (viewport normalization, longitude projection, nearest-city / center-circle search, stereo pan), I/O state (cities.json database, retry-on-fail backoff, decoded-AudioBuffer FIFO cache), Web Audio playback (TTS routing + ducking), and the trigger orchestration itself (dwell timer, cooldown, flyby throttle, public `announcer` API). The first two have no dependency on Web Audio or DOM and are the easiest to test, so they were the natural extraction targets. Split into three files: `city-spatial.js` (pure math, 208 LOC), `city-cache.js` (cities + buffer I/O, 118 LOC), and `city-announcer.js` retained as the orchestrator (257 LOC). 22-case Vitest suite added for the spatial helpers — covers antimeridian normalization, longitude projection across the dateline, population-weighted scoring, viewport-edge pan saturation, and degenerate-span fallbacks.

## Why

City-announcer was the largest top-level module without test coverage, and its spatial logic carries the project's only antimeridian-aware code. The existing module hid those helpers as private functions, so the antimeridian projection and the nearest-city scoring were both implicitly tested only via the live "drag the map past the dateline and see if Tokyo announces" path — fine when it works, opaque when it breaks.

Splitting now also makes the orchestrator readable as a single screen of trigger logic (dwell, cooldown, flyby throttle, playback) with the math + I/O behind named imports, instead of 200 LOC of math interleaved with 100 LOC of WebSocket-style state plus 175 LOC of orchestration.

The public `announcer` export keeps its four entry points (`onViewportSettle`, `onViewportMove`, `setEnabled`, `reset`) so `main.js` and the audio toggle path don't need to change.

## What changed

### `frontend/city-spatial.js` (new, 208 LOC)

Pure functions, no module-level mutable state, no `engine` or `BASE_PATH` dependency:

- `normalizeViewportBounds(bounds)` — antimeridian-safe span normalization (170→-170 becomes 170→190, span > 360° caps at 360°, missing fields fall back to safe defaults).
- `projectLngToViewport(lng, viewport)` — picks the lng / lng±360 candidate that lands inside the span (or the closest to centerLng when none qualify).
- `findNearestCity(centerLat, centerLng, bounds, cities)` — scores `dist² / pop^0.15` and returns the lowest-scoring in-viewport city; takes `cities` as a parameter rather than reaching into module state.
- `findCityInCenter(centerLat, centerLng, bounds, cities)` — center-circle variant used by the flyby (drag) trigger.
- `computePan(cityLng, west, east)` — derives a [-1, +1] stereo pan from the city's horizontal viewport position; antimeridian-safe via the same `normalizeViewportBounds` helper.

Also exports `CENTER_RADIUS_FRACTION` and `POP_PRIORITY_EXPONENT` (the only constants used solely by these functions).

### `frontend/city-cache.js` (new, 118 LOC)

Module-level state for the cities database and decoded-audio buffer cache:

- `cities[]`, `citiesLoaded`, `lastLoadAttempt` — same eager-load pattern as before (a `loadCities()` call fires on module init).
- `audioBufferCache` — Map<slug, AudioBuffer>; FIFO eviction at 50 entries.
- Exports: `getCities()`, `isCitiesLoaded()`, `maybeRetryLoadCities()` (30 s backoff), `loadCityAudio(slug)` (async, short-circuits on cache hit), and `getCachedCityAudio(slug)` (synchronous null-or-buffer accessor for the flyby path that must not await).

### `frontend/city-announcer.js` (476 → 257 LOC)

Retains only the orchestrator + DSP:

- Trigger constants (`DWELL_MS`, `COOLDOWN_MS`, `MIN_ZOOM`, `FLYBY_MIN_ZOOM`, `MOVE_THROTTLE_MS`, `TTS_GAIN_RATIO`, `FADE_IN_S`).
- Trigger state (`lastAnnouncedCity`, `lastAnnounceTime`, `dwellTimer`, `enabled`, `currentSource`, `lastMoveCheck`).
- `playAnnouncement(buffer, pan)` — Web Audio routing: `BufferSource → Gain → StereoPanner → destination`, plus `engine.duck()` / `engine.unduck()` around playback.
- `checkAndAnnounce` (dwell entry) and `onViewportMove` (flyby entry) call into the spatial + cache modules; the post-await `enabled` / `engine.isRunning()` re-check stays in `checkAndAnnounce`.
- `setEnabled` / `reset` and the public `announcer` export are unchanged.

### `frontend/__tests__/city-spatial.test.js` (new, 22 cases)

- `normalizeViewportBounds`: standard, antimeridian crossing (170→-170 → 170→190), span clamping at 360°, default fallbacks for missing/null bounds.
- `projectLngToViewport`: in-span passthrough, antimeridian shift, closest-candidate fallback.
- `findNearestCity`: closest-by-score, latitude-band rejection, antimeridian projection, empty-list null, population-weighted tiebreaker.
- `findCityInCenter`: center-circle hit, no-hit null, latitude-band rejection.
- `computePan`: center-zero, edge saturation, out-of-viewport clamping, antimeridian viewport, degenerate-span fallback.

## Verification

- `npm run test:frontend` → 125 passed (was 103; +22 new spatial tests). City-spatial test file is the first frontend top-level module with its own coverage outside hover-glow / sheet-drag / initial-viewport-push.
- `npm run lint` clean.
- Browser smoke (`npm run dev`, headless preview):
    - Module-level imports load cleanly: `import('/city-announcer.js')`, `import('/city-spatial.js')`, `import('/city-cache.js')` all return the expected named exports. ✓
    - `city-cache.isCitiesLoaded()` returns `true` after page load with `getCities().length === 555` (same count as pre-refactor). ✓
    - End-to-end dwell trigger: started audio, panned to New York at zoom 7, waited 3 s. Spied `engine.duck` recorded exactly 1 call — confirming `findNearestCity` returned NYC, `loadCityAudio` fetched + decoded the m4a, and `playAnnouncement` ran the routing + ducking. Full pipeline cities.json → spatial → cache → playback works through the new module boundaries. ✓
    - No console errors during the start / pan / dwell sequence.

## Files changed

- **Added** `frontend/city-spatial.js` — pure spatial helpers (208 LOC).
- **Added** `frontend/city-cache.js` — cities + buffer I/O (118 LOC).
- **Modified** `frontend/city-announcer.js` — keep only the orchestrator + DSP (476 → 257 LOC, ~46% reduction).
- **Added** `frontend/__tests__/city-spatial.test.js` — 22 cases covering the extracted spatial functions.
- **Added** `docs/devlog/M6/2026-05-03-M6-frontend-city-announcer-split.md` — this entry.
- **Modified** `docs/DEVLOG.md` — index this entry.
