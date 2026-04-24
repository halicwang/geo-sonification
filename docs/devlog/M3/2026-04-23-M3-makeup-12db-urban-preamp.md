# 2026-04-23 — Refactor: Makeup Gain +12 dB with Urban Bus Preamp

Raise master makeup gain from +10 dB to +12 dB and add a per-bus
preamp array, pre-attenuating the `urban` bus by -10 dB so the
summed output still clears the limiter on urban-heavy viewports.
Net effect: quieter buses come up another +2 dB to sit closer to
the -16 LUFS target while the hotter urban content no longer pins
the limiter.

## Why

After the `+10 dB` commit (`38be4e4`) subjective listening still
read as "a bit quiet." Advancing to `+12 dB` gets within striking
distance of Spotify/Apple-family loudness. But urban's raw peak
(`-6.61 dBTP` from `scripts/measure-loudness.js`) was already the
dominant limiter trigger at `+10 dB`; a further +2 dB would push
its post-makeup peak to `+5.4 dBTP` and engage the limiter by
~8 dB — that's "always-on compression" territory, which is the
opposite of the clean target.

The inter-bus imbalance is a source-authoring issue (urban.wav
is ~6 LU louder integrated and ~15 dB hotter peak than the
other six), previously flagged in the
`2026-04-23-M3-info-panel-visual-overhaul` devlog as
out-of-scope. This commit addresses it at the runtime level
without touching the WAVs: a static per-bus preamp multiplier
applied at the end of `rafLoop`'s gain computation.

## Changes

### `frontend/audio-engine.js`

- New `BUS_PREAMP_GAIN` constant array (7 entries, matching
  `BUS_NAMES` order). All buses = `1.0` except `urban` at
  `0.316` (≈ -10 dB). Comment explains the calibration source
  and the math.
- `MAKEUP_GAIN_DB` bumped from `10` to `12`.
- The rafLoop's final assignment
  `gains[i].gain.value = value;` becomes
  `gains[i].gain.value = value * BUS_PREAMP_GAIN[i];`. One
  multiplication per bus per frame; negligible cost.

No other engine logic changes.

## Headroom Math

Using the numbers from `scripts/measure-loudness.js`:

| bus    | source LUFS | source peak | +12 dB makeup peak | with preamp      | limiter? |
| ------ | ----------- | ----------- | ------------------ | ---------------- | -------- |
| urban  | -26.04      | -6.61 dBTP  | +5.4 dBTP          | -4.6 dBTP (-10)  | clear    |
| crop   | -29.91      | -17.67 dBTP | -5.7 dBTP          | same             | clear    |
| forest | -31.51      | -20.98 dBTP | -9.0 dBTP          | same             | clear    |
| shrub  | -32.80      | -20.62 dBTP | -8.6 dBTP          | same             | clear    |
| bare   | -32.83      | -21.52 dBTP | -9.5 dBTP          | same             | clear    |
| water  | -32.88      | -20.93 dBTP | -8.9 dBTP          | same             | clear    |
| grass  | -32.97      | -21.90 dBTP | -9.9 dBTP          | same             | clear    |

Limiter threshold is `-3 dBTP`; with the urban preamp every bus
now peaks below it, so the limiter idles unless multiple hot
buses coincide (rare; soft-normalize caps summed amplitude at
unity anyway). The urban preamp leaves 1.6 dB of margin against
the threshold.

Loudness picture after the change:

- urban alone: -26.04 - 10 + 12 = -24 LUFS
- forest alone: -31.51 + 12 = -19.5 LUFS
- typical mixed scene: ~-20 to -22 LUFS (below the -16 LUFS
  target but noticeably louder than the pre-commit baseline)

Urban viewports will now read *quieter* than forest/water
viewports — an intentional reversal of the pre-commit behavior
where urban was the loudest. This matches the engine's
already-implicit assumption that all buses should sit at
comparable reference levels.

## Verification

- `npm run format:check` — clean.
- `npm run lint` — clean.
- `npm test` — 14 suites / 154 tests pass.
- `curl /audio-engine.js` serves `MAKEUP_GAIN_DB = 12`, the
  `BUS_PREAMP_GAIN` array with `0.316` at index 4, and the
  `value * BUS_PREAMP_GAIN[i]` multiplication in rafLoop.
- Browser A/B left to the user's reload:
    - Ambient scenes (forest, water, grass) should feel
      noticeably louder than the prior commit.
    - Urban viewports should sound clean — no pumping, no
      buried transients. Overall urban loudness will be lower
      than forest/water by design.
    - No limiter activity on any single-bus scenario; mixed
      scenes should still clear it thanks to the soft-normalize.

## Rollback

One-line tunes:

- Back off to `+10 dB`: `MAKEUP_GAIN_DB = 10` — undoes the
  loudness bump, urban preamp becomes unnecessary but harmless
  (no limiter engagement).
- Urban "too quiet" after this change: raise
  `BUS_PREAMP_GAIN[4]` from `0.316` toward `0.5` (-6 dB).
  Each +2 dB reduces the limiter margin by 2 dB; at
  `BUS_PREAMP_GAIN[4] = 0.5` urban peaks at -0.6 dBTP which
  would engage the limiter.

Full revert: `git revert <hash>` restores the `+10 dB` /
no-preamp state in one commit.

## Files Changed

- **Modified**: `frontend/audio-engine.js` — new preamp array,
  makeup bump, rafLoop multiplier.
- **Modified**: `docs/DEVLOG.md` — index entry.
- **Added**: this entry.
