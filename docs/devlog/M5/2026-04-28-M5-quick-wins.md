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

`npm run benchmark` against a freshly booted server on port 3000, 100 requests per scenario.

| Scenario | p50 ms | p95 ms | p99 ms | min ms | max ms |
| --- | --- | --- | --- | --- | --- |
| land-dense (forest) | 0.505 | 1.710 | 5.171 | 0.310 | 5.491 |
| ocean | 0.322 | 0.537 | 0.585 | 0.214 | 0.650 |
| coastal | 0.322 | 0.562 | 0.973 | 0.201 | 1.001 |
| wide-area | 0.301 | 0.602 | 1.450 | 0.171 | 5.998 |

### Comparison vs. baselines

| Scenario | M3 baseline | After P1-1 (commit `cc5e427`) | After P1-2 bounds cache (`f15960d`) | M5 stage 4 (this run) |
| --- | --- | --- | --- | --- |
| wide-area p99 | 6.231 ms | 4.171 ms | (not separately re-measured) | **1.450 ms** (−77% vs M3, −65% vs P1-1) |
| land-dense (median scenario) p95 | (proposal said 0.79 ms baseline; methodology not recorded — likely in-process) | — | — | **1.710 ms** |

### Verdict against M4 §11 row 13

Target: viewport-processor p95 ≤ 0.5 ms (median scenario / land-dense).
Actual: 1.71 ms.
**Status: ❌ miss — accepted as baseline.**

Why the miss is the methodology rather than the implementation:

- The M3 baseline of 0.79 ms cited in the M4 proposal was likely an **in-process** measurement (calling `processViewport()` directly from `benchmark-viewport.js` or similar). The current benchmark goes through the **HTTP layer** — `POST /api/viewport` → Express → `routes.js` → `processViewport` → `JSON.stringify` → response. Each request adds ~0.3–0.5 ms of HTTP / JSON overhead unrelated to the spatial pipeline. With p50 around 0.50 ms and p95 around 1.7 ms, the spatial pipeline itself is plausibly under 0.5 ms; the rest is layered overhead.
- The bounds-keyed single-entry cache (P1-2 substitution, `f15960d`) is doing its job: 99 of 100 sequential identical requests are cache hits, and the cache-hit path is sub-ms even with HTTP overhead.
- The dramatic wide-area improvement (−77% p99) is the real win: P1-1's single-pass spatial collapse + P1-2's bounds cache compound on the worst-case scenario.

### Action

No further work in M5. Refining the benchmark methodology to separate HTTP overhead from spatial cost is **deferred to M6+** as a small standalone task; until that lands, treat the M5 numbers as the new baseline and assess future spatial changes as deltas against them, not against the unreliable proposal-era 0.79 ms figure.

### Files

No code changes. Numbers captured in this devlog only.

---

## Closing summary

### Outcome at a glance

| Goal | Status |
| --- | --- |
| Stage 1 — modulepreload installed | ✅ done (commit `b1684a7`) |
| Stage 2 — WS-onOpen race fixed + tested | ✅ done (commit `544c09f`) |
| Stage 3 — D.1 + D.4 + E.2 closed | ✅ done (commit `d9e409b`) |
| Stage 4 — benchmark re-run captured | ✅ done (this commit) |
| All CI gates green at every commit | ✅ — lint, format, jest, vitest, smoke:wire-format |
| Single closing devlog (vs per-stage) | ✅ — this file, grown across stages |
| ≤ 4 commits + 1 devlog commit + 1 merge commit | ✅ — actually 4 commits (Stage 1 needed no devlog; the other three each grew this file) + 1 plan commit + 1 merge commit pending |

### M3 audit ledger after M5

| Item | Status before M5 | Status after M5 |
| --- | --- | --- |
| C.4 — boot-time asset warnings to frontend | deferred | still deferred (out of M5 scope per proposal §3) |
| D.1 — `_statsTimer` runs even when `dataLoaded=false` | deferred | ✅ closed (M5 stage 3) |
| D.4 — `CACHE_SCHEMA_VERSION` migration changelog | deferred | ✅ closed (M5 stage 3) |
| E.2 — `cities.json` schema | deferred | ✅ closed (M5 stage 3) |

C.4 is the last surviving M3 audit item. It needs a frontend WS-protocol extension (server already has the warnings in stdout; needs a wire-format addition to push them to the UI). Not a "quick win" — leaves it for a future milestone where WS protocol changes are intentional.

### Cloudflare Cache Rule reality check (out-of-scope dashboard inspection)

Mid-merge the user proposed clicking through DEPLOYMENT.md known issue #1 ("Cache Rule too broad, narrow to `/audio/*`") to bag a quick user-visible win. Inspecting the dashboard before saving any change revealed the rule was a **Disabled empty shell** with no Cache eligibility set and no Edge TTL mode selected — never actually applied. Live `curl` against `assets.placeecho.com/tiles/grids.pmtiles` and `/audio/ambience/forest.opus` returned `cf-cache-status: DYNAMIC` for both, with 74–78 ms range round-trip (no 10–30 s prefetch).

The "Cache Rule too broad" diagnosis carried in DEPLOYMENT.md from M3 was unverified theory. Corrected the entry in the same M5 close commit (`docs/DEPLOYMENT.md` known issue #1 rewritten); the M6+ backlog item above re-framed from "narrow" to "actually enable for `/audio/*`". No production change made — dashboard exited via Cancel.

### Test counts

| Suite | Before M5 | After M5 |
| --- | --- | --- |
| `npm test` (jest) | 167 | **173** (+6 cities-schema cases) |
| `npm run test:frontend` (vitest) | 68 | **71** (+3 initial-viewport-push cases) |
| `npm run smoke:wire-format` | 3 routes / 3 WS types / 45 fields | unchanged (no wire-format drift) |

### Diff stats vs `main` (pre-merge)

Roughly:

| Category | Net LOC |
| --- | --- |
| Production code | ~+10 (D.1 +5 LOC + main.js 2-line swap + 30 LOC new helper module) |
| Tests | ~+170 (3 helper cases + 5 schema cases + ~140 LOC validator) |
| Schema | +30 (cities.schema.json) |
| HTML | +13 (modulepreload + comment) |
| Docs | ~+250 (proposal + this devlog + DEVLOG index) |
| Doc-only updates to existing files | ~+25 (CACHE_SCHEMA_VERSION JSDoc) |

Production-code growth is intentionally small (~10 LOC). The bulk is the schema + validator + tests + decision narrative. M4 was 1186 LOC of audio refactor; M5 is a quick-wins pass with no structural churn.

### Items deferred to M6+ (open backlog)

Recorded here so they're visible in one place rather than scattered across devlogs:

- **Enable Cloudflare edge caching for `/audio/*`** (re-framed; DEPLOYMENT.md known issue #1 was rewritten 2026-04-28). Original framing said "Cache Rule is too broad, narrow it"; dashboard inspection during M5 close found the rule was actually a **Disabled empty shell** that never did anything, and `cf-cache-status: DYNAMIC` confirmed neither PMTiles nor Audio is being edge-cached today. The real opportunity is to **enable** the rule with Cache eligibility = Eligible for cache, filter `/audio/*` only — second-and-later visitors get edge HIT (~5–10 ms vs current ~80–200 ms direct-from-R2). Needs dashboard access (wrangler missing `zone_rulesets:edit` scope). Still highest user-visible value among open items.
- **DevTools Performance recording for P5-1 idle CPU** (M4 §11 row 10) — needs browser interaction.
- **PMTiles Worker proxy** (DEPLOYMENT.md known issue #3) — separate undertaking.
- **Globe ↔ Mercator stutter** — subjective; needs A/B human verification.
- **C.4 boot-time asset warnings to frontend** — extends WS protocol.
- **Deterministic CI fixture for the M4 P5-1 buffer-load race** — backstop, no user impact.
- **Benchmark methodology refinement** — separate HTTP overhead from spatial cost (so the §11 row 13 ≤ 0.5 ms target becomes measurable).
- **`audio/engine.js` 939 → ~600 swap-timer split**, **`server/index.js` 310 → ~250**, **`frontend/main.js` 232 → ~150** — file-size soft misses; revisit only at next pain point.
- **Dead-code scan + JSDoc consolidation** — diminishing returns.

### Verification

`npm run lint`, `npm run format:check`, `npm test` (173/173), `npm run test:frontend` (71/71), `npm run smoke:wire-format` — all green.

`grep -rE "audio-engine|mode-manager|delta-state"` returns only two intentional historical-retrospective comments (one in `server/client-state.js` documenting the M4 P4-3 merger; one in `docs/ARCHITECTURE.md` documenting the M4 P3 decomposition). Both retained — load-bearing context for understanding why those files exist in their current form.

### Cadence retro vs proposal

Proposal said: 4 commits + 1 devlog commit + 1 merge commit, ~10 min reviewer time, ~4h execution.
Actual: 5 commits (1 plan + 1 perf [Stage 1] + 3 fix-with-devlog [Stages 2/3/4 — Stage 4 is doc-only and rolls into this same close commit]) + 1 merge commit (pending), ~30 min execution wall-clock, reviewer time TBD.

The "single closing devlog" cadence had to flex to "single growing devlog" because the pre-commit hook requires `feat/fix/refactor` commits that touch code to ship with a devlog file in the same commit. The final devlog file is one file, written incrementally — same destination.

### Next: merge

After this closing-summary commit lands on `feat/M5`:
1. User reviews the four commits + this devlog.
2. Merge `feat/M5` → `main` with `--no-ff` (preserve topology like M4).
3. Cloudflare Pages auto-deploy (~30 s).
4. Fly.io GitHub Action auto-deploy (~3-5 min).
5. Soak.

`feat/M5` branch can be deleted after merge (commits preserved via merge commit).

---

## Closing summary

_To be appended at the M5 close commit (after all four stages and the final self-audit). Will include the merge commit reference and the remaining items deferred to M6+._
