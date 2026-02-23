# AGENTS.md

Repository-level agent instructions for `geo-sonification`.

## Mandatory Pre-Change Check

Before making any code or documentation change, you must:

1. Read `/Users/halic/Installed/geo-sonification/docs/DEVLOG.md` section `Recording Guide`.
2. Read the latest relevant `DEVLOG` entries for the milestone you are touching (`docs/devlog/M1|M2|M3`).
3. If you are modifying docs structure, confirm naming/index rules in `docs/DEVLOG.md` before editing.

## Mandatory Devlog Rules

When a change requires a devlog entry:

1. Put the entry in the active milestone folder: `docs/devlog/M*/`.
2. Use filename format: `YYYY-MM-DD-M*-kebab-case-title.md`.
3. Add/update the link in `/Users/halic/Installed/geo-sonification/docs/DEVLOG.md` under `## Entries`.
4. Use `### Standalone Design Docs` only for non-entry reference documents.

## Commit Message Guard

Recommended trailer line:

`DEVLOG-REVIEWED: YYYY-MM-DD`

Repository `commit-msg` hook runs in warn-only mode by default.
Set `DEVLOG_REVIEWED_ENFORCE=1` to enforce blocking behavior.
