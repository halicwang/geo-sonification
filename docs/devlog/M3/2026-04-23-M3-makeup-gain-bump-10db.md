# 2026-04-23 — Refactor: Bump Master Makeup Gain from +8 dB to +10 dB

After listening to the initial loudness-norm pass with
`MAKEUP_GAIN_DB = 8` (commit `e0073fe`) the output still felt quiet
next to Spotify-adjacent references. Bumping to `+10 dB` — which is
the value that the initial `scripts/measure-loudness.js` run
originally suggested for the -16 LUFS target — pulls the loudest
bus (`urban`, source at -26.04 LUFS) up to about -16 LUFS and the
quieter buses to roughly -20 to -23 LUFS. The conservative +8 dB
choice at first commit was explicitly to avoid the limiter
working on urban transients; +10 dB lets that happen, which is
perceptually acceptable on ambient content.

## Change

`frontend/audio-engine.js`: `const MAKEUP_GAIN_DB = 8;` →
`const MAKEUP_GAIN_DB = 10;`

## Headroom math (from the original measurement)

- `urban.wav` integrated = -26.04 LUFS, true peak = -6.61 dBTP.
- After +10 dB makeup: integrated ~= -16 LUFS, raw peak ~= +3.4 dBTP.
- Limiter (threshold -3 dB, ratio 20:1, attack 3 ms) attenuates
  the +3.4 dBTP raw peak by ~6.1 dB → post-limiter peak ~= -2.7
  dBTP. Safely under both 0 dBFS and the -1 dBTP streaming
  guideline.
- Other buses have peaks in the -17 to -22 dBTP range at source;
  +10 dB brings them to -7 to -12 dBTP, well below the limiter
  threshold. No engagement on forest / grass / water / etc.

## Verification

- `npm run format:check` — clean.
- `npm run lint` — clean.
- `npm test` — 14 suites / 154 tests pass (server-side only).
- `curl /audio-engine.js` serves `MAKEUP_GAIN_DB = 10;`.
- Browser A/B left to the user's reload: press play → should
  hear a ~2 dB louder baseline compared to the prior `+8 dB`
  commit. On urban-heavy viewports the limiter will tighten
  transients; on forest/water viewports nothing audible beyond
  the added loudness.

## Rollback

One-line revert: set back to `const MAKEUP_GAIN_DB = 8;`, or
`git revert <hash>` of this commit. Any value between 6 and 12
is reasonable territory; values above 12 start producing
always-on compression on urban content.

## Files Changed

- **Modified**: `frontend/audio-engine.js` — single constant.
- **Modified**: `docs/DEVLOG.md` — index entry.
- **Added**: this entry.
