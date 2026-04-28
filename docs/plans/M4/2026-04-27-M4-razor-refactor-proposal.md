# Milestone 4 — Occam's Razor Refactor Proposal

**Author:** Zixiao Wang (Halic)
**Date:** 2026-04-27 (revised 2026-04-27 — Occam pivot, see §0)
**Status:** Completed (P5-4 pending) — see [M4 summary](2026-04-27-M4-summary.md) for §11 verification, missed-targets analysis, M3 audit closure, and the P5-4 definition-of-done.
**Companion docs:**

- `docs/DEVLOG.md` — devlog entries indexed under M4
- `docs/plans/M4/P*/` — per-stage execution files (created lazily as stages are picked up)

---

## 0. Revision history

**2026-04-27 (initial)** — 29 stages across 6 phases.

**2026-04-27 (Occam pivot, after P0 complete)** — re-cut to 22 stages by:

- **Dropping P0-5** entirely. The audio recorder file, baseline-notes, and proposal §2.E softening were rolled back. No audio reference is captured during M4.
- **Dropping `lerp` from P0-3** (`audio/utils.js`). It had zero callers; CLAUDE.md "no design for hypothetical future requirements" applies.
- **Dropping P1-2** (`server/http-client-state.js` extraction). It existed only to feed P4-4; the merger should happen directly.
- **Dropping P2-1 / P2-2 / P2-3** (`frontend/utils.js`, `event-bus.js`, `lifecycle.js`). All three add abstractions for assumed future need.
- **Collapsing P3 from 7 stages / 9 files to 5 stages / 4 new files**. Swap-timer / bus / announcer-bus stay inside `audio/engine.js` as named exports.
- **Collapsing P4 from 4 stages to 3**. Drop the `bootstrap.js` extraction — the startup block in `server/index.js` is naturally cohesive.
- **Softening the per-stage devlog rule** to "per-significant-stage."

**2026-04-27 (post-P1-1 small revision)** — re-cut to **21 stages**. Dropped the post-pivot P1-2 ("Delete `server/types.js` (104-line empty file)"). The original audit's "empty file" framing was wrong: `types.js` carries zero runtime code but is referenced by **45 JSDoc `import('./types').<TypeName>` annotations** across `server/normalize.js`, `data-loader.js`, `spatial.js`, `viewport-processor.js`, etc. — it's the type-definition source for IDE / TypeScript-Language-Server IntelliSense across the whole server codebase. Deleting it would degrade dev UX without any runtime or LOC win that warrants the trade. The typedef-maintenance work that does need doing (`ModeState` / `DeltaState` typedefs become obsolete after the merger) folds naturally into **P4-3** as part of the file-deletion wave there. P1 shrinks from 3 stages to 2 (P1-1 spatial collapse, P1-2 lcFractions memoization).

The pre-pivot version's stage counts and DoD lines are preserved in git history (`git log --follow docs/plans/M4/2026-04-27-M4-razor-refactor-proposal.md`).

---

## 1. Context

`placeecho.com` has been live in production since the close of M3. A repository-wide audit ("muck level" assessment, ~6.0/10) surfaced two structural problems worth addressing in M4:

1. **`frontend/audio-engine.js` is 1186 lines (~41% of frontend code).** A single file owns the audio context, master chain, multiple buses, the buffer LRU, the rAF loop, the swap timer, and 45+ internal helpers. Module-level `let` state ties every subsystem together: nothing can be tested in isolation.
2. **`server/index.js` is 516 lines and mixes responsibilities.** HTTP routes, the WebSocket handler, and the boot sequence share one file. `server/mode-manager.js` and `server/delta-state.js` parallel each other almost line-for-line (~130 lines of duplication: two cleanup timers, two `normalizeClientId` variants).

(A third audit finding, "M3 has no `docs/plans/M3/`," is already addressed by writing this M4 plan; it does not drive scope.)

M4 is a **decomposition** pass — pull `audio-engine` apart into a few testable modules, extract the server route + WS handler from `index.js`, merge the parallel state layer. By the close of M4, `audio-engine.js` no longer exists (deleted in P5-4), `server/index.js` shrinks to ~250 lines, and the critical pure-function audio helpers carry ≥ 70% test coverage (up from 0%).

**Cadence: single long-lived branch (`feat/M4`).** All M4 commits go on `feat/M4`; nothing merges to `main` until P5-4. `placeecho.com` runs the M3 `main` codebase throughout. Hotfixes target `main` directly; `feat/M4` rebases after each.

---

## 2. Discipline (operative rules during M4)

### 2.A. Wire-format compatibility

Wire-format changes during M4 are **not blocked** during execution (single-branch cadence — frontend and server always reach prod together at P5-4). `npm run smoke:wire-format` (P0-1) runs as a regression check whenever server routes / WS message types / response fields change, and runs at the P5-4 closing audit against `main` to catch field churn that accumulated across M4.

### 2.B. Devlog policy (revised)

Each significant stage gets a devlog entry under `docs/devlog/M4/YYYY-MM-DD-M4-<short-title>.md`, indexed in `docs/DEVLOG.md` § Entries. "Significant" means: new module file, deletion > 50 lines, architectural change, or anything that benefits from a "what nodes connect to what" review. Trivial code moves (popup → popup.js, progress → progress.js) can share a phase-close devlog.

### 2.C. Commit message template

Conventional Commits + project scope (`CLAUDE.md`). M4 stages use `M4/P<n>` scope. A `DEVLOG-REVIEWED: YYYY-MM-DD` footer signals the matching devlog exists. **No `Co-Authored-By` trailers** — `CLAUDE.md` § Authorship is absolute.

### 2.D. Hotfix priority

Hotfixes branch from `hotfix/<short-title>` and merge directly to `main`. After a hotfix lands, `feat/M4` rebases `main` to absorb it.

### 2.E. Audio regression detection (revised — Occam pivot)

No captured baseline. Each audio-touching stage relies on:

1. Unit-test coverage on extracted pure functions via the P0-1 audio-context mock.
2. **Manual A/B listen** on `npm run dev` for ≥ 30 s with audio settled, listening for clicks / pops / gain steps / pitch shifts.
3. A "what nodes connect to what" review block in the stage's devlog, naming AudioNode types and connection order.
4. Numeric verification via DevTools eval of the kind P0-3 demonstrated (e.g. `dbToLinear(12) === Math.pow(10, 12 / 20)`).

If a regression slips, fix forward with a hotfix to `main` after the P5-4 merge; worst case revert the offending P3 commit on `feat/M4` before merge.

### 2.F. Build-tag in the frontend bundle

P0-2 already injects `buildHash` (short git SHA) + `buildTime` (ISO timestamp) into `dist/config.runtime.js` via `scripts/build-pages.js`; the frontend boot logs `[PlaceEcho] build <hash> deployed <iso>`.

### 2.G. Plan iteration

Once P0-2 lands, the local Chinese plan at `~/.claude/plans/m-milestone-linked-pine.md` is **superseded** by this proposal. Each adjustment commits as `docs(M4): adjust <which> plan after <reason>`.

### 2.H. Single-branch workflow

All M4 work goes onto `feat/M4`. A single draft PR (`feat(M4): razor refactor (in progress)`) tracks `feat/M4` against `main` and is marked ready at P5-4. Each push triggers `npm test && npm run test:frontend && npm run lint && npm run smoke:wire-format` via CI.

---

## 3. Phases overview (post-pivot)

| Phase | Theme | Stages | Hours | Status |
|---|---|---|---|---|
| **P0** | Test scaffolding + plan + low-friction extractions | 4 (was 5; P0-5 dropped) | 9.5h | ✅ all 4 complete |
| **P1** | Server-side low-hanging fruit | 2 (was 4; original P1-2 dropped pre-execution, post-pivot P1-2 dropped after re-evaluating types.js) | 5h | P1-1 ✅ done; P1-2 pending |
| **P2** | Targeted frontend code moves | 2 (was 5; P2-1/2/3 dropped) | 4h | pending |
| **P3** | Audio decomposition (5 stages, 4 new files) | 5 (was 7; bus/swap/announcer absorbed into engine.js) | 13h | pending |
| **P4** | Server decomposition + state merger | 3 (was 4; bootstrap stage dropped) | 6h | pending |
| **P5** | Performance + closing docs + milestone close | 4 (unchanged) | 7-9h | pending |

**Total:** 21 stages / ~45-47h. Of these, **5 stages are already complete** (P0-1 through P0-4 and P1-1); 16 remain.

---

## 4. Phase 0 — Test scaffolding + plan + low-friction extractions (✅ complete)

| Stage | Status | Commit |
|---|---|---|
| **P0-1** | ✅ vitest + happy-dom + wire-format smoke | `316f3f1` + `ffaf1aa` |
| **P0-2** | ✅ M4 plan skeleton + build-hash injection | `f4b1617` |
| **P0-3** | ✅ extract `audio/utils.js` + `audio/constants.js` (lerp removed in pivot commit) | `87c873d` |
| **P0-4** | ✅ tooling cleanup — drop `setup-git-hooks.sh`, merge eslint scripts block | `c7a2be7` |
| ~~**P0-5**~~ | ❌ dropped in 2026-04-27 Occam pivot — no audio baseline captured | (rolled back) |

**Phase Gate:** `npm test && npm run test:frontend && npm run lint && npm run smoke:wire-format` green. `audio-engine.js` 1186 → 1124 lines. `frontend/audio/utils.js` covers `clamp01` / `dbToLinear` / `equalPowerCurves` at 100%.

---

## 5. Phase 1 — Server-side low-hanging fruit (5h)

| Stage | Task | Critical files | Hours | DoD |
|---|---|---|---|---|
| **P1-1** ✅ | Collapse `spatial.js` bucket-range loops into a single pass; remove the `gridData.filter` fallback dead code. | `server/spatial.js`, `server/__tests__/spatial-coverage.test.js` | 2.5h | jest green (154); `npm run benchmark` `wide-area` p99 6.231 → 4.171 ms (-33%); empty-index early-return test added. **Landed in `cc5e427`.** |
| **P1-2** | Add `lcFractions` hash memoization in `server/viewport-processor.js` (M3 audit D.2). Single-entry cache keyed by `lcFractions.map(n => n.toFixed(4)).join(',')`. | `server/viewport-processor.js`, `server/__tests__/viewport-processor.test.js` | 2.5h | `npm run benchmark` average processing time drops 1-2 ms → 0.5-1 ms; new tests cover hit (second call's `elapsedMs` ≈ 0) and miss (different input → recompute). |

Dropped from this phase across the two pivots:

- **Original P1-2** (`http-client-state.js` extraction) — folded into P4-3 merger.
- **Post-pivot P1-2** ("delete `server/types.js`") — dropped after discovering the file is the JSDoc-typedef source for 45 `import('./types').<TypeName>` references across the server codebase. Deletion would break IDE IntelliSense without a real LOC or runtime win. The typedef cleanup it implied (`ModeState` / `DeltaState` becoming obsolete) folds naturally into P4-3.
- `_statsCounter` SIGTERM rewrite + `config.js` IIFE simplification — cosmetic; defer to M5 if ever.

**Phase Gate:** `npm test` green; `npm run smoke:wire-format` passes; **1 phase-close devlog** for P1-2 (P1-1's perf-win devlog already landed). P2 starts on the same branch.

---

## 6. Phase 2 — Targeted frontend code moves (4h)

| Stage | Task | Critical files | Hours | DoD |
|---|---|---|---|---|
| **P2-1** | Move `map.js:341-395` (popup `click` / `mouseenter` / `mouseleave` + popup DOM) into `frontend/popup.js`. Pure code move. | New `frontend/popup.js`; modify `frontend/map.js` | 2h | `map.js` shrinks ~55 lines; popup behavior visually identical (preview screenshot diff). |
| **P2-2** | Move the progress-bar pointer handlers + `updateProgressBar` polling (lines ~108-291 of `main.js`) into `frontend/progress.js`. Pure code move; polling kept (no event-bus per pivot). | `frontend/main.js` (shrinks ~180 lines), new `frontend/progress.js` | 2h | `main.js` 304 → ~125 lines; preview confirms progress-bar drag interaction unchanged. |

Dropped from original P2: P2-1 (`frontend/utils.js`), P2-2 (`event-bus.js`), P2-3 (`lifecycle.js`), and the lifecycle-driven main.js rewrite that was P2-5. main.js stays sequential — no state machine.

**Phase Gate:** `npm run test:frontend` green; preview smoke clean; UI visually unchanged in local dev; **1 phase-close devlog** (covers both moves). P3 starts on the same branch.

---

## 7. Phase 3 — Audio decomposition (13h, the engine room)

**Final shape of `frontend/audio/`:**

```
frontend/audio/
├── constants.js     ── ✅ P0-3 already in place
├── utils.js         ── ✅ P0-3 already in place
├── context.js       ── P3-1 (master chain + 12 connect calls)
├── buffer-cache.js  ── P3-2 (sample loading + Promise.all priority + generation guard)
├── raf-loop.js      ── P3-3 (pure EMA driver — testable in isolation)
└── engine.js        ── P3-4 (composes the rest; swap-timer + bus + announcer routing as named exports inside, testable via mock)
```

**Design decisions (lean version):**

- **`raf-loop.js` is genuinely pure.** Returns a `smoothedSnapshot`; does not call `setValueAtTime`. `engine.js` invokes it from rAF and applies the snapshot. This is the testability win that justifies a separate file.
- **swap-timer / bus / announcer routing stay inside `engine.js`** as named exports (`swapBusVoice`, `scheduleGlobalSwap`, etc.). Testable via the P0-1 audio-context mock without needing separate module boundaries. The original 4-file split was over-engineered for the value.
- **`city-announcer.js` does not move into `audio/`.** Its dwell logic / spatial query / `cities.json` loader stays put; only the `audioCtx.createBufferSource() + panner + gain` snippet moves into `engine.js`.
- **P3-0 makes audio-engine internally lazy** — protects against double `AudioContext` instantiation while modules are being filled in.

| Stage | Task | Critical files | Hours | DoD |
|---|---|---|---|---|
| **P3-0** | Lazy-init refactor: module-top-level `audioCtx` becomes `let audioCtx = null; function ensureCtx() { … }`. Caller-side untouched. | `frontend/audio-engine.js` (internal only) | 2h | No `new AudioContext` at module top level; DevTools confirms no `AudioContext` is created on page load. |
| **P3-1** | Create `audio/context.js` — master chain creation + the 12 connect calls (`grep -c "\.connect(" frontend/audio-engine.js` confirms count). | New `frontend/audio/context.js`, new `frontend/__tests__/audio/context.test.js` | 2h | Mock-based test verifies the connect order matches the pre-refactor wiring; manual preview is identical. |
| **P3-2** | Create `audio/buffer-cache.js` — `loadSample` + `Promise.all` priority loading + generation guard. | New `frontend/audio/buffer-cache.js`, new `frontend/__tests__/audio/buffer-cache.test.js` | 2.5h | Coverage ≥ 70% (including the generation-aborts-fetch path). |
| **P3-3** | Create `audio/raf-loop.js` — pure EMA driver. Returns `{ proximity, velocity, coverage[8] }` without touching audio params. `engine.js` invokes it from its rAF callback and applies the snapshot. | New `frontend/audio/raf-loop.js`, new `frontend/__tests__/audio/raf-loop.test.js`; modify `frontend/audio-engine.js` | 2.5h | Test: 1000 ticks of 16 ms dt converges within ±0.1% of target; coverage ≥ 90%. |
| **P3-4** | Create `audio/engine.js` — composes context / buffer-cache / raf-loop + the remaining swap-timer, BusVoice, LoopSlot, announcer-bus routing as named exports inside this single file. Reduce `frontend/audio-engine.js` to a re-export shim (final deletion in P5-4). | New `frontend/audio/engine.js`, modify `frontend/audio-engine.js` to a re-export shim, new `frontend/__tests__/audio/engine.test.js` | 4h | Local 30-min stress test passes (no clicks/pops); §2.E manual A/B listen confirms zero audible delta; engine.js exposes `start` / `stop` / `update` / `duck` / `unduck` (matching the existing surface); `grep -E "from .*audio-engine" frontend/` shows callers still hit the shim path. |

**Phase Gate:** `frontend/audio/` test coverage ≥ 60% (raf-loop ≥ 90%, buffer-cache ≥ 70%, others as integration); 30-minute continuous-playback stress test on local `npm run dev` clean; §2.E manual A/B listen passes for every stage; the `audio-engine.js` re-export shim is kept on `feat/M4` until P5-4; **per-significant-stage devlogs** for P3-0 / P3-1 / P3-3 / P3-4 (P3-2 buffer-cache is straightforward enough to share P3-1's devlog). P4 starts on the same branch.

---

## 8. Phase 4 — Server decomposition + state merger (6h)

| Stage | Task | Critical files | Hours | DoD |
|---|---|---|---|---|
| **P4-1** | Extract `server/routes.js` — gather every `app.get` / `app.post` handler (`/health`, `/api/config`, `/api/viewport`). | New `server/routes.js`, modify `server/index.js` | 1.5h | HTTP smoke green; `npm run smoke:wire-format` passes; `index.js` -80 lines. |
| **P4-2** | Extract `server/ws-handler.js` — `attachWsHandler` + upstream message routing + broadcast. | New `server/ws-handler.js`, modify `server/index.js` | 2h | WS integration tests green; WS message-type strings unchanged; `index.js` -130 lines. |
| **P4-3** | Merge `mode-manager.js` + `delta-state.js` into a single `server/client-state.js`: combine `{currentMode}` and `{snapshot}` into one `clientState` with one cleanup timer. Inline the `normalizeClientId` / `getHttpClientKey` helpers (P1-2 dropped them as a separate stage). | Promote `server/client-state.js`; delete `server/mode-manager.js` + `server/delta-state.js`; modify `server/index.js`, `server/viewport-processor.js`; adapt `server/__tests__/mode-manager.test.js` + `delta-state.test.js` to verify behavior on the merged module | 2.5h | All jest suites green; one 5-min TTL cleanup timer (down from two); `npm run smoke:wire-format` passes (`mode` field byte-identical). |

Dropped from original P4: P4-1 (`bootstrap.js` extraction). The startup block in `server/index.js` is naturally cohesive — split for the sake of splitting was premature.

**Phase Gate:** `npm test` green; `server/index.js` 516 → ~250 lines; server total LOC 3279 → ~3000; `npm run smoke:wire-format` passes against `main`; **per-significant-stage devlogs** for P4-1 + P4-3 (P4-2 ws-handler can share P4-1's devlog if same day). P5 starts on the same branch.

---

## 9. Phase 5 — Performance + closing docs + milestone close (7-9h)

| Stage | Task | Critical files | Hours | DoD |
|---|---|---|---|---|
| **P5-1** | Add idle detection to `audio/raf-loop.js`: when every EMA has converged (Δ < 0.001) and velocity = 0, skip the frame; preserve a wake mechanism. | `frontend/audio/raf-loop.js` | 2h | Capture an at-time idle CPU baseline (5-min DevTools Performance recording on `npm run dev` _before_ the patch), apply patch, capture a second 5-min recording, verify main-thread CPU drops (target: ≥ 30% drop OR ≤ 3.5% absolute). Convergence speed during interaction unchanged. |
| **P5-2** | Update `docs/ARCHITECTURE.md` (new `audio/` subsystem diagram + server routes/ws-handler/client-state diagram) and `docs/DEPLOYMENT.md` ("Repository layout"). `CLAUDE.md` is gitignored (M3 audit E.1) — not touched. | `docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md` | 2.5h | Both docs match the code; two new diagrams added. |
| **P5-3** | Write the M4 summary at `docs/plans/M4/2026-XX-XX-M4-summary.md` (English). The M3 tech-debt-audit carryover (Appendix A) is included. Add the closing devlog. | New `docs/plans/M4/2026-XX-XX-M4-summary.md`, new `docs/devlog/M4/<date>-M4-summary.md`, `docs/DEVLOG.md` index | 2h | This proposal moves to `Status: Completed`; summary records actual vs planned hours. |
| **P5-4** | **Closing audit + cleanup + milestone close.** Grep-verify quantitative targets; **delete `frontend/audio-engine.js` re-export shim**; list any unmet targets in `docs/devlog/M4/<date>-M4-residual-debt.md` as M5 candidates; final commit `chore(M4): close milestone 4 — razor refactor complete` then merge `feat/M4` → `main`. | Delete `frontend/audio-engine.js`, new `docs/devlog/M4/<date>-M4-residual-debt.md` | 1h | Each §11 target marked ✅ or ⏭️; `audio-engine.js` no longer exists; the M4 closing commit is on `main`; post-merge prod soak ≥ 24h with no regression report. |

**Phase Gate (M4 milestone close).** Every quantitative target either achieved or explicitly deferred to M5; `frontend/audio-engine.js` does not exist; the draft `feat(M4)` PR is merged to `main`; **3-4 closing devlog entries** (P5-1, P5-2/3 combined, P5-4 closing, residual-debt). Total M4 ledger: ~12-15 devlog entries (down from the original 30, per §2.B revision).

---

## 10. Wire-format Contract (must hold throughout M4)

The concrete rule-2.A inventory. Server changes during M4 may **only add fields**; the names / types / paths below are frozen.

> ✅ **Verified 2026-04-27 by P0-1** against `server/index.js` (HEAD `899f4bd`) and `server/spatial.js` `buildStatsResult` + `server/viewport-processor.js`. Runtime expression: `scripts/wire-format-baseline.json` + `scripts/smoke-wire-format.js`.

### HTTP routes & response fields (verified)

| Path | Method | Response fields | Note |
|---|---|---|---|
| `/health` | GET | `ok`, `dataLoaded` | smoke gate; CI relies on `dataLoaded: true` |
| `/api/config` | GET | `gridSize`, `landcoverMeta` | M4: field names frozen |
| `/api/viewport` | POST | 17-field stats payload + `error` on 400/503 | M4: field names frozen |
| `/data/cities.json` | GET | static file | path frozen |
| `/tiles/*` | GET | PMTiles static | path frozen |

`/api/viewport` 200 response keys (frozen): `dominantLandcover`, `nightlightNorm`, `populationNorm`, `forestNorm`, `avgForestPct`, `avgPopulationDensity`, `avgNightlightMean`, `avgNightlightP90`, `gridCount`, `landcoverDistribution`, `landcoverBreakdown`, `theoreticalGridCount`, `landCoverageRatio`, `mode`, `perGridThresholdEnter`, `perGridThresholdExit`, `audioParams`.

### WebSocket messages (verified)

| Direction | `type` | Fields |
|---|---|---|
| inbound | `viewport` | `bounds` (4-element array), `zoom` (optional) |
| outbound | `stats` | unicast: same 17 keys as HTTP `/api/viewport`; broadcast: minus `mode` plus `broadcast: true`; loading: `loading: true`, `message` |
| outbound | `error` | `error` (string) |

`npm run smoke:wire-format` verifies every row by static grep over `server/**/*.js`.

---

## 11. Quantitative targets (post-pivot)

| Indicator | M3 baseline | M4 target | Verification |
|---|---|---|---|
| `audio-engine.js` single-file existence | 1186 lines | **does not exist** (P5-4 deletes the shim) | `ls frontend/audio-engine.js` returns "No such file" |
| Largest single file under `audio/` | — | ≤ 800 lines (engine.js absorbs swap/bus/announcer) | `wc -l frontend/audio/*.js` |
| `server/index.js` | 516 lines | ≤ 250 lines | `wc -l` |
| `frontend/main.js` | 304 lines | ≤ 150 lines (P2-2 moves progress wiring out) | `wc -l` |
| `audio/utils.js` coverage | 100% | ≥ 90% (preserve) | `vitest --coverage` |
| `audio/raf-loop.js` coverage | 0% | ≥ 90% | `vitest --coverage` |
| `audio/buffer-cache.js` coverage | 0% | ≥ 70% | `vitest --coverage` |
| `audio/context.js` coverage | 0% | ≥ 70% (mock-based) | `vitest --coverage` |
| `audio/engine.js` coverage | 0% | ≥ 50% (integration) | `vitest --coverage` |
| Audio idle main-thread CPU | (no captured M3 baseline) | P5-1 captures at-time before/after; verify drop ≥ 30% OR ≤ 3.5% absolute | DevTools 5-min idle Performance at P5-1 |
| Audio audible regression | — | none — verified by §2.E manual A/B listen on every audio-touching commit | listen + devlog code review |
| Server `wide-area` p99 | 6.231 ms | ≥ 5% lower (P1-1 spatial collapse) | `npm run benchmark` |
| Server `viewport-processor` p95 (median scenario) | 0.79 ms (land-dense) | ≤ 0.5 ms (P1-2 lcFractions memo) | `npm run benchmark` |
| Server total LOC | 3279 | ~3000 | `wc -l server/**/*.js` |

Dropped from original §11: cold-start FCP (no captured baseline), audio LUFS / spectrogram / RMS (no recordings), `frontend/utils.js` / `lifecycle.js` / `event-bus.js` coverage (modules not built per pivot), `progress.js` and `city-announcer.js` coverage (no test files mandated; covered if/when convenient).

---

## 12. Risk register

| Risk | Severity | Mitigation | Rollback |
|---|---|---|---|
| **P5-4 big-bang merge surfaces multiple latent regressions at once** | **Critical** | Every prior stage's local Phase Gate stays strict; `feat/M4` keeps `npm test && npm run test:frontend && npm run lint && npm run smoke:wire-format` green at every commit; §2.E manual A/B listen run at P5-4 against `feat/M4` HEAD; preview-URL stress tested before marking PR ready | Tag the fail point, revert the merge, bisect on `feat/M4` |
| P3 swap-timer / bus split causes crossfade-timing glitches | High | P0 mock + 30-min local stress + §2.E A/B listen + the `audio-engine.js` re-export shim kept until P5-4 | Revert P3 commits before merge to `main` |
| P3-4 absorbs too much into `engine.js` and the file becomes hard to navigate | Medium | If `engine.js` exceeds 800 lines, split out the next-largest cohesive chunk (swap-timer is the natural candidate); decision at P3-4 implementation time | Stage-level revert on `feat/M4`; pull swap-timer into its own file later |
| P3-6 deletion of legacy `audio-engine.js` shim exposes a missed import path | High | Land as a re-export shim first; grep every `audio-engine` reference before P5-4 deletion | Restore the shim on `feat/M4` |
| Double `AudioContext` instantiation during P3-0..P3-4 | High | P3-0 enforces lazy-init internally | Revert offending stage commit |
| happy-dom missing Web Audio API + Mapbox WebGL | Medium | P0-1 hand-rolled mock for audio; `map.js` / `popup.js` / `websocket.js` excluded from coverage | None (design constraint) |
| Wire-format regression at P5-4 surprises an open user session | Medium | `npm run smoke:wire-format` run at P5-4 close; if any field renamed across full M4 diff, document so users refresh | Hotfix on `main` re-aliases the old name |
| P4-3 mode/delta merger violates an assumed independence | Medium | Adapt the existing mode-manager / delta-state tests to verify equivalent behavior on the merged module | Revert P4-3 commits |
| Hotfix collides with `feat/M4` | Medium | Hotfix → `main` directly; `feat/M4` rebases `main` after each | Hotfix takes priority; rebase resolves |
| `feat/M4` and `main` diverge for ~3-4 weeks; rebase friction grows | Medium | Rebase `feat/M4` onto `main` after each hotfix | If rebase becomes painful, fall back to merge commit at P5-4 |
| `placeecho.com` users mid-session during P5-4 deploy | Low | Pages atomic switchover = 0 downtime; build-tag banner identifies active version | None |

---

## 13. Critical files

- [frontend/audio-engine.js](../../../frontend/audio-engine.js) — P0-3 extracts utils/constants; P3-0 makes it lazy; P3-4 collapses it to a re-export shim; P5-4 deletes it.
- [frontend/main.js](../../../frontend/main.js) — P0-2 added the build-tag banner; P2-2 moves progress wiring out.
- [server/index.js](../../../server/index.js) — P4-1 / P4-2 extract routes + ws-handler; index.js stays as the express setup + bootstrap entry.
- [server/mode-manager.js](../../../server/mode-manager.js) + [server/delta-state.js](../../../server/delta-state.js) — P4-3 merges and removes both.

---

## 14. Phase-gate dependency matrix

Under single-branch cadence, phase order is preserved but no per-phase prod soak applies.

| Phase | Depends on | Parallelizable with |
|---|---|---|
| P0 | — | ✅ all 4 stages complete |
| P1 | P0 complete | None |
| P2 | P1 complete | None |
| P3 | P2 complete + audio/utils + audio/constants in place (P0-3 done) | P3-0 must precede P3-1..P3-4; P3-1 / P3-2 mutually independent |
| P4 | P3 complete | P4-1 / P4-2 mutually independent (different files); P4-3 last |
| P5 | P4 complete | P5-2 / P5-3 (docs) parallel with P5-1. P5-4 is the **only** stage that touches `main`. |
| **Hotfix (any time)** | — | Always wins. Hotfix → `main` directly; `feat/M4` rebases afterward. |

---

## Appendix A — M3 tech-debt-audit carryover

[M3 tech-debt audit](../../devlog/M3/2026-04-23-M3-tech-debt-audit.md) line items, mapped to their M4 / M5 owners (post-pivot):

| Item | Description | Disposition |
|---|---|---|
| A.1 | `frontend/__tests__/` does not exist | ✅ M4 P0-1 (vitest + happy-dom) |
| B.6 | rAF loop runs unconditionally | ✅ M4 P5-1 (idle detection) |
| C.4 | Boot-time asset warnings only reach server stdout | ⏭️ M5 (frontend WS protocol extension required) |
| D.1 | `_statsTimer` runs even when `dataLoaded=false` | ⏭️ M5 (cosmetic; pivot dropped this from P1) |
| D.2 | `viewport-processor` doesn't memoize `lcFractions` | ✅ M4 P1-2 |
| D.3 | `delta-state` TTL expiry has no test | ✅ M4 P4-3 (post-merger coverage) |
| D.4 | `CACHE_SCHEMA_VERSION` has no migration changelog | ⏭️ M5 (small standalone task) |
| D.5 | mode/delta TTL timers diverge | ✅ M4 P4-3 |
| E.2 | `cities.json` lacks a schema | ⏭️ M5 (small standalone task) |

---

## Appendix B — Out of scope for M4

To prevent scope creep:

- ❌ **No deployment-architecture changes** (Pages + R2 + Worker + Fly).
- ❌ **No `gee-scripts/` archival** — purely cosmetic.
- ❌ **No PMTiles Worker proxy optimization** — M5.
- ❌ **No H3 / quadtree replacement of `spatial.js` bucketing** — deprecated M3 P2 scope.
- ❌ **No Cloudflare Cache Rule fix** — M5.
- ❌ **No frontend WS protocol extension** — needs design; M5.
- ❌ **No rewrite of `city-announcer.js` business logic.**
- ❌ **No Mapbox style / dot-rendering changes** — M3 settled this.
- ❌ **No `CLAUDE.md` update** — gitignored local AI-agent config.
- ❌ **No `frontend/utils.js` / `event-bus.js` / `lifecycle.js`** — dropped in 2026-04-27 pivot; revisit only if a concrete pain point demands them.
- ❌ **No audio LUFS / spectrogram regression baseline** — dropped in pivot; §2.E manual A/B listen replaces it.
