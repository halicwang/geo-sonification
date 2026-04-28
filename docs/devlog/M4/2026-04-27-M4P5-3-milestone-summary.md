# 2026-04-27 — Milestone: M4 Razor Refactor Summary

P5-3. Land the M4 milestone summary at [`docs/plans/M4/2026-04-27-M4-summary.md`](../../plans/M4/2026-04-27-M4-summary.md), record actual vs planned hours and the §11 quantitative-target verification, mark the proposal's `Status:` as "Completed (P5-4 pending)", and add this entry to the devlog index. The only stage not yet executed is **P5-4** (closing audit + delete the `audio-engine.js` re-export shim + merge `feat/M4` → `main`); P5-3 is the formal milestone retrospective up to that point.

## Summary highlights

- **Phase ledger**: 20 of 22 stages done; only P5-4 remains. Single-day execution wall-clock; one full revert + redo cycle (P5-1, see below).
- **§11 hits**: 6 ✅ (audio-engine.js exists as shim per design, audio/* coverage targets all met, server `wide-area` p99 −33% vs −5% target, no audible regression). 4 ❌ (file-size targets — see "Misses" below). 1 ⏭️ deferred (audio idle CPU measurement). 2 ⏸️ pending P5-4 (final shim deletion + viewport-processor p95 benchmark re-run).
- **Devlog ledger**: 21 entries vs the proposal's "12–15" soft cap. Six over: three from the P5-1 revert+redo accident, two cross-cutting design devlogs (occam-pivot, commitlint), one tooling cleanup that should arguably have ridden in a peer commit. All kept — searchable narrative > chasing the number.
- **M3 tech-debt-audit closure**: 5 of 9 items resolved (A.1, B.6, D.2, D.3, D.5); 4 deferred to M5 (C.4, D.1, D.4, E.2 — all small, self-contained, none block M5 milestone-scope work).

## Misses worth flagging

Three file-size targets missed; none are pain points in practice:

| File | Target | Actual | Why miss is acceptable |
| --- | --- | --- | --- |
| `frontend/audio/engine.js` | ≤ 800 LOC | 939 LOC | Target was set pre-pivot for the 4-file split; post-pivot collapsed swap-timer / BusVoice / LoopSlot / announcer-bus into named exports inside engine.js per the proposal's risk-register decision. 17% over, not yet hard to navigate. |
| `server/index.js` | ≤ 250 LOC | 310 LOC | After routes + ws-handler extracted, residual 310 LOC is bootstrap + dependency wiring + graceful shutdown — no obvious further extraction. "~250" was estimate, not measurement. |
| `frontend/main.js` | ≤ 150 LOC | 232 LOC | After P2-2 progress extraction, remaining is WS boot + Mapbox boot + viewport router + audio wiring + announcer pipeline. Further reduction needs a state-machine rewrite that the Occam pivot explicitly killed (P2-3 lifecycle). |

The deferred CPU measurement (§11.10) is the more interesting miss — P5-1 landed structurally correct but never had a before/after DevTools Performance recording captured. Folded into the M5 work item alongside the deterministic CI reproduction of the buffer-load race.

## The P5-1 incident as a case study

Worth highlighting beyond the summary doc: the original P5-1 (`224b1ca`) added rAF idle suspension with five wake triggers covering every external EMA target mutation. Vitest passed. Preview-environment dry-run passed. Production: seven-bus ambience went silent on hard-reload Start audio.

Root cause: per-bus `gain.value` writes are gated on `bufferCache.has(i)`. On a cold buffer load (~3–5 s), EMAs converged within `IDLE_THRESHOLD = 0.001` *before* any sample finished decoding; rAF self-suspended; the gate was never re-evaluated; `gain.value` froze at 0 forever. The wake enumeration was complete with respect to **target writes** but missed **buffer-load completion** as a separate readiness condition the loop was implicitly gating on.

The redo (`6bc2a8d`) added a sixth wake — `startRaf()` after `await bufferCache.loadAll(audioCtx)` in `start()` — plus a defensive `!audioCtx || suspended` guard at the top of `startRaf()` that closes a sibling silent-killer (`updateMotion()` called pre-`start()` would leak a stale `rafId`).

The lesson recorded in the summary: performance optimizations that introduce a state machine (idle ↔ active) need to enumerate **all readiness conditions** the loop is gating on. The implicit `bufferCache.has(i)` gate was easy to miss in the original five-wake enumeration. M5 deterministic-reproduction work is the right backstop.

## What changes in the repo

This entry adds the formal summary doc + flips the proposal's `Status:` field. No code changes; no CLAUDE.md changes.

## Files changed

- **Added** `docs/plans/M4/2026-04-27-M4-summary.md` — the milestone retrospective: outcome at a glance, phase ledger, §11 verification, devlog ledger, missed-targets analysis, P5-1 incident write-up, M3 audit-carryover status, M5 candidate list, P5-4 definition-of-done.
- **Added** `docs/devlog/M4/2026-04-27-M4P5-3-milestone-summary.md` — this entry.
- **Modified** `docs/plans/M4/2026-04-27-M4-razor-refactor-proposal.md` — `Status: Active` → `Status: Completed (P5-4 pending)`.
- **Modified** `docs/DEVLOG.md` — index this entry.

## Next: P5-4

The closing audit + shim deletion + merge to `main`. Re-verify §3 of the summary at the merge HEAD, delete `frontend/audio-engine.js`, write the residual-debt devlog enumerating the items in §5 + §8 of the summary, final `chore(M4): close milestone 4 — razor refactor complete` commit, merge `feat/M4` → `main`, post-merge soak ≥ 24 h.
