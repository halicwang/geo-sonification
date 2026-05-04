# 2026-05-03 — Refactor: Frontend DOM Write-on-Change Guards Across Hot Paths

Closes the deferred ticket from `2026-05-03-mobile-panel-rework.md` line 147 ("textContent write-on-change guard in `ui.js` / `map.js`") and bundles two adjacent hot paths (volume-slider input handler in `main.js`, progress-bar rAF loop in `progress.js`) that share the same pattern. Nine guards across four files; all checks "if formatted-string equals last-written, skip the DOM write."

## Why

Three classes of hot writes existed before:

- **map.js `move` handler** (~60 Hz during pan/zoom): wrote `state.els.zoomLevel.textContent = zoom.toFixed(2)` every event. The formatted value only changes ~once per 0.01-zoom step, so most writes were no-ops at the DOM level.
- **progress.js `setVisualProgress`** (60 Hz when audio on, called from rAF): wrote `fillEl.style.width` and `handleEl.style.left` every frame. Audio-loop progress doesn't change every frame at typical loop lengths, so many frames are duplicate.
- **main.js volume-slider `input` handler** (10–30 Hz during drag): wrote `--fill-pct` CSS var and `volumeValue.textContent = raw + '%'` every event. Integer `raw` values produce identical strings across consecutive ticks at the same slider position.
- **ui.js `updateUI`** (per WS stats message): wrote four stat-field `textContent`s unconditionally. Many fields stay constant while the user pans within the same area (mode rarely flips, dominant-landcover stable inside biome regions).

The mobile-panel rework explicitly deferred this — adding the guards is a "if profiling shows it matters" follow-up — but with `.stats-section` now visible on mobile, the cost is pure benefit and the diff stays trivially reviewable.

## What changed

### Pattern

Module-scope (or closure-scope) `let lastX = ''`, then before each write:

```js
const text = formatValue();
if (text === lastX) return;
lastX = text;
el.textContent = text; // (or el.style.X = text)
```

### Sites

- **`map.js`** — module-level `let lastZoomText = ''`. Guard inside the `move` handler; the initial-paint write at the bottom of `style.load` also seeds the cache so the very first `move` after a style load doesn't redundantly re-write the same value.
- **`progress.js`** — closure-level `let lastPct = ''` inside `attachProgressBar`. Guard at the top of `setVisualProgress` (single function used by both rAF and pointer-drag paths, so the guard covers both call sites for free).
- **`main.js`** — closure-level `let lastFillPct = ''` and `let lastVolumeText = ''` inside the DOMContentLoaded callback, each guarding one write site in `updateVolumeFillPct()` and the slider `input` listener respectively.
- **`ui.js`** — module-level `let _lastGridCount = ''`, `_lastAudioMode`, `_lastProximity`, `_lastLandType`. The audioMode guard also covers the adjacent `style.color` write (color and text both change in lockstep when mode flips, so one guard handles both).

### Format-string allocation

Each guard formats the value (e.g. `zoom.toFixed(2)`) before comparing — same allocation that would happen during the write anyway, so the guard adds zero allocation in steady state. The guard's own work is one string-equality check (cheap), and the no-write skip avoids a `set textContent` call which the spec considers a mutation event source for MutationObservers + can trigger reflow under flex-wrap layouts (per the mobile devlog's note).

### Out of scope (decided after grep)

- `ui.js:69, 89` `landcoverList.innerHTML` — full HTML rebuild per stats message; naïve string equality rarely matches because `landcoverBreakdown` items vary. Optimizing needs a different strategy (DOM diffing or template caching), not in this Occam pass.
- `ui.js:102` `closest('#info-panel')` walk — `state.els.infoPanel` is already cached but the walk runs only on connect/disconnect (not hot). Off-topic for this commit.
- `hover-glow-*` — recently swept (`4548164`), no surviving targets.
- `city-announcer.js` antimeridian test gap — separate ticket.

## Verification

### Static gates

- `npm run lint` clean.
- `npm run test:frontend` (Vitest) — 91 / 91.
- `npm test` (Jest server) — 189 / 189.
- `npm run format:check` clean.
- `grep -nE "lastZoomText|lastPct|lastFillPct|lastVolumeText|_lastGridCount|_lastAudioMode|_lastProximity|_lastLandType" frontend/*.js` — all 9 guards landed across the 4 files.

### Live-page verification (preview server on localhost)

Spied on `textContent` setters for the six target elements via `Object.defineProperty(el, 'textContent', ...)` overrides, then exercised the hot paths:

- **ui.js — same-stats deduplication**: called `updateUI(sampleStats)` twice in a row with identical payload. Write counts: `grid-count` 1 → 1, `audio-mode` 0 → 0, `land-type` 0 → 0, `proximity` 1 → 1. (The 0s mean prior boot-time `updateUI` had already cached those values; the second call also skipped — guard works.) ✅
- **ui.js — different-stats lets through**: called `updateUI` with `gridCount=50, mode='per-grid', dom=30, prox=0.1` then `gridCount=200, mode='aggregated', dom=40, prox=0.9`. All four counters incremented by exactly 1. Guards aren't stuck. ✅
- **main.js volume slider — same-value deduplication**: dispatched `input` event twice with `slider.value = 75`. `volume-value` write count: 1 → 1. ✅
- **map.js zoom-level — same-zoom deduplication**: fired `map.fire('move')` twice at zoom 4.0. `zoom-level` write count: 0 → 0. ✅
- **map.js zoom-level — different-zoom lets through**: `map.setZoom(5.0)`. `zoom-level` count incremented to 1, DOM text updated to "5.00". ✅
- **No console errors**, no server log errors after the test session. Page renders normally (dot grid visible, audio toggle + hamburger present, attribution at bottom-left).

(Progress-bar guard not directly exercised — would need a live audio session — but the pattern is identical to the others, the `setVisualProgress` function is closed-over, and Vitest tests pass.)

## Files changed

- **Modified** `frontend/map.js` — `let lastZoomText` at module top + guard around `move`-handler write + cache-seeding at initial-paint write.
- **Modified** `frontend/progress.js` — `let lastPct` inside `attachProgressBar` + guard at top of `setVisualProgress`.
- **Modified** `frontend/main.js` — `let lastFillPct`, `let lastVolumeText` near volume-slider section + guards in `updateVolumeFillPct()` and the `input` listener.
- **Modified** `frontend/ui.js` — four `let _lastX` at module top + guards around `gridCount`, `audioMode` (also gates adjacent style.color write), `proximity`, `landType` writes.
- **Added** `docs/devlog/M6/2026-05-03-M6-frontend-write-on-change-guards.md` — this entry.
- **Modified** `docs/DEVLOG.md` — index this entry at the top of `## Entries`.

## Deferred (out of this commit)

- `ui.js` innerHTML rebuild for the landcover breakdown — needs different optimization strategy.
- `city-announcer.js` antimeridian unit tests.
- `ui.js:102` `closest()` redundancy — trivial follow-up.
