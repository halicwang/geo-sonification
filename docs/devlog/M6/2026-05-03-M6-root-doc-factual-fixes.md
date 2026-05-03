# 2026-05-03 — Fix: README Ambience Payload Number (~14 MB → ~15 MB)

A second-pass root-doc audit (after `2026-05-01-M6-doc-audit-resync.md`) caught one residual factual drift in `README.md`: the M3 Opus-encoding optimization line states the post-encoding payload as `~14 MB`, but the seven `frontend/audio/ambience/*.opus` files now sum to 15.29 MB (or 14.58 MiB), which rounds to 15 either way.

## Why

The first audit re-aligned README, ARCHITECTURE, and DEPLOYMENT against the code, but the ambience-size number is a literal string buried in a feature list, easy to miss on a sweep that focused on architectural claims. A re-read with the explicit goal of "what numbers in root-level docs no longer match disk?" surfaced this one. Not behaviourally broken, but out by 5–8% depending on whether you read the original `~14 MB` as MiB or MB.

The 67k-cell number in README at lines 91 and 259 was also flagged during the same sweep but turned out to be **correct**: `scripts/build-grid-index.js` line 26 documents the deduplicated sidecar size as `N≈67,331`, which is the count after `loadGridData()` + `spatial.init()` strip duplicate / out-of-range cells from the 80,695 raw CSV rows. No change there.

## What changed

`README.md` line 257 — Opus-ambience optimization line:

- Was: `Reduces first-load audio payload from ~328 MB to ~14 MB without audibly degrading the textures.`
- Now: `Reduces first-load audio payload from ~328 MB to ~15 MB without audibly degrading the textures.`

## Verification

- `du -ch frontend/audio/ambience/*.opus | tail -1` reports 15M (rounded MiB), matching the new number more closely than the old.
- `grep -n "~14 MB" README.md` returns nothing — old string fully replaced.
- `npx prettier --check README.md` clean.

## Files changed

- **Modified** `README.md` — single number update on the Opus-ambience payload line.
- **Added** `docs/devlog/M6/2026-05-03-M6-root-doc-factual-fixes.md` — this entry.
- **Modified** `docs/DEVLOG.md` — index this entry at the top of `## Entries`.
