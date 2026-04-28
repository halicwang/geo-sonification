# 2026-04-27 — Refactor: vitest + happy-dom Scaffold and Wire-Format Smoke

Light up the frontend test rig (vitest + happy-dom + a hand-rolled
Web Audio mock) and stand up `npm run smoke:wire-format` — a static
regression smoke that fails CI if any HTTP route field name or WS
message field name drifts from the captured baseline. This is M4
P0-1, the first stage on `feat/M4` that every later phase depends on.

## Why now

M3's tech-debt audit (item A.1) flagged that `frontend/__tests__/`
does not exist; until P0-1, no part of the frontend can be tested in
isolation. Phase P3 is the major audio decomposition pass — splitting
`frontend/audio-engine.js` (1186 lines) into seven testable modules —
and refuses to start without unit-test scaffolding under it. P4 then
moves server routes into `server/routes.js` / `server/ws-handler.js`,
and it must do so without renaming or removing any field that an open
`placeecho.com` session would receive across the eventual P5-4 merge.

P0-1 lights up both halves of that safety net in one stage:

- **`npm run test:frontend`** (vitest + happy-dom) — vitest is locked
  at `^3.2.4` because vitest 4 requires Node ≥ 20.19 and the existing
  CI matrix is `[18, 22]`. happy-dom is pinned at `^15` for the same
  Node 18 reason (happy-dom 16 drops Node 18 support).
- **`npm run smoke:wire-format`** — reads
  `scripts/wire-format-baseline.json` and verifies every listed route
  path, HTTP response field, WS inbound type, WS outbound type, and
  payload field name still appears in the active server source tree.

## Decisions and rationale

### Where vitest installs

Root `devDependencies`. The frontend has no `package.json` (it's
plain HTML/JS served statically); creating one purely to host a test
dep would force a third `npm ci --prefix frontend` step in CI and
break the existing root + server two-package layout. vitest's `include`
glob (`frontend/__tests__/**/*.test.js`) resolves test files anywhere,
so the install location is irrelevant to test discovery.

### Wire-format smoke design

Three options were considered:

- **A — diff vs `main`** (`git show main:server/index.js | grep ...`):
  rejected. Breaks on shallow clones. Once `feat/M4` diverges
  meaningfully, `main` stops being a stable reference for routes that
  P4 deliberately moves around.
- **B — frozen baseline JSON** (`scripts/wire-format-baseline.json`):
  chosen. Captured once; drift requires deliberately editing the
  JSON. Multi-file grep over `server/**/*.js` survives P4's planned
  route extraction (`server/routes.js`, `server/ws-handler.js`).
- **C — runtime probe** (boot the server, hit `/health` etc.):
  rejected. Overlaps with the existing `npm run smoke`
  (smoke-worldcover.js) which already does live HTTP + WS exercise,
  and would need data fixtures every CI run.

Drift detection is **rename/removal-strict, addition-tolerant**. The
script flags any baseline-listed identifier that no longer appears in
the source tree, but does not fail when new fields are added — that
matches the proposal §2.A rule that wire-format additions are allowed
within M4. To intentionally update the baseline after a deliberate
field rename, run `npm run smoke:wire-format -- --update`.

### Mock surface — full 13 APIs up front

`audio-engine.js` today only calls `createGain`, `createBufferSource`,
`createBiquadFilter`, `createDynamicsCompressor`, but the proposal
lists 13 APIs because `city-announcer.js` adds `createPanner` +
`decodeAudioData`, the buffer cache uses `createBuffer` +
`decodeAudioData`, and lifecycle code reads `currentTime`, `sampleRate`,
`destination` and calls `suspend` / `resume` / `close`. Building the
full surface in P0-1 means subsequent P3 stages don't churn the mock
helper — the mock is an "engine room utility", not part of any single
stage's diff.

Each create* factory returns a chainable node so `a.connect(b).connect(c)`
compiles. AudioParam-like properties (`gain`, `frequency`, `Q`, etc.)
expose `setValueAtTime` / `linearRampToValueAtTime` /
`exponentialRampToValueAtTime` / `setTargetAtTime` /
`cancelScheduledValues`. `currentTime` is a getter on a settable
internal `_now` so tests can inject a fake clock without monkey-patching
globals.

### CI placement

Two new steps slot into the existing `test` job, **after** `npm test`
(jest). Order matters: jest is the existing mature gate (154 tests);
running it first means a vitest scaffold issue can never mask a
regression in server logic. No new jobs are added; the matrix stays
at Node 18 + 22.

### ESLint block count temporarily 6

A new block grants vitest globals to `frontend/__tests__/**`. This
pushes the block count from 5 to 6; P0-4 (tooling cleanup) will
collapse it back to ≤ 5 by merging the server + scripts blocks. The
overshoot is intentional and documented for the P0-4 stage to pick
up.

## What changed

### Test infrastructure (new)

- **`vitest.config.js`** — happy-dom env, glob for `frontend/__tests__/`,
  v8 coverage provider, excludes for Mapbox / WebGL / WS modules that
  happy-dom cannot exercise (proposal §11).
- **`frontend/__tests__/_helpers/audio-context-mock.js`** — 13-API
  Web Audio mock. Chainable nodes, AudioParam mocks, settable fake
  clock.
- **`frontend/__tests__/_smoke.test.js`** — DOM smoke (proves
  happy-dom env loads).
- **`frontend/__tests__/audio/_smoke.test.js`** — mock-audio smoke
  (proves the chainable connect graph + spies work).

### Wire-format smoke (new)

- **`scripts/wire-format-baseline.json`** — frozen contract: 3 HTTP
  routes (`/health`, `/api/config`, `/api/viewport`), 1 WS inbound
  type (`viewport`), 2 WS outbound types (`stats`, `error`); 18-key
  union for the stats payload (covers unicast, broadcast,
  loading-state, plus the `mode` field that gets stripped from
  broadcasts).
- **`scripts/smoke-wire-format.js`** — static grep over `server/**/*.js`
  (excluding `__tests__/` and `node_modules/`); rename/removal-strict,
  addition-tolerant; `--update` flag refreshes the baseline.

### Wiring (modified)

- **`package.json`** — `+vitest@^3.2.4`, `+happy-dom@^15.11.0`,
  `+@vitest/coverage-v8@^3.2.4` to `devDependencies`; new scripts
  `test:frontend` and `smoke:wire-format`.
- **`.github/workflows/ci.yml`** — two new steps in the existing
  `test` job, running on Node 18 + 22.
- **`eslint.config.js`** — new block for `frontend/__tests__/**`
  granting vitest globals; the existing frontend block now ignores
  the test directory. Block count temporarily 6 (P0-4 cleanup).

### Documentation

- **`docs/plans/M4/2026-04-27-M4-razor-refactor-proposal.md` §10** —
  the wire-format contract table is now verified against `server/index.js`
  HEAD; the `(P0-1 verify)` placeholders are replaced with concrete
  field names; the obsolete "/state" planning artifact note is dropped.
- **`docs/devlog/M4/2026-04-27-M4-vitest-and-wire-format-smoke.md`** —
  this entry.
- **`docs/DEVLOG.md`** — index link to this entry.

## Verification

- `npm install` — completes; `package-lock.json` updates with
  vitest@3.2.4 + happy-dom@15.x + @vitest/coverage-v8@3.2.4.
- `npm run test:frontend` — both smoke tests pass.
- `npm run smoke:wire-format` — exits 0 against current server tree
  (baseline captured from current source).
- `npm test` — 154 server jest tests still green.
- `npm run lint` — eslint green including the new block.
- `npm run format:check` — prettier green.
- **Negative test**: temporarily renamed `dataLoaded` → `data_loaded`
  in `server/index.js` `/health` handler; `npm run smoke:wire-format`
  exited non-zero with `route GET /health: response field 'dataLoaded'
  no longer appears in server/**/*.js`; reverted.

## Risks and rollback

- **vitest@3.2.4 ↔ Node 18**: confirmed locally; if CI matrix surfaces
  a runtime error, revert this commit on `feat/M4` and pin a different
  3.x patch.
- **happy-dom missing an API the smokes don't yet exercise**: P0-1
  smoke surface is intentionally minimal. Downstream stages add
  coverage and surface gaps; if a real gap appears we can switch
  `environment: 'happy-dom'` to `'jsdom'` in `vitest.config.js` (same
  shape, different package; proposal §12 risk row).
- **Smoke false positives** (a baseline identifier coincidentally
  matched in a comment): would still indicate the source needs a
  whole-word JS identifier somewhere in `server/**/*.js`. The
  whole-word `\b...\b` regex constraint already filters most noise.

## Rollback

Revert the single P0-1 commit on `feat/M4`. No production code is
touched; no other stage depends on this commit landing.

## Follow-up — Node 18 ESM config loading

The first push (commit `316f3f1`) failed CI on the Node 18 leg with
`Error [ERR_REQUIRE_ESM]: require() of ES Module .../vite/...`. Cause:
`vitest.config.js` used `require('vitest/config')`, but `vite` is now
ESM-only and Node 18's `require()` cannot load ESM packages. Node 22
in the same matrix succeeded because it supports `require(esm)` for
compatible modules.

Fix: rename `vitest.config.js` → `vitest.config.mjs` and switch to
`import { defineConfig } from 'vitest/config'` / `export default
defineConfig(...)`. The `.mjs` extension forces the file to load as
native ESM regardless of the root `package.json` type, so the rest of
the repo (server CommonJS) is unaffected. This is precisely the
mitigation noted in proposal §12 risk row "vitest ↔ existing frontend
ES-module compatibility": the import shape needed to be ESM, not CJS.

`scripts/smoke-wire-format.js` and the audio-context mock helper stay
in their original module formats — only the vitest config file
crosses the ESM boundary.

## Files changed

- **Added**: `vitest.config.js` — vitest 3.x config with happy-dom
  env and v8 coverage provider.
- **Added**: `frontend/__tests__/_helpers/audio-context-mock.js` —
  13-API Web Audio mock with chainable nodes and a settable fake
  clock.
- **Added**: `frontend/__tests__/_smoke.test.js` — DOM smoke proving
  happy-dom is wired up.
- **Added**: `frontend/__tests__/audio/_smoke.test.js` — mock-audio
  smoke proving chainable connect + spies work.
- **Added**: `scripts/wire-format-baseline.json` — frozen wire-format
  contract for `/health`, `/api/config`, `/api/viewport`, WS
  `viewport` / `stats` / `error`.
- **Added**: `scripts/smoke-wire-format.js` — static-grep regression
  smoke; rename/removal-strict, addition-tolerant; `--update` flag.
- **Added**: `docs/devlog/M4/2026-04-27-M4-vitest-and-wire-format-smoke.md` —
  this entry.
- **Modified**: `package.json` — `+vitest`, `+happy-dom`,
  `+@vitest/coverage-v8`; new scripts `test:frontend` and
  `smoke:wire-format`.
- **Modified**: `package-lock.json` — locked transitive resolutions
  for the three new dev deps.
- **Modified**: `.github/workflows/ci.yml` — two new steps in the
  `test` job (Node 18 + 22).
- **Modified**: `eslint.config.js` — new vitest globals block; existing
  frontend block now ignores `frontend/__tests__/`.
- **Modified**: `docs/plans/M4/2026-04-27-M4-razor-refactor-proposal.md` —
  §10 wire-format contract verified against HEAD source.
- **Modified**: `docs/DEVLOG.md` — index this entry.
