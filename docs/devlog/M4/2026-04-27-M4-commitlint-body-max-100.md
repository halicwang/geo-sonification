# 2026-04-27 — Design: Raise commitlint Body / Footer Max Line Length 72 → 100

Bump `body-max-line-length` and `footer-max-line-length` in
`commitlint.config.js` from 72 to 100, matching the header rule that
was already raised to 100 in commit `e923a8f`.

## Why now

The PR-level commitlint job (which lints every commit in the
`main..feat/M4` range, not just the head commit) was failing on the
existing P0-2 commit `f4b1617`. Its body contains exactly one line
that is 73 characters long:

```
runtimeConfig.buildHash and an ISO timestamp into runtimeConfig.buildTime
```

Two reasonable fixes were considered:

- Rebase + reword `f4b1617` to wrap that line at 72 — clean history
  but requires a force-push to `feat/M4` to reflect the rewrite.
- Bump the rule from 72 to 100, matching the header precedent —
  non-destructive; precedent already set in `e923a8f` for similar
  reasons.

The bump-the-rule path was chosen. Rationale: the conventional-commits
spec gives a 72-100 range as the practical body-wrap window; 100
already matches our header limit; rewriting commit history on a
long-lived `feat/M4` branch is a meaningfully larger blast radius than
relaxing a stylistic rule, especially when the violating commit is
only 1 character over.

## What changed

- **`commitlint.config.js`** — `body-max-line-length` 72 → 100;
  `footer-max-line-length` 72 → 100. Inline comment notes the date
  and the M4 P0-1 trigger.

## Verification

`npx commitlint --from main --to feat/M4 --verbose` — exits 0; all
four commits in the M4 range pass: `f4b1617`, `899f4bd`, `316f3f1`,
`ffaf1aa`.

## Files changed

- **Modified**: `commitlint.config.js` — body/footer max-line-length
  raised to 100, with inline note.
- **Added**: `docs/devlog/M4/2026-04-27-M4-commitlint-body-max-100.md` —
  this entry.
- **Modified**: `docs/DEVLOG.md` — index this entry.
