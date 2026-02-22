# Dev Log

Update logs, design decisions, and ideas for Geo-Sonification.

## Recording Guide

- **Order**: Reverse chronological — newest entry first, oldest last.
- **Location**: Each entry is a standalone file in `docs/devlog/`.
- **File naming**: `YYYY-MM-DD-kebab-case-title.md`
- **Heading format**: `# YYYY-MM-DD — <Category>: <Short Title>` (h1 in standalone file).
- **Categories**: `Feature`, `Fix`, `Refactor`, `Design`, `Milestone`, `Discussion` (pick the most fitting one).
- **Entry body**: Start with a 1–3 sentence summary of _what_ and _why_. Then add subsections (`##`) as needed for details, file lists, formulas, behavior matrices, etc.
- **Scope**: One entry per logical change. If a single session produces multiple independent changes, write separate entries (same date is fine).
- **File lists**: End each entry with a "Files changed" section listing new/modified/deleted files with a one-line description.
- **Index**: Add a link to this file when creating a new entry.

---

## Entries

| Date | Category | Title |
| --- | --- | --- |
| 2026-02-22 | Design | [Spec Gap Completion](docs/devlog/2026-02-22-spec-gap-completion.md) |
| 2026-02-22 | Fix | [Frontend Loop Playback Stability](docs/devlog/2026-02-22-loop-playback-fix.md) |
| 2026-02-22 | Refactor | [Remove Max/MSP Code](docs/devlog/2026-02-22-remove-maxmsp.md) |
| 2026-02-22 | Fix | [Web Audio & WebSocket Bug Fixes](docs/devlog/2026-02-22-web-audio-bugfix.md) |
| 2026-02-21 | Feature | [Web Audio Migration (Phase W)](docs/devlog/2026-02-21-web-audio-migration.md) |
| 2026-02-21 | Refactor | [JSDoc Type Annotations](docs/devlog/2026-02-21-jsdoc-annotations.md) |
| 2026-02-20 | Refactor | [Frontend Module Split](docs/devlog/2026-02-20-frontend-module-split.md) |
| 2026-02-20 | Fix | [Proximity Zoom Mapping](docs/devlog/2026-02-20-proximity-zoom-mapping.md) |
| 2026-02-20 | Fix | [Crossfade Proximity Fix](docs/devlog/2026-02-20-crossfade-proximity-fix.md) |
| 2026-02-20 | Feature | [Loop Playback](docs/devlog/2026-02-20-loop-playback.md) |
| 2026-02-19 | Feature | [Crop Bus](docs/devlog/2026-02-19-crop-bus.md) |
| 2026-02-19 | Feature | [Water Bus & 4-Bus Fold-Mapping](docs/devlog/2026-02-19-water-bus.md) |
| 2026-02-19 | Design | [Sound Design Architecture](docs/devlog/2026-02-19-sound-design-architecture.md) |
| 2026-02-19 | Milestone | [Server-Side Foundation](docs/devlog/2026-02-19-server-side-foundation.md) |
| 2026-02-08 | Feature | [OSC Pipeline Extensions](docs/devlog/2026-02-08-osc-pipeline-extensions.md) |
| 2026-02-06 | Feature | [Per-Grid Mode](docs/devlog/2026-02-06-per-grid-mode.md) |
| 2026-01-27 | Discussion | [Pivot to Real-Time](docs/devlog/2026-01-27-pivot-to-realtime.md) |
| 2026-01-22 | Discussion | [Initial Proposal](docs/devlog/2026-01-22-initial-proposal.md) |

### Standalone Design Docs

| Date | Title |
| --- | --- |
| 2026-02-06 | [Per-Grid Spatial Sonification — Design Rationale](docs/devlog/2026-02-06-per-grid-design-rationale.md) |
| 2026-01-26 | [Landcover Fix](docs/devlog/2026-01-26-landcover-fix.md) |

---

## Idea Backlog

- Auditory icons for landcover types (literal nature sounds: crickets, birds, wind)
- City-level deep dive with localized datasets (acoustic ecology, urban soundscape)
- Historical data slider if a self-built map backend is ever created
- Frequency-domain audification for multiple simultaneous data streams
