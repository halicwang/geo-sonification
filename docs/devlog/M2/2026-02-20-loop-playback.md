# 2026-02-20 — Feature: Loop Playback: Global Clock + Double-Buffered Crossfade

## Problem

The Max patch had complete data routing (OSC → crossfade controller → 5-bus fold-mapping → flonum displays) but **zero audio objects**. No `buffer~`, `groove~`, or `dac~` existed. To hear anything, a loop playback system was needed.

## Design constraint: harmonic content

All 5 ambience WAVs are produced with Diva synth at 128 BPM with chord progressions — not ambient noise. If each bus crossfaded independently, their crossfade points would drift apart over time, causing chord collisions. Solution: **global clock + local voice manager** architecture.

## WAV format: 2:01.875 with crossfade tail

Each WAV is 2 minutes + 1 bar (1.875 seconds at 128 BPM). The last bar is a copy of the first bar. When the playback reaches the 2:00 mark, a second `groove~` voice starts from 0ms. During the 1.875s overlap, the old voice fades out and the new voice fades in. The identical content in the overlap window ensures a seamless transition.

## Architecture

```
[loop_clock.js]  ← single global clock
     |
  outlet 0: "go" / "xfade" / "stop" symbols
     |
  [route go xfade stop]
     |       |       |
  [s geosoni_loop_go] [s geosoni_xfade] [s geosoni_loop_stop]
     |
     ├─ [loop_voice.js] inside [loop_bus tree]
     ├─ [loop_voice.js] inside [loop_bus crop]
     ├─ [loop_voice.js] inside [loop_bus urban]
     ├─ [loop_voice.js] inside [loop_bus bare]
     └─ [loop_voice.js] inside [loop_bus water]
```

**`loop_clock.js`** — schedules crossfade timing via Max JS `Task`. Collects buffer lengths from all 5 buses via `[r geosoni_buflen]`, uses `min(lengths) - 1875` as trigger point. Validates lengths on receipt. Idempotent start/stop.

**`loop_voice.js`** — per-bus executor with 6 outlets (2 per groove~ for speed/position + 2 for fade envelopes). Two independent Tasks: `stopOutgoingTask` (after xfade) and `stopBothTask` (after stop). Anti-click ramps: 10ms fade-in on start, 20ms fade-out on stop with groove~ stopped after fade completes.

**`loop_bus.maxpat`** — abstraction with `#1` argument substitution. Contains `buffer~`, `info~` (triggered by buffer~ load-complete, not loadbang — eliminates race condition), 2× `groove~` (internal loop OFF), 3× `line~`, 8× `*~`, 2× `+~`, stereo outlets.

## Max patch changes

- DSP toggle with enforced ordering: ON → `dsp 1` first, then `clock.start()` after 50ms. OFF → `clock.stop()` first, then `dsp 0` after 100ms (fade-out safety).
- All start/stop/crossfade commands flow through `loop_clock.js` — toggle never bypasses clock.
- 5× `loop_bus` instances wired to fold-mapping flonum outputs.
- Stereo summing chain → `*~ 0.2` master trim (-14 dB for 5-bus headroom) → `dac~ 1 2`.
- Namespaced send/receive: `geosoni_loop_go`, `geosoni_xfade`, `geosoni_loop_stop`, `geosoni_buflen`.

## Files

- **New**: `sonification/loop_clock.js` — global crossfade clock
- **New**: `sonification/loop_voice.js` — per-bus voice manager
- **New**: `sonification/loop_bus.maxpat` — per-bus playback abstraction
- **Modified**: `sonification/max_wav_osc.maxpat` — added audio layer (DSP toggle, clock, 5 loop_bus instances, stereo mix, dac~)
- **Modified**: `sonification/samples/README.md` — updated ambience spec (48kHz, 2:01.875, crossfade tail)
- **Modified**: `README.md` — updated file structure and Sound Mapping section
- **No server changes**
