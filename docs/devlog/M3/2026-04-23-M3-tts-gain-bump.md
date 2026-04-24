# 2026-04-23 — Refactor: Raise Announcer TTS Gain 0.3 → 0.8

The city-announcer was added (`2026-04-02`) with
`TTS_GAIN_RATIO = 0.3` — 30 % of master volume, ~-10 dB — chosen
for a pre-loudness-normalization world where ambience played at
unity gain. After the `+12 dB` master makeup (commit `2d5cf9a`),
ambience plays approximately 4× louder at the DAC than before,
while TTS still runs through a parallel path that bypasses
`makeupGain`. The balance that was designed for "TTS at -10 dB
below ambience" flipped into "TTS at +2 dB below ducked ambience",
which reads as a muffled voiceover.

Bump `TTS_GAIN_RATIO` to `0.8` — the largest round number that
keeps the TTS path comfortably below 0 dBFS at realistic source
peaks (macOS `say` output peaks around -3 to -6 dBFS; the
announcer path has no limiter of its own, so going above 1.0
would risk hard clipping).

## Loudness Math

The announcer graph is:

```
source → gain (= masterVolume * TTS_GAIN_RATIO) → panner → destination
```

It does not pass through `makeupGain`, `limiter`, `lpFilter1/2/3`,
or `duckGain`. The ambience graph is:

```
buses → ... → masterGain → duckGain → makeupGain → limiter → lpFilters → destination
```

Relative DAC peak levels at `masterVolume = 1.0` on a crop-dominant
viewport (worst-case amplitude):

| path                     | before (TTS ratio 0.3) | after (TTS ratio 0.8) |
| ------------------------ | ---------------------- | --------------------- |
| ambience non-ducked      | ~0.71                  | ~0.71                 |
| ambience ducked          | ~0.43                  | ~0.43                 |
| TTS                      | ~0.21                  | ~0.57                 |
| TTS vs ducked ambience   | -6 dB                  | +2.4 dB               |

The TTS peak stays below 0 dBFS (~-5 dBFS output at worst-case
source peak of -3 dBFS), so no clipping on the parallel path.

## Changes

### `frontend/city-announcer.js`

- `TTS_GAIN_RATIO = 0.3` → `TTS_GAIN_RATIO = 0.8`
- JSDoc on the constant rewritten to explain the reasoning: the
  announcer bypasses the ambience makeup gain, so this ratio has
  to carry the voice on its own; kept under unity because the
  path has no limiter.

## Design Decisions

- **Bump the ratio rather than route TTS through `makeupGain`.**
  A "cleaner" fix is to route the announcer into the same
  `makeupGain`/`limiter` stage as ambience so TTS picks up the
  loudness normalization for free. But that would either put TTS
  behind the `duckGain` (making it duck itself — wrong) or require
  a new "shared output" node separate from duckGain, which is a
  graph refactor across two modules. Tuning a single constant is
  a 1-line fix with clear math; deferred the refactor until a
  second reason appears to do it.
- **Target `+2 to +3 dB` over ducked ambience**, not more. The
  announcer's pan + ambience duck + voice timbre already lift the
  perceived speech intelligibility; an aggressive "voice 6 dB
  above music" ratio would feel abrasive on quiet ambient
  viewports.
- **Did not touch `DUCK_DEPTH`.** With `TTS_GAIN_RATIO = 0.8`
  alone, TTS sits clearly above ducked ambience (+2.4 dB) without
  having to duck the ambience more aggressively. A deeper duck
  would help further but also make ambient viewports feel like
  they're "interrupted" during announcements, which is the
  opposite of the restrained-data-instrument direction.

## Rollback

One-line change: set `TTS_GAIN_RATIO` back toward its original
value, or anywhere in between. Safe values:

- `0.3` — original pre-loudness-norm setting (TTS buried).
- `0.5` — halfway; TTS still below ducked ambience.
- `0.7` — TTS just above ducked ambience (~+1 dB).
- `0.8` — chosen here (~+2.4 dB).
- `0.9` — TTS clearly dominates (~+3 dB), still safe.
- `1.0 +` — risky; no limiter on the announcer path to catch
  peaks if the source happens to be hot.

## Verification

- `npm run format:check` — clean.
- `npm run lint` — clean.
- `npm test` — 14 suites / 154 tests pass.
- `curl /city-announcer.js` serves `TTS_GAIN_RATIO = 0.8;`.
- Browser A/B deferred to user reload: pan near a city, announcer
  should now clearly cut through the ducked ambience; no harsh
  clipping or distortion on the voice.

## Files Changed

- **Modified**: `frontend/city-announcer.js` — the constant and its
  JSDoc.
- **Modified**: `docs/DEVLOG.md` — index entry.
- **Added**: this entry.
