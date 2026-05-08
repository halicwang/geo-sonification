# AGENTS.md

Repository-level agent instructions for `geo-sonification`.

## Planning Hierarchy

See `CLAUDE.md § Planning Hierarchy` for the full definition of **Milestone → Phase → Stage**.

Key operational implication: stage plans in `docs/plans/M*/P*/` contain the granular execution steps for each phase. You **must** consult them before executing any phase work (see check #3 below).

## Mandatory Pre-Change Check

Before making any code or documentation change, you must:

1. Read `docs/DEVLOG.md` section `Recording Guide`.
2. Read the latest relevant `DEVLOG` entries for the milestone you are touching (`docs/devlog/M*/`, e.g. `docs/devlog/M6/`). Deprecated milestone entries are in `docs/devlog/deprecated/`.
3. If you are **planning or executing** work within a milestone phase, read **all** stage plans in the corresponding `docs/plans/M*/P<n>/` folder before starting. Stage files define the ordered steps, expected outputs, and evidence requirements for that phase. If the folder does not exist or is empty, proceed without stage plans but note the absence in your output so the user is aware.
4. If you are modifying docs structure, confirm naming/index rules in `docs/DEVLOG.md` before editing.

## Mandatory Devlog Rules

A devlog entry is required only when the change matches one of three triggers:

1. **New feature** — user-facing capability that didn't exist before.
2. **Significant enhancement** — behavior, scope, performance, or interface contract change on an existing feature. Parameter tweaks and cosmetic polish do not qualify.
3. **Large-scale refactor** — architectural pivot or cross-module restructure.

**Mandatory pre-commit judgment**: Before every commit, self-evaluate the change against the three triggers above. The judgment is the mandatory step — the entry is conditional on it. When ambiguous, ask the user before committing. Skip the devlog for bug fixes, parameter tweaks, single-line config changes, icon swaps, dead-code removal, doc factual fixes, isolated perf gates, cosmetic UI polish, and single-module hygiene cleanup; the commit body covers them.

When an entry is warranted, follow these format rules:

1. Put the entry in the active milestone folder: `docs/devlog/M*/`. Independent post-milestone tasks (no milestone framing) may sit at the root of `docs/devlog/`; the pre-commit hook regex `^docs/devlog/` accepts both. Default to a milestone folder unless you have explicit reason otherwise.
2. Use filename format: `YYYY-MM-DD-M*-kebab-case-title.md` for milestone entries; `YYYY-MM-DD-kebab-case-title.md` for root-level independent entries.
3. Add/update the link in `docs/DEVLOG.md` under `## Entries`.
4. Use `### Standalone Design Docs` only for non-entry reference documents.

See `docs/DEVLOG.md § Recording Guide` for full entry format.

## Git Workflow Boundary

Do not run `git add`, `git commit`, or `git push` automatically when a task ends. After finishing edits and verification, stop and report what changed; wait for the user to explicitly request a commit. A prior commit approval covers only that single commit — it does not extend to follow-up commits, amends, or pushes. See `CLAUDE.md § Git Workflow Boundary`.

## Commit Message Convention

This project enforces [Conventional Commits](https://www.conventionalcommits.org/) via [commitlint](https://commitlint.js.org/) in CI. Non-conforming commits will fail the `commitlint` check. See `CLAUDE.md § Commit Messages` for the full specification including types, scopes, formatting rules, and anti-patterns.

Key rules for agents:

1. **Format**: `<type>(<scope>): <subject>` — max 100 chars (header). Body and footer also max 100 chars per line; see `commitlint.config.js`.
2. **Types** (enforced): `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `ci`, `perf`, `revert`.
3. **Scope** (recommended, not enforced): module name (`server`, `frontend`, `audio`, `ws`, `data`) or phase tag (`M2`). Omitting scope is valid: `fix: handle missing data`.
4. **Subject**: imperative mood, start lowercase, no period. Uppercase abbreviations (API, HTTP, DEM) are allowed.
5. **Body** (for non-trivial changes): explain **why**, wrap at 100 chars per line.
6. **Anti-patterns**: no vague messages (`Update files`, `Fix stuff`), no `WIP` on shared branches, no "explain" or "recent" as change verbs.

### Devlog Trailer

Recommended footer when devlog was reviewed before committing:

```
DEVLOG-REVIEWED: YYYY-MM-DD
```
