# 2026-04-29 — Docs: M6 README + ARCHITECTURE updates

Wrap-up entry for M6 P2-3. README and `docs/ARCHITECTURE.md` updated
to reflect the new build pipeline and the runtime hover-glow module.
No code changes.

## README.md

- Section "4. Run GEE Export and Build PMTiles" now lists the three
  prerequisite commands for hover glow:
    1. `node scripts/download-natural-earth.js` (idempotent)
    2. `node scripts/compute-border-distance.js` (~3s, fingerprinted)
    3. `npm --prefix server run build:tiles` (rebuilds both
       `grids.pmtiles` and `grid_index.bin`)
- New subsection "Border-aware hover glow (M6)" — three short bullets
  on build-time, run-time, and the live-tunable DevTools surface.
- File-structure tree gains:
    - `data/cache/border-distance.v1.json`
    - `data/sources/natural-earth/`
    - `data/tiles/grid_index.bin`

## docs/ARCHITECTURE.md

New "Hover glow (`frontend/hover-glow.js`)" subsection between the
audio subsystem and the server subsystem. Captures the same module
layout the runtime devlog described, in the codebase's standard
"box of nested arrows" style — `parseGridIndex`, `tick()`,
`window.__hg`. Cross-references `compute-border-distance.js`,
`build-tiles.js`, `build-grid-index.js`, and the `circle-color`
paint expression in `map.js`.

## Verification scope (P2-1, P2-2)

Of the 10 manual verification scenarios in the M6 plan, 5 were
exercised live during P1-1/P1-2/P1-3 development and recorded in
[the runtime devlog](2026-04-29-M6-hover-glow-runtime.md#verified-scenarios-browser-testing):

| # | Scenario | Result |
| --- | --- | --- |
| 1 | Germany/France border zoom 7 | 80 cells, max glow 0.96 ✓ |
| 2 | Siberian interior zoom 5 | 0 cells ✓ |
| 3 | Taymyr coast zoom 5 | 286 cells ✓ |
| 4 | Antimeridian (Aleutians) zoom 5 | 15 cells ✓ |
| 5 | Mid-Pacific zoom 5 | 0 cells ✓ |
| — | Cleanup invariant | Cells leaving active set get `{glow:0}` ✓ |

The remaining scenarios (drag-from-Europe-to-America, sustained
30-second zoom-2 pan with FPS recording, globe→mercator transition,
mouseleave clearing, tab-blur clearing) are best run by the user on
their own machine — frame-rate measurements via a remote MCP browser
are not representative of typical desktop performance, and
sustained-pan profiling needs DevTools Performance recordings.
`window.__hg.forceTick()` and the live-tunable knobs in
`__hg.tune({...})` give the user direct probes for any further
exploration.

## Files changed

- `README.md` — MODIFY (build steps, hover-glow section, file tree)
- `docs/ARCHITECTURE.md` — MODIFY (new subsection)
