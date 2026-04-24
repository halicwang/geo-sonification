# Architecture — Sound Engine

This document describes the browser-based Web Audio engine.

For the overall system architecture (Frontend → Server → Browser Audio), see `README.md`.
For the **production deployment topology** (Cloudflare Pages + Worker + R2 + Fly.io), see [`DEPLOYMENT.md`](DEPLOYMENT.md).
For the frontend module structure (8 ES modules: config, landcover, ui, map, websocket, audio-engine, city-announcer, main), see `docs/devlog/M2/2026-02-20-frontend-module-split.md` and `docs/devlog/deprecated/2026-02-21-M3-open-platform-migration/2026-02-21-web-audio-migration.md`.
For sound design rationale and task specs, see `docs/plans/M2/2026-02-19-M2-sound-design-plan.md`.

---

## Data Flow

```
Frontend (Mapbox) ──WS──> Server (viewport bounds + zoom)
                           │
                           ├── spatial.js (aggregate stats)
                           ├── audio-metrics.js
                           │     ├── computeBusTargets() — fold 11 LC → 7 buses
                           │     └── computeProximityFromZoom() — zoom-based proximity
                           ├── viewport-processor.js — attach audioParams to stats
                           │
                      <──WS──  { type: 'stats', ..., audioParams }
                           │
Frontend: audio-engine.js
  ├── engine.update(audioParams) — store bus/coverage/proximity targets
  ├── engine.updateMotion(velocity) — client-side drag velocity (no server round-trip)
  ├── requestAnimationFrame loop
  │     ├── EMA smoothing (4 parallel signals, performance.now() timing)
  │     ├── coverage-linear land/ocean mix → GainNode.gain
  │     ├── proximity → 3-stage LP filter cutoff (500 Hz–20 kHz)
  │     └── velocity → lpFilter1 Q modulation
  ├── AudioBufferSourceNode × 7 — double-buffered crossfade loop
  └── visibilitychange — suspend/resume AudioContext
```

---

## Bus Fold-Mapping (11 LC Classes → 7 Audio Buses)

Eleven ESA WorldCover land cover classes are folded into seven audio buses:

```
Forest bus = LC 10 (Tree/Forest) + 95 (Mangrove)
Shrub bus  = LC 20 (Shrubland)
Grass bus  = LC 30 (Grassland)
Crop bus   = LC 40 (Cropland)
Urban bus  = LC 50 (Urban)
Bare bus   = LC 60 (Bare) + 100 (Moss/Lichen)
Water bus  = max( LC 70 (Snow/Ice) + 80 (Water) + 90 (Wetland),  oceanMix )
```

The Water bus uses `Math.max(landValue, oceanMix)` so that open-ocean areas (where no grid data exists) still produce water audio. `oceanMix` is derived from the coverage-linear land/ocean split (see below).

This fold-mapping is defined in `server/audio-metrics.js` (`BUS_LC_INDICES`, `computeBusTargets`).

---

## WAV Loading

Seven ambience WAVs are fetched from `/audio/ambience/<name>.wav` (`forest.wav`, `shrub.wav`, `grass.wav`, `crop.wav`, `urban.wav`, `bare.wav`, `water.wav`) with progress tracking via `ReadableStream`. Priority ordering: forest + water first (parallel), then shrub + grass + crop + urban + bare (parallel). Each bus uses double-buffered one-shot `AudioBufferSourceNode` voices with equal-power crossfade scheduling to eliminate loop-boundary clicks. A power curve (`exponent = 0.6`) is applied to smoothed bus values before gain assignment, stretching mid-high range differences for better perceptual contrast. A soft-limiter (`norm = max(shapedSum, 1.0)`) prevents clipping when multiple buses are active simultaneously. These WAV assets are local and gitignored (`frontend/audio/ambience/*.wav`), so a fresh clone must provide them manually; missing files surface as per-bus load errors in the UI.

---

## EMA Smoothing

Four parallel EMA signals run every `requestAnimationFrame`:

| Signal    | Time constant                     | Formula                                                          |
| --------- | --------------------------------- | ---------------------------------------------------------------- |
| Bus gains | 500 ms (`SMOOTHING_TIME_MS`)      | `alpha = 1 - exp(-dt / 500)`                                     |
| Coverage  | 500 ms (`SMOOTHING_TIME_MS`)      | same                                                             |
| Proximity | 120 ms (`PROXIMITY_SMOOTHING_MS`) | `alpha = 1 - exp(-dt / 120)` — faster for snappy filter response |
| Velocity  | 50 ms attack / 600 ms decay       | asymmetric EMA — fast rise on drag start, slow fade on stop      |

Timing uses `performance.now()`, not rAF timestamps. If `dt > 2000ms` (snap threshold), all signals jump directly to target.

---

## Coverage-Linear Ocean Detection

The land/ocean mix is a simple linear ramp driven by `coverage` (fraction of viewport cells with land data):

```
coverage  0%  → landMix = 0.0,  oceanMix = 1.0   (pure ocean)
coverage 40%  → landMix = 1.0,  oceanMix = 0.0   (pure land)
linear interpolation between, clamped outside [0%, 40%]
```

Formula: `landMix = clamp01(coverage / 0.4)`, `oceanMix = 1 - landMix`.

Each land bus gain is `(shaped[i] / norm) * landMix`. The Water bus takes `Math.max(landValue, oceanMix)`, ensuring water audio is always present when coverage is low. EMA smoothing (500 ms) on `coverage` provides gradual transitions.

---

## Low-Pass Filter Chain

Three cascaded 12 dB/oct `BiquadFilterNode`s form a 36 dB/oct (6th-order Butterworth) low-pass filter between `masterGain` and `audioCtx.destination`:

```
masterGain → lpFilter1 → lpFilter2 → lpFilter3 → destination
```

**Cutoff frequency** is driven by the smoothed proximity signal:

```
cutoff = 500 * 40^proximitySmoothed
```

This maps proximity `0 → 500 Hz` (zoomed out, muffled) to `1 → 20 kHz` (zoomed in, full brightness). Logarithmic spacing matches human pitch perception so zoom-in and zoom-out feel equally gradual.

**Q modulation**: `lpFilter1.Q` is modulated by smoothed drag velocity, adding a resonance peak during fast panning:

```
Q = BASE_Q1 + velocitySmoothed * (MAX_Q1 - BASE_Q1)
    0.5176  +                     (4.0    - 0.5176)
```

`lpFilter2` and `lpFilter3` keep fixed Butterworth Q values (0.7071 and 1.9319).

---

## Client-Side Motion Signals

Drag velocity is computed in `map.js` from consecutive viewport center positions and fed directly to the audio engine via `engine.updateMotion(velocity)` — no server round-trip, for zero-latency response. The velocity signal (0–1, capped at 50 deg/sec) controls the lpFilter1 Q modulation described above.

---

## Loop Progress and Seeking

The engine exposes `getLoopProgress()` (returns `{ progress, cycleSeconds }`) and `seekLoop(progress)` for a draggable loop progress bar in the UI. Seeking stops all current voices and restarts them at the target buffer offset with the same drift-free scheduling clock.

---

## Idle Behavior

If `update()` is not called (for example, map is stationary), the engine keeps the last smoothed bus values and continues loop playback. It does not auto-fade to silence on idle; suspension is only driven by explicit user stop or tab visibility changes.

---

## Visibility Handling

On `document.hidden`: cancel rAF, clear swap timer, and suspend `AudioContext`. On visible (if user hasn't explicitly stopped): resume context, snap all smoothed values (buses, coverage, proximity) to current targets and reset velocity to 0 (avoids jarring transition from stale values), restart rAF and swap timer.

---

## Timing Constants

| Constant                       | Value   | Location        | Purpose                                     |
| ------------------------------ | ------- | --------------- | ------------------------------------------- |
| `SMOOTHING_TIME_MS`            | 500 ms  | audio-engine.js | EMA time constant (bus gains, coverage)     |
| `PROXIMITY_SMOOTHING_MS`       | 120 ms  | audio-engine.js | Faster EMA for LP filter cutoff             |
| `SNAP_THRESHOLD_MS`            | 2000 ms | audio-engine.js | Snap-to-target when dt too large            |
| `VELOCITY_ATTACK_MS`           | 50 ms   | audio-engine.js | Velocity EMA attack (fast rise)             |
| `VELOCITY_DECAY_MS`            | 600 ms  | audio-engine.js | Velocity EMA decay (slow fade)              |
| `LOOP_OVERLAP_SECONDS`         | 1.875 s | audio-engine.js | Crossfade overlap between loop voices       |
| `LOOP_START_LOOKAHEAD_SECONDS` | 0.05 s  | audio-engine.js | Initial source scheduling lookahead         |
| `LOOP_TIMER_LOOKAHEAD_SECONDS` | 0.1 s   | audio-engine.js | JS wake-up before swap boundary             |
| `GAIN_CURVE_EXPONENT`          | 0.6     | audio-engine.js | Power-curve shaping for perceptual contrast |
| `BASE_Q1`                      | 0.5176  | audio-engine.js | lpFilter1 Q at rest (Butterworth)           |
| `MAX_Q1`                       | 4.0     | audio-engine.js | lpFilter1 Q at max velocity                 |
| `LAND_FULL_COVERAGE_THRESHOLD` | 0.4     | audio-engine.js | Coverage at which land mix reaches 100%     |

---

## City Announcer

`frontend/city-announcer.js` — announces the nearest major city name via pre-generated TTS audio with stereo panning when the user dwells at a location.

### Trigger Conditions (all must be true)

| Condition        | Value          | Detail                                                  |
| ---------------- | -------------- | ------------------------------------------------------- |
| Dwell time       | 500 ms         | Viewport must stay still for 0.5 s after last `moveend` |
| Min zoom         | >= 5           | World view does not trigger                             |
| City in viewport | bounds check   | Nearest city must be within current viewport bounds     |
| City changed     | name differs   | Same city is not re-announced on small pans             |
| Cooldown         | 4 000 ms       | Minimum gap between announcements                       |
| Audio enabled    | engine running | Respects the user's play/stop toggle                    |

### City Database

Pre-built `data/cities.json` (~555 entries, population > 1M, sourced from GeoNames CC BY 4.0). Each entry: `{ name, lat, lng, pop, slug }`. Loaded once on module init via `fetch('/data/cities.json')`. Nearest-city lookup is a linear scan filtered to the viewport bounding box.

### Audio Routing

Pre-generated M4A clips in `frontend/audio/cities/{slug}.m4a` (macOS `say -v Samantha`, ~3–5 KB each). Loaded on demand with a 50-entry LRU AudioBuffer cache. Playback bypasses the ambient LP filter chain:

```
[AudioBufferSource] → [GainNode] → [StereoPannerNode] → audioCtx.destination
```

Pan value is computed from the city's horizontal position in the viewport: `pan = clamp((cityLng − west) / (east − west) × 2 − 1, −1, +1)`. Gain respects master volume (`masterVolume × 0.3`).

### Data Flow

```
map 'moveend'
  → main.js passes center, zoom, viewport bounds
  → announcer.onViewportSettle(lat, lng, zoom, bounds)
    → 500 ms dwell timer (reset on each moveend)
    → findNearestCity(center, bounds)  [local JSON database]
    → loadCityAudio(slug)              [fetch + decodeAudioData, cached]
    → playAnnouncement(buffer, pan)    [Web Audio, stereo-panned]
```
