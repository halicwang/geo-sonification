# 2026-05-01 — Fix: Retroactive Summary Corrections (M1, M2, M3, M6)

A two-pass audit of the four retroactive milestone summaries added in
commit `38c7f22` surfaced 11 factual or numerical errors. All fixed
in-place; no source code touched.

## What was wrong

### Counting mistakes

- **M2 summary line 29**: "19 entries under `docs/devlog/M2/`" — the
  directory has 20 entries; the table itself listed all 20. The
  introductory count was off-by-one.
- **M3 summary lines 9 / 28 / 245**: "46 entries", "All 46 entries
  are covered", "(46 index entries)" — actual count is 47 (matches
  `ls docs/devlog/M3/*.md | wc -l` and the `DEVLOG.md` index).

### Tense / direction errors

- **M1 summary line 79**: "5-minute TTL — first appearance later than
  M4's `client-state.js` merger" — semantically reversed. The
  5-minute TTL was introduced in M1 (2026-02), M4's `client-state.js`
  merger landed three months later. Changed to "predates M4's
  `client-state.js` by ~3 months".

### Misrepresentation of source material

- **M3 summary §Companion line 8**: "The absence was flagged as M3
  tech-debt-audit item E.1 ... and addressed by writing the M4 plan
  rather than backfilling an M3 proposal." — Audit E.1's actual
  scope was stale `CLAUDE.md`/`AGENTS.md` references to a non-
  existent `docs/plans/M3/`, dismissed as `[剔除]` because those
  files had been git-ignored in commit `9b5af86`. E.1 neither
  flagged the proposal absence nor was it "addressed by writing the
  M4 plan." Rewrote the paragraph to describe what audit E.1
  actually said.

- **M3 summary §1 line 22**: "There is no formal 'M3 close commit'
  — the milestone ended when M4 began on 2026-04-27." — Actually
  PR #5 (commit `f6ced39`) merged `feat/M3-ui-ux-overhaul` to `main`
  on 2026-04-25; the milestone *was* merged, just without an
  explicit `chore: close milestone 3` marker (a pattern M4 later
  established with `a173ea4`). Clarified the wording.

### Inaccurate file/symbol references

- **M2 summary line 42**: "New helper `computeProximityFromZoom()` in
  `server/osc-metrics.js`" — the file is `server/audio-metrics.js`
  (no file named `osc-metrics.js` has ever existed; line 104 of the
  same summary already used the correct name).

- **M2 summary lines 23 / 175**: References to "commit
  `2026-03-16-M2-split-tree-bus`" and "git log af1acaa..2026-03-16-
  M2-split-tree-bus-commit" — these are devlog filenames, not
  commit SHAs. The actual SHA is `4384add`. Replaced both
  references; line 23 also gains a link to the devlog file for
  readability.

### Inaccurate numbers

- **M6 summary lines 23 / 66**: "frontend/hover-glow.js shrinks
  819 → ~150 LOC" — actual LOC at commit `216bd88` (GPU rewrite) is
  293; further trimmed to 177 by the second Occam sweep
  (`4548164`). The "~150 LOC" estimate was off by ~50% and conflated
  two distinct end states. Rewrote line 23 to give both numbers
  in sequence; line 66 (the GPU-rewrite caption) just needed
  `293`.

- **M6 summary line 23**: same bullet listed "JS curve helpers" as
  deleted *during* the GPU rewrite. They were not — they survived
  the rewrite and were removed by the second Occam sweep. Moved
  them into the right time bucket.

- **M6 summary line 107 (§3.2)**: "~100 LOC after the second Occam
  sweep" — actual is 177 LOC. Changed to the precise number.

- **M6 summary line 125 (§3.4)**: "frontend/__tests__/hover-glow.
  test.js — 91 tests" — the file has 12 tests; 91 is the *frontend
  suite total* across 8 files. Rewrote with the per-file count
  inline and the suite total as a trailing note.

### Missing context

- **M1 summary §3.2 server-modules list**: did not mention
  `mode-manager.js`, even though M2 summary §3.2 calls it "M1
  inheritance." The module was extracted from `server/index.js` in
  commit `496d6a4` (2026-02-14), a few days after the last M1 devlog
  entry — outside the M1 timeline range but logically continuous
  with M1's per-client mode state. Added an inline note in the
  `server/index.js` bullet rather than a new bullet, to keep the
  M1 timeline boundary clean.

- **M2 summary §2.1/§2.3 cross-classification**: The
  `2026-02-21-jsdoc-annotations.md` row was placed in §2.3
  (Post-Phase-W: 2026-02-23 → 2026-03-16) even though the entry
  date is 2026-02-21 and predates the Phase W pivot itself. Moved
  to the end of §2.1; expanded §2.1's date range from
  `2026-02-19 → 2026-02-20` to `2026-02-19 → 2026-02-21`; updated
  the row's "Note" to reflect the corrected location.

## How verified

For each claim, ran a targeted check against the repo:

- Devlog counts: `ls docs/devlog/M*/*.md | wc -l`.
- LOC at past commits: `git show <sha>:frontend/hover-glow.js | wc -l`.
- Test counts: ran `npx vitest run` against current and past
  worktrees.
- Commit SHAs: `git log --format='%h %s' -1 <sha>`.
- File existence: `ls server/<name>.js`.
- audit E.1 wording: re-read [M3 tech-debt
  audit](2026-04-23-M3-tech-debt-audit.md:91).

## Files changed

- **Modified:** `docs/plans/M1/2026-04-30-M1-summary.md`,
  `docs/plans/M2/2026-04-30-M2-summary.md`,
  `docs/plans/M3/2026-04-30-M3-summary.md`,
  `docs/plans/M6/2026-04-30-M6-summary.md`.
- **New:** this devlog.

No source code changes; no behavior change.
