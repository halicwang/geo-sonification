# 2026-04-27 — Design: P5-2 ARCHITECTURE.md and DEPLOYMENT.md Refresh for M4 Subsystems

Refresh `docs/ARCHITECTURE.md` and `docs/DEPLOYMENT.md` to reflect the M4 razor refactor. The audio engine (P3) and server (P4) are no longer monoliths — both are now decomposed into single-purpose modules — and the architecture / deployment docs were still describing the M2-era layout. Two new ASCII subsystem diagrams in ARCHITECTURE.md, an expanded Repository layout in DEPLOYMENT.md, plus a freshness pass on idle behavior and timing constants to absorb the P5-1 changes.

## What changed

**`docs/ARCHITECTURE.md`**

- **Stale module-count reference (line 7).** The header pointed at "8 ES modules: config, landcover, ui, map, websocket, audio-engine, city-announcer, main" via the M2 split devlog. After M4 the count is wrong (audio-engine is a shim; engine/context/buffer-cache/raf-loop/utils/constants live under `audio/`; popup and progress are extracted from main and map). Replaced with a pointer to the new **Subsystems** section.
- **New section: Subsystems.** Two ASCII diagrams using the file's existing `box ──> imports` style:
  - **Audio subsystem (`frontend/audio/`)** — `engine.js` at the top with its public surface listed, then arrows to `context.js` (master chain factory), `buffer-cache.js` (with the `onAllLoaded → startAllSources` callback called out so the P5-1 buffer-load wake makes sense in context), `raf-loop.js` (pure EMA driver, lists all five exports including the new `isEmaIdle`), `utils.js`, `constants.js`. Footer note that `frontend/audio-engine.js` is the re-export shim scheduled for P5-4 deletion.
  - **Server subsystem (`server/`)** — `index.js` boots data-loader / mounts routes / attaches ws-handler. `ws-handler.js` uses `client-state.js` for per-client state and routes viewport messages into `viewport-processor.js`, which on cache miss runs through `parse-bounds.js` + `spatial.js` + `landcover.js` + `audio-metrics.js`. `config.js` + `load-env.js` + `types.js` listed at the bottom for completeness.
- **Data Flow rewrite.** Updated the existing flow diagram so server-side names match the new modules (`ws-handler.js → viewport-processor.js → spatial / landcover / audio-metrics`) instead of the M3-era "spatial.js + audio-metrics.js + viewport-processor.js" flat list. Frontend side now references `audio/engine.js` and `audio/raf-loop.js` explicitly, and adds the `isEmaIdle ⇒ rafId = null` branch + the `onAllLoaded → startAllSources → post-load startRaf wake` sequence introduced in P5-1.
- **Idle Behavior section expanded.** The old wording ("It does not auto-fade to silence on idle; suspension is only driven by explicit user stop or tab visibility changes") is preserved as the user-facing behavior, but now followed by a five-row table enumerating the rAF wake triggers (`update`, `updateMotion`, `visibilitychange`, `start` initial arm, `start` post-`bufferCache.loadAll` arm) and a paragraph explaining that Web Audio playback decouples from rAF — suspending the rAF callback is purely a CPU saving, not an audio interruption. The buffer-load wake row includes a pointer to the redo devlog (`2026-04-27-M4-raf-idle-detection-redo.md`) so a future reader can find the production race that motivated it.
- **Timing Constants table refresh.** "Location" column updated from the now-monolithic `audio-engine.js` to the actual module: most timing τ + loop / preamp constants moved to `audio/constants.js`; `GAIN_CURVE_EXPONENT` / `BASE_Q1` / `MAX_Q1` / `LAND_FULL_COVERAGE_THRESHOLD` are still inline in `audio/engine.js`. Added a new row for `IDLE_THRESHOLD = 0.001` (P5-1). Closing paragraph notes that EMA state and `tickEma` / `isEmaIdle` live in `audio/raf-loop.js` as pure functions, and the engine is responsible for the dt computation and AudioParam writes.

**`docs/DEPLOYMENT.md`**

- **Repository layout section.** Expanded the `server/` and `frontend/` lines to surface the M4 internal structure for any operator reading this doc cold. `server/` now lists `index.js`, `routes.js`, `ws-handler.js`, plus a one-line group for the supporting modules (viewport-processor, spatial, audio-metrics, landcover, client-state, parse-bounds, normalize, data-loader, config, load-env, types). `frontend/` calls out the `audio/` subdirectory (engine + context + buffer-cache + raf-loop + utils + constants), the soon-to-be-deleted `audio-engine.js` shim, and the remaining root-level modules. Both entries point at `docs/ARCHITECTURE.md` for the full subsystem diagrams. Deployment behavior is unchanged — same Docker image, same Pages bundle — the listing is purely informational so an ops reader doesn't think the backend is still a single 500-line file.

## What is **not** changed

- **`CLAUDE.md`** — gitignored per the M3 audit (E.1), not a deliverable for this stage.
- **No code changes.** This is a docs-only stage.
- **Other ARCHITECTURE.md sections** (Bus Fold-Mapping, WAV Loading, EMA Smoothing formulas, Coverage-Linear Ocean Detection, Low-Pass Filter Chain, Client-Side Motion Signals, Loop Progress, Visibility Handling, City Announcer) — still accurate; left untouched.
- **Other DEPLOYMENT.md sections** (Live URLs, Architecture three-layer diagram, Why this split, How to re-deploy, Cloudflare dashboard state, Credentials, Known issues, TODO, Smoke tests, Operator runbooks) — operator-facing, unchanged by the M4 module reshuffle.

## Verification

- `npm run lint` clean (no JS touched, but ran for sanity).
- `npm run format:check` clean.
- Cross-checked every module name in the two diagrams against `ls server/*.js` and `ls frontend/audio/*.js` — all 14 server modules and all 6 audio modules accounted for.
- Re-read both diagrams against the actual import graph to make sure the arrows reflect real `require()` / `import` edges, not fictional ones (e.g. `data-loader.js` uses `normalize.js` for fingerprint-cached p1/p99 scaling — real import; `viewport-processor.js` calls `parse-bounds.js` — real import).

## Files changed

- **Modified** `docs/ARCHITECTURE.md` — stale-reference fix, new Subsystems section with two ASCII diagrams, Data Flow rewrite, Idle Behavior expansion with rAF wake table, Timing Constants Location-column refresh + `IDLE_THRESHOLD` row.
- **Modified** `docs/DEPLOYMENT.md` — Repository layout section expanded under `server/` and `frontend/`.
- **Added** `docs/devlog/M4/2026-04-27-M4P5-2-architecture-and-deployment-refresh.md` — this entry.
- **Modified** `docs/DEVLOG.md` — index this entry.
