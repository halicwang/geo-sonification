# Dev Log

Update logs, design decisions, and ideas for Geo-Sonification.

## Recording Guide

- **Order**: Reverse chronological — newest entry first, oldest last.
- **Location**: Most entries live in their milestone folder under `docs/devlog/M*/` (for example `docs/devlog/M2/`). Deprecated milestone entries are in `docs/devlog/deprecated/`. Independent post-milestone tasks (no milestone framing) may sit at the root of `docs/devlog/` directly; the pre-commit hook regex `^docs/devlog/` accepts both locations.
- **Milestone folder**: Put each new milestone-scoped entry in the active milestone folder (`M1`, `M2`, ...). Default to a milestone folder unless the work is genuinely independent.
- **File naming (new entries)**: `YYYY-MM-DD-M*-kebab-case-title.md` for milestone entries (for example `2026-02-21-M2-jsdoc-annotations.md`); `YYYY-MM-DD-kebab-case-title.md` for root-level independent entries.
- **Legacy files**: Existing entries that used the old naming style do not need to be renamed only for convention.
- **Heading format (entries)**: `# YYYY-MM-DD — <Category>: <Short Title>` (h1 in standalone entry files listed in `## Entries`).
- **Categories**: `Feature`, `Fix`, `Refactor`, `Design`, `Milestone`, `Discussion` (pick the most fitting one).
- **Category note for docs architecture changes**: use `Refactor` for structure/path changes; use `Design` for documentation conventions or policy updates.
- **Entry body**: Start with a 1–3 sentence summary of _what_ and _why_. Then add subsections (`##`) as needed for details, file lists, formulas, behavior matrices, etc.
- **When to write an entry — three triggers (the only triggers)**: an entry is required only when the change matches one of:
    1. **New feature** — a user-facing capability or subsystem that did not exist before.
    2. **Significant enhancement** to an existing feature — notable change in behavior, scope, performance, or interface contract. Parameter tweaks, coefficient nudges, and cosmetic polish do not qualify.
    3. **Large-scale refactor** — architectural pivot, cross-module restructure, data-layout change, replacement of a major mechanism (e.g. DOM → GPU, sync → async, AoS → SoA).

    Skip the devlog for everything else: bug fixes, parameter tweaks, single-line config changes, glyph/icon swaps, dead-code removal, doc factual fixes, repo housekeeping, isolated perf gates, cosmetic UI polish, single-module hygiene cleanup. The commit message body is the right home — write a substantive body when needed.

- **Mandatory gate (every commit)**: Before each commit, self-evaluate the change against the three triggers. The judgment is mandatory; the entry is conditional. If yes → entry created BEFORE the commit. If no → commit without devlog. If genuinely ambiguous → ask the user before committing.
- **Scope (when an entry is warranted)**: One entry per logical change. If a single session produces multiple independent triggering changes, write separate entries (same date is fine).
- **File lists**: End each entry with a "Files changed" section listing new/modified/deleted files with a one-line description.
- **Index**: Add a link in `## Entries` when creating a new entry; use `### Standalone Design Docs` only for non-entry reference docs.

---

## Entries

| Date       | Category   | Title                                                                                                                                                                                         |
| ---------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-08 | Design     | [Add Git Workflow Boundary Rule to CLAUDE.md and AGENTS.md](devlog/M6/2026-05-08-M6-git-workflow-boundary-rule.md)                                                                            |
| 2026-05-04 | Feature    | [Light / Dark / Auto Theme Switching](devlog/M6/2026-05-04-M6-frontend-light-dark-auto-theme.md)                                                                                              |
| 2026-05-03 | Refactor   | [Split city-announcer into spatial + cache + orchestrator](devlog/M6/2026-05-03-M6-frontend-city-announcer-split.md)                                                                          |
| 2026-05-03 | Refactor   | [Extract voice-scheduler from audio/engine.js](devlog/M6/2026-05-03-M6-frontend-engine-voice-scheduler-split.md)                                                                              |
| 2026-05-03 | Refactor   | [Inject UI Callbacks into map.js](devlog/M6/2026-05-03-M6-frontend-map-ui-callback-injection.md)                                                                                              |
| 2026-05-03 | Fix        | [Process-Level Rejection and Exception Handlers](devlog/M6/2026-05-03-M6-process-error-handlers.md)                                                                                           |
| 2026-05-03 | Refactor   | [Server Occam Sweep — Drop Dead Grid-Count Proximity, Simplify Defensive Guards](devlog/M6/2026-05-03-M6-server-occam-sweep.md)                                                               |
| 2026-05-03 | Design     | [Devlog Recording Guide Allows Root-Level Independent Entries](devlog/M6/2026-05-03-M6-devlog-rule-allow-root-level-entries.md)                                                               |
| 2026-05-03 | Feature    | [Mobile Info Panel Rework — Content Reflow, State Colors, Toggle-Driven Transitions](devlog/2026-05-03-mobile-panel-rework.md)                                                                |
| 2026-05-01 | Fix        | [Doc Audit & Resync (README, ARCHITECTURE, DEPLOYMENT)](devlog/M6/2026-05-01-M6-doc-audit-resync.md)                                                                                          |
| 2026-05-01 | Fix        | [Retroactive Summary Corrections (M1, M2, M3, M6)](devlog/M6/2026-05-01-M6-retroactive-summary-corrections.md)                                                                                |
| 2026-04-30 | Refactor   | [Hover-glow GPU Custom-Layer Rewrite](devlog/M6/2026-04-30-M6-hover-glow-gpu-custom-layer.md)                                                                                                 |
| 2026-04-30 | Refactor   | [Drop Legacy Aggregation Path](devlog/M6/2026-04-30-M6-drop-legacy-aggregation.md)                                                                                                            |
| 2026-04-30 | Refactor   | [Hover-glow Perf — SoA Candidates + KM_PER_DEG Hoist + Typedef](devlog/M6/2026-04-30-M6-hover-glow-perf-soa.md)                                                                               |
| 2026-04-30 | Feature    | [Hover-glow Cursor-Floor Halo](devlog/M6/2026-04-30-M6-hover-glow-cursor-floor.md)                                                                                                            |
| 2026-04-29 | Feature    | [Hover-glow Tunables + Tests (M6 P1-4/P1-5)](devlog/M6/2026-04-29-M6-hover-glow-tunables-tests.md)                                                                                            |
| 2026-04-29 | Feature    | [Hover-glow Runtime (M6 P1-1/P1-2/P1-3)](devlog/M6/2026-04-29-M6-hover-glow-runtime.md)                                                                                                       |
| 2026-04-29 | Feature    | [Border-distance Pipeline (M6 P0)](devlog/M6/2026-04-29-M6-border-distance-pipeline.md)                                                                                                       |
| 2026-04-28 | Refactor   | [Drive Proximity Locally from Live Zoom](devlog/M5/2026-04-28-M5-proximity-local-direct.md)                                                                                                   |
| 2026-04-28 | Feature    | [Mobile UX Redesign — Info Panel as Bottom Sheet](devlog/2026-04-28-mobile-bottom-sheet.md)                                                                                                   |
| 2026-04-28 | Milestone  | [M5 Quick Wins (Pack A) — single growing entry across stages](devlog/M5/2026-04-28-M5-quick-wins.md)                                                                                          |
| 2026-04-27 | Milestone  | [M4 Residual Debt → M5 Candidates (P5-4)](devlog/M4/2026-04-27-M4P5-4-residual-debt.md)                                                                                                       |
| 2026-04-27 | Milestone  | [M4 Razor Refactor Summary (P5-3)](devlog/M4/2026-04-27-M4P5-3-milestone-summary.md)                                                                                                          |
| 2026-04-27 | Design     | [Revert P5-1 rAF Idle Detection — Caused Audio Dropout in Production](devlog/M4/2026-04-27-M4-revert-p5-1-raf-idle.md)                                                                        |
| 2026-04-27 | Refactor   | [Merge `mode-manager.js` + `delta-state.js` into `client-state.js`](devlog/M4/2026-04-27-M4-merge-client-state.md)                                                                            |
| 2026-04-27 | Refactor   | [Extract `server/ws-handler.js` and `server/parse-bounds.js`](devlog/M4/2026-04-27-M4-extract-ws-handler.md)                                                                                  |
| 2026-04-27 | Refactor   | [Extract `server/routes.js` (HTTP Route Handlers)](devlog/M4/2026-04-27-M4-extract-server-routes.md)                                                                                          |
| 2026-04-27 | Refactor   | [Collapse `audio-engine.js` to a Re-Export Shim, New `audio/engine.js`](devlog/M4/2026-04-27-M4-collapse-engine-shim.md)                                                                      |
| 2026-04-27 | Refactor   | [Extract `frontend/audio/raf-loop.js` (Pure EMA Driver)](devlog/M4/2026-04-27-M4-extract-raf-loop.md)                                                                                         |
| 2026-04-27 | Refactor   | [Extract `frontend/audio/buffer-cache.js`](devlog/M4/2026-04-27-M4-extract-buffer-cache.md)                                                                                                   |
| 2026-04-27 | Refactor   | [Extract `frontend/audio/context.js` (Master Chain Factory)](devlog/M4/2026-04-27-M4-extract-audio-context.md)                                                                                |
| 2026-04-27 | Refactor   | [Extract Loop-Progress Bar from `main.js` into `frontend/progress.js`](devlog/M4/2026-04-27-M4-extract-progress-from-main.md)                                                                 |
| 2026-04-27 | Refactor   | [Extract Popup Logic from `map.js` into `frontend/popup.js`](devlog/M4/2026-04-27-M4-extract-popup-from-map.md)                                                                               |
| 2026-04-27 | Design     | [Occam Pivot — Drop P0-5, P1-2, P2-1/2/3; Collapse P3/P4 Stages; Remove Unused `lerp`](devlog/M4/2026-04-27-M4-occam-pivot.md)                                                                |
| 2026-04-27 | Refactor   | [Extract `frontend/audio/utils.js` and `frontend/audio/constants.js`](devlog/M4/2026-04-27-M4-extract-audio-utils-and-constants.md)                                                           |
| 2026-04-27 | Refactor   | [vitest + happy-dom Scaffold and Wire-Format Smoke](devlog/M4/2026-04-27-M4-vitest-and-wire-format-smoke.md)                                                                                  |
| 2026-04-25 | Feature    | [PlaceEcho Brand Mark for Trademark Specimen](devlog/M3/2026-04-25-M3-placeecho-trademark-specimen-branding.md)                                                                               |
| 2026-04-25 | Feature    | [Fly.io Auto-Deploy via GitHub Action](devlog/M3/2026-04-25-M3-fly-deploy-github-action.md)                                                                                                   |
| 2026-04-25 | Refactor   | [Server Response Compression (gzip + WS perMessageDeflate)](devlog/M3/2026-04-25-M3-server-response-compression.md)                                                                           |
| 2026-04-24 | Refactor   | [Encode Ambience as Opus 128k (20× Smaller)](devlog/M3/2026-04-24-M3-ambience-opus-encoding.md)                                                                                               |
| 2026-04-24 | Milestone  | [Production Deployment Handoff](devlog/M3/2026-04-24-M3-production-deployment-handoff.md)                                                                                                     |
| 2026-04-24 | Feature    | [Pages Build + Cloudflare Worker Subpath Proxy](devlog/M3/2026-04-24-M3-pages-deploy-and-worker-subpath-proxy.md)                                                                             |
| 2026-04-24 | Refactor   | [Single-Port Server + Fly.io Docker Setup](devlog/M3/2026-04-24-M3-single-port-server-and-fly-docker.md)                                                                                      |
| 2026-04-24 | Refactor   | [Frontend Deployment Runtime Config](devlog/M3/2026-04-24-M3-frontend-deployment-runtime-config.md)                                                                                           |
| 2026-04-24 | Refactor   | [Tile LOD via Per-Feature Minzoom (Square 2-Tier)](devlog/M3/2026-04-24-M3-tile-lod-per-feature-minzoom.md)                                                                                   |
| 2026-04-23 | Feature    | [Announcer Sidechain Ducking](devlog/M3/2026-04-23-M3-announcer-sidechain-ducking.md)                                                                                                         |
| 2026-04-23 | Feature    | [Master Loudness Normalization (−16 LUFS)](devlog/M3/2026-04-23-M3-loudness-normalization.md)                                                                                                 |
| 2026-04-23 | Feature    | [Info Panel Visual Overhaul](devlog/M3/2026-04-23-M3-info-panel-visual-overhaul.md)                                                                                                           |
| 2026-04-16 | Fix        | [Globe Dot Overlay + UI Overhaul](devlog/M3/2026-04-16-M3-globe-dot-overlay-fix.md)                                                                                                           |
| 2026-04-02 | Feature    | [City Announcer Population-Weighted Priority](devlog/M3/2026-04-02-M3-city-announcer-population-priority.md)                                                                                  |
| 2026-04-02 | Feature    | [City Name Announcer with Stereo Panning](devlog/M3/2026-04-02-M3-city-name-announcer.md)                                                                                                     |
| 2026-03-16 | Feature    | [Split Tree Bus into Forest/Shrub/Grass (5→7 Buses)](devlog/M2/2026-03-16-M2-split-tree-bus.md)                                                                                               |
| 2026-02-24 | Feature    | [Loop Cycle Progress Bar](devlog/M2/2026-02-24-M2-loop-progress-bar.md)                                                                                                                       |
| 2026-02-23 | Fix        | [Web Audio Loop Crossfade Stability](devlog/M2/2026-02-23-M2-web-audio-loop-crossfade-stability.md)                                                                                           |
| 2026-02-23 | Refactor   | [~~M3 Doc Hierarchy Reorganization~~](devlog/deprecated/2026-02-21-M3-open-platform-migration/2026-02-23-M3-doc-hierarchy-reorganization.md) _(M3 deprecated)_                                |
| 2026-02-22 | Fix        | [Pre-Commit Prettier Guard](devlog/deprecated/2026-02-21-M3-open-platform-migration/2026-02-22-M3-pre-commit-prettier-guard.md) _(M3 — milestone deprecated, changes retained)_               |
| 2026-02-22 | Design     | [P0 Close-Out & Planning Hierarchy](devlog/deprecated/2026-02-21-M3-open-platform-migration/2026-02-22-M3-p0-close-and-planning-hierarchy.md) _(M3 — milestone deprecated, changes retained)_ |
| 2026-02-22 | Feature    | [Provisional SLO Benchmark (P0-B)](devlog/deprecated/2026-02-21-M3-open-platform-migration/2026-02-22-M3-provisional-slo-benchmark.md) _(M3 — milestone deprecated, changes retained)_        |
| 2026-02-22 | Feature    | [Golden Baseline Harness (P0-A)](devlog/deprecated/2026-02-21-M3-open-platform-migration/2026-02-22-M3-golden-baseline-harness.md) _(M3 — milestone deprecated, changes retained)_            |
| 2026-02-22 | Refactor   | [Rename gee/ to gee-scripts/](devlog/deprecated/2026-02-21-M3-open-platform-migration/2026-02-22-M3-rename-gee-scripts.md) _(M3 — milestone deprecated, changes retained)_                    |
| 2026-02-22 | Feature    | [GitHub Actions CI Workflow](devlog/deprecated/2026-02-21-M3-open-platform-migration/2026-02-22-M3-github-ci.md) _(M3 — milestone deprecated, changes retained)_                              |
| 2026-02-22 | Refactor   | [Move Project Docs into docs/](devlog/deprecated/2026-02-21-M3-open-platform-migration/2026-02-22-M3-docs-root-cleanup.md) _(M3 — milestone deprecated, changes retained)_                    |
| 2026-02-22 | Design     | [~~Spec Gap Completion~~](devlog/deprecated/2026-02-21-M3-open-platform-migration/2026-02-22-spec-gap-completion.md) _(M3 deprecated)_                                                        |
| 2026-02-22 | Fix        | [Frontend Loop Playback Stability](devlog/deprecated/2026-02-21-M3-open-platform-migration/2026-02-22-loop-playback-fix.md) _(M3 — milestone deprecated, changes retained)_                   |
| 2026-02-22 | Refactor   | [Remove Max/MSP Code](devlog/deprecated/2026-02-21-M3-open-platform-migration/2026-02-22-remove-maxmsp.md) _(M3 — milestone deprecated, changes retained)_                                    |
| 2026-02-22 | Fix        | [Web Audio & WebSocket Bug Fixes](devlog/deprecated/2026-02-21-M3-open-platform-migration/2026-02-22-web-audio-bugfix.md) _(M3 — milestone deprecated, changes retained)_                     |
| 2026-02-21 | Feature    | [Web Audio Migration (Phase W)](devlog/deprecated/2026-02-21-M3-open-platform-migration/2026-02-21-web-audio-migration.md) _(M3 — milestone deprecated, changes retained)_                    |
| 2026-02-20 | Refactor   | [Frontend Module Split](devlog/M2/2026-02-20-frontend-module-split.md)                                                                                                                        |
| 2026-02-20 | Feature    | [Loop Playback](devlog/M2/2026-02-20-loop-playback.md)                                                                                                                                        |
| 2026-02-19 | Feature    | [Crop Bus](devlog/M2/2026-02-19-crop-bus.md)                                                                                                                                                  |
| 2026-02-19 | Feature    | [Water Bus & 4-Bus Fold-Mapping](devlog/M2/2026-02-19-water-bus.md)                                                                                                                           |
| 2026-02-19 | Design     | [Sound Design Architecture](devlog/M2/2026-02-19-sound-design-architecture.md)                                                                                                                |
| 2026-02-19 | Milestone  | [Server-Side Foundation](devlog/M2/2026-02-19-server-side-foundation.md)                                                                                                                      |
| 2026-02-08 | Feature    | [OSC Pipeline Extensions](devlog/M1/2026-02-08-osc-pipeline-extensions.md)                                                                                                                    |
| 2026-02-06 | Feature    | [Per-Grid Mode](devlog/M1/2026-02-06-per-grid-mode.md)                                                                                                                                        |
| 2026-01-27 | Discussion | [Pivot to Real-Time](devlog/M1/2026-01-27-pivot-to-realtime.md)                                                                                                                               |
| 2026-01-22 | Discussion | [Initial Proposal](devlog/M1/2026-01-22-initial-proposal.md)                                                                                                                                  |

### Standalone Design Docs

| Date       | Title                                                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| 2026-02-06 | [Per-Grid Spatial Sonification — Design Rationale](devlog/M1/2026-02-06-per-grid-design-rationale.md) |
| 2026-01-26 | [Landcover Fix](devlog/M1/2026-01-26-landcover-fix.md)                                                |

---

## Idea Backlog

- Auditory icons for landcover types (literal nature sounds: crickets, birds, wind)
- City-level deep dive with localized datasets (acoustic ecology, urban soundscape)
- Historical data slider if a self-built map backend is ever created
- Frequency-domain audification for multiple simultaneous data streams
