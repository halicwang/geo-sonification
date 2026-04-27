# 2026-04-27 — Design: P0-5 Ships Tool-Only — Audio Recording and Idle CPU Capture Deferred

M4 P0-5 was originally scoped to capture 5 × 30 s WAV recordings at
five megacities + a 5-minute Chrome DevTools idle Performance JSON,
to serve as the reference baseline for every audio-touching stage in
P3 and P5-1. By operator decision, the recording capture step was
skipped. The recorder file (`scripts/record-audio-baseline.html`)
ships as opt-in infrastructure; a server-side numeric baseline
(`viewport-processor` p50/p95/p99 + LOC + test counts) is captured
in `docs/plans/M4/baseline/baseline-notes.md`. Several DoD lines and
quantitative-target rows in the M4 proposal are softened
accordingly.

## Why now

Operator weighed the cost of running the full 5-city + 5-minute
capture (≈ 2 h initial + ≈ 1.5 h recurring across P3-5 / P3-6 / P5-1)
against the marginal regression-detection benefit on top of the
unit-test coverage and code-review protocol. The P3 stages are all
"pure code move" (same AudioNodes, same connection topology, same
parameter values) — the same pattern that P0-3 already verified
end-to-end via DevTools eval (`dbToLinear(12) === Math.pow(10, 12 / 20)`
exactly; equal-power curve endpoints and bus preamp values
byte-identical). With the audio-context mock landing in P0-1 and the
"manual A/B listen on `npm run dev`" protocol replacing the
`ffmpeg`-based numeric comparison, the residual probability of an
audible regression slipping is judged tolerable.

The CPU baseline for P5-1 is the one piece that meaningfully needs
*some* number to compare against. The fix: P5-1 captures its own
at-time idle Performance recording immediately before the
idle-detection patch and again after, comparing the two. This proves
the patch helps but does not bound the absolute number against an
M3 reference — operator accepts that tradeoff.

## Decisions and rationale

### What's still captured

- **Server `viewport-processor` benchmark** (HEAD = `c7a2be7`, post-P0-3 + P0-4):
  | Scenario | p50 (ms) | p95 (ms) | p99 (ms) |
  |---|---:|---:|---:|
  | `land-dense` | 0.469 | 0.795 | 0.923 |
  | `ocean` | 0.376 | 0.577 | 0.614 |
  | `coastal` | 0.398 | 0.623 | 0.699 |
  | `wide-area` | 1.020 | 1.903 | 6.231 |

  These numbers are the "before" reference for P1-1 (spatial
  bucket-range collapse, targets the `wide-area` p99 long tail) and
  P1-4 (`lcFractions` memoization, targets the `land-dense` p50/p95
  band).

- **Code-volume baseline** at HEAD `c7a2be7`: `audio-engine.js` 1124,
  `main.js` 304, frontend total 3044, server total 3279, jest 153
  tests, vitest 17 tests, `audio/utils.js` coverage 100/100/100/100.

- **Wire-format contract** — already locked in `scripts/wire-format-baseline.json`
  by P0-1; checked on every push by `npm run smoke:wire-format`.

### What's deferred (and what replaces it)

- **5 × 30 s audio reference WAVs** — replaced by:
  1. unit tests on every extracted module via the P0-1 audio-context
     mock (asserting routing topology + parameter values),
  2. **§2.E manual A/B listening protocol**: 30 s of `npm run dev`
     local listening per audio-touching commit, looking for clicks /
     pops / gain steps / pitch shifts, with audio settled (≥ 5 s
     after toggle), and
  3. a "what nodes connect to what" review block in every P3 stage's
     devlog, naming AudioNode types and connection order.

- **5-minute idle Chrome Performance JSON** — replaced by P5-1
  capturing its own at-time recording before / after the
  idle-detection patch.

### Proposal sections updated

- **§2.E** rewritten to record the tool-only delivery, the
  replacement protocol, and how to opt-in to a full capture later.
- **§4 P0-5** stage row rewritten — DoD becomes "recorder file
  in-tree + baseline-notes.md captures server numeric baseline."
- **§7 P3-5 / P3-6 stage rows** — DoD's `ΔLUFS / spectrogram /
  RMS` hard gate replaced by the §2.E manual A/B protocol.
- **§7 Phase Gate (P3 close)** — removed the LUFS / spectrogram
  hard requirement.
- **§9 P5-1 stage row** — DoD reframed: capture an at-time idle CPU
  baseline, apply patch, capture again, verify drop ≥ 30% or ≤ 3.5%.
- **§11 Quantitative targets** — three rows reinterpreted: cold-start
  FCP ("informal local check, no regression report"), audio idle
  CPU ("P5-1 captures fresh at-time baseline"), audio LUFS /
  spectrogram / RMS ("manual A/B listen on `npm run dev`").
- **§12 Risk register** — three rows updated to drop references to
  the captured P0-5 reference, replacing them with the §2.E protocol
  and feature-flag rollback path.
- **§14 Phase-gate dependency matrix** — P3 dependency now "§2.E
  manual A/B listening protocol locked in" instead of "P0-5 baseline
  captured."

### Why the recorder is committed in-tree even though unused

The HTML recorder is small (<300 lines, no build, no dependencies)
and self-documenting. Keeping it in `scripts/` means the operator
can opt-in at any point during M4 — fly to a city, record, archive
externally — without re-deriving the harness. If at P5-1 the operator
wants the original 5-segment regression check after all, the file is
ready. Removing it would force a rebuild later and lose the JSDoc
explaining how the captureStream wiring should work.

## Verification

- `npm run benchmark` (against `npm start`) produced the four-scenario
  numbers archived above.
- `wc -l` captures recorded in `baseline-notes.md`.
- `npm run lint` / `format:check` / `test:frontend` / `smoke:wire-format` / `npm test` —
  all green at HEAD before commit.

## Risks and rollback

- **An audible regression slips past the manual A/B listen** at some
  P3 stage. Mitigation: the operator can opt-in to the recorder at
  any point and run the originally-planned LUFS / spectrogram / RMS
  comparison (proposal §2.E describes how). Rollback for the slipped
  regression: revert the offending P3 commit on `feat/M4`.
- **P5-1 at-time CPU baseline is noisy** because background processes
  on the operator's machine fluctuate. Mitigation: capture both
  before / after recordings back-to-back in the same session, with
  the same browser tabs open.
- **Future P3 work depends on §2.E being a stable rule**. If the
  operator changes their mind on capture-vs-listen mid-M4, P3 stages
  re-running for retroactive numeric comparison is straightforward
  (the recorder captures whatever the current `feat/M4` HEAD sounds
  like).

## Files changed

- **Added**: `scripts/record-audio-baseline.html` — opt-in audio
  baseline recorder; per-city button → 30 s MediaRecorder capture
  → WebM download. JSDoc explains the cross-origin caveat and how
  to wire `audioEngine.captureMaster()` if/when the operator
  decides to use it.
- **Added**: `docs/plans/M4/baseline/baseline-notes.md` — captured
  server `viewport-processor` benchmark + LOC + test counts; records
  the tool-only delivery decision and the §2.E replacement protocol.
- **Modified**: `docs/plans/M4/2026-04-27-M4-razor-refactor-proposal.md` —
  §2.E rewrite, §4 P0-5 stage row revision, §7 P3-5/P3-6 + Phase
  Gate softening, §9 P5-1 stage row revision, §11 quantitative
  targets reinterpretation, §12 risk register softening, §14
  dependency matrix softening.
- **Added**: `docs/devlog/M4/2026-04-27-M4-baseline-tool-only.md` —
  this entry.
- **Modified**: `docs/DEVLOG.md` — index this entry.
