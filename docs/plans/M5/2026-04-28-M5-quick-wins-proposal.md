# Milestone 5 — Quick Wins (Pack A)

**Author:** Zixiao Wang (Halic)
**Date:** 2026-04-28
**Status:** Active
**Companion docs:**

- [`docs/DEVLOG.md`](../../DEVLOG.md) — devlog index (single closing entry for M5)
- [`docs/plans/M4/2026-04-27-M4-summary.md`](../M4/2026-04-27-M4-summary.md) — parent context

---

## 1. Context

Pack A from the M4 P5-4 / M5 scoping discussion. Four small autonomous-driveable tasks selected because **none requires manual user intervention during execution** (only review + merge at the end). Out-of-scope items that need dashboard clicks (Cloudflare Cache Rule), browser interaction (DevTools recording), or larger design (PMTiles Worker proxy, audio module restructure) are explicitly deferred.

Occam-pivoted from day one: no phases, no per-stage devlogs, single closing devlog. Branch: `feat/M5`. Total estimate: **~4 hours of execution, 4 commits + 1 devlog commit + 1 merge commit, ~10 min of reviewer time at close**.

---

## 2. Stages

| # | Task | Critical files | Hours | DoD |
|---|---|---|---|---|
| **1** | Add `<link rel="modulepreload">` for the 6 `frontend/audio/*` modules to compensate for the M4 P3 module-fragmentation cost on first load. | `frontend/index.html` | 0.5 | DevTools network shows 6 audio modules parallel-fetched (no waterfall). 0 console errors. lint + format clean. |
| **2** | Fix WS-onOpen vs Mapbox `style.load` race in `main.js`: WS connects faster than Mapbox finishes parsing → first viewport push is dropped, leaving an empty grid + silent audio until the user pans. Gate the first viewport push on `state.runtime.map.isStyleLoaded()` or listen for `style.load`. | `frontend/main.js`, possibly `frontend/__tests__/` | 1.5 | Hard-reload + click Start audio reliably shows grid + audio without panning. Unit / integration test covers the ordering. lint + format + jest + vitest + smoke clean. |
| **3** | Close 3 of 4 deferred M3 audit items: **D.1** (`_statsTimer` runs even when `dataLoaded=false`), **D.4** (`CACHE_SCHEMA_VERSION` migration changelog), **E.2** (`cities.json` lacks a schema). | `server/index.js` (D.1), `server/data-loader.js` (D.4), `data/cities.json` + new server-side validation test (E.2) | 2.0 | D.1: timer is `null` until `dataLoaded` flips. D.4: changelog comment block above the constant covering version history. E.2: a JSON Schema spec in repo + a Jest test that validates `cities.json` against it. All three captured in the closing devlog. |
| **4** | Re-run `viewport-processor` benchmark and record actual p95 vs M4 §11 row 13 target (≤ 0.5 ms). | `npm run benchmark` (no code change) | 0.5 | Benchmark output captured in the closing devlog. If hit: target ✅. If miss: documented as accepted-as-baseline. |

**M5 close:** all four DoDs met → single closing devlog at `docs/devlog/M5/2026-04-28-M5-summary.md` → merge `feat/M5` → `main` → Pages + Fly auto-deploy.

---

## 3. Explicitly out of scope

| Dropped | Why |
|---|---|
| Cloudflare Cache Rule narrowing to `/audio/*` | Needs Cloudflare dashboard access (wrangler missing `zone_rulesets:edit`) |
| Audio idle CPU DevTools recording (M4 §11 row 10) | Needs browser interaction |
| PMTiles Worker proxy (DEPLOYMENT.md known issue #3) | Separate undertaking, not a "quick win" |
| Globe ↔ Mercator stutter | Subjective verification required |
| C.4 boot-time asset warnings to frontend | Extends WS protocol — larger task |
| Deterministic CI fixture for P5-1 race | Engineering hygiene, zero user impact |
| `audio/engine.js` 939 → ~600 split (swap-timer extraction) | Pure structural; no value until the next time audio behavior changes |
| `server/index.js` / `frontend/main.js` further file-size pressure | Diminishing returns post-M4 |
| Dead-code scan | Mostly judgment-call territory; deferred indefinitely |

---

## 4. Quantitative targets

| Indicator | Target | Verification |
|---|---|---|
| modulepreload installed | 6 `<link>` tags | grep `frontend/index.html` |
| First-load WS race | not reproducible after fix | hard-reload smoke (manual + automated) |
| M3 audit closure | D.1 + D.4 + E.2 → done | grep + new test passing |
| viewport-processor p95 | measured + recorded (regardless of target) | `npm run benchmark` |
| All CI gates | green at every commit | jest + vitest + lint + format + smoke:wire-format |

---

## 5. Wire-format invariants

Identical to M4 §10. **No new wire-format changes during M5.** `npm run smoke:wire-format` runs at every commit.

---

## 6. Cadence

- Single branch `feat/M5` (no per-stage branches).
- Each stage: one commit. Stage 4 produces a benchmark recording entry only.
- One closing devlog at the end (`docs/devlog/M5/<date>-M5-summary.md`).
- Single PR, single merge to `main`.
- No proposal revision history — if scope changes, edit this file in place.

---

## 7. Risk register

| Risk | Mitigation |
|---|---|
| Stage 2 (WS race) turns out larger than 1.5h | Cap at 3h; if still incomplete, revert and defer to a dedicated milestone |
| Stage 3 audit items reveal hidden dependencies | Each is independently revertable; close the doable ones, defer the rest |
| Benchmark p95 misses target after Stage 4 | Document as baseline; do not refactor for the number |
| Wire-format drift from any stage | smoke:wire-format gate catches at commit time |

---

## 8. Critical files

- `frontend/index.html` (Stage 1)
- `frontend/main.js` (Stage 2)
- `server/index.js` (Stage 3, D.1)
- `server/data-loader.js` (Stage 3, D.4)
- `data/cities.json` + new schema file + new test (Stage 3, E.2)
- `scripts/benchmark-viewport.js` (Stage 4 — invocation only)
