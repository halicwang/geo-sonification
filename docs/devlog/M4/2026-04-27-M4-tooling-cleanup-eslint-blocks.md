# 2026-04-27 — Refactor: Tooling Cleanup — Drop `setup-git-hooks.sh`, Consolidate ESLint Blocks

Delete the deprecated Bash duplicate of the git-hooks installer and
consolidate `eslint.config.js` from six functional blocks back to
five. M4 P0-4 — pure housekeeping; no runtime effect.

## Why now

After P0-1 the ESLint config grew a sixth block (the new vitest-globals
block for `frontend/__tests__/`). The proposal §4 P0-4 commits to ≤ 5
blocks, achieved here by merging the `server/**/*.js` block and the
`scripts/**/*.js` block into a single Node CJS block — both already
shared identical `ecmaVersion: 2020`, `sourceType: 'commonjs'`, and
`globals: { ...globals.node }`. The merged block now also applies the
`'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]` rule to
scripts (was previously absent), bringing scripts under the same
`_unused` arg convention used everywhere else.

`scripts/setup-git-hooks.sh` is a Unix-only duplicate of
`scripts/setup-git-hooks.js`; `npm run setup:hooks` already invokes
the `.js` version, which uses `process.platform` to skip `chmod`
on Windows and runs identically on macOS / Linux otherwise. The `.sh`
copy has been dead since the `.js` version landed.

## What changed

### Deleted

- **`scripts/setup-git-hooks.sh`** — bash version, redundant with
  the cross-platform Node version. Root file count drops by one
  (proposal §4 P0-4 DoD).

### `eslint.config.js` — 6 blocks → 5

Old layout (after P0-1):

1. `server/**/*.js` — Node CJS, src
2. `server/__tests__/**/*.js` — Node CJS + Jest globals
3. `frontend/**/*.js` — browser ESM
4. `frontend/__tests__/**/*.js` — browser ESM + Vitest globals
5. `frontend/config.local.js` — classic browser script
6. `scripts/**/*.js` — Node CJS

New layout:

1. **Node CJS source — `server/**/*.js` + `scripts/**/*.js`** (merged;
   `server/__tests__/**` excluded as before)
2. `server/__tests__/**/*.js` — Node CJS + Jest globals
3. `frontend/**/*.js` — browser ESM
4. `frontend/__tests__/**/*.js` — browser ESM + Vitest globals
5. `frontend/config.local.js` — classic browser script

A short header comment at the top of the config records the layout
so the next person doesn't have to reverse-engineer it from the
block sequence.

### `README.md`

The "Repository layout" tree drops the
`├── setup-git-hooks.sh                 # Git hooks installer (Unix)`
row. The `.js` row above it stays.

## Verification

- `npm run lint` — green (all 5 blocks resolve; `scripts/` files now
  also pass under the merged block's stricter `_unused-args` rule).
- `npm run format:check` — green.
- `npm run setup:hooks` — still installs hooks correctly via the
  `.js` script (executed locally; output matches pre-cleanup).
- `npm run test:frontend` — 17 tests pass (same as P0-3).
- `npm run smoke:wire-format` — passes (45 field names; tooling
  changes don't touch the WS contract).
- `npm test` — 153 jest tests still green.
- ESLint block count: now 5 functional blocks + 1 ignores entry +
  1 `prettierConfig` entry = 7 array entries total, but only 5
  carry rules (the proposal's count).

## Risks and rollback

- **Scripts now lint stricter**: the merged block applies
  `argsIgnorePattern: '^_'` to `scripts/**/*.js`. If a script has
  unused args without underscore prefixes, lint will warn (not
  error). None do today; verified by `npm run lint`.
- **`setup-git-hooks.sh` removal**: any user docs / IDE bookmarks
  pointing to the `.sh` path are stale. The `.js` script is the
  canonical entry; `npm run setup:hooks` is the documented call.
- **Rollback**: revert this commit on `feat/M4`. No downstream stage
  depends on either change.

## Files changed

- **Deleted**: `scripts/setup-git-hooks.sh` — Unix-only Bash duplicate
  of the cross-platform `.js` version.
- **Modified**: `eslint.config.js` — six functional blocks merged
  to five (Node CJS server + scripts unified); top-of-file header
  comment documents the layout.
- **Modified**: `README.md` — "Repository layout" tree drops the
  `setup-git-hooks.sh` row.
- **Added**: `docs/devlog/M4/2026-04-27-M4-tooling-cleanup-eslint-blocks.md` —
  this entry.
- **Modified**: `docs/DEVLOG.md` — index this entry.
