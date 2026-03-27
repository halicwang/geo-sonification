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
| 2026-03-26 | Feature    | [Granulation Layer](devlog/M2/2026-03-26-M2-granulation-layer.md)                                                                                                                             |
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
