# AGENTS.md

Repository-level agent instructions for `geo-sonification`.

## Planning Hierarchy

See `CLAUDE.md § Planning Hierarchy` for the full definition of **Milestone → Phase → Stage**.

Key operational implication: stage plans in `docs/plans/M*/P*/` contain the granular execution steps for each phase. You **must** consult them before executing any phase work (see check #3 below).

## Mandatory Pre-Change Check

Before making any code or documentation change, you must:

1. Read `docs/DEVLOG.md` section `Recording Guide`.
2. Read the latest relevant `DEVLOG` entries for the milestone you are touching (`docs/devlog/M1|M2|M3`).
3. If you are **planning or executing** work within a milestone phase, read **all** stage plans in the corresponding `docs/plans/M*/P<n>/` folder before starting. Stage files define the ordered steps, expected outputs, and evidence requirements for that phase. If the folder does not exist or is empty, proceed without stage plans but note the absence in your output so the user is aware.
4. If you are modifying docs structure, confirm naming/index rules in `docs/DEVLOG.md` before editing.

## Mandatory Devlog Rules

When a change requires a devlog entry:

1. Put the entry in the active milestone folder: `docs/devlog/M*/`.
2. Use filename format: `YYYY-MM-DD-M*-kebab-case-title.md`.
3. Add/update the link in `docs/DEVLOG.md` under `## Entries`.
4. Use `### Standalone Design Docs` only for non-entry reference documents.

## Commit Message Guard

Recommended trailer line:

`DEVLOG-REVIEWED: YYYY-MM-DD`

Repository `commit-msg` hook runs in warn-only mode by default.
Set `DEVLOG_REVIEWED_ENFORCE=1` to enforce blocking behavior.
