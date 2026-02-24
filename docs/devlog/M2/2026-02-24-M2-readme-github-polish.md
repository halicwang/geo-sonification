# 2026-02-24 — Refactor: README GitHub Polish

Overhauled README.md for public GitHub publishing. The existing content was technically accurate but read like an internal development reference rather than a project landing page.

## Changes

### P1 — High impact

- Added project pitch paragraph below the title, explaining the project's purpose without implying global coverage out of the box
- Expanded WAV audio file prerequisites with precise format specs: 48 kHz, stereo recommended, crossfade tail requirement (last 1.875 s = copy of first 1.875 s), sourcing suggestions
- Added Data Sources section at the bottom referencing ESA WorldCover 2021, WorldPop 2020, and VIIRS Nighttime Lights with license info, linking to `NOTICE` for full attribution

### P2 — Polish

- Added CI, License (Apache-2.0), and Node.js version badges at the top
- Wrapped File Structure in a collapsible `<details>` block (56-line tree was visually dominant)
- Converted one-click start from a heading to a blockquote callout with prerequisite note ("Requires steps 1–4 below")

### P3 — Nice to have

- Added Contributing section: welcomes PRs, recommends opening an issue first, references Conventional Commits + commitlint
- Expanded API Endpoints with WebSocket documentation: connection address, client→server message format (including required `zoom` field), server→client response shape, link to ARCHITECTURE.md

## Files changed

- `README.md` — all changes described above
- `docs/devlog/M2/2026-02-24-M2-readme-github-polish.md` — this entry
- `docs/DEVLOG.md` — index link added
