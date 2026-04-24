# 2026-04-23 — Feature: Master Loudness Normalization (−16 LUFS)

Introduce a master-bus loudness-normalization chain (static makeup
gain + soft peak limiter) that pulls the average output toward a
fixed −16 LUFS target, roughly aligning the app with broadcast /
streaming loudness conventions (Spotify −14, YouTube −14, Apple
Music −16) without touching any per-bus mix math or source WAVs.
The chain is gated by an `ENABLE_LOUDNESS_NORM` `localStorage` flag
(default on) so it can be A/B toggled from the browser console.
Calibration data comes from a new standalone `ffmpeg`-based
measurement script.

## Motivation

Before this change the Web Audio graph was:

```
7 buses → masterGain (user volume slider) → lpFilter1/2/3 → destination
```

No compressor, no limiter, no LUFS metering. Source WAVs were
user-supplied with unknown native loudness, so slider=100 played
the files at whatever level they happened to be authored at —
wildly quieter than any modern streaming platform would render.
Measurement showed the loudest source bus (`urban.wav`) sitting at
−26.0 LUFS integrated and the rest clustered around −31 to −33
LUFS, meaning typical output was ~10–17 LU below a Spotify-like
loudness floor.

The fix needed to (a) align output loudness with streaming
conventions, (b) leave the per-bus mix math untouched (EMA, power
curve, soft-normalize, ocean fold), and (c) leave source WAVs
byte-identical. A single dB-shift at master with a safety limiter
satisfies all three.

## Measurement

Ran `node scripts/measure-loudness.js` against
`frontend/audio/ambience/`. Per-file numbers:

| bus    | integrated LUFS | true peak (dBTP) | LRA (LU) |
| ------ | --------------- | ---------------- | -------- |
| urban  | **−26.04**      | **−6.61**        | 2.00     |
| crop   | −29.91          | −17.67           | 0.90     |
| forest | −31.51          | −20.98           | 0.50     |
| shrub  | −32.80          | −20.62           | 0.80     |
| bare   | −32.83          | −21.52           | 1.60     |
| water  | −32.88          | −20.93           | 1.80     |
| grass  | −32.97          | −21.90           | 1.60     |

`amix(normalize=0)` of all seven at unity: I=−21.99 LUFS, TP=−4.31
dBTP. Inter-bus loudness spread is 6.93 LU; `urban.wav` is the
only file with non-trivial transient content, and by ~15 dB.

The script's primary suggestion — `MAKEUP_GAIN_DB = target −
loudest_single = −16 − (−26.04) = +10.04 dB` — would pull the
loudest bus to target but push `urban.wav` transients to +3.4 dBTP,
forcing the limiter into near-continuous compression on any urban
scene. Dropped to **+8 dB** instead. Tradeoff table discussed
before commit:

| makeup | urban avg | urban peak (→ limiter) | other buses avg | limiter behavior       |
| ------ | --------- | ---------------------- | --------------- | ---------------------- |
| +10 dB | −16 LUFS  | +3.4 dBTP → −4 dB comp | −21 LUFS        | always-on on urban     |
| **+8 dB** | **−18 LUFS** | **+1.4 dBTP → −2 dB comp** | **−23 LUFS** | **urban transients only** |
| +6 dB  | −20 LUFS  | −0.6 dBTP              | −25 LUFS        | essentially idle       |

+8 dB reads as "tasteful master" instead of "always-compressed",
gives the limiter a genuine safety-net role rather than a
permanent-workload role, and still raises average loudness by 8 dB
across the board. The urban intra-source imbalance (15 dB above
everything else) is a separate authoring-level concern not
addressed here.

## Changes

### `scripts/measure-loudness.js` (new)

Standalone Node tool, zero npm deps, shells out to the system
`ffmpeg` with `loudnorm=print_format=json`. Measures each of the
seven bus files individually, then runs an `amix=normalize=0`
reference over all seven, parses the `loudnorm` JSON block out of
`ffmpeg`'s stderr, and prints:

- per-file integrated LUFS / true peak / loudness range
- loudest / quietest / spread summary
- amix upper-bound reference
- suggested `MAKEUP_GAIN_DB` against both reference points
- projected post-makeup peak on the loudest bus (so it's obvious
  whether the limiter will see work)
- a final JSON block for downstream scripting

Pure read — no WAV is modified. Warnings fire when the suggested
makeup falls outside `[−10, +10]` dB, when the loudest source
exceeds −6 LUFS (too hot to safely boost), or when any source
already clips (TP > 0 dBTP).

### `frontend/config.js`

New `getLoudnessNormEnabled()` export that reads
`localStorage.ENABLE_LOUDNESS_NORM`. Defaults to `true`; only the
literal string `'false'` disables the chain, and a `try/catch`
guard around `localStorage` access returns `true` if storage is
unavailable, so the feature is on for any path that reaches the
engine. Storage key name captured in a module-private const
alongside the existing `CLIENT_ID_STORAGE_KEY` pattern.

### `frontend/audio-engine.js`

- Top-of-file now imports `getLoudnessNormEnabled` from
  `./config.js` (first import in this module — it had been
  self-contained previously).
- New constants alongside `PRIORITY_*`:
    - `MAKEUP_GAIN_DB = 8`
    - `LIMITER_THRESHOLD_DB = -3`
    - `LIMITER_RATIO = 20`
    - `LIMITER_ATTACK_SEC = 0.003`
    - `LIMITER_RELEASE_SEC = 0.25`
    - `LIMITER_KNEE_DB = 0`
- In the `if (!audioCtx)` block of `start()`, the single
  `masterGain.connect(lpFilter1)` call is replaced by a branch on
  `getLoudnessNormEnabled()`:
    - **on** — create a local `GainNode` (value = `10 ** (8/20) ≈
      2.51`) and a local `DynamicsCompressorNode` configured as a
      soft peak limiter, wire
      `masterGain → makeupGain → limiter → lpFilter1`, and log
      `[audio] Loudness norm ON — makeup 8.0 dB, limiter threshold
      -3 dB` for verification
    - **off** — fall back to the legacy `masterGain → lpFilter1`
      connection and log `[audio] Loudness norm OFF — legacy chain`

`makeupGain` and `limiter` are **local `const`** inside the init
block — they're connected once at context creation and never
revisited, so they don't need module-level storage. That also
keeps `stop()` free of extra teardown logic.

## Rollback

Three layers, fastest first:

1. **Browser console (10 s)** —
   `localStorage.setItem('ENABLE_LOUDNESS_NORM', 'false');
   location.reload();`. The engine's next `start()` takes the
   legacy branch; behavior is bit-for-bit the pre-commit chain.
2. **Code default flip (1 line)** — change
   `getLoudnessNormEnabled` to return `false` by default; ship a
   follow-up commit. Script and devlog stay.
3. **Git revert** — single commit, `git revert <hash>` restores
   `audio-engine.js` / `config.js` / `scripts/` / `docs/devlog/`
   / `docs/DEVLOG.md`. Source WAVs are untouched and don't appear
   in the diff.

## Design Decisions / Tradeoffs

- **+8 dB over the script's +10 dB primary suggestion.** +10 dB
  achieves target loudness when only the loudest bus plays but
  forces the limiter into near-continuous compression on urban
  scenes (projected peak +3.4 dBTP). +8 dB gives ~2 dB of limiter
  engagement only on urban transients, which reads as mastering
  rather than pumping.
- **DynamicsCompressorNode as limiter, not a true-peak limiter.**
  Web Audio's built-in compressor uses ~6 ms lookahead and cannot
  strictly guarantee inter-sample true-peak compliance at the DAC.
  For ambient sources with no sharp transients this is observably
  fine; if the project ever adds percussive content, a
  WASM/AudioWorklet true-peak limiter can slot in at the same
  graph location.
- **Static calibration, not runtime LUFS-aware auto-gain.**
  Real-time K-weighted integrated LUFS measurement (BS.1770) in
  Web Audio is ~200 lines of FFT + filter banks, and coupling it
  to a gain control produces audible pumping on ambient content.
  A one-shot calibration with a peak limiter for safety is the
  right tool for this class of sound.
- **`masterVolume` (user slider) still sits *before* the makeup
  stage.** So slider=100 yields "-16 LUFS reference";
  slider=150 still adds +3.5 dB above that (post-limiter, so
  headroom compresses). This keeps the slider's 0–150 semantics
  identical to before and makes the loudness change a transparent
  lift rather than a slider recalibration.
- **Calibration is tied to the current source WAVs.** If
  `frontend/audio/ambience/` is re-authored, rerun
  `scripts/measure-loudness.js` and update `MAKEUP_GAIN_DB`. The
  script is zero-dep and finishes in a few seconds.

## Verification

- `npm run format:check` — clean.
- `npm run lint` — clean.
- `npm test` — 14 suites / 154 tests pass (server-side; no server
  changes).
- Script dry-run on the current WAVs produced the table above
  with no warnings.
- Served-asset `curl` spot-checks:
    - `main.js` unchanged
    - `style.css` unchanged
    - `config.js` exports `getLoudnessNormEnabled`
    - `audio-engine.js` ships `MAKEUP_GAIN_DB`, both limiter
      constants, the `createDynamicsCompressor()` call, and both
      `[audio] Loudness norm …` console.info strings
- Browser A/B left to the user's own dev-server reload — the
  console message on `start()` tells the user which branch ran.
  Expected before/after subjective: pressing play now should feel
  materially louder at the same slider position, and the volume
  slider's "Vol 100%" default should read as something close to
  what Spotify plays at unity.

## Files Changed

- **Modified**: `frontend/audio-engine.js` — loudness-normalization
  chain (import, 6 constants, branch in `start()`).
- **Modified**: `frontend/config.js` — `getLoudnessNormEnabled`
  export + `LOUDNESS_NORM_STORAGE_KEY` constant.
- **Modified**: `docs/DEVLOG.md` — index entry for this feature.
- **Added**: `scripts/measure-loudness.js` — loudness measurement
  tool.
- **Added**: `docs/devlog/M3/2026-04-23-M3-loudness-normalization.md`
  — this entry.

## Untouched

- `frontend/audio/ambience/*.wav` — all seven source files
  byte-identical.
- `frontend/audio-engine.js` per-bus gain math (EMA smoothing,
  `GAIN_CURVE_EXPONENT`, soft-normalize, ocean fold, loop-swap
  logic).
- `setVolume()` / `getVolume()` public surface — slider range and
  semantics unchanged.
- Server-side (`server/`) — no changes.
