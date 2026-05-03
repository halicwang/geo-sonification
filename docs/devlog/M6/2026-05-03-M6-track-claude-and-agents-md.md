# 2026-05-03 — Design: Track CLAUDE.md and AGENTS.md as Project-Level Agent Guidance

`.gitignore` previously listed `CLAUDE.md` and `AGENTS.md` under "AI agent config (local-only)". After re-reading both files during the root-doc audit, none of their content is actually agent-personal — every section is project-scoped (naming conventions, directory layout, devlog policy, commit format including the absolute "NEVER add Co-Authored-By" rule, planning hierarchy). Keeping project rules behind `.gitignore` made them invisible to PR review and to other contributors (human or AI), which already manifested as fact drift between `docs/DEVLOG.md` (tracked) and `CLAUDE.md`/`AGENTS.md` (untracked) — both define devlog rules and the two had silently diverged before this audit.

## Why

Concrete problems with the previous setup:

1. **Drift is invisible**. The third commit of this audit (`docs(M6): allow root-level devlog entries`) had to update `docs/DEVLOG.md` to match reality, but the parallel update to `CLAUDE.md`/`AGENTS.md` happened only on Halic's machine. New collaborators starting today would inherit the old rule.
2. **Cold-start cost for new agents/contributors**. A fresh `git clone` exposed zero project rules — every new agent had to be re-briefed from scratch.
3. **AGENTS.md is a public ecosystem standard** (OpenAI Codex / agent collaboration), conventionally tracked alongside `CONTRIBUTING.md`. Hiding it breaks reader expectations.
4. **Content audit confirms zero personal preference**. Both files contain only project-scoped rules — no language preferences, response-style overrides, or per-developer toggles.

The right home for genuinely personal preferences (e.g. "respond in Chinese", "be terse") is `~/.claude/CLAUDE.md` (Claude Code's global per-user file), not the project root.

## What changed

`.gitignore`:

- Removed lines 32–33 (`AGENTS.md`, `CLAUDE.md`).
- Kept `.claude/` ignored — that directory holds session/cache data and genuinely should not be tracked.
- Updated the section header from "AI agent config (local-only)" to "AI agent session/cache data (local-only)" to match what's left, plus a one-line comment explaining why `CLAUDE.md`/`AGENTS.md` are intentionally tracked.

`CLAUDE.md` and `AGENTS.md`:

- First-time tracked. Initial content is the audited-and-corrected version produced during the same root-doc sweep:
    - Reference Docs section now lists `docs/DEPLOYMENT.md` and uses an accurate label for `docs/DEVLOG.md`.
    - Directory Conventions table reflects `M1/`–`M6/` (was frozen at `M1/, M2/`).
    - Tech Stack row mentions Jest + Vitest + commitlint.
    - Naming Conventions calls out both `server/__tests__/` (Jest) and `frontend/__tests__/` (Vitest).
    - Development Workflow groups `Common commands` by purpose and adds the missing `npm run test:frontend`, lint/format, smoke, and benchmark entries.
    - Commit body wrap is 100 chars (matches `commitlint.config.js`), not the stale 72.
    - Mandatory Devlog Rules in `AGENTS.md` document the root-level-entry exception, matching the same-day `docs/DEVLOG.md` Recording Guide update.

No personal preferences were added or removed during this audit; the diff is purely "tracked-from-now-on plus accumulated correctness fixes".

## Verification

- `git check-ignore -v CLAUDE.md AGENTS.md` returns nothing — both files are tracked-eligible.
- `git status` shows them as untracked (about to be `git add`-ed in this commit), and `.claude/` still shows as ignored.
- `grep -nE "secret|token|password|api[_-]?key" CLAUDE.md AGENTS.md` returns nothing — no credentials slipping in.
- `npm run lint`, `npm test`, `npm run test:frontend` unaffected (no JS touched).

## Files changed

- **Modified** `.gitignore` — removed `CLAUDE.md` / `AGENTS.md` lines, kept `.claude/`, updated section comment.
- **Added (first-time tracked)** `CLAUDE.md` — project-level instructions, audit-corrected.
- **Added (first-time tracked)** `AGENTS.md` — agent-facing operational rules, audit-corrected.
- **Added** `docs/devlog/M6/2026-05-03-M6-track-claude-and-agents-md.md` — this entry.
- **Modified** `docs/DEVLOG.md` — index this entry at the top of `## Entries`.
