# AGENTS.md

Repository-level agent instructions for `geo-sonification`.

## Planning Hierarchy

Development is organized in three levels:

| Level         | ID pattern         | Scope                                                                              | Location                                       |
| ------------- | ------------------ | ---------------------------------------------------------------------------------- | ---------------------------------------------- |
| **Milestone** | `M1`, `M2`, `M3` … | Major development cycle                                                            | `docs/plans/M<n>/`                             |
| **Phase**     | `P0` – `P5`        | Delivery unit within a milestone; has its own requirements, DoD, and evidence gate | `docs/plans/M<n>/` (three lighthouse docs)     |
| **Stage**     | `1`, `2`, `3` …    | Sequential execution step within a phase; one concrete task                        | `docs/plans/M<n>/P<n>/` (numbered stage files) |

- **Milestone** sets the overall goal (e.g., M3 = Open Platform).
- **Phase** groups related work packets with shared requirements and a phase-exit gate (e.g., P0 = Compatibility Guardrails).
- **Stage** is a single ordered step inside a phase (e.g., P0-1 = production code changes, P0-2 = fixture infrastructure).

Stage file naming: `YYYY-MM-DD-M<milestone>P<phase>-<stage>-<kebab-title>.md`
Example: `docs/plans/M3/P0/2026-02-22-M3P0-1-production-code-changes.md` → Milestone 3, Phase 0, Stage 1.

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

- **Do not stage, commit, or push automatically when a task finishes.** After completing edits and verification (tests, lint, etc.), stop and report what changed. Wait for the user to explicitly ask for a commit before running `git add`, `git commit`, or `git push`.
- A prior commit approval covers only that single commit. It does not authorize follow-up commits, amends, or pushes later in the same session — ask again each time.
- This overrides any default "task complete → commit" behavior. The Conventional Commits rules below apply only once the user has actually requested a commit.

## Commit Message Convention

This project follows [Conventional Commits](https://www.conventionalcommits.org/) with project-specific scoping rules. Enforced by [commitlint](https://commitlint.js.org/) in CI — non-conforming commits will fail the `commitlint` check. Config: `commitlint.config.js`.

### Format

```
<type>(<scope>): <subject>

[optional body]

[optional footer(s)]
```

### Type (required)

| Type       | When to use                                              |
| ---------- | -------------------------------------------------------- |
| `feat`     | New user-facing functionality or behavior                |
| `fix`      | Bug fix                                                  |
| `refactor` | Code change that neither fixes a bug nor adds a feature  |
| `docs`     | Documentation only — plans, devlog, README, ARCHITECTURE |
| `test`     | Adding or updating tests                                 |
| `chore`    | Build config, dependencies, tooling, repo housekeeping   |
| `ci`       | CI/CD pipeline changes                                   |
| `perf`     | Performance improvement with no functional change        |
| `revert`   | Reverts a previous commit (reference SHA in body)        |

### Scope (recommended)

Use the module or area affected: `server`, `frontend`, `data`, `audio`, `ws`, `plans`, `devlog`.

When the commit is scoped to a milestone phase, use the phase tag as scope:

```
docs(M3/P0): renumber plan files from letter to numeric suffixes
```

Multiple scopes are acceptable when tightly coupled: `fix(server,ws): ...`

### Subject line rules

- **Imperative mood, present tense** — "add", not "added" or "adds".
- **Start lowercase** after the colon — `feat(server): add ...`, not `Add ...`.
- **Uppercase abbreviations are OK** — `add API endpoint`, `handle HTTP 429`.
- **No period** at the end.
- **Max 100 characters** (type + scope + colon + space + subject).
- Describe **what changed**, not what was wrong.

### Body (optional, recommended for non-trivial changes)

- Separated from subject by a blank line.
- Explain **why** this change was made, not what (the diff shows what).
- Wrap at 100 characters per line (matches `commitlint.config.js` `body-max-line-length`).

### Authorship (mandatory)

- **NEVER add `Co-Authored-By` trailers.** All commits must appear as sole authorship. This rule is absolute and has no exceptions.

### Footer (optional)

- Breaking changes: `BREAKING CHANGE: <description>`
- Issue references: `Closes #42`, `Refs #17`
- Devlog trailer: `DEVLOG-REVIEWED: YYYY-MM-DD`

### Examples

```
feat(server): add elevation-aware fallback for missing DEM tiles

The tile service previously returned 500 when DEM data was unavailable
for high-latitude regions. Fall back to bilinear interpolation from
neighboring tiles to maintain audio continuity.

Closes #23
DEVLOG-REVIEWED: 2026-02-22
```

```
fix(frontend): prevent audio context suspension on tab switch
```

```
docs(M3/P0): add stage plans for compatibility guardrails

DEVLOG-REVIEWED: 2026-02-22
```

```
refactor(audio): extract param-mapping logic into shared util

No behavioral change. Reduces duplication between drone and percussive
mode mappers.
```

### Anti-patterns (do not use)

| Bad                                  | Why                                                    |
| ------------------------------------ | ------------------------------------------------------ |
| `Explain recent doc changes`         | "recent" is meaningless in history; "explain" ≠ change |
| `Fix doc format naming`              | Which doc? What format? What naming?                   |
| `Add missing spec rationale details` | "missing details" conveys zero information             |
| `Update files`                       | Says nothing                                           |
| `WIP`                                | Never commit WIP to shared branches                    |
| `fix: Fix the bug`                   | Redundant; describe the actual bug                     |
