# Dev Log

Update logs, design decisions, and ideas for Geo-Sonification.

## Recording Guide

- **Order**: Reverse chronological — newest entry first, oldest last.
- **Location**: Each entry is a standalone file under `docs/devlog/M*/` (for example `docs/devlog/M2/`). Deprecated milestone entries are in `docs/devlog/deprecated/`.
- **Milestone folder**: Put each new entry in the active milestone folder (`M1`, `M2`, ...).
- **File naming (new entries)**: `YYYY-MM-DD-M*-kebab-case-title.md` (for example `2026-02-21-M2-jsdoc-annotations.md`).
- **Legacy files**: Existing entries that used the old naming style do not need to be renamed only for convention.
- **Heading format (entries)**: `# YYYY-MM-DD — <Category>: <Short Title>` (h1 in standalone entry files listed in `## Entries`).
- **Categories**: `Feature`, `Fix`, `Refactor`, `Design`, `Milestone`, `Discussion` (pick the most fitting one).
- **Category note for docs architecture changes**: use `Refactor` for structure/path changes; use `Design` for documentation conventions or policy updates.
- **Entry body**: Start with a 1–3 sentence summary of _what_ and _why_. Then add subsections (`##`) as needed for details, file lists, formulas, behavior matrices, etc.
- **Scope**: One entry per logical change. If a single session produces multiple independent changes, write separate entries (same date is fine).
- **File lists**: End each entry with a "Files changed" section listing new/modified/deleted files with a one-line description.
- **Index**: Add a link in `## Entries` when creating a new entry; use `### Standalone Design Docs` only for non-entry reference docs.

---

## Entries

| Date       | Category   | Title                                                                                                                                                                                         |
| ---------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-04-27 | Refactor   | [Tooling Cleanup — Drop `setup-git-hooks.sh`, Consolidate ESLint Blocks](devlog/M4/2026-04-27-M4-tooling-cleanup-eslint-blocks.md)                                                            |
| 2026-04-27 | Refactor   | [Extract `frontend/audio/utils.js` and `frontend/audio/constants.js`](devlog/M4/2026-04-27-M4-extract-audio-utils-and-constants.md)                                                           |
| 2026-04-27 | Design     | [Raise commitlint Body / Footer Max Line Length 72 → 100](devlog/M4/2026-04-27-M4-commitlint-body-max-100.md)                                                                                 |
| 2026-04-27 | Refactor   | [vitest + happy-dom Scaffold and Wire-Format Smoke](devlog/M4/2026-04-27-M4-vitest-and-wire-format-smoke.md)                                                                                  |
| 2026-04-27 | Design     | [M4 Plan Skeleton + Build-Tag Injection](devlog/M4/2026-04-27-M4-plan-skeleton-and-build-hash.md)                                                                                             |
| 2026-04-25 | Fix        | [Launcher Scripts Drop Stale WS_PORT After Single-Port Migration](devlog/M3/2026-04-25-M3-launcher-drop-stale-ws-port.md)                                                                     |
| 2026-04-25 | Fix        | [Defer Panel Stale Warning Until Disconnect Persists Past Grace Window](devlog/M3/2026-04-25-M3-stale-warning-grace-window.md)                                                                |
| 2026-04-25 | Feature    | [PlaceEcho Brand Mark for Trademark Specimen](devlog/M3/2026-04-25-M3-placeecho-trademark-specimen-branding.md)                                                                               |
| 2026-04-25 | Design     | [Deploy Pipeline Online (Pages + Fly Auto-Deploy)](devlog/M3/2026-04-25-M3-deploy-pipeline-online.md)                                                                                         |
| 2026-04-25 | Feature    | [Fly.io Auto-Deploy via GitHub Action](devlog/M3/2026-04-25-M3-fly-deploy-github-action.md)                                                                                                   |
| 2026-04-25 | Design     | [README Refresh for Grid Perf Stack](devlog/M3/2026-04-25-M3-readme-grid-perf-stack.md)                                                                                                       |
| 2026-04-25 | Refactor   | [Suppress Grid Stroke During Map Motion](devlog/M3/2026-04-25-M3-suppress-stroke-during-drag.md)                                                                                              |
| 2026-04-25 | Refactor   | [Tighten Viewport Debounce 200 → 120 ms](devlog/M3/2026-04-25-M3-tighter-viewport-debounce.md)                                                                                                |
| 2026-04-25 | Refactor   | [Static Asset Cache Headers](devlog/M3/2026-04-25-M3-static-asset-cache-headers.md)                                                                                                           |
| 2026-04-25 | Refactor   | [Server Response Compression (gzip + WS perMessageDeflate)](devlog/M3/2026-04-25-M3-server-response-compression.md)                                                                           |
| 2026-04-24 | Refactor   | [Encode Ambience as Opus 128k (20× Smaller)](devlog/M3/2026-04-24-M3-ambience-opus-encoding.md)                                                                                               |
| 2026-04-24 | Milestone  | [Production Deployment Handoff](devlog/M3/2026-04-24-M3-production-deployment-handoff.md)                                                                                                     |
| 2026-04-24 | Feature    | [Pages Build + Cloudflare Worker Subpath Proxy](devlog/M3/2026-04-24-M3-pages-deploy-and-worker-subpath-proxy.md)                                                                             |
| 2026-04-24 | Fix        | [Docker Cache Fingerprint + Fly VM Sizing](devlog/M3/2026-04-24-M3-docker-cache-fingerprint-and-fly-sizing.md)                                                                                |
| 2026-04-24 | Refactor   | [Single-Port Server + Fly.io Docker Setup](devlog/M3/2026-04-24-M3-single-port-server-and-fly-docker.md)                                                                                      |
| 2026-04-24 | Refactor   | [Frontend Deployment Runtime Config](devlog/M3/2026-04-24-M3-frontend-deployment-runtime-config.md)                                                                                           |
| 2026-04-24 | Design     | [Raise Commit Header Max Length to 100](devlog/M3/2026-04-24-M3-commit-header-max-100.md)                                                                                                     |
| 2026-04-24 | Refactor   | [Nudge Dot Fill One More Step to #606060](devlog/M3/2026-04-24-M3-dot-color-grey-tighter.md)                                                                                                  |
| 2026-04-24 | Refactor   | [Push Dot Overlay Further Into Mid-Grey](devlog/M3/2026-04-24-M3-dot-color-darker-grey.md)                                                                                                    |
| 2026-04-24 | Refactor   | [Darken Dot Overlay from #d0d0d0 to #b0b0b0](devlog/M3/2026-04-24-M3-darken-dot-overlay.md)                                                                                                   |
| 2026-04-24 | Refactor   | [Roll Back Dot Rendering Experiments to Pre-LOD State](devlog/M3/2026-04-24-M3-revert-dot-rendering-experiments.md)                                                                           |
| 2026-04-24 | Refactor   | [Bump Low-Zoom Dot Radius So the Wash Reads Clearly](devlog/M3/2026-04-24-M3-dot-wash-radius-bump.md)                                                                                         |
| 2026-04-24 | Refactor   | [Anti-Moiré via Sub-Pixel Low-Zoom Dot Radius](devlog/M3/2026-04-24-M3-sub-pixel-dot-anti-moire.md)                                                                                           |
| 2026-04-24 | Refactor   | [Tile LOD via Per-Feature Minzoom (Square 2-Tier)](devlog/M3/2026-04-24-M3-tile-lod-per-feature-minzoom.md)                                                                                   |
| 2026-04-23 | Fix        | [Tile LOD Actually Applies (Switch to --cluster-distance)](devlog/M3/2026-04-23-M3-tile-lod-cluster-distance.md)                                                                              |
| 2026-04-23 | Refactor   | [Bump Tile LOD Base-Zoom 8 → 10](devlog/M3/2026-04-23-M3-tile-lod-base-zoom-10.md)                                                                                                            |
| 2026-04-23 | Refactor   | [Tile LOD to Fix Moiré and Stutter at Low Zoom](devlog/M3/2026-04-23-M3-tile-lod-to-fix-moire-and-stutter.md)                                                                                 |
| 2026-04-23 | Refactor   | [Unify UI Accent Color to Mint #5CFFC8](devlog/M3/2026-04-23-M3-unify-accent-mint.md)                                                                                                         |
| 2026-04-23 | Refactor   | [Raise Announcer TTS Gain 0.3 → 0.8](devlog/M3/2026-04-23-M3-tts-gain-bump.md)                                                                                                                |
| 2026-04-23 | Refactor   | [Makeup Gain +12 dB with Urban Bus Preamp](devlog/M3/2026-04-23-M3-makeup-12db-urban-preamp.md)                                                                                               |
| 2026-04-23 | Refactor   | [Bump Master Makeup Gain from +8 dB to +10 dB](devlog/M3/2026-04-23-M3-makeup-gain-bump-10db.md)                                                                                              |
| 2026-04-23 | Feature    | [Announcer Sidechain Ducking](devlog/M3/2026-04-23-M3-announcer-sidechain-ducking.md)                                                                                                         |
| 2026-04-23 | Fix        | [Info Panel Post-Audit Cleanup](devlog/M3/2026-04-23-M3-info-panel-audit-cleanup.md)                                                                                                          |
| 2026-04-23 | Fix        | [Audio Status Stuck on "Loading…" After Second Start](devlog/M3/2026-04-23-M3-audio-status-stuck-loading-on-restart.md)                                                                       |
| 2026-04-23 | Refactor   | [Remove "Land Cover — by area" Subheader](devlog/M3/2026-04-23-M3-remove-land-cover-subheader.md)                                                                                             |
| 2026-04-23 | Refactor   | [Volume Slider Max 100% + Larger Hit Area](devlog/M3/2026-04-23-M3-volume-slider-max-100-and-hit-area.md)                                                                                     |
| 2026-04-23 | Feature    | [Master Loudness Normalization (−16 LUFS)](devlog/M3/2026-04-23-M3-loudness-normalization.md)                                                                                                 |
| 2026-04-23 | Refactor   | [Volume Slider Custom Paint](devlog/M3/2026-04-23-M3-volume-slider-custom-paint.md)                                                                                                           |
| 2026-04-23 | Refactor   | [Remove Per-Bus Audio Loading List](devlog/M3/2026-04-23-M3-remove-audio-bus-list.md)                                                                                                         |
| 2026-04-23 | Feature    | [Info Panel Visual Overhaul](devlog/M3/2026-04-23-M3-info-panel-visual-overhaul.md)                                                                                                           |
| 2026-04-23 | Fix        | [Frontend Lifecycle & Asset Failure Hardening](devlog/M3/2026-04-23-M3-frontend-lifecycle-and-asset-hardening.md)                                                                             |
| 2026-04-23 | Design     | [M3 Tech Debt Audit](devlog/M3/2026-04-23-M3-tech-debt-audit.md)                                                                                                                              |
| 2026-04-23 | Fix        | [Review Finding Follow-Ups](devlog/M3/2026-04-23-M3-review-finding-follow-ups.md)                                                                                                             |
| 2026-04-16 | Fix        | [Globe Dot Overlay + UI Overhaul](devlog/M3/2026-04-16-M3-globe-dot-overlay-fix.md)                                                                                                           |
| 2026-04-02 | Feature    | [City Announcer Population-Weighted Priority](devlog/M3/2026-04-02-M3-city-announcer-population-priority.md)                                                                                  |
| 2026-04-02 | Feature    | [City Name Announcer with Stereo Panning](devlog/M3/2026-04-02-M3-city-name-announcer.md)                                                                                                     |
| 2026-04-02 | Fix        | [Startup, Audio, and Antimeridian Edge Cases](devlog/M3/2026-04-02-M3-startup-audio-antimeridian-fixes.md)                                                                                    |
| 2026-03-16 | Refactor   | [Sync ARCHITECTURE.md and Code Comments with Implementation](devlog/M2/2026-03-16-M2-doc-code-sync.md)                                                                                        |
| 2026-03-16 | Fix        | [Loop Retrigger Phase Lock](devlog/M2/2026-03-16-M2-loop-retrigger-phase-lock.md)                                                                                                             |
| 2026-03-16 | Feature    | [Split Tree Bus into Forest/Shrub/Grass (5→7 Buses)](devlog/M2/2026-03-16-M2-split-tree-bus.md)                                                                                               |
| 2026-02-24 | Refactor   | [README GitHub Polish](devlog/M2/2026-02-24-M2-readme-github-polish.md)                                                                                                                       |
| 2026-02-24 | Feature    | [Loop Cycle Progress Bar](devlog/M2/2026-02-24-M2-loop-progress-bar.md)                                                                                                                       |
| 2026-02-23 | Fix        | [Audio Engine Code Review Fixes](devlog/M2/2026-02-23-M2-audio-engine-code-review-fixes.md)                                                                                                   |
| 2026-02-23 | Fix        | [Coverage 0–40 Linear Land/Ocean Mapping](devlog/M2/2026-02-23-M2-coverage-linear-0-40-mapping.md)                                                                                            |
| 2026-02-23 | Fix        | [Grid-Coverage Land/Ocean Mix Rule](devlog/M2/2026-02-23-M2-grid-coverage-land-ocean-mix.md)                                                                                                  |
| 2026-02-23 | Fix        | [Low-Pass Floor and Ocean Boost Logic Tuning](devlog/M2/2026-02-23-M2-lowpass-ocean-logic-tuning.md)                                                                                          |
| 2026-02-23 | Fix        | [Web Audio Trigger Phase Sync](devlog/M2/2026-02-23-M2-web-audio-trigger-phase-sync.md)                                                                                                       |
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
| 2026-02-21 | Refactor   | [JSDoc Type Annotations](devlog/M2/2026-02-21-jsdoc-annotations.md)                                                                                                                           |
| 2026-02-20 | Refactor   | [Frontend Module Split](devlog/M2/2026-02-20-frontend-module-split.md)                                                                                                                        |
| 2026-02-20 | Fix        | [Proximity Zoom Mapping](devlog/M2/2026-02-20-proximity-zoom-mapping.md)                                                                                                                      |
| 2026-02-20 | Fix        | [Crossfade Proximity Fix](devlog/M2/2026-02-20-crossfade-proximity-fix.md)                                                                                                                    |
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
