# 2026-04-24 — Design: Raise Commit Header Max Length to 100

Loosen the commitlint `header-max-length` rule from 72 to 100 and update
the CLAUDE.md commit-message spec to match. The 72 limit conflates
Git's classic 50/72 rule (50 = subject, 72 = body wrap), and in practice
many informative scoped headers on this project land in the 75–90 range.
100 matches `@commitlint/config-conventional`'s default and stays within
what GitHub's list views render without truncation.

The body/footer `max-line-length: 72` stays as-is — that's a body-wrap
rule and the 72-column wrap is still the right target for prose.

## Why now

A CI run on `feat/M3-ui-ux-overhaul` pushed ~30 commits at once and
commitlint flagged 16 of them for header-length — all with meaningful,
non-bloated subjects that needed scope plus specifics (e.g. numeric
thresholds, before/after values, file-pair scope tags). The rule was
producing noise, not signal.

## Files changed

- `commitlint.config.js` — `header-max-length` value `72` → `100`.
- `docs/DEVLOG.md` — index entry for this devlog.

`CLAUDE.md` (gitignored local agent config) is also updated in-workspace
to match, but it's not part of this commit — each contributor keeps
their own local copy and should sync the 100-char rule there by hand.
