# Milestone 4 — Occam's Razor Refactor Proposal

**Author:** Zixiao Wang (Halic)
**Date:** 2026-04-27
**Status:** Active
**Companion docs:**
- `docs/DEVLOG.md` — per-stage devlog entries indexed under M4
- `docs/plans/M4/baseline/baseline-notes.md` — P0-5 audio + performance baseline configuration
- `docs/plans/M4/P*/` — per-stage execution files (created lazily as stages are picked up)

---

## 1. Context

`placeecho.com` has been live in production since the close of M3 (UX/audio iteration + production deployment + PlaceEcho brand mark). A repository-wide audit ("muck level" assessment, ~6.0/10) surfaced three structural problems that the day-to-day devlog stream is not equipped to resolve:

1. **`frontend/audio-engine.js` is 1186 lines (~41% of frontend code).** A single file owns the audio context, master chain, multiple buses, the buffer LRU, the rAF loop, the swap timer, and 45+ internal helpers, plus residual experimental code from the April dot-color / tile-LOD / gain iterations. Module-level `let` state ties every subsystem together: nothing can be tested in isolation, and any subsystem failure is a single point of failure for the whole page.
2. **`server/index.js` is 516 lines and mixes responsibilities.** HTTP routes, the WebSocket handler, and the boot sequence share one file. `server/mode-manager.js` and `server/delta-state.js` parallel each other almost line-for-line (~130 lines of duplication: two cleanup timers, two `normalizeClientId` variants).
3. **M3 has no `docs/plans/M3/` directory.** It was tracked entirely through devlog entries, which broke the Milestone → Phase → Stage hierarchy that `CLAUDE.md` defines and that M1 / M2 followed. M4 must restore that hierarchy.

M4 is not maintenance. It is a deliberate **decomposition** pass driven by Occam's razor — pull `audio-engine` apart into testable subsystems, end the dual-subscription event web on the frontend, merge the parallel server state layer, and stand up the test infrastructure that any further refactor will depend on. By the close of M4, the largest single file drops from 1186 lines to ≤ 200, and the critical frontend subsystems carry ≥ 80% unit-test coverage (up from 0%).

**Cadence rule (revised 2026-04-27).** M4 ships as a **single long-lived branch** (`feat/M4`). All 29 stages commit to that branch in order; nothing merges to `main` until P5-4. `placeecho.com` runs the M3 `main` codebase throughout the ~5-7 week M4 execution window; only at M4 close does the entire refactor reach prod as one big-bang merge. This trades the per-phase prod-soak safety net for branch-management simplicity — every stage's risk is deferred to the final merge, but `main` never carries half-finished refactor work and there are no frontend-vs-server version skews to manage during execution.

---

## 2. Discipline (operative rules during M4)

The 29 stages of M4 are governed by the following rules. They take precedence over "is the feature correct?" because their job is to keep `placeecho.com` from regressing while the engine room is open.

### 2.A. Wire-format compatibility — relaxed under single-branch cadence

**Why it changed (2026-04-27).** Originally this rule existed because per-phase PRs would put a newer server on prod while the older frontend kept running in users' tabs — a recipe for silent field renames to break live sessions. With the single-branch cadence (all of M4 merges atomically at P5-4), frontend and server always reach prod together. The "legacy frontend + new server" middle ground does not exist during M4 execution.

**Rule (revised).** Wire-format changes during M4 are **not blocked** during execution — but P5-4 must still verify that the version of `placeecho.com` after M4 merge is internally consistent. P0-1 still creates `scripts/smoke-wire-format.js`; it now serves as a **regression check** rather than a per-stage gate:

- run during P0..P5 stages whenever server routes / WS message types / response fields change, to catch unintentional field renames within a single stage's diff
- run as part of P5-4 closing audit against `main` to catch any field churn that accumulated across all of M4 vs the M3 baseline (this is the only place the legacy frontend matters: a user with the page open on `placeecho.com` at the moment of M4 merge will trigger a WS reconnect; if message field names changed, the open session breaks until reload)

The smoke is therefore still useful at the **M4 close boundary** (M3 → M4 transition for any active session) even though it is not gating during execution.

**Note on `npm run smoke`** (existing): runs `scripts/smoke-worldcover.js`, a data-pipeline smoke. It does **not** verify the WS protocol. P0-1 still introduces the wire-format smoke as a separate `npm run smoke:wire-format` script.

### 2.B. Every stage gets a devlog entry

`CLAUDE.md` requires that refactors create devlog entries. Before opening any stage, read `docs/DEVLOG.md` § Recording Guide (mandatory pre-flight). Each entry:

- file path: `docs/devlog/M4/YYYY-MM-DD-M4-<short-title>.md`
- heading: `# YYYY-MM-DD — <Category>: <Short Title>` where Category is one of `Refactor` / `Feature` / `Fix` / `Design` / `Milestone` / `Discussion`
- index link added in `docs/DEVLOG.md` § Entries

### 2.C. Commit message template

Conventional Commits + project scope (`CLAUDE.md`). M4 stages use the `M4/P<n>` scope:

| Scenario | Example |
|---|---|
| Extract a submodule | `refactor(M4/P3): extract audio/raf-loop pure EMA driver` |
| Remove dead code | `refactor(M4/P1): remove server/types.js empty file` |
| Performance | `perf(M4/P5): skip raf-loop frame when EMA converged` |
| Test infrastructure | `test(M4/P0): introduce vitest + happy-dom for frontend tests` |
| Tooling | `chore(M4/P0): consolidate eslint config into per-area blocks` |
| Documentation | `docs(M4/P5): document audio subsystem decomposition in ARCHITECTURE` |
| Milestone close | `chore(M4): close milestone 4 — razor refactor complete` |

A `DEVLOG-REVIEWED: YYYY-MM-DD` footer signals the matching devlog entry exists. **No `Co-Authored-By` trailers** — `CLAUDE.md` § Authorship is absolute.

### 2.D. Hotfix priority

The 5-7 week window will see incidental hotfixes. Hotfixes branch from `hotfix/<short-title>` and merge directly to `main` — they ship to `placeecho.com` independently of M4. After a hotfix lands, **`feat/M4` must `git rebase main`** to absorb the hotfix; the rebase resolves any conflicts before the next M4 stage commit. There is no longer a "post-hotfix soak before the next M4 PR can merge" rule, because no M4 PR merges until P5-4 anyway.

### 2.E. Audio reference recording + performance baseline

M4 is a pure refactor. The audible target is **zero perceptible change**, with idle CPU ideally lower. `vitest` cannot assert "still sounds the same", so P0-5 captures a baseline that every audio stage compares against.

Baseline artifacts (produced by P0-5; archived to `~/Documents/M4-baseline/`, **not committed**):

- 5 × 30 s WAV recordings at five geographically distinct megacities (Beijing 39.9N 116.4E, Los Angeles 34.05N -118.24W, London 51.5N -0.13W, Sydney -33.87S 151.21E, Cairo 30.04N 31.24E). Each clip is structured as 10 s static + 10 s dragging + 10 s announcer-trigger dwell — chosen so all five segments contain announcer activity (every site is a population > 1M city in `cities.json`).
- 1 × 5-minute idle Chrome DevTools Performance JSON.
- A baseline number table: main-thread CPU median, per-segment LUFS, loop-seamlessness rating.

**Recording method (preferred, deterministic):** a console-driven `MediaRecorder` snippet that captures the audio context output for 30 s and downloads the result as WAV / WebM Opus. Backup: BlackHole + Audacity on macOS. **Not OBS** (the system-mix is not separable on playback). `scripts/record-audio-baseline.html` (P0-5 deliverable) is the unified entry point.

**DoD on every audio-touching phase (P3, P5-1):** record the same 5 segments, compare LUFS via `ffmpeg loudnorm` (Δ ≤ 0.5 LU), spectrogram visual diff (PNG attached to PR), and waveform RMS (Δ ≤ 1%).

### 2.F. Build-tag in the frontend bundle

P0-2 (this stage) extends `scripts/build-pages.js` so that `dist/config.runtime.js` carries `buildHash` (short git SHA) and `buildTime` (ISO timestamp). On boot the frontend logs `[PlaceEcho] build <hash> deployed <iso>`. **No hard-coded phase tag**: phase context is recoverable from the commit message (the `M4/P<n>` scope).

### 2.G. Plan iteration during execution

Once P0-2 lands, the local Chinese plan at `~/.claude/plans/m-milestone-linked-pine.md` is **superseded**. All further plan iteration happens in this file. Each adjustment commits as `docs(M4): adjust <which> plan after <reason>`.

### 2.H. Meaning of stage hours

**The `Hours` column in stage tables includes:** code + unit tests + manual smoke / preview verification + 90 s audio regression (where applicable) + devlog entry + commit/push to the `feat/M4` branch.
**The `Hours` column excludes:** CI runtime per push (a few minutes each), the eventual P5-4 final review.

**No per-stage soak window** under the single-branch cadence — the next stage commits to `feat/M4` as soon as the current stage's hours are spent and verification passes locally. Wall-clock estimate is now ~5-7 weeks (down from the original 7-9 week per-phase estimate, since prod-soak windows no longer apply).

### 2.H.bis. Single-branch workflow (revised 2026-04-27)

- All M4 work goes onto **`feat/M4`** — one branch from P0-1 through P5-4.
- Every stage is one or more commits with `<type>(M4/P<n>): <subject>` headers (rule 2.C).
- Pushes happen frequently to keep `origin/feat/M4` reflecting current state and so a draft PR can render the running diff for review.
- A single **draft PR** (`feat(M4): razor refactor (in progress)`) tracks `feat/M4` against `main`. P5-4 marks it ready and merges it.
- Hotfixes still target `main` directly; `feat/M4` rebases `main` after each hotfix lands (rule 2.D).
- `placeecho.com` runs the M3 `main` codebase throughout. The first time M4 reaches prod is the P5-4 merge.

---

## 3. Phases overview

| Phase | Theme | Stages | Hours | Key risks | Reaches prod |
|---|---|---|---|---|---|
| **P0** | Test scaffolding + plan skeleton + baseline capture | 5 | 12h | Dual `AudioContext` (mitigated by P3-0); `vitest@^3` lock for Node 18 compat; `smoke:wire-format` design | Not until P5-4 |
| **P1** | Server-side low-hanging fruit | 4 | 11h | jest 154 tests must stay green; `npm run benchmark` regressions | Not until P5-4 |
| **P2** | Frontend skeleton + lifecycle rewrite | 5 | 11–13h | Mapbox/Web Audio not testable in happy-dom; `map.js` dual-subscription cleanup | Not until P5-4 |
| **P3** | Filling out the `audio/` subsystem | 7 | 15–18h | Dual `AudioContext`; pure-function boundary for the rAF loop; swap-timer drift; audio-reference comparison | Not until P5-4 |
| **P4** | `server/index.js` decomposition + state-layer merge | 4 | 8–10h | Wire-format regression vs M3 (caught by `smoke:wire-format`) | Not until P5-4 |
| **P5** | Performance tuning + closing docs + carryover audit + milestone closing + first prod merge | 4 | 7–9h | Correctness of rAF idle detection; **P5-4 is the first time M4 hits prod — every M4 stage's risk surfaces here at once** | **Yes (P5-4 = first prod deploy of M4)** |

**Total:** 29 stages / 64–73h / 5-7 weeks at ~10h/week (no per-phase soak windows under single-branch cadence; only hotfix rebases interleave).

---

## 4. Phase 0 — Test scaffolding + plan skeleton + baseline capture (12h)

| Stage | Task | Critical files | Hours | DoD |
|---|---|---|---|---|
| **P0-1** | Introduce `vitest@^3` + `happy-dom` (vitest 4 requires Node ≥ 20.19, incompatible with current CI matrix `[18, 22]`; lock vitest 3.x for Node 18+ compat). Add `npm run test:frontend` and `npm run smoke:wire-format`. Modify `.github/workflows/ci.yml` to add a `npm run test:frontend` step inside the existing `test` job (keep 2 jobs total, no new job), running on Node 18 + 22. Create `scripts/smoke-wire-format.js` — grep `/health`, `/api/config`, `/api/viewport` field names + WS send/recv field names diff against `main` (after P0-1 verifies the actual route list). Hand-write `frontend/__tests__/_helpers/audio-context-mock.js` (happy-dom does not implement Web Audio API; mock must cover every API used by audio-engine: `createGain`, `createBufferSource`, `createPanner`, `createBiquadFilter`, `createBuffer`, `createDynamicsCompressor`, `currentTime`, `sampleRate`, `destination`, `suspend`, `resume`, `close`, `decodeAudioData` — every method returns a mock node carrying a `connect` spy). Devlog entry must record the dependency-introduction approval trail. | `package.json`, new `vitest.config.js`, `.github/workflows/ci.yml`, new `frontend/__tests__/_helpers/audio-context-mock.js`, new `scripts/smoke-wire-format.js`, new `frontend/__tests__/audio/_smoke.test.js` | 3.5h | `npm run test:frontend` runs one DOM smoke + one mock-audio smoke; `npm run smoke:wire-format` passes; CI `test` job runs jest + vitest + smoke:wire-format green; devlog records the vitest version-lock rationale. |
| **P0-2** | Stand up the `docs/plans/M4/` skeleton + write the English proposal (this file). Inject build-time commit hash into `frontend/config.runtime.js` (the existing `scripts/build-pages.js` already generates this file; only ~5 lines added — `buildHash = execSync('git rev-parse --short HEAD')` + `buildTime = new Date().toISOString()`). Frontend boot logs the banner. Mark the local Chinese plan as superseded (rule 2.G). | New `docs/plans/M4/2026-04-27-M4-razor-refactor-proposal.md`, new `docs/plans/M4/P{0..5}/` directories, `docs/DEVLOG.md` index, `scripts/build-pages.js` (~5-line inject), `frontend/config.runtime.example.js` (document `buildHash` field), `frontend/main.js` (one-line console banner reading `runtimeConfig.buildHash`) | 3h | `ls docs/plans/M4/P{0..5}` succeeds; this proposal aligns with the local Chinese plan; running `node scripts/build-pages.js` produces a `dist/config.runtime.js` containing `buildHash` + `buildTime`; the browser console reports `[PlaceEcho] build <8-char-hash> deployed <ISO>`; local Chinese plan carries a "superseded" notice on top. |
| **P0-3** | Extract `frontend/audio/utils.js` (`clamp01` specialization, `lerp`, `dbToLinear`, `equalPowerCurves`) + `frontend/audio/constants.js` (12 timing constants + `BUS_PREAMP_GAIN` + limiter knobs). **Pure code move; zero behavior change.** `clamp01(x) = clamp(x, 0, 1)` is the audio-path specialization; the generic `clamp(min, max, x)` lives in `frontend/utils.js` (P2-1). The audio code uses `clamp01`; non-audio code uses generic `clamp`. P0-3 creates the `audio/` directory; P3 fills it. | New `frontend/audio/utils.js`, new `frontend/audio/constants.js`, new `frontend/__tests__/audio/utils.test.js`; modify `frontend/audio-engine.js` (top ~145 lines) | 2h | `audio-engine.js` shrinks by ~145 lines; utils functions hit 100% coverage; manual preview confirms identical audible behavior. |
| **P0-4** | Tooling cleanup: delete `scripts/setup-git-hooks.sh` (the `.js` version stays). Consolidate `eslint.config.js` from 6 blocks down to ≤ 5: server + scripts merged into one Node CJS block, frontend src block, frontend tests block (vitest globals), `frontend/config.local.js` block. Original 6 → 5 (not 4 — frontend tests need their own globals). | Delete `scripts/setup-git-hooks.sh`, modify `eslint.config.js`, update `README.md` references | 1.5h | `npm run lint` green; `npm run setup:hooks` still works; root file count drops by one; `eslint.config.js` block count ≤ 5. |
| **P0-5** | Capture audio + performance baseline (rule 2.E). Build `scripts/record-audio-baseline.html` (one button per city, MediaRecorder + auto-download). Record the 5 × 30 s WAV files (Beijing / Los Angeles / London / Sydney / Cairo — five megacities so every clip captures announcer activity). Capture a 5-minute idle Chrome DevTools Performance JSON. Write the configuration into `docs/plans/M4/baseline/baseline-notes.md` (macOS version, Chrome version, CPU model, Mapbox zoom, timestamps). | New `scripts/record-audio-baseline.html`, new `docs/plans/M4/baseline/baseline-notes.md` (text-only into git; WAV + JSON archived externally to `~/Documents/M4-baseline/`) | 2h | Five WAVs + one Performance JSON archived externally; spectrograms confirm announcer voice formants at the 18-22 s mark on every clip (sanity check); `baseline-notes.md` documents reproducible recording configuration. |

**Phase Gate (local — no prod merge).** `npm test && npm run test:frontend && npm run lint` all green; `audio-engine.js` shrinks 1186 → ~1040 lines; baseline number table complete; **5 devlog entries** committed to `feat/M4`; the local Chinese plan carries a "superseded" notice and this proposal takes over. P0 work continues toward P1 on the same `feat/M4` branch with no prod soak.

---

## 5. Phase 1 — Server-side low-hanging fruit (11h)

| Stage | Task | Critical files | Hours | DoD |
|---|---|---|---|---|
| **P1-1** | Collapse `spatial.js` bucket-range loops into a single pass; remove the `gridData.filter` fallback dead code. **Design note:** `spatialIndex` is always truthy after `loadGridData()`, so the fallback never executes. After removal, retain an empty-index early return — when `spatialIndex.size === 0` (theoretical edge case), return an empty array instead of falling back to the O(N) filter. P1-1 verifies current line numbers in `spatial.js` before editing (M3 may have shifted them). | `server/spatial.js` (line range to be re-verified at execution time), `server/__tests__/spatial.test.js`, `server/__tests__/spatial-coverage.test.js` | 2.5h | jest green; `npm run benchmark` shows viewport-tick p95 ≥ 5% lower; one new test covers the empty-index early return path. |
| **P1-2** | Extract `server/http-client-state.js` — a shared module exposing `normalizeClientId`, a `createTtlCleanup` factory, and `getHttpClientKey`. **Keep `mode-manager.js` and `delta-state.js` as files** for now; the genuine merger waits for P4-4. | New `server/http-client-state.js`, new `server/__tests__/http-client-state.test.js`; modify `server/mode-manager.js`, `server/delta-state.js`, `server/index.js` | 3.5h | `mode-manager` / `delta-state` export shape unchanged (diff verified); server -60 lines; **residual `mode-manager.js` / `delta-state.js` line count estimated ≤ 100 each** (mode-manager 169 - 30 ≈ 139 trimming further to ~110; delta-state 126 - 30 ≈ 96). If the residue is little more than getters/setters, log this in the devlog so P4-4 can promote the merger early. |
| **P1-3** | Delete `server/types.js` (104-line empty file). Convert `_statsCounter` from a 30 s polling logger to a SIGTERM/SIGINT-flushed dump. Replace the IIFE-heavy `config.js` constant initializer with plain helper functions. | Delete `server/types.js`; modify `server/index.js:80-90`, `server/config.js:204-218` | 2.5h | `grep -r "require\\('\\./types'\\)" server/` returns nothing; `[Stats]` log lines no longer appear after 30 s of idle uptime; server -50 lines; new test asserts SIGTERM triggers the stats flush. |
| **P1-4** | Add `lcFractions` hash memoization in `server/viewport-processor.js` (M3 tech-debt audit D.2). **Strategy:** cache key = `lcFractions.map(n => n.toFixed(4)).join(',')` (8 floats joined; precise enough to discriminate, cheap enough not to blow up). **Single-entry cache** (last input + last output); on miss, recompute and replace. Single-entry behavior fits the viewport-tick stream where consecutive identical `lcFractions` are common, with zero memory growth. Promote to multi-entry only if real workload demands it. | `server/viewport-processor.js`, `server/__tests__/viewport-processor.test.js` | 2.5h | `npm run benchmark` average processing time drops 1-2 ms → 0.5-1 ms; new tests cover hit (second call's `elapsedMs` ≈ 0) and miss (different input → recompute). |

**Phase Gate (local — no prod merge).** `npm test` green; server LOC 3279 → ~3070; local manual smoke (drag 5 s + audio toggle + info-panel update); `npm run smoke:wire-format` passes against `main` (catches accidental field renames during P1's diff); **4 devlog entries** committed to `feat/M4`. P2 starts on the same branch.

---

## 6. Phase 2 — Frontend skeleton + lifecycle rewrite (11–13h)

| Stage | Task | Critical files | Hours | DoD |
|---|---|---|---|---|
| **P2-1** | Create `frontend/utils.js` (DOM/math helpers: generic `clamp(min, max, x)`, `debounce`, `querySelectorRequired`). Distinct from `audio/utils.js` (which carries the `clamp01` specialization). | New `frontend/utils.js`, new `frontend/__tests__/lib/utils.test.js` | 1h | Coverage ≥ 90%; `Math.max(0, Math.min(1, x))` patterns outside audio-engine reduced to zero. |
| **P2-2** | Create `frontend/event-bus.js` (~40-line minimal pub/sub) + tests. Publish the **event roster** (§ 6.1) to the PR description and to this proposal — explicit per-event decisions on bus vs direct callback. | New `frontend/event-bus.js`, new `frontend/__tests__/lib/event-bus.test.js`; update this proposal with the event roster | 2h | `on` / `off` / `emit` coverage ≥ 90%; event roster captured in this proposal. |
| **P2-3** | Create `frontend/lifecycle.js` — `bootstrap → ready → interactive` three-phase state machine. **Legal transitions only:** `bootstrap → ready` and `ready → interactive`. **Illegal:** skip-level (`bootstrap → interactive`), backwards (`ready → bootstrap`, `interactive → ready`), repeat (`interactive → interactive`), post-terminal (`interactive → *`). All illegal transitions throw `LifecycleTransitionError`. **Attach a P2-5 dry-run** as a comment block inside `lifecycle.js` so P2-5 is unlikely to discover a design mismatch and have to re-do P2-3. | New `frontend/lifecycle.js`, new `frontend/__tests__/lib/lifecycle.test.js` | 2.5h | Three-state happy-path tests + four illegal-transition tests; dry-run comment covers every wiring concern in current `main.js`. |
| **P2-4** | Move `map.js:341-395` (popup `click` / `mouseenter` / `mouseleave` + popup DOM) into `frontend/popup.js`. | New `frontend/popup.js`; modify `frontend/map.js` | 2h | `map.js` shrinks 395 → ~340; popup behavior visually identical (preview screenshot diff). |
| **P2-5** | Apply `lifecycle` in `main.js`: `bootstrap` (DOM cache + `getClientId` + Mapbox token) → `ready` (`await loadServerConfig + await initMap`) → `interactive` (attach handlers + `connectWebSocket` + announcer subscribes via event-bus). Extract the progress-bar wiring into `frontend/progress.js` (preserve polling for now; the event-driven rewrite lands in P3-3). **Migration table** (§ 6.2) is normative; **verify each line range against the actual `main.js` HEAD before editing** (M4 hotfixes may have shifted them). | `frontend/main.js`, `frontend/map.js` (`initMap` → async, viewport events go through event-bus), `frontend/city-announcer.js` (subscribe via event-bus), new `frontend/progress.js`, new `frontend/__tests__/dom/progress.test.js` | 3.5h | `main.js` 292 → ≤ 150 (every entry in the migration table reconciled); `map.js` emits the move event exactly once; `progress.js` coverage ≥ 70% (pointer events are simulatable in happy-dom); cold-start FCP within ±5% of P0-5 baseline; preview smoke checklist passes. |

**Phase Gate (local — no prod merge).** `npm run test:frontend` green (utils + event-bus + lifecycle + progress all meet their coverage targets); preview smoke clean; UI visually unchanged in local dev; **5 devlog entries** committed to `feat/M4`. P3 starts on the same branch.

### 6.1. Event roster (P2-2 deliverable)

| Event | Source | Consumers | Decision |
|---|---|---|---|
| `viewport:moveend` | `map.js` | `main.js` (state.runtime.viewport), `city-announcer.js` (dwell trigger), `audio-engine.js` (param commit) | **Bus** (multi-consumer) |
| `viewport:move` | `map.js` | `city-announcer.js` (flyby trigger), `audio-engine.js` (motion update) | **Bus** (multi-consumer) |
| `audio:start` / `audio:stop` | `main.js` toggle | `audio-engine.js`, `city-announcer.js` (reset), `ui.js` (status) | **Bus** (multi-consumer) |
| `data:ready` | `websocket.js` | `main.js` (renderLoadingUI), `audio-engine.js` (start) | **Bus** (multi-consumer) |
| `audio:loop:progress` | `audio/engine.js` (P3-3) | `progress.js` | **Bus** (replaces polling) |
| `stats:counter` | `viewport-processor` upstream | `ui.js` | **Direct callback** (single consumer) |
| `error:*` | various | top-level handler in `main.js` | **Direct callback** (single sink) |

### 6.2. `main.js` migration table (P2-5 — must reach ≤ 150 lines)

> Line numbers come from the audit findings. **P2-5 must re-verify each range against current `main.js` HEAD** before editing — hotfixes during M4 will shift them.

| Section | Current line range (verify) | Destination | Δ lines |
|---|---|---|---|
| `state.els` initialization | 32–52 | `lifecycle.bootstrap()` | -20 |
| Mapbox token validation | 57–66 | `lifecycle.bootstrap()` | -10 |
| `loadServerConfig` | 69 | `lifecycle.ready()` | 0 |
| `initMap` | 71 | `lifecycle.ready()` (await) | 0 |
| Announcer move/moveend hookup | 85–86 | `interactive` + event-bus subscription | -2 |
| `connectWebSocket` callback chain | 89–105 | `lifecycle.interactive()` | -15 |
| `getAnnouncerArgs()` closure | 74–84 | Removed (map.js exposes viewport state internally) | -10 |
| Progress-bar pointer handlers (5 of them) | 108–216 (excluding 217–237) | `frontend/progress.js` (~120 new lines) | -108 |
| `updateProgressBar` polling | 217–237 | Stays in `progress.js` (polling kept; event-driven rewrite in P3-3) | 0 |
| Remaining progress pointerup/cancel etc. | 238–291 | `frontend/progress.js` | -54 |

Total moved out: -219 lines. `main.js` core retained (imports + lifecycle calls + top-level error handler) ≈ 73 + ~30 lines of three-phase calls ≈ ~100 lines. Comfortable margin under the 150-line cap.

---

## 7. Phase 3 — Filling out the `audio/` subsystem (15–18h, the engine room)

**Final shape of `frontend/audio/`:**

```
frontend/audio/
├── constants.js       (~150 lines) ── ✅ P0-3 already in place
├── utils.js           (~80 lines)  ── ✅ P0-3 already in place
├── context.js         (~120 lines) ── P3-1
├── buffer-cache.js    (~140 lines) ── P3-2
├── raf-loop.js        (~120 lines) ── P3-3 (pure EMA driver)
├── swap-timer.js      (~150 lines) ── P3-4 (loopClock state machine)
├── bus.js             (~180 lines) ── P3-5 (BusVoice / LoopSlot)
├── announcer-bus.js   (~60 lines)  ── P3-5 (panner + gain routing)
└── engine.js          (~120 lines) ── P3-6 (composes the rest, public API)
```

**Design decisions:**

- **`city-announcer.js` does not move into `audio/`.** It owns "when to play which city" — business logic, not audio routing. P3-5 only relocates the `audioCtx.createBufferSource() + panner + gain` snippet into `audio/announcer-bus.js`. The `cities.json` loader, `findNearestCity`, and the dwell timer remain in `city-announcer.js`.
- **`raf-loop.js` is genuinely pure.** It returns a `smoothedSnapshot` object (`{ proximity, velocity, coverage[8] }`); it does **not** call `setValueAtTime`. `engine.js` invokes `raf-loop` from its rAF callback and is responsible for picking which audio params receive the smoothed values. This is the boundary that makes the rAF loop testable.
- **`swap-timer.js` does not depend on `AudioContext.currentTime`.** It receives `now` as a parameter; tests inject a fake clock to assert state transitions. Drift testing is **not** automated (under a fake clock drift = 0 by construction). Drift validation comes from a 30-minute local `npm run dev` session plus spectrogram comparison.
- **P3-0 makes audio-engine internally lazy.** Inside `audio-engine.js` the module-top-level `const audioCtx = new AudioContext()` becomes `let audioCtx = null; function ensureCtx() { if (!audioCtx) audioCtx = new AudioContext(); return audioCtx; }`. All internal helpers route through `ensureCtx()`. **Caller-side imports and signatures are unchanged** — `main.js`, `city-announcer.js`, etc. need no edits. This is what protects against double `AudioContext` instantiation while the new modules are being filled in.

| Stage | Task | Critical files | Hours | DoD |
|---|---|---|---|---|
| **P3-0** | Lazy-init refactor described above. **Caller-side untouched.** Prevents double `AudioContext` during P3-1..P3-6. | `frontend/audio-engine.js` (internal only) | 2h | No `new AudioContext` at module top level; DevTools confirms no `AudioContext` is created on page load (only when the user toggles audio on); caller imports diff = 0. |
| **P3-1** | Create `audio/context.js` — master chain creation + the **12 connect calls** (verified by `grep -c "\.connect(" frontend/audio-engine.js` at planning time; re-verify before editing). | New `frontend/audio/context.js`, new `frontend/__tests__/audio/context.test.js` | 2h | mock `AudioContext` (P0-1 helper) verifies the connect order matches the original audio-engine wiring (diffed); `audio-engine.js` consumes the new module; manual preview is identical. |
| **P3-2** | Create `audio/buffer-cache.js` — `loadSample` + `Promise.all` priority loading + generation guard. | New `frontend/audio/buffer-cache.js`, new `frontend/__tests__/audio/buffer-cache.test.js` | 2.5h | Coverage ≥ 80% (including the generation-aborts-fetch path); `audio-engine.js` consumes the new module. |
| **P3-3** | Create `audio/raf-loop.js` — pure EMA driver returning a snapshot, **never calling `setValueAtTime`**. Engine emits `audio:loop:progress` on event-bus; `progress.js` switches from polling to subscribing (closes the polling debt left by P2-5). | New `frontend/audio/raf-loop.js`, new `frontend/__tests__/audio/raf-loop.test.js`; modify `frontend/progress.js` (subscribe), `frontend/audio-engine.js` (emit) | 2.5h | Test: dt = 16 ms × 1000 ticks converges within ±0.1% of target; engine.js calls `raf-loop` from its rAF tick and explicitly applies `setValueAtTime`; coverage ≥ 95%; **`grep "requestAnimationFrame" frontend/progress.js`** returns no results (raf-loop.js still uses rAF; progress.js no longer does). |
| **P3-4** | Create `audio/swap-timer.js` — `loopClock` + `scheduleGlobalSwap` + `performGlobalSwap` state machine accepting `now` as a parameter. **Feature flag implementation:** add `USE_LEGACY_SWAP_TIMER` field to `frontend/config.runtime.js` (default `false`); audio-engine reads the flag at boot to pick new vs legacy path. Console toggle: `window.runtimeConfig.USE_LEGACY_SWAP_TIMER = true; location.reload()` switches back for debugging. Cleanup happens in P5-4. | New `frontend/audio/swap-timer.js`, new `frontend/__tests__/audio/swap-timer.test.js`; modify `frontend/config.runtime.example.js` to document the flag | 3h | Coverage ≥ 85% (lookahead trigger logic, cycle hand-off, `performSwap` admission); `audio-engine.js` consumes the new module; **with flag = false (default) the new path runs; with flag = true the legacy path runs and `console.warn` notes the override**. |
| **P3-5** | Create `audio/bus.js` (`BusVoice` / `LoopSlot` / `swapBusVoice` / `resetBusLoop`) and `audio/announcer-bus.js` (panner + gain routing). Update `city-announcer.js` to call `announcer-bus` instead of touching `audioCtx` directly. | New `frontend/audio/bus.js`, new `frontend/audio/announcer-bus.js`, integration tests; modify `frontend/city-announcer.js` | 5h | Integration test: post-swap two voices do not overlap; **30-minute continuous-playback stress test on local `npm run dev`** with no clicks/pops; P0-5 5-segment audio comparison ΔLUFS ≤ 0.5 LU + spectrogram visually similar + RMS Δ ≤ 1% (ffmpeg loudnorm + visual diff is included in this stage's hours). |
| **P3-6** | Create `audio/engine.js` — composes everything, exposes `start`/`stop`/`update`/`duck`. Reduce `frontend/audio-engine.js` to a one-line `export * from './audio/engine.js'` re-export shim (**final deletion happens in P5-4**, leaving the shim on `feat/M4` until then so any missed import path can be caught and fixed before the big-bang merge). | New `frontend/audio/engine.js`, modify `frontend/audio-engine.js` to a re-export shim | 2h | `grep -E "from .*audio-engine" frontend/` shows only the new path; local 30-minute stress test passes; local audio idle main-thread CPU vs P0-5 baseline **does not regress** (P5-1 is where we ask for a drop). |

**Phase Gate (local — no prod merge).** `npm run test:frontend --coverage` shows `frontend/audio/` coverage ≥ 80%; **30-minute continuous-playback stress test on local `npm run dev`** clean (no clicks/pops); **P0-5 5-segment audio comparison passes (ΔLUFS ≤ 0.5 LU + spectrogram similar + RMS Δ ≤ 1%)** (rule 2.E hard requirement); the swap-timer feature flag and the `audio-engine.js` re-export shim are kept on `feat/M4` until P5-4 cleanup; **7 devlog entries** committed to `feat/M4`. P4 starts on the same branch.

---

## 8. Phase 4 — `server/index.js` decomposition + state-layer merge (8–10h)

| Stage | Task | Critical files | Hours | DoD |
|---|---|---|---|---|
| **P4-1** | Extract `server/bootstrap.js` — `startHttpServer` + `attachWsServer` + `warnIfStaticAssetsMissing` + `startServer` orchestration. | New `server/bootstrap.js`, modify `server/index.js` | 2h | `server.startup.test.js` green; `index.js` -100 lines; **wire-format self-check is vacuously true** (no routes/WS handlers touched in this stage) — still run `npm run smoke:wire-format` to confirm. |
| **P4-2** | Extract `server/routes.js` — gather every `app.get` / `app.post` handler (the actual routes are `/health`, `/api/config`, `/api/viewport`). | New `server/routes.js`, modify `server/index.js` | 1.5h | HTTP smoke green; `/health` + `/api/config` + `/api/viewport` response field shape unchanged (`npm run smoke:wire-format` diff vs prior responses); `index.js` -80 lines. |
| **P4-3** | Extract `server/ws-handler.js` — `attachWsHandler` + upstream message routing + broadcast. | New `server/ws-handler.js`, modify `server/index.js` | 2h | WS integration tests green; WS message-type strings unchanged (rule 2.A schema-diff script passes); `index.js` -130 lines. |
| **P4-4** | The genuine `mode-manager` + `delta-state` merger. Combine `{currentMode}` and `{snapshot}` into a single `clientState` with one cleanup timer. **Caller list (verified by grep):** `server/index.js` (require + route handler usage), `server/viewport-processor.js` (require + mode application), plus the four test files: `server/__tests__/mode-manager.test.js`, `delta-state.test.js`, `benchmark-gate.test.js`, `golden-baseline.test.js`. | Promote `server/http-client-state.js`; delete `server/mode-manager.js` + `server/delta-state.js`; modify `server/index.js` + `server/viewport-processor.js`; adapt the four test files (mode-manager / delta-state tests rewritten to verify equivalent behavior on the merged module) | 2.5h | All 14 jest suites green; server -130 lines; one 5-minute TTL cleanup timer (down from two); `npm run smoke:wire-format` passes against `main` (the `/api/viewport` response shape — including `mode`, `snapshot` — and WS message field names are byte-identical to M3 main, so the P5-4 merge will not break any open user session). |

**Phase Gate (local — no prod merge).** `npm test` green; `server/index.js` 516 → ≤ 100 lines; server total LOC 3279 → ~2900; `npm run smoke:wire-format` passes against `main` (catches accidental field renames across P1+P4 server diff); **4 devlog entries** committed to `feat/M4`. P5 starts on the same branch.

---

## 9. Phase 5 — Performance + closing docs + carryover audit + milestone closing (7–9h)

| Stage | Task | Critical files | Hours | DoD |
|---|---|---|---|---|
| **P5-1** | Add idle detection to `audio/raf-loop.js`: when every EMA has converged (Δ < 0.001) and velocity = 0, skip the frame; preserve a wake mechanism. | `frontend/audio/raf-loop.js` | 2h | Compared against P0-5 baseline: **if baseline ≥ 5%, target a drop ≥ 30% or absolute value ≤ 3.5%; if baseline < 5%, target no regression (i.e. ≤ baseline)**; convergence speed during interaction unchanged; rerun the 5-segment audio comparison (LUFS / spectrogram / RMS). |
| **P5-2** | Update `docs/ARCHITECTURE.md` (audio/ subsystem diagram + lifecycle three-state diagram + server bootstrap/routes/ws-handler three-layer diagram) and `docs/DEPLOYMENT.md` ("Repository layout" reflecting the new server structure). **Note:** `CLAUDE.md` has been gitignored as a local AI-agent-config file since commit 9b5af86 (M3 tech-debt audit E.1) and is not a project source-of-truth document; this stage **does not touch `CLAUDE.md`**. | `docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md` | 2.5h | Both docs match the code; three new diagrams added (audio subsystem, lifecycle, server tiers). |
| **P5-3** | Write the M4 summary at `docs/plans/M4/2026-XX-XX-M4-summary.md` (English). The **M3 tech-debt-audit carryover table** (§ Appendix A) is included as an appendix. Add the closing devlog entry. | New `docs/plans/M4/2026-XX-XX-M4-summary.md`, new `docs/devlog/M4/<date>-M4-summary.md`, `docs/DEVLOG.md` index | 2h | This proposal moves to `Status: Completed`; DEVLOG.md index complete; the summary records actual vs planned hours by stage. |
| **P5-4** | **Closing audit + cleanup + milestone close.** Grep-verify that every quantitative target landed; **delete the swap-timer feature flag** (1-week window has passed); **delete `frontend/audio-engine.js` re-export shim** (grep confirms no callers); list any unmet targets in `docs/devlog/M4/<date>-M4-residual-debt.md` as M5 candidates; **the final commit message is `chore(M4): close milestone 4 — razor refactor complete`**. | `frontend/audio/swap-timer.js` (drop the legacy path), delete `frontend/audio-engine.js`, new `docs/devlog/M4/<date>-M4-residual-debt.md` | 1h | Each target row in § 10 is marked ✅ (achieved) or ⏭️ (deferred to M5); DEVLOG.md index updated; `audio-engine.js` no longer exists; `swap-timer.js` has one path; the M4 closing commit is on `main`. |

**Phase Gate (M4 milestone close — first prod merge).** Every quantitative target either achieved or explicitly deferred to M5; `ARCHITECTURE.md` + `DEPLOYMENT.md` match the code; `frontend/audio-engine.js` does not exist; `grep -r 'audio-engine' frontend/` returns no hits; **the draft `feat(M4): razor refactor` PR is marked ready and merged to `main`** — this is the first time M4 reaches `placeecho.com`; post-merge prod soak ≥ 24 h with no regression report (this soak now matters because every M4 stage's risk surfaces simultaneously); **4 devlog entries** (including the closing entry); the M4 ledger comprises **29 stage devlog entries + 1 closing entry = 30 entries** in DEVLOG.md.

---

## 10. Wire-format Contract (must hold throughout M4)

The concrete rule-2.A inventory. Server changes during M4 may **only add fields**; the names / types / paths below are frozen.

> ⚠️ **This table is a draft.** Some rows come from the audit, others from plan-time inference. **P0-1 must verify every row against `server/index.js` + `server/viewport-processor.js` and amend this table** before opening P1. (Already-known correction: the original "/state" route was a planning artifact and does not exist; the actual dynamic routes are exactly `/health`, `/api/config`, `/api/viewport`.)

### HTTP routes & response fields (real routes verified)

| Path | Method | Response fields (P0-1 to verify field-by-field) | Note |
|---|---|---|---|
| `/health` | GET | Includes `dataLoaded` (CI smoke depends on `dataLoaded:true`) | M4: field names frozen |
| `/api/config` | GET | (P0-1 verify) | M4: field names frozen |
| `/api/viewport` | POST | (P0-1 verify request + response fields) | M4: field names frozen |
| `/data/cities.json` | GET | static file | path frozen |
| `/tiles/*` | GET | PMTiles static | path frozen |
| `/data/*` other static | GET | static, contents from `data/` | paths frozen |

### WebSocket messages (P0-1 to verify; below is a draft)

| Type | Fields (inferred) | Note |
|---|---|---|
| upstream `viewport` | `bounds`, `zoom`, `clientId`, `mode` | P0-1 verify after `grep "ws.on('message'"` |
| upstream `ping` | `t` | P0-1 verify |
| upstream `audio:start` / `audio:stop` | (no payload) | P0-1 verify |
| downstream `audio` | `proximityNorm`, `velocityNorm`, `lcFractions`, `mode`, etc. | P0-1: grep `ws.send` + `JSON.stringify` to reconcile the field set |
| downstream `pong` | `t` | P0-1 verify |

**P0-1 verification tasks (must complete before P1 opens):**

1. `grep -nE "app\.(get|post)|app\.use" server/index.js` to enumerate routes
2. `grep -nE "ws\.send|JSON\.stringify" server/index.js server/ws-*.js 2>/dev/null` to enumerate downstream fields
3. `grep -nE "data\.(type|action)" server/index.js` to find upstream message dispatch
4. Reconcile this table against the grep output — only then is the contract usable.

The schema-diff helper script (rule 2.A) is the runtime expression of this contract.

---

## 11. Quantitative targets

| Indicator | M3 baseline | M4 target | Verification |
|---|---|---|---|
| `audio-engine.js` single-file existence | 1186 lines | **does not exist** (P5-4 deletes the shim) | `ls frontend/audio-engine.js` returns "No such file" |
| Largest single file under `audio/` | — | ≤ 200 lines | `wc -l frontend/audio/*.js \| sort -n` |
| `server/index.js` | 516 lines | ≤ 100 lines | `wc -l` |
| `frontend/main.js` | 292 lines | ≤ 150 lines | `wc -l` (verified line-by-line against the migration table) |
| `audio/` subsystem unit-test coverage | 0% | ≥ 80% | `vitest --coverage --include='frontend/audio/**'` |
| `utils` / `lifecycle` / `event-bus` coverage | 0% | ≥ 90% | `vitest --coverage` for each |
| `progress.js` coverage | 0% | ≥ 70% (pointer events are simulatable in happy-dom) | `vitest --coverage` |
| `city-announcer.js` coverage | 0% | ≥ 50% (spatial + dwell logic; audio routing skipped) | same |
| `map.js` / `popup.js` / `websocket.js` coverage | 0% | **N/A** (happy-dom does not support Mapbox / WebGL) | manual + preview only |
| Cold-start FCP | (P0-5 baseline) | within ±5% of baseline | Chrome DevTools recording diff |
| Audio idle main-thread CPU median | (P0-5 baseline) | baseline ≥ 5% → drop ≥ 30% or ≤ 3.5%; baseline < 5% → no regression | DevTools 5-min idle Performance recording diff |
| Audio LUFS / spectrogram / waveform RMS | (P0-5 baseline 5 segments) | ΔLUFS ≤ 0.5 / visually similar / ΔRMS ≤ 1% | `ffmpeg loudnorm` + visual diff |
| Server viewport-processor p95 | 1-2 ms | 0.5-1 ms | `npm run benchmark` |
| Server total LOC | 3279 | ~2900 | `wc -l server/**/*.js` |
| Frontend total LOC | 2918 | 2900–3050 (informational, not enforced; audio/ split adds file headers) | `wc -l frontend/**/*.js` (excluding `__tests__`) |

---

## 12. Risk register

| Risk | Severity | Mitigation | Rollback |
|---|---|---|---|
| **P5-4 big-bang merge surfaces multiple latent regressions at once (single-branch cadence trade-off)** | **Critical** | Every prior stage's local Phase Gate stays strict; `feat/M4` keeps `npm test && npm run test:frontend && npm run lint` green at every commit; P0-5 audio reference is rerun at P5-4 against `feat/M4` HEAD; preview-URL stress tested before marking PR ready | The draft PR can sit in "ready for review" indefinitely; if smoke uncovers a bug, fix on `feat/M4` and re-validate before merge. Worst case: tag the fail point, revert the merge, and bisect on `feat/M4` |
| P3-4/P3-5 swap-timer / bus split causes crossfade-timing glitches (clicks / pops) | **Critical** | P0 test scaffold + 30-min local stress + P0-5 spectrogram comparison + feature flag kept on `feat/M4` until P5-4 cleanup | Toggle the flag for instant fallback on `feat/M4`; worst case revert the P3 commits before merge to `main` |
| P3-6 deletion of legacy `audio-engine.js` exposes a missed import path | High | Land as a re-export shim first; keep the shim on `feat/M4` until P5-4 cleanup; grep every `audio-engine` reference before P5-4 deletion | Restore the shim on `feat/M4` |
| Double `AudioContext` instantiation during P3-0..P3-6 | High | P3-0 enforces lazy-init internally (callers untouched) | DevTools detects double-instantiation → revert the offending stage commit |
| `vitest` ↔ existing frontend ES-module compatibility | Medium | P0-1 verifies the import shape (audit confirms ES module); enable vitest's `transformMode: 'web'` | Revert P0-1 commits on `feat/M4`; fall back to jsdom or pure-node module mode |
| happy-dom missing Web Audio API + Mapbox WebGL | Medium | P0-1 hand-rolled mock for audio; `map.js` / `popup.js` / `websocket.js` excluded from coverage targets | None (a design constraint) |
| PMTiles fetch under vitest | Low | P3 does not test PMTiles loading; if needed, use vitest's built-in fetch mock | N/A |
| P0-1 test scaffold complicates CI and breaks the server jest job | Medium | A new `npm run test:frontend` (kept separate from `npm test`); CI matrix 18+22 still runs both; dev dep only | Revert P0-1 commits on `feat/M4` |
| Wire-format regression in P5-4 merge surprises an open user session | Medium | `npm run smoke:wire-format` run against `main` at P5-4 close; if any field renamed across full M4 diff, document it in P5-4 closing devlog so users know to refresh | If a rename slips, hotfix on `main` re-aliases the old name |
| P4-4 mode/delta merger violates a previously assumed independence | Medium | P1-2 already factored out the helpers; if jest regresses at P4-4, revert immediately | Revert P4-4 commits alone on `feat/M4` |
| P2-5 lifecycle rewrite introduces a startup-order regression | Medium | Local FCP diff against P0-5 baseline; P2-3's dry-run comment vetoes designs that don't match `main.js` reality | Revert P2-5 commits on `feat/M4` |
| Audio-engine ends up half-extracted, half-tested mid-phase | Medium | Each stage diff against the P0-5 audio reference before commit | Stage-level revert on `feat/M4` |
| Hotfix collides with `feat/M4` | Medium | Rule 2.D: hotfix → `main` directly; `feat/M4` rebases `main` after each hotfix lands | Hotfix takes priority always; M4 rebase resolves conflicts |
| `feat/M4` and `main` diverge for ~5-7 weeks; rebase friction grows | Medium | Rebase `feat/M4` onto `main` after each hotfix; before P5-4 merge, do one final clean rebase | If a rebase becomes too painful, fall back to a merge commit at P5-4 instead of rebase |
| `placeecho.com` users mid-session during the P5-4 deploy | Low | Pages atomic switchover = 0 downtime; the build-tag banner makes the active version self-evident in DevTools after reload | None (post-hoc forensics) |
| ESLint config shape changes for the new frontend tests block | Low | P0-4 settles on ≤ 5 blocks (not 4); frontend tests get their own block with vitest globals | Revert P0-4 commits on `feat/M4` |
| `progress.js` keeps polling after P2-5 and degrades interaction | Low | P3-3 retires the polling in the same stage as the rAF-loop extraction (subscribes to `audio:loop:progress`) | Revert P3-3 `progress.js` change on `feat/M4`; polling resumes |

---

## 13. Critical files (the six places where most of the M4 diff lives)

- [frontend/audio-engine.js](../../../frontend/audio-engine.js) — P0-3 extracts utils/constants; P3-0 makes it lazy; P3-6 collapses it to a re-export shim; P5-4 deletes it (1186-line core).
- [frontend/main.js](../../../frontend/main.js) — P0-2 adds the build-tag banner; P2-5 is the lifecycle rewrite.
- [server/index.js](../../../server/index.js) — P4 decomposes its 516 lines into bootstrap/routes/ws-handler.
- [frontend/map.js](../../../frontend/map.js) — P2-4 evicts the popup logic; P2-5 collapses the move-event subscription via the event-bus.
- [server/mode-manager.js](../../../server/mode-manager.js) + [server/delta-state.js](../../../server/delta-state.js) — P1-2 extracts shared helpers; P4-4 merges and removes the files.
- [.github/workflows/ci.yml](../../../.github/workflows/ci.yml) — P0-1 adds the frontend test step inside the existing `test` job.

---

## 14. Phase-gate dependency matrix

Under the single-branch cadence (revised 2026-04-27), Phase order is preserved but no per-phase prod soak applies. The dependencies below are between stages on `feat/M4`, not between deploy windows.

| Phase | Depends on | Parallelizable with |
|---|---|---|
| P0 | — | P0-3 / P0-4 / P0-5 are mutually independent and can be interleaved once P0-1 + P0-2 land. |
| P1 | P0-1 (vitest) + P0-2 (M4 directory + Chinese plan superseded) | P0-3 / P0-4 / P0-5 (interleave late P0 stages with early P1 work). |
| P2 | P0-1 + P0-2 + P0-3 (utils file structure) + P1 stage commits passing locally | Not parallel with P1 (each phase commits in order on `feat/M4`). |
| P3 | P2 commits passing locally + audio/ subsystem coverage ≥ 70% (P3 raises this stage by stage) + P0-5 baseline captured | Nothing in parallel (audio core ownership). |
| P4 | P3 commits passing locally (any P3 issue resolved on `feat/M4`) | Nothing in parallel (server-side ownership). |
| P5 | P4 commits passing locally | P5-2 / P5-3 (docs + audit) parallel with P5-1. P5-4 is the **only** stage that touches `main`. |
| **Hotfix (any time)** | — | Always wins. Hotfix → `main` directly; `feat/M4` rebases `main` afterward. No prod soak gating M4 progress (M4 doesn't reach prod until P5-4 anyway). |

There are no longer hard serialization gates between phases — under single-branch cadence, P3 and P4 both reach prod simultaneously at P5-4. The original 48 h soaks flanking P3 are folded into a single post-P5-4 soak that monitors the whole M4 in production.

---

## Appendix A — M3 tech-debt-audit carryover

[M3 tech-debt audit](../../devlog/M3/2026-04-23-M3-tech-debt-audit.md) line items, mapped to their M4 / M5 owners:

| Item | Description | Disposition |
|---|---|---|
| A.1 | `frontend/__tests__/` does not exist | ✅ M4 P0-1 (vitest + happy-dom) |
| B.6 | rAF loop runs unconditionally | ✅ M4 P5-1 (idle detection) |
| C.4 | Boot-time asset warnings only reach server stdout | ⏭️ M5 (frontend WS protocol extension required) |
| D.1 | `_statsTimer` runs even when `dataLoaded=false` | ✅ M4 P1-3 (SIGTERM-only flush) |
| D.2 | `viewport-processor` doesn't memoize `lcFractions` | ✅ M4 P1-4 |
| D.3 | `delta-state` TTL expiry has no test | ✅ M4 P4-4 (post-merger coverage) |
| D.4 | `CACHE_SCHEMA_VERSION` has no migration changelog | ⏭️ M5 (small standalone task) |
| D.5 | mode/delta TTL timers diverge | ✅ M4 P4-4 |
| E.2 | `cities.json` lacks a schema | ⏭️ M5 (small standalone task) |

---

## Appendix B — Out of scope for M4

To prevent scope creep mid-execution:

- ❌ **No deployment-architecture changes** (Pages + R2 + Worker + Fly) — every layer was verified necessary.
- ❌ **No `gee-scripts/` archival** — purely cosmetic, zero ROI.
- ❌ **No PMTiles Worker proxy optimization** (DEPLOYMENT.md known issue) — unrelated to the refactor theme; M5.
- ❌ **No H3 / quadtree replacement of `spatial.js` bucketing** — that lives in the deprecated M3 P2 scope.
- ❌ **No Cloudflare Cache Rule fix** (DEPLOYMENT.md known issue #1) — deploy-side fix; M5.
- ❌ **No frontend WS protocol extension** (C.4 warning channel) — needs protocol design; M5.
- ❌ **No rewrite of `city-announcer.js` business logic** — P3-5 only relocates the audio-routing snippet.
- ❌ **No Mapbox style / dot-rendering changes** — M3 settled this.
- ❌ **No `CLAUDE.md` update** — gitignored local AI-agent config (M3 tech-debt-audit E.1).
