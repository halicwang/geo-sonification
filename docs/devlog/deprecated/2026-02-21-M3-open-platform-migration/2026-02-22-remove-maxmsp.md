# 2026-02-22 — Refactor: Remove Max/MSP Code

> **Deprecated (2026-02-23):** M3 Open Platform milestone was abandoned. Tooling, tests, and bugfixes introduced during this period are retained; the Open Platform feature set was not pursued.

Removed all tracked Max/MSP and OSC-related runtime code from the repository. With Web Audio fully functional (Phase W, 2026-02-21), Max/MSP is no longer needed. The system now uses Web Audio exclusively for sonification. (Some local worktrees may still keep ignored legacy files under `sonification/`.)

## Changes

- Removed tracked Max/MSP files under `sonification/` (6 ES5 JS scripts, 2 .maxpat patches, sample placeholders). The path remains gitignored for optional local experiments.
- Deleted `server/osc.js` (UDP transport to Max) and `server/osc_schema.js` (OSC packet definitions)
- Deleted `scripts/osc_simulator.js` (OSC test tool)
- Deleted 3 OSC-specific test files: `osc.test.js`, `osc-disabled.test.js`, `osc-schema.test.js`
- Renamed `server/osc-metrics.js` → `server/audio-metrics.js` (inlined `LC_CLASS_ORDER` and `clamp01`)
- Renamed test files: `osc-metrics.test.js` → `audio-metrics.test.js`, `osc-metrics-bus.test.js` → `audio-metrics-bus.test.js`
- Removed `ENABLE_OSC`, `OSC_HOST`, `OSC_PORT`, `DEBUG_OSC` from `server/config.js` and `.env.example`
- Removed OSC-only typedefs (`OscArg`, `OscPacket`) from `server/types.js` and updated module references to `audio-metrics.js`
- Removed all OSC send calls from `server/viewport-processor.js`
- Removed OSC imports, `/api/manual` endpoint, and `oscReady` from `server/index.js`
- Removed `osc` npm dependency from `server/package.json`
- Simplified `start.command` (removed Max patch opening logic)
- Relocated audio sample directory: `sonification/samples/ambience/` → `frontend/audio/ambience/`
- Updated all documentation: `CLAUDE.md`, `ARCHITECTURE.md`, `README.md`
- Note: `DT_MIN_MS` / `DT_MAX_MS` / `DELTA_RATE_CEILING` cleanup belongs to the earlier delta-signal simplification (2026-02-19), not this Max/MSP removal.

## Files changed

- `sonification/` — tracked runtime files removed from git history; directory remains gitignored for local-only artifacts
- `server/osc.js` — deleted
- `server/osc_schema.js` — deleted
- `scripts/osc_simulator.js` — deleted
- `server/__tests__/osc.test.js` — deleted
- `server/__tests__/osc-disabled.test.js` — deleted
- `server/__tests__/osc-schema.test.js` — deleted
- `server/osc-metrics.js` → `server/audio-metrics.js` — renamed, inlined LC_CLASS_ORDER and clamp01 (modified)
- `server/__tests__/osc-metrics.test.js` → `server/__tests__/audio-metrics.test.js` — renamed (modified)
- `server/__tests__/osc-metrics-bus.test.js` → `server/__tests__/audio-metrics-bus.test.js` — renamed (modified)
- `server/types.js` — removed OSC-only typedefs (`OscArg`, `OscPacket`), updated reference comments (modified)
- `server/viewport-processor.js` — removed OSC send calls (modified)
- `server/index.js` — removed OSC imports, /api/manual, oscReady (modified)
- `server/config.js` — removed OSC config variables (modified)
- `server/package.json` — removed `osc` dependency (modified)
- `.env.example` — removed OSC variables (modified)
- `start.command` — removed Max/MSP logic (modified)
- `frontend/audio-engine.js` — removed Max references in comments (modified)
- `frontend/audio/ambience/.gitkeep` — new (relocated from sonification/samples/ambience/)
- `CLAUDE.md` — updated (modified)
- `ARCHITECTURE.md` — rewritten for Web Audio only (modified)
- `README.md` — rewritten for Web Audio only (modified)
