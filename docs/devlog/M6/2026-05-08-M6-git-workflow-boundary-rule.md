# 2026-05-08 — Design: Add Git Workflow Boundary Rule to CLAUDE.md and AGENTS.md

Both agent guidance files now carry an explicit rule that agents must not stage, commit, or push automatically when a task ends — they stop after edits and verification, report what changed, and wait for the user to ask for a commit. A prior commit approval covers only that single commit; follow-up commits, amends, or pushes need fresh approval.

## Why

Default agent behavior tends to treat "task complete" as "ready to commit," which collapses two decisions the user wants to keep separate: *is the change correct* and *is now the right time to record it*. The user reviews diffs before committing, sometimes interleaves multiple unrelated changes into separate commits, and expects each commit to be an explicit ask — not a side effect of finishing a task. Without a written rule, the boundary depends on whichever heuristic the agent happens to be using that session.

Promoting the rule into the project-level guidance files (rather than keeping it as a one-off conversational correction) means it survives across sessions and applies to any agent reading the repo, not just the one that received the correction.

## What changed

`CLAUDE.md` — new top-level section `## Git Workflow Boundary` inserted before `## Commit Messages`:

1. Bullet 1: do not stage/commit/push automatically when a task finishes; stop, report, wait for the user to ask.
2. Bullet 2: a prior approval covers only that single commit — follow-ups need a new ask.
3. Bullet 3: this overrides any default "task complete → commit" behavior; the Conventional Commits rules apply only once a commit is actually requested.

`AGENTS.md` — new section `## Git Workflow Boundary` inserted before `## Commit Message Convention`, condensed to one paragraph and pointing to `CLAUDE.md § Git Workflow Boundary` for the canonical version.

No code, no test changes, no behavior change in the running system.

## Verification

- `npx prettier --check CLAUDE.md AGENTS.md` clean.
- Section ordering preserved: in `CLAUDE.md`, the new section sits between `## Documentation Update Policy` and `## Commit Messages` so the commit-related guidance stays grouped; in `AGENTS.md` it sits between `## Mandatory Devlog Rules` and `## Commit Message Convention` for the same reason.

## Files changed

- **Modified** `CLAUDE.md` — add `## Git Workflow Boundary` section (3 bullets).
- **Modified** `AGENTS.md` — add `## Git Workflow Boundary` section (1 paragraph, references `CLAUDE.md`).
- **Added** `docs/devlog/M6/2026-05-08-M6-git-workflow-boundary-rule.md` — this entry.
- **Modified** `docs/DEVLOG.md` — index this entry at the top of `## Entries`.
