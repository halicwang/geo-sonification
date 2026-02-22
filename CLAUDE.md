# CLAUDE.md

geo-sonification is a real-time geographic data sonification system. A Node.js server processes Mapbox viewport data and streams audio parameters to a Web Audio engine running in the browser.

## Language

- All code, comments, commit messages, and documentation must be written in English.
- Conversation and planning with the user may be in English or Chinese depending on context.

## Tech Stack & Constraints

- Pure JavaScript — no TypeScript. Use JSDoc type annotations for IDE support.
- ESLint + Prettier configured at the project root. Run `npm run lint` and `npm run format:check`.
- Node.js 18+, Express, WebSocket (`ws`).
- Do not introduce new npm dependencies without explicit approval.

## Directory Conventions

| Directory     | Purpose                                                      | File naming                    |
| ------------- | ------------------------------------------------------------ | ------------------------------ |
| `server/`     | Node.js backend                                              | kebab-case (`mode-manager.js`) |
| `frontend/`   | Plain HTML/CSS/JS map client, no build tools                 | —                              |
| `data/raw/`   | GEE exports — source of truth, do not edit manually          | —                              |
| `data/cache/` | Derived data, auto-rebuilt by server — do not edit or commit | —                              |
| `gee/`        | Google Earth Engine export scripts                           | —                              |
| `docs/`       | Design documents and dev logs                                | —                              |
| `scripts/`    | Utility scripts                                              | —                              |

## Naming Conventions

- Variables and functions: `camelCase`
- Constants and environment variables: `UPPER_SNAKE_CASE`
- Server source files: `kebab-case.js`
- Test files: `server/__tests__/<module-name>.test.js`

## Core Design Principles

1. **`config.js` is the single source for runtime configuration.** All thresholds, ports, and tunable parameters live in `server/config.js`. No magic numbers in other files.

2. **`audio-metrics.js` is the audio computation module.** Bus fold-mapping (`LC_CLASS_ORDER`, `computeBusTargets`), ocean detection (`computeOceanLevel`), proximity, and delta calculations all live in `server/audio-metrics.js`.

3. **Single-responsibility modules.** Each server module does one thing.

4. **State factory pattern.** Per-client state is created via `createXxxState()` factory functions (e.g. `createModeState()`, `createDeltaState()`).

5. **EMA smoothing.** Exponential moving average is the standard approach for smoothing signal transitions.

## Do Not Touch

- **`data/raw/*.csv`** — GEE export results. Changes require re-export via GEE scripts.

## Documentation Update Policy

- **Feature changes** (new modules, architectural adjustments) must update all three files: `DEVLOG.md`, `README.md`, and `ARCHITECTURE.md`.
- **Bug fixes and internal refactors** only require a `DEVLOG.md` entry; update `README.md` and `ARCHITECTURE.md` as needed.

## Development Workflow

- After changing server code, run `npm test` and confirm all tests pass.
- Common commands: `npm start`, `npm run dev`, `npm test`, `npm run clean:cache`
- Environment variables: see `.env.example`

## Reference Docs

- System architecture: `ARCHITECTURE.md`
- Design decisions: `DEVLOG.md`
- Sound design: `docs/2026-02-19-sound-design-plan.md`
- Data schema: `data/raw/SCHEMA.md`
- Open platform spec: `docs/2026-02-21-MILESTONE-3-OPEN-PLATFORM-SPEC.md`
- Migration plan: `docs/2026-02-21-MILESTONE-3-MIGRATION-PLAN.md`
- Implementation guide: `docs/2026-02-22-MILESTONE-3-IMPLEMENTATION-GUIDE.md`
