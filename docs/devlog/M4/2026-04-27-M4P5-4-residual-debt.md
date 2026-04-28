# 2026-04-27 — Milestone: M4 Residual Debt → M5 Candidates

P5-4. The closing audit confirmed the M4 razor refactor is structurally complete: `frontend/audio-engine.js` is deleted, the three callers (`main.js`, `map.js`, `city-announcer.js`) import directly from `./audio/engine.js`, all gates green at the merge HEAD. This entry enumerates every M4 item that did not land in scope and assigns it to M5. Three of the unmet items are §11 file-size targets that the proposal author estimated pre-pivot; one is a deferred performance measurement; the rest are M3 audit carryover items the proposal already routed to M5.

## Source of truth

The full list and per-item rationale is in [`docs/plans/M4/2026-04-27-M4-summary.md`](../../plans/M4/2026-04-27-M4-summary.md) §5 (missed targets) and §8 (M5 candidates). This devlog is the operational checklist — short, actionable, ready for M5 scoping to consume.

## Backlog for M5

### Soft-miss file-size targets (do not act unless a concrete pain point appears)

| File | Target | Actual at M4 close | Re-baseline rationale |
| --- | --- | --- | --- |
| `frontend/audio/engine.js` | ≤ 800 LOC | 939 LOC | Post-pivot collapsed swap-timer / BusVoice / LoopSlot / announcer-bus into named exports per the risk-register decision. Target was set pre-pivot. |
| `server/index.js` | ≤ 250 LOC | 310 LOC | Residual is bootstrap + dependency wiring + graceful shutdown — no obvious further extraction. "~250" was estimate, not measurement. |
| `frontend/main.js` | ≤ 150 LOC | 232 LOC | Further reduction would need the dropped P2-3 lifecycle rewrite (Occam pivot killed it). |
| `server/` total LOC | ~3000 | 3355 | JSDoc typedef coverage in `types.js` (kept after the post-pivot revision recognized it carries 45 `import('./types').<TypeName>` references) is the main gap. |

**Action:** revisit only if a concrete pain point surfaces. Do not refactor for the number alone.

### Deferred audio CPU measurement

P5-1 §11 row asked for a before/after DevTools Performance recording verifying ≥ 30% main-thread CPU drop on idle audio. Neither the original P5-1 nor the redo captured the recording. The structural argument (post-patch the rAF callback isn't scheduled while idle, so per-frame cost is zero by construction) stands, but isn't a measurement.

**Action:** at M5, build a deterministic CI fixture for the buffer-load race (synthetic `bufferCache.loadAll` delay + `requestAnimationFrame` driver), then use the same fixture as the harness for an idle-vs-active CPU comparison. The fixture work is the long pole; the CPU measurement is a small follow-on.

### `viewport-processor` p95 benchmark verification

§11 row 13 asked for `viewport-processor` p95 ≤ 0.5 ms after the original P1-2 lcFractions memoization. P1-2 was substituted at execution time with a bounds-keyed single-entry cache (broader hit set, simpler implementation) and the benchmark was not re-run.

**Action:** at M5, run `npm run benchmark`, record the actual p95, decide between accepting the gap and revisiting the substitution.

### M3 tech-debt-audit carryover (4 deferred items)

Already routed to M5 in the proposal's [Appendix A](../../plans/M4/2026-04-27-M4-razor-refactor-proposal.md#appendix-a--m3-tech-debt-audit-carryover). All four are small, self-contained, and do not block any M5 milestone-scope work.

| Item | Description | Why M5 |
| --- | --- | --- |
| C.4 | Boot-time asset warnings only reach server stdout | Requires a frontend WS protocol extension — needs design |
| D.1 | `_statsTimer` runs even when `dataLoaded=false` | Cosmetic; no observable user impact |
| D.4 | `CACHE_SCHEMA_VERSION` has no migration changelog | Standalone task, no dependency |
| E.2 | `cities.json` lacks a schema | Standalone task, no dependency |

### Other M5 candidates surfaced during M4

| Item | Source | Status |
| --- | --- | --- |
| Deterministic CI reproduction of P5-1 buffer-load race | [P5-1 redo devlog](2026-04-27-M4-raf-idle-detection-redo.md) §"Defer to M5" | Pre-condition for the CPU measurement above |
| `main.js` WS-onOpen vs Mapbox style.load race | [P5-1 revert devlog](2026-04-27-M4-revert-p5-1-raf-idle.md) "Hypotheses we couldn't conclusively confirm" | Pre-existed M4; surfaced when always-running rAF stopped masking it; same readiness-condition family as P5-1 |
| Cloudflare Cache Rule narrowing to `/audio/*` | [`docs/DEPLOYMENT.md`](../../DEPLOYMENT.md) Known Issue #1 | Out of scope per Appendix B |
| PMTiles Worker proxy for per-Range caching | [`docs/DEPLOYMENT.md`](../../DEPLOYMENT.md) Known Issue #3 | Out of scope per Appendix B |

## What landed in M4 (one-line each)

For the merge commit's reference, all 21 stages that DID complete:

- **P0-1** vitest + happy-dom + wire-format smoke (`316f3f1`, `ffaf1aa`)
- **P0-2** M4 plan skeleton + build-hash injection (`f4b1617`)
- **P0-3** extract `audio/utils.js` + `audio/constants.js` (`87c873d`)
- **P0-4** tooling cleanup — drop `setup-git-hooks.sh`, merge eslint blocks (`c7a2be7`)
- **P1-1** spatial.js single-pass aggregator (`cc5e427`, −33% wide-area p99)
- **P1-2** viewport-processor bounds-keyed single-entry cache (`f15960d`, substitution)
- **P2-1** popup logic extracted from `map.js` (`d7e942d`)
- **P2-2** loop-progress bar extracted from `main.js` (`53b5598`)
- **P3-0** lazy-init refactor (`15f3293`)
- **P3-1** `audio/context.js` (`21c2f72`)
- **P3-2** `audio/buffer-cache.js` (`b39cae3`)
- **P3-3** `audio/raf-loop.js` (`e8a15d7`)
- **P3-4** collapse `audio-engine.js` → `audio/engine.js` + shim (`92aaa5d`)
- **P4-1** extract `server/routes.js` (`df11145`)
- **P4-2** extract `server/ws-handler.js` + shared parse-bounds util (`b50e5a2`)
- **P4-3** merge mode-manager + delta-state into `client-state.js` (`97bcb8d`)
- **P5-1** rAF idle detection — original (`224b1ca`), reverted (`bcb7ab2`, `35d6058`), redone with buffer-load wake (`6bc2a8d`)
- **P5-2** ARCHITECTURE.md + DEPLOYMENT.md refresh for M4 subsystems (`1e58f9a`)
- **P5-3** M4 milestone summary + proposal status flip (`0d53535`)
- **P5-4** closing audit + delete shim + this devlog (this commit)

## Files changed (this stage)

- **Deleted** `frontend/audio-engine.js` — the 13-LOC re-export shim from P3-4. Three callers updated.
- **Modified** `frontend/main.js`, `frontend/map.js`, `frontend/city-announcer.js` — import from `./audio/engine.js` directly.
- **Modified** `frontend/__tests__/audio/engine.test.js` — drop the "shim path" describe block (one test, retired with the shim).
- **Modified** `frontend/__tests__/_helpers/audio-context-mock.js` — header comment refreshed.
- **Modified** `frontend/audio/engine.js` — `@module` annotation `frontend/audio-engine` → `frontend/audio/engine`; console-error tag prefix `[audio-engine]` → `[audio/engine]`.
- **Modified** `frontend/audio/constants.js` — file-header comment trimmed (the P0-3 origin note pointed at the now-deleted `audio-engine.js`).
- **Modified** `frontend/main.js`, `frontend/config.js`, `frontend/city-announcer.js` — comment / pointer updates from the deleted file name to its current home.
- **Modified** `scripts/build-pages.js`, `scripts/measure-loudness.js` — same pointer updates.
- **Modified** `README.md` — frontend layout tree + architecture diagram label + curl example updated.
- **Modified** `docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md` — strip the "shim, deleted in P5-4" notes left by P5-2; replace with a single retrospective sentence in ARCHITECTURE.md explaining the decomposition.
- **Added** `docs/devlog/M4/2026-04-27-M4P5-4-residual-debt.md` — this entry.
- **Modified** `docs/DEVLOG.md` — index this entry.

Verification: `npm run lint`, `npm run format:check`, `npm test` (167/167), `npm run test:frontend` (68/68 — was 69, the dropped shim-path test accounts for the diff), `npm run smoke:wire-format` all green. `grep -rE "audio-engine"` returns one acceptable hit (the historical-retrospective sentence in ARCHITECTURE.md) and nothing in `frontend/` or `server/` runtime code.

## Next: M4 close + merge to `main`

After this commit, the closing commit `chore(M4): close milestone 4 — razor refactor complete` lands on `feat/M4`, then `feat/M4` merges to `main` for the production deploy. Pages atomic switchover; Fly auto-deploy on the same push. Post-merge soak ≥ 24 h with no regression report.
