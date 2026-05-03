# 2026-05-03 — Design: Devlog Recording Guide Allows Root-Level Independent Entries

The Recording Guide previously declared that every devlog entry lives under `docs/devlog/M*/`, but two existing entries — `2026-04-28-mobile-bottom-sheet.md` and `2026-05-03-mobile-panel-rework.md` — sit at the root of `docs/devlog/` because they were intentional "post-milestone independent task" entries (the user explicitly asked for "直接 main 上搞", no milestone framing). The guide now formally documents this exception so the rule matches reality and so future agents don't try to "fix" the placement.

## Why

The mobile bottom-sheet entry (2026-04-28) self-documents the reason on line 112:

> No `M*/` subfolder — independent post-M5 task; pre-commit hook regex `^docs/devlog/` matches root-level paths too.

The pre-commit hook (`.githooks/commit-msg`) does in fact regex-match `^docs/devlog/`, so root-level entries pass the gate. But the Recording Guide and `AGENTS.md § Mandatory Devlog Rules` only described the milestone-folder path, which made the actual placement look like a violation rather than an intentional opt-out. A second-pass root-doc audit caught this mismatch and the user confirmed the placement was deliberate.

Updating the rule (rather than moving the entries into `M6/` and renaming them with an `M6` tag they don't belong to) preserves the original intent that the mobile UX work is cross-milestone polish.

## What changed

`docs/DEVLOG.md § Recording Guide` — three bullets adjusted:

1. **Location**: Now reads "Most entries live in their milestone folder ... Independent post-milestone tasks (no milestone framing) may sit at the root of `docs/devlog/` directly; the pre-commit hook regex `^docs/devlog/` accepts both locations."
2. **Milestone folder**: Adds "Default to a milestone folder unless the work is genuinely independent" so the milestone path remains the strong preference.
3. **File naming**: Spells out both forms — `YYYY-MM-DD-M*-kebab-case-title.md` for milestone entries, `YYYY-MM-DD-kebab-case-title.md` for root-level entries — so the M-tag is correctly omitted for the latter.

No entries are moved or renamed.

## Verification

- `find docs/devlog -maxdepth 1 -type f -name "*.md"` returns the two existing root-level mobile entries; the updated guide describes them accurately.
- `grep -n "^docs/devlog/" .githooks/commit-msg` shows the regex still matches both root and `M*/` paths — no hook change needed.
- `npx prettier --check docs/DEVLOG.md` clean.

## Files changed

- **Modified** `docs/DEVLOG.md` — Recording Guide bullets for Location, Milestone folder, File naming.
- **Added** `docs/devlog/M6/2026-05-03-M6-devlog-rule-allow-root-level-entries.md` — this entry.
- **Modified** `docs/DEVLOG.md` — index this entry at the top of `## Entries`.
