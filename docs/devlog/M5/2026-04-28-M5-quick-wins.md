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

Three independently scoped audit items closed in one commit because each is small and self-contained.

### D.1 — `_statsTimer` runs even when `dataLoaded=false`

Original audit ([2026-04-23-M3-tech-debt-audit.md](../M3/2026-04-23-M3-tech-debt-audit.md):72) said the 30 s stats logger fires during boot. The current code already had an inner counter guard (`if (_statsCounter.viewports > 0)`) that produced no log under that condition, since `incrementStats` is only reachable after the route / WS handlers' `dataLoaded` checks pass. So the symptom the audit named is _de facto_ already gone.

What the audit really wants is the **invariant** stated explicitly in the code, not deduced from a chain of unrelated guards. One-line change:

```diff
 const _statsTimer = setInterval(() => {
+    if (!dataLoaded) return;
     if (_statsCounter.viewports > 0) {
         ...
     }
 }, STATS_LOG_INTERVAL_MS);
```

Behavior unchanged; intent now self-evident; future caller that bumps `_statsCounter.viewports` before `dataLoaded` flips can't accidentally log a partially-loaded server's stats. **Files:** `server/index.js` (+5 LOC including the comment block).

### D.4 — `CACHE_SCHEMA_VERSION` migration changelog

Original audit (D.4 in the same M3 doc) flagged that the constant lacked any record of what each version meant or when to bump. The trailing inline comment (`// bump when cache format changes (v3: nightlight -1 sentinel)`) only told you the latest delta.

Replaced with a JSDoc block above the constant that documents (a) the bump protocol — what kinds of change require a bump, what happens when the version mismatches on read — and (b) a version history table. v1 and v2 are pre-repo (initial commit landed at v3 already, per `git log -L /CACHE_SCHEMA_VERSION/`). v3's source is recorded with a commit reference for traceability. Future bumps land a new row.

```diff
-const CACHE_SCHEMA_VERSION = 3; // bump when cache format changes (v3: ...)
+/**
+ * Cache schema version. Mismatched on read → cache invalidated and rebuilt.
+ *
+ * Bump protocol: (...)
+ * Version history: (table)
+ */
+const CACHE_SCHEMA_VERSION = 3;
```

**Files:** `server/data-loader.js` (+22 LOC, all docstring; constant value unchanged).

### E.2 — `cities.json` lacks a schema

Original audit (E.2 in the same M3 doc) flagged that the 555-entry `data/cities.json` had no schema definition and no validation. A future contributor could add a malformed entry (wrong slug pattern, out-of-range coordinates, extra fields) and `frontend/city-announcer.js` would either silently misbehave or 404 on the `/audio/cities/{slug}.m4a` fetch.

Two new files:

- **`data/cities.schema.json`** — JSON Schema (draft-07) capturing the actual shape: array of objects with five required fields (`name`, `lat`, `lng`, `pop`, `slug`), no additional properties, lat/lng bounded to WGS84 ranges, integer population ≥ 1, slug constrained to `^[a-z0-9-]+$` (matching the M4A filename naming).
- **`server/__tests__/cities-schema.test.js`** — Jest gate. Loads both files, runs a hand-rolled validator (the project's `npm-deps-no-add` rule rules out `ajv`), asserts zero violations against the live `cities.json`. Plus four self-tests (missing field, out-of-range coords, non-slug pattern, additionalProperties) that confirm the validator actually rejects bad inputs.

The validator is a single recursive function (~80 LOC including the test cases) covering the JSON Schema subset this one schema actually uses: `type`, `required`, `properties`, `additionalProperties:false`, `minLength`, `pattern`, `minimum`, `maximum`, `minItems`, `items`. Anything beyond that we don't need; if a future schema does need more, extend the validator at that point.

**Files:**
- **Added** `data/cities.schema.json` — JSON Schema spec (~30 LOC).
- **Added** `server/__tests__/cities-schema.test.js` — validator + 5 Jest cases (~140 LOC).

### Verification

`npm run lint` clean; `npm run format:check` clean; `npm test` 167 → **173** (5 new schema-validation cases); `npm run test:frontend` unchanged at 71; `npm run smoke:wire-format` ok. No production-code behavior change in D.1 (already a no-op); no production-code change at all in D.4 / E.2.

### M3 audit status

After this commit, three of the four "deferred to M5" items from the M4 P5-4 residual-debt list are closed:

| Item | Status |
| --- | --- |
| C.4 — boot-time asset warnings reach frontend | still deferred (extends WS protocol — out of M5 scope per the proposal) |
| D.1 — `_statsTimer` gate | ✅ closed here |
| D.4 — `CACHE_SCHEMA_VERSION` changelog | ✅ closed here |
| E.2 — `cities.json` schema | ✅ closed here |

---

## Stage 4 — viewport-processor benchmark re-run

_To be appended in the Stage 4 commit. Will record the actual p95 numbers for the four scenarios (forest, ocean, coastal, wide-area) against the M4 §11 row 13 target (≤ 0.5 ms p95)._

---

## Closing summary

_To be appended at the M5 close commit (after all four stages and the final self-audit). Will include the merge commit reference and the remaining items deferred to M6+._
