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
| `docs/plans/` | Design proposals, milestone specs, migration plans           | —                              |
| `docs/devlog/`| Development logs and debugging records (`M1/`, `M2/`, `M3/`) | —                              |
| `scripts/`    | Utility scripts                                              | —                              |

## Naming Conventions

- Variables and functions: `camelCase`
- Constants and environment variables: `UPPER_SNAKE_CASE`
- Server source files: `kebab-case.js`
- Test files: `server/__tests__/<module-name>.test.js`

## Do Not Touch

- **`data/raw/*.csv`** — GEE export results. Changes require re-export via GEE scripts.

## Documentation Update Policy

- **Feature changes** (new modules, architectural adjustments) must: create a new entry in `docs/devlog/M*/`, add it to the `DEVLOG.md` index, and update `README.md` and `ARCHITECTURE.md` when behavior changed.
- **Bug fixes and internal refactors** require a new `docs/devlog/M*/` entry + index link; update `README.md` and `ARCHITECTURE.md` if external behavior or operator workflow changed.

## Development Workflow

- Mandatory pre-flight before any code/docs change: read `DEVLOG.md` `Recording Guide` and the latest relevant entries for the milestone being edited.
- After changing server code, run `npm test` and confirm all tests pass.
- Common commands: `npm start`, `npm run dev`, `npm test`, `npm run clean:cache`
- Environment variables: see `.env.example`

## Reference Docs

- System architecture: `ARCHITECTURE.md`
- Design decisions: `DEVLOG.md`
- Data schema: `data/raw/SCHEMA.md`
- Open platform spec: `docs/plans/M3/2026-02-21-M3-open-platform-spec.md`
- Migration plan: `docs/plans/M3/2026-02-21-M3-migration-plan.md`
- Implementation guide: `docs/plans/M3/2026-02-22-M3-implementation-guide.md`
