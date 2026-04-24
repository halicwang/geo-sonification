# 2026-04-23 — Feature: Announcer Sidechain Ducking

When the city-announcer speaks a city name the ambience chain now
pulls down ~10 dB for the duration of the announcement, then smoothly
returns. The TTS gain was already `masterVolume * 0.3` (TTS at roughly
-10 dB relative to master), but on louder ambience moments the speech
was still getting buried. Ducking the ambience side gives the TTS a
clean seat above the mix without touching per-bus math or the source
WAVs.

## Motivation

The announcer plays its TTS through a separate path
(`source → gain → panner → ctx.destination`) and never rode the
ambience master chain (`audio-engine.js:918–930`), so the two streams
sum independently at the DAC with no interaction. With the recent
master loudness normalization pulling ambience toward -16 LUFS, the
TTS-vs-ambience headroom shrank further — a forest + urban viewport
with loud buses would completely mask the city-name. A sidechain-style
duck is the conventional fix for this class of voice-over-music
balance.

Web Audio's `DynamicsCompressorNode` has no sidechain input port, so a
"real" trigger-driven sidechain isn't available without an
AudioWorklet. For the single-voice / single-event use case here,
program-driven `setTargetAtTime` automation gives the same perceptual
result with far less plumbing.

## Changes

### `frontend/audio-engine.js`

- New constants `DUCK_DEPTH = 0.3`, `DUCK_ATTACK_TC = 0.05`,
  `DUCK_RELEASE_TC = 0.15`. Depth ≈ -10.5 dB; time constants chosen
  for broadcast voice-over feel (fast attack so ambience is out of
  the way by the first syllable, slower release so ambience doesn't
  snap back).
- New module-level `let duckGain = null;` in the State section.
- In the `if (!audioCtx)` init block, `duckGain` is created at unity
  and spliced between `masterGain` and the next stage:
    - With loudness norm:
      `masterGain → duckGain → makeupGain → limiter → lpFilter1`
    - Without loudness norm:
      `masterGain → duckGain → lpFilter1`
- Two new exported functions:
    - `duck()` — schedules `duckGain.gain.setTargetAtTime(DUCK_DEPTH,
      ctx.currentTime, DUCK_ATTACK_TC)`.
    - `unduck()` — schedules back to 1.0 with `DUCK_RELEASE_TC`.
    Both guard on `duckGain` / `audioCtx` existing, so they're safe
    no-ops before `engine.start()`.
- Both functions added to the `engine` export object.

### `frontend/city-announcer.js`

- In `playAnnouncement()`, right before `source.start()` call
  `engine.duck()`. Timing aligns with the existing 50 ms TTS fade-in
  (`FADE_IN_S = 0.05`), so ambience sinks at the same rate the TTS
  ramps in.
- In `source.onended`, after the existing disconnect bookkeeping,
  call `engine.unduck()`. `onended` fires both on natural buffer end
  and on explicit `source.stop()` (used by `reset()` and the "a new
  announcement preempts an older one" path), so unduck always runs.

## Design Decisions / Tradeoffs

- **Program-driven vs trigger-driven sidechain.** Web Audio's
  DynamicsCompressor can't use the announcer as a sidechain input.
  A true envelope-follower + compressor implementation needs an
  AudioWorklet (~200 lines) and, for a single TTS voice with a known
  start/end, adds no perceptible benefit over a setTargetAtTime
  call. Skipped.
- **Overlapping announcements.** Existing announcer logic
  `source.stop()`s the in-flight source before starting a new one.
  `source.stop()` triggers `onended`, which calls `unduck()`, and
  the new announcement's `duck()` fires moments later. Since
  `setTargetAtTime` cancels pending automation on the same
  AudioParam, the ambience just stays ducked across the seam
  instead of pumping up-then-down. No ref-count needed.
- **`setTargetAtTime` vs `linearRampToValueAtTime`.** The former's
  exponential approach is smoother and is the idiomatic choice for
  gain ducks (matches how hardware compressors behave in the time
  domain). The target is approached asymptotically — with the
  chosen time constants, ~95% of target depth is reached within
  ~150 ms, which is well under the length of any city-name TTS.
- **No feature flag.** Ducking is a narrow, predictable UX
  improvement; its scope is only "during announcer playback."
  Adding an `ENABLE_DUCKING` localStorage flag would be consistency
  theater with no real rollback value — a revert of this single
  commit is the faster rollback.
- **Duck depth = 0.3 (linear).** Matches the TTS gain ratio
  (`TTS_GAIN_RATIO = 0.3`) so ducked ambience and TTS are
  approximately equal-weight in the mix, leaving the TTS clearly
  intelligible without burying the ambience entirely. Can be tuned
  by editing `DUCK_DEPTH`.

## Verification

- `npm run format:check` — clean.
- `npm run lint` — clean.
- `npm test` — 14 suites / 154 tests pass (server-side only; no
  server changes).
- `curl http://localhost:3000/audio-engine.js` — new `DUCK_DEPTH`,
  `duckGain`, `duck`, and `unduck` identifiers all ship; export
  block contains `duck, unduck`.
- `curl http://localhost:3000/city-announcer.js` — `engine.duck()`
  and `engine.unduck()` each appear once.
- Browser A/B deferred to the user's reload on the running dev
  server. Checklist:
    - Pan the map until a city-name fires. Ambience should sink
      within ~50 ms of TTS onset, stay low through the phrase,
      then lift back over ~150 ms after the last syllable.
    - Fast-pan across two adjacent cities to trigger back-to-back
      announcements. Ambience should stay ducked across both
      without a detectable pump between them.
    - Adjust the volume slider during an announcement. Both TTS
      and ducked ambience should scale together (masterGain sits
      upstream of both paths' effective levels).

## Files Changed

- **Modified**: `frontend/audio-engine.js` — 3 constants, 1 module
  var, chain splice in both loudness-norm branches, 2 new exported
  functions.
- **Modified**: `frontend/city-announcer.js` — 2 lines wiring
  `engine.duck()` / `engine.unduck()`.
- **Modified**: `docs/DEVLOG.md` — index entry.
- **Added**: this entry.

## Rollback

1. Set `DUCK_DEPTH = 1.0` — turns the duck into a no-op at a
   one-line diff (duckGain stays unity throughout). Useful for
   quick A/B.
2. `git revert <hash>` — single commit, clean reversal of all code
   paths. Source WAVs untouched.
