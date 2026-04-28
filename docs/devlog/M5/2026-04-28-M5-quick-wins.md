# 2026-04-28 — Milestone: M5 Quick Wins (Pack A)

Single living devlog for the entire M5 milestone. The proposal at [`docs/plans/M5/2026-04-28-M5-quick-wins-proposal.md`](../../plans/M5/2026-04-28-M5-quick-wins-proposal.md) calls for one closing entry at milestone close; the pre-commit hook requires `feat/fix/refactor` commits that touch code to ship with a devlog file in the same commit, so this entry is grown stage-by-stage rather than written in one pass at the end. Same final shape, fewer commits.

Each stage section below is appended at the same commit that lands the stage.

---

## Stage 1 — modulepreload (`b1684a7`)

**Type:** `perf`. Hook-exempt, no devlog requirement, but recorded here for the unified narrative.

Six `<link rel="modulepreload" href="audio/<module>.js" />` tags added to `frontend/index.html`'s `<head>`, after the stylesheet but before any deferred script. The browser fetches the six `frontend/audio/*` modules in parallel as soon as the HTML is parsed, instead of waiting for `main.js` to load and discover each `import` statement (waterfall).

**Estimated impact:** −150–250 ms time-to-first-audio-ready on 4G; <50 ms on desktop WiFi (where the waterfall was already cheap). Measured impact deferred to M5+ — the M4 §11 row 10 DevTools recording target is on the same M5+ list.

**Files:** `frontend/index.html` (+13 LOC including the comment block).

---

## Stage 2 — WS-onOpen vs Mapbox style.load race fix

The bug noted in the M4 P5-1 revert devlog under "Hypotheses we couldn't conclusively confirm":

> Race between WS `onOpen → onViewportChange` (line 107 in `main.js`, gated on `state.runtime.map`) and Mapbox `style.load → onViewportChange` (line 331 in `map.js`). If WS fires first while map style is loading, the initial viewport may not be sent.

Confirmed during M5 stage 2: `state.runtime.map` exists right after `initMap()` (the Mapbox object is constructed synchronously) but `map.isStyleLoaded()` is `false` until `style.load` fires asynchronously, typically 100–500 ms later. On a warm WS reconnect (where the WS upgrade completes in <100 ms), `onOpen` runs first; the gate `if (state.runtime.map)` passes; `onViewportChange()` calls `getBounds()` against the not-yet-rendered map, which returns the initial-projection placeholder. The server happily computes audioParams from those bounds and replies. The user sees an empty grid + stale audio for one viewport-debounce window until they pan, at which point the bug self-heals.

Pre-existing — M3 era. M4 P5-1's idle suspend stopped masking it: pre-P5-1 the always-running rAF kept calling `gain.value` writes every frame, so the next tick after `style.load` corrected the audio output even without a fresh `audioParams`. Post-P5-1 the rAF self-suspends after EMA convergence, so the stale audio sticks until something wakes it (typically the user's first pan).

### Fix

Extract `triggerInitialViewportPush(map, onViewportChange)` into `frontend/initial-viewport-push.js` — kept as a separate small module so vitest can unit-test the ordering logic without importing the whole `main.js` DOMContentLoaded chain (which depends on `window.mapboxgl`, not loaded under happy-dom).

```js
export function triggerInitialViewportPush(map, onViewportChange) {
    if (!map) return;
    if (map.isStyleLoaded()) {
        onViewportChange();
        return;
    }
    map.once('style.load', onViewportChange);
}
```

Three contract cases tested in `frontend/__tests__/initial-viewport-push.test.js`:

1. style already loaded → synchronous call, no listener registration
2. style not loaded → defer to `once('style.load', cb)`, no synchronous call
3. `map === null` (pre-`initMap()`) → no-op

`main.js` change is two lines: import + replace the `if (state.runtime.map) onViewportChange()` block with a single `triggerInitialViewportPush(state.runtime.map, onViewportChange)` call.

### Verification

`npm run lint` clean; `npm run format:check` clean; `npm test` 167/167; `npm run test:frontend` 68 → **71** (5 → 6 test files, +3 cases for the new helper); `npm run smoke:wire-format` ok.

Manual reproduction of the race in production cannot be reliably forced from a clean test environment (depends on warm cache + fast WS handshake timing); structural argument — `style.load` is the only event that guarantees `getBounds()` returns post-init values, so gating on it eliminates the class — is what the unit tests document.

### Files

- **Added** `frontend/initial-viewport-push.js` — the helper.
- **Added** `frontend/__tests__/initial-viewport-push.test.js` — 3 cases.
- **Modified** `frontend/main.js` — 2 lines (import + call site).

---

## Stage 3 — M3 audit closure (D.1 + D.4 + E.2)

_To be appended in the Stage 3 commit._

---

## Stage 4 — viewport-processor benchmark re-run

_To be appended in the Stage 4 commit. Will record the actual p95 numbers for the four scenarios (forest, ocean, coastal, wide-area) against the M4 §11 row 13 target (≤ 0.5 ms p95)._

---

## Closing summary

_To be appended at the M5 close commit (after all four stages and the final self-audit). Will include the merge commit reference and the remaining items deferred to M6+._
