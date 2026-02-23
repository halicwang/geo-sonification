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

## Commit Message Convention

This project enforces [Conventional Commits](https://www.conventionalcommits.org/) via [commitlint](https://commitlint.js.org/) in CI. Non-conforming commits will fail the `commitlint` check. See `CLAUDE.md § Commit Messages` for the full specification including types, scopes, formatting rules, and anti-patterns.

Key rules for agents:

1. **Format**: `<type>(<scope>): <subject>` — max 72 chars.
2. **Types** (enforced): `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `ci`, `perf`, `revert`.
3. **Scope** (recommended, not enforced): module name (`server`, `frontend`, `audio`, `ws`, `data`) or phase tag (`M3/P0`). Omitting scope is valid: `fix: handle missing data`.
4. **Subject**: imperative mood, start lowercase, no period. Uppercase abbreviations (API, HTTP, DEM) are allowed.
5. **Body** (for non-trivial changes): explain **why**, wrap at 72 chars.
6. **Anti-patterns**: no vague messages (`Update files`, `Fix stuff`), no `WIP` on shared branches, no "explain" or "recent" as change verbs.

### Devlog Trailer

Recommended footer when devlog was reviewed before committing:

```
DEVLOG-REVIEWED: YYYY-MM-DD
```
