# 2026-04-27 — Design: M4 Plan Skeleton + Build-Tag Injection

Stand up the `docs/plans/M4/` Phase/Stage hierarchy, write the English
proposal that supersedes the local Chinese plan, and inject a build-tag
(commit hash + ISO timestamp) into `dist/config.runtime.js` so the
production frontend can identify which deploy served the page.

## Why now

M3 was tracked entirely through devlog entries, with no
`docs/plans/M3/` directory — a break from the Milestone → Phase →
Stage hierarchy that `CLAUDE.md` defines and that M1 / M2 followed.
M4's first stage (P0-2) restores that hierarchy by creating
`docs/plans/M4/` with `P0..P5/` subdirectories and the canonical
proposal document. Once this proposal exists, the local Chinese plan
at `~/.claude/plans/m-milestone-linked-pine.md` is superseded; all
plan iteration during M4 happens in the repo proposal (rule 2.G).

The build-tag piece is M4 rule 2.F: every M4 phase ships an
independent PR, and `placeecho.com` users mid-session during a deploy
should be able to see — in DevTools — which commit served their page.
Without it, attributing a regression to a specific stage means
guessing from timestamps. With it, one glance at the console
identifies the deploy.

## What changed

### `docs/plans/M4/` — new

- `2026-04-27-M4-razor-refactor-proposal.md` (the English proposal,
  with execution rules, all 29 stages, the wire-format contract, the
  quantitative target table, the risk register, and the carryover
  appendix).
- `P0/`, `P1/`, `P2/`, `P3/`, `P4/`, `P5/` empty subdirectories
  (Stage execution files land here as each stage opens).
- `baseline/` for P0-5's `baseline-notes.md` (audio + performance
  reference configuration).

### Build-tag pipeline

- **`scripts/build-pages.js`** captures `buildHash` via
  `git rev-parse --short HEAD` (graceful fallback to empty string on
  failure with a `console.warn`) and `buildTime` via
  `new Date().toISOString()` at build time. Both fields are added to
  the `runtimeConfig` object that ships as `dist/config.runtime.js`.
- **`frontend/config.runtime.example.js`** documents the two new
  fields so anyone copying the template knows they're auto-injected.
- **`frontend/main.js`** logs
  `[PlaceEcho] build <buildHash> deployed <buildTime>` once at module
  scope, suppressed when `buildHash` is empty (the local-dev case).
- **`frontend/config.runtime.js`** has its stale "scripts/generate-runtime-config.js"
  reference replaced with the actual generator (`scripts/build-pages.js`)
  and updated to mention the new fields.

## Verification

- `node scripts/build-pages.js` (with stub deploy env vars) produces
  `dist/config.runtime.js` containing real values:
  `buildHash: "c7cf090"` and an ISO `buildTime`.
- Browser preview at `http://localhost:3000/`: with local-dev
  `config.runtime.js` (which leaves `buildHash` empty), the banner
  is correctly suppressed and there are no console errors.
- `console.info('[PlaceEcho] build c7cf090 deployed 2026-04-27...')`
  emits when the runtime config carries a real `buildHash` (verified
  by injecting a test config object via DevTools eval).
- `npm run lint` green.

## Rule-2.G consequence

The local Chinese plan at
`~/.claude/plans/m-milestone-linked-pine.md` carries a "superseded"
notice on top from this stage onward. All further M4 plan iteration
must edit
`docs/plans/M4/2026-04-27-M4-razor-refactor-proposal.md` and commit
as `docs(M4): adjust <which> plan after <reason>`.

## Files changed

- **Added**: `docs/plans/M4/2026-04-27-M4-razor-refactor-proposal.md` —
  English M4 proposal, the canonical plan from now on.
- **Added**: `docs/plans/M4/P0/`, `P1/`, `P2/`, `P3/`, `P4/`, `P5/`,
  `baseline/` — empty Phase/Stage directory skeleton.
- **Added**: `docs/devlog/M4/2026-04-27-M4-plan-skeleton-and-build-hash.md` —
  this entry.
- **Modified**: `scripts/build-pages.js` — capture `buildHash` and
  `buildTime`, add them to the runtime config object.
- **Modified**: `frontend/config.runtime.example.js` — document
  `buildHash` / `buildTime` fields.
- **Modified**: `frontend/config.runtime.js` — fix stale
  `scripts/generate-runtime-config.js` comment, mention new fields.
- **Modified**: `frontend/main.js` — boot-time build-tag banner.
- **Modified**: `docs/DEVLOG.md` — index this entry.
