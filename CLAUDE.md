# CLAUDE.md

geo-sonification is a real-time geographic data sonification system. A Node.js server processes Mapbox viewport data and streams OSC messages to a Max/MSP synthesis engine.

## Tech Stack & Constraints

- Pure JavaScript — no TypeScript. Use JSDoc type annotations for IDE support.
- ESLint + Prettier configured at the project root. Run `npm run lint` and `npm run format:check`.
- Node.js 18+, Express, WebSocket (`ws`), OSC over UDP (`osc`).
- Max/MSP 8+ — JS scripts inside Max run on an **ES5 engine**. No arrow functions, template literals, destructuring, `let`/`const`, or any ES6+ syntax in `sonification/*.js` files.
- Do not introduce new npm dependencies without explicit approval.

## Directory Conventions

| Directory       | Purpose                                                      | File naming                            |
| --------------- | ------------------------------------------------------------ | -------------------------------------- |
| `server/`       | Node.js backend                                              | kebab-case (`mode-manager.js`)         |
| `sonification/` | Max/MSP patches & JS control scripts                         | snake_case (`crossfade_controller.js`) |
| `frontend/`     | Plain HTML/CSS/JS map client, no build tools                 | —                                      |
| `data/raw/`     | GEE exports — source of truth, do not edit manually          | —                                      |
| `data/cache/`   | Derived data, auto-rebuilt by server — do not edit or commit | —                                      |
| `gee/`          | Google Earth Engine export scripts                           | —                                      |
| `docs/`         | Design documents and dev logs                                | —                                      |
| `scripts/`      | Utility scripts                                              | —                                      |

## Naming Conventions

- Variables and functions: `camelCase`
- Constants and environment variables: `UPPER_SNAKE_CASE`
- Server source files: `kebab-case.js`
- Sonification JS files: `snake_case.js`
- Test files: `server/__tests__/<module-name>.test.js`

## Core Design Principles

1. **OSC protocol: extend only, never modify.** New OSC addresses can be added freely. Existing message addresses and argument formats must never change.

2. **`osc_schema.js` is the single source of truth for OSC.** All OSC addresses, type-tag sequences, and packet builders must be imported from `server/osc_schema.js`. Never hardcode OSC address strings (e.g. `'/landcover'`) in other files.

3. **`config.js` is the single source for runtime configuration.** All thresholds, ports, and tunable parameters live in `server/config.js`. No magic numbers in other files.

4. **Single-responsibility modules.** Each server module does one thing.

5. **State factory pattern.** Per-client state is created via `createXxxState()` factory functions (e.g. `createModeState()`, `createDeltaState()`).

6. **EMA smoothing.** Exponential moving average is the standard approach for smoothing signal transitions.

## Do Not Touch

- **`.maxpat` files** — binary Max patches, not editable as text.
- **`data/raw/*.csv`** — GEE export results. Changes require re-export via GEE scripts.
- **`sonification/samples/`** — audio assets. Do not replace or delete.

## Development Workflow

- After changing server code, run `npm test` and confirm all tests pass.
- Common commands: `npm start`, `npm run dev`, `npm test`, `npm run clean:cache`
- Environment variables: see `.env.example`

## Reference Docs

- System architecture: `ARCHITECTURE.md`
- Design decisions: `DEVLOG.md`
- Sound design: `sound_design_plan.md`
- Data schema: `data/raw/SCHEMA.md`
