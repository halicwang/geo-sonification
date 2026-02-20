# Architecture — Max/MSP Sound Engine

This document describes the internal wiring of the Max patch (`sonification/max_wav_osc.maxpat`) and its supporting JS scripts and sub-patches.

For the overall system architecture (Frontend → Server → Max), see `README.md`.
For sound design rationale and task specs, see `sound_design_plan.md`.

---

## File Inventory

```
sonification/
├── max_wav_osc.maxpat          Main patch — OSC routing, mixing, DSP control
├── loop_bus.maxpat             Sub-patch template (not used directly, kept as reference)
├── crossfade_controller.js     EMA-smoothed 11-channel volume controller
├── loop_clock.js               Global crossfade clock — schedules go/xfade/stop
├── loop_voice.js               Per-bus voice manager — double-buffered groove~ control
├── water_bus.js                Three-level ocean detector with EMA smoothing
├── icon_trigger.js             Probabilistic auditory icon trigger
├── granulator.js               Granular synthesis engine (unused in current wiring)
└── samples/
    ├── ambience/               Loopable stereo WAVs (one per bus)
    │   ├── tree.wav
    │   ├── crop.wav
    │   ├── urban.wav
    │   ├── bare.wav
    │   └── water.wav
    └── icons/                  Short one-shot samples for icon triggers
```

---

## Signal Flow Overview

```
UDP 7400 (OSC from Node server)
    │
    ├─→ 4 summary values ─────→ display + outlets (landcover, nightlight, population, forest)
    │
    ├─→ 11 land-cover channels ─┬─→ crossfade_controller.js (EMA smoothing)
    │                           │       │
    │                           │       └─→ fold-mapping (11 → 5 bus volumes)
    │                           │               │
    │                           │               └─→ 5× loop_bus sub-patches (double-buffered playback)
    │                           │                       │
    │                           │                       └─→ stereo sum → *~ 0.2 master trim → dac~
    │                           │
    │                           └─→ icon_trigger.js (probabilistic one-shots)
    │
    ├─→ per-grid data ─────────→ print (debug, reserved for future spatial audio)
    │
    └─→ proximity / coverage ──→ water_bus.js (ocean detector)
                               ──→ crossfade_controller.js inlet 11
                               ──→ icon_trigger.js inlet 11
```

---

## Layer 1 — OSC Input & Primary Routing

```
[udpreceive 7400]
       │
[route /landcover /nightlight /population /forest]
       │             │              │           │
   unpack i      unpack f       unpack f    unpack f
       │             │              │           │
   number ───→   flonum ───→    flonum ───→  flonum ───→   (display)
       │             │              │           │
   outlet        outlet         outlet       outlet        (to external)
```

First-level `route` extracts four viewport-level summary values:

| Address | Type | Range | Meaning |
|---------|------|-------|---------|
| `/landcover` | int | 10–100 | Dominant ESA WorldCover class code |
| `/nightlight` | float | 0–1 | Normalized VIIRS nightlight intensity |
| `/population` | float | 0–1 | Normalized population density |
| `/forest` | float | 0–1 | Forest cover fraction |

Unmatched messages continue to the next routing stages.

---

## Layer 2 — 11-Channel Land Cover Distribution

```
[route /lc/10 /lc/20 /lc/30 /lc/40 /lc/50 /lc/60 /lc/70 /lc/80 /lc/90 /lc/95 /lc/100]
  │      │      │      │      │      │      │      │       │       │       │
  (each) → unpack f → flonum (display) → outlet (external)
                  │                          │
                  ├──→ js crossfade_controller.js  (inlet 0–10)
                  └──→ js icon_trigger.js          (inlet 0–10)
```

Each `/lc/*` value is a float 0–1 representing the area fraction of that land cover class. Every channel fans out to three destinations: display, crossfade controller, and icon trigger.

| Outlet | Class | Label |
|--------|-------|-------|
| 0 | 10 | Tree / Forest |
| 1 | 20 | Shrubland |
| 2 | 30 | Grassland |
| 3 | 40 | Cropland |
| 4 | 50 | Urban / Built-up |
| 5 | 60 | Bare / Sparse |
| 6 | 70 | Snow / Ice |
| 7 | 80 | Water |
| 8 | 90 | Herbaceous Wetland |
| 9 | 95 | Mangroves |
| 10 | 100 | Moss / Lichen |

---

## Layer 3 — Per-Grid Data & Viewport Signals

### Per-grid routing (debug / future use)

```
[route /grid/count /grid/pos /grid/lc /grid /viewport]
   │          │          │        │         │
 print    unpack f f  unpack×11  unpack   print
         → print     → print   → print
```

Currently routed to `print` objects for Max console inspection. Reserved for future spatial audio.

### Viewport signals

```
[route /proximity /delta/lc /coverage]
    │                          │
 unpack f                   unpack f
    │                          │
 flonum (display)           flonum (display)
    │                          │
 [send geosoni_prox]        [send geosoni_cov]
```

`/proximity` (float 0–1) and `/coverage` (float 0–1) are broadcast via named `send`/`receive` pairs to three consumers:

| Signal | Consumers |
|--------|-----------|
| `geosoni_prox` | `crossfade_controller.js` inlet 11, `icon_trigger.js` inlet 11, `water_bus.js` inlet 0 |
| `geosoni_cov` | `water_bus.js` inlet 1 |

---

## Layer 4 — Crossfade Controller

**File**: `crossfade_controller.js` — 12 inlets, 11 outlets.

Smooths raw land cover percentages into gradual volume envelopes using EMA (exponential moving average).

### Inlet assignment

- Inlets 0–9: `/lc/10` through `/lc/95` — store target value only (no output trigger)
- Inlet 10: `/lc/100` — store target AND trigger frame update for all 11 channels
- Inlet 11: `/proximity` — stored for downstream use

### Frame-based smoothing

The server sends all 11 `/lc/*` messages in rapid succession. To ensure consistent smoothing, inlets 0–9 only store values. Inlet 10 (the last class in send order) triggers `updateFrame()`, which applies the same `dt` and `alpha` to all 11 channels simultaneously.

```
alpha = 1 - exp(-dt / smoothingTime)      // smoothingTime default: 500 ms
smoothed[i] += alpha * (target[i] - smoothed[i])
```

### Output

11 floats (0–1), output right-to-left per Max convention. Each outlet corresponds to one ESA class in the same order as the inlet table above.

---

## Layer 5 — Fold Mapping (11 Channels → 5 Audio Buses)

The crossfade controller always outputs 11 independent channels. The Max patch wiring folds them into 5 audio buses using `+ 0.` adder chains:

```
Tree bus  = out[0] + out[1] + out[2] + out[8] + out[9] + out[10]
            (Tree)  (Shrub)  (Grass)  (Wetland) (Mangrove) (Moss)
            ┌─ tree_add1: out[0] + out[1]
            ├─ tree_add2: tree_add1 + out[2]
            ├─ tree_add3: out[8] + out[9]
            ├─ tree_add4: tree_add3 + out[10]
            └─ tree_add5: tree_add2 + tree_add4

Crop bus  = out[3]                          (Cropland — direct)

Urban bus = out[4]                          (Urban — direct)

Bare bus  = out[5]                          (Bare — direct)

Water bus = max( out[6] + out[7],  water_bus.js ocean level )
            ┌─ water_add1: out[6] + out[7]   (Snow/Ice + Water)
            ├─ js water_bus.js → smoothed ocean level
            └─ [maximum 0.]: takes the larger of the two
```

This fold-mapping is temporary. As new audio assets are added, channels will unbundle from shared buses.

---

## Layer 5a — Water Bus Ocean Detector

**File**: `water_bus.js` — 2 inlets, 1 outlet.

Produces a smoothed "ocean level" based on the absence of grid data (ocean has no grids, so `coverage ≈ 0`).

### Three levels

| Condition | Target | Meaning |
|-----------|--------|---------|
| `proximity == 0` | 1.0 | Pure ocean — no grids at all |
| `coverage < 0.1` AND `proximity > 0.7` | 0.7 | Coastal — mostly ocean, some land |
| Otherwise | 0.0 | Land — sufficient data coverage |

The target is EMA-smoothed with the same formula as the crossfade controller (default 500 ms). The output feeds into `[maximum 0.]` alongside the crossfade's class 70+80 sum, so the Water bus volume is whichever is greater: the land-cover-derived water percentage or the ocean detector level.

---

## Layer 6 — DSP Control & Loop Clock

### DSP toggle

```
[toggle] → [sel 1 0]
    ├─ ON:  [t b b]
    │        ├─→ [; max dsp 1]             (enable audio engine)
    │        └─→ [delay 50] → "start" → js_clock
    │
    └─ OFF: [t b b]
             ├─→ "stop" → js_clock
             └─→ [delay 100] → [; max dsp 0]   (disable after fade-out)
```

### loop_clock.js — Global crossfade clock

**File**: `loop_clock.js` — 1 inlet, 1 outlet.

Single instance. Manages timing for all 5 buses simultaneously.

**Inputs**:
- `start` — begin playback, schedule first crossfade
- `stop` — stop all playback
- `buflen <ms>` — register a buffer length (from each loop_bus on load)

**Buffer length collection**: Each of the 5 loop_bus instances sends its buffer duration via `[s geosoni_buflen]` → `[r geosoni_buflen]` → `[prepend buflen]` → clock inlet. The clock computes `triggerMs = min(allLengths) - 1875ms`.

**Tick cycle**: On start, outputs `"go"`. Every `triggerMs` thereafter, outputs `"xfade"`. On stop, outputs `"stop"`.

**Output routing**:
```
js_clock outlet 0 → [route go xfade stop]
                        │        │       │
                  [s geosoni_loop_go]  [s geosoni_xfade]  [s geosoni_loop_stop]
```

These named sends broadcast to all 5 loop_bus instances simultaneously, ensuring synchronized crossfades across all buses.

---

## Layer 7 — Loop Bus Sub-Patches

Five instances embedded as `[p loop_bus_tree]`, `[p loop_bus_crop]`, `[p loop_bus_urban]`, `[p loop_bus_bare]`, `[p loop_bus_water]`. Each has 1 inlet (bus volume) and 2 outlets (stereo audio).

### Internal structure (identical across all 5)

```
INLET: bus volume (float 0–1)
    │
[pack f 20] → [line~ 0.]  ─── volume envelope (20 ms smoothing)

BUFFER LOADING:
[buffer~ loop_<name>] ← [loadmess replace .../ambience/<name>.wav]
    │ (bang on load complete)
[info~ loop_<name>] outlet 6 (duration ms) → [s geosoni_buflen]

VOICE CONTROL:
[r geosoni_loop_go]   → "start_playing" ─┐
[r geosoni_xfade]     → "xfade"         ─┼─→ [js loop_voice.js]
[r geosoni_loop_stop] → "stop"           ─┘       │ 6 outlets
                                                   │
    ┌──────────────────────────────────────────────┘
    │
    │  outlet 0: speed A → [sig~ 0.] → groove~ A (speed inlet)
    │  outlet 1: pos A   → groove~ A (seek inlet)
    │  outlet 2: speed B → [sig~ 0.] → groove~ B (speed inlet)
    │  outlet 3: pos B   → groove~ B (seek inlet)
    │  outlet 4: fade A  → [line~ 0.] (envelope signal)
    │  outlet 5: fade B  → [line~ 0.] (envelope signal)

AUDIO PATH (double-buffered crossfade):
    groove~ A (L ch) ──*~ fade_A ──┐
                                    ├─ +~ ── sum_L ──*~ vol_line ── OUT L
    groove~ B (L ch) ──*~ fade_B ──┘

    groove~ A (R ch) ──*~ fade_A ──┐
                                    ├─ +~ ── sum_R ──*~ vol_line ── OUT R
    groove~ B (R ch) ──*~ fade_B ──┘
```

### loop_voice.js — Per-bus voice manager

**File**: `loop_voice.js` — 1 inlet, 6 outlets.

Controls two `groove~` objects (voice A and voice B) that alternate playback. Does not schedule timing — only responds to commands from `loop_clock.js`.

| Command | Behavior |
|---------|----------|
| `start_playing` | Start voice A from 0 ms, fade in 10 ms (anti-click), silence voice B |
| `xfade` | Start incoming voice from 0 ms, crossfade 1875 ms (1 bar @ 128 BPM), schedule stop of outgoing voice after fade |
| `stop` | Fade both voices out in 20 ms, then stop groove~ objects |

Key constants:
- `XFADE_MS = 1875` — crossfade duration
- `STARTUP_FADE_MS = 10` — anti-click ramp on start
- `STOP_FADE_MS = 20` — anti-click ramp on stop

Groove~ objects have `loop 0` (looping disabled) so playback is one-shot per voice. The clock schedules the next crossfade before the buffer ends, creating seamless looping via the A/B alternation.

---

## Layer 8 — Stereo Mix & DAC Output

The 5 loop_bus sub-patches each output a stereo pair (L, R). These are summed with a cascade of `+~` objects:

```
L channel:                              R channel:
loop_tree L  + loop_crop L  → sum_L_1   loop_tree R  + loop_crop R  → sum_R_1
sum_L_1  + loop_urban L → sum_L_2       sum_R_1  + loop_urban R → sum_R_2
sum_L_2  + loop_bare  L → sum_L_3       sum_R_2  + loop_bare  R → sum_R_3
sum_L_3  + loop_water L → sum_L_4       sum_R_3  + loop_water R → sum_R_4
             │                                        │
          [*~ 0.2]                                 [*~ 0.2]
             │                                        │
          [dac~ 1 2] ─────────────────────────────────┘
```

Master trim is `*~ 0.2` (≈ −14 dB) to prevent clipping when all 5 buses play simultaneously at full volume.

---

## Layer 9 — Icon Trigger (Parallel Path)

**File**: `icon_trigger.js` — 13 inlets, 2 outlets.

Runs independently of the loop playback system.

### Inputs

- Inlets 0–10: 11 land cover percentages (same fan-out as crossfade controller)
- Inlet 11: proximity (via `receive geosoni_prox`)
- Inlet 12: bang from `[metro 100]` (toggle-controlled, 10 ticks/sec)

### Algorithm (per metro tick)

1. Compute weight per class: `weight[i] = lcPercent[i] * proximity` (zero if class inactive or on cooldown)
2. Trigger probability: `totalWeight * baseRate` (default 0.05)
3. Roll dice — if triggered, weighted random selection among eligible classes
4. Output: outlet 1 → intensity (random float 0–1), outlet 0 → category (ESA class code)

### Active classes (Phase 1)

Only classes with prepared icon samples are active: **10** (Tree), **40** (Crop), **50** (Urban), **60** (Bare). Add class codes to `ACTIVE_CLASSES` as new icon samples are added.

### Configuration messages (send to inlet 0)

- `baserate <float>` — trigger probability per tick (default 0.05)
- `cooldown <ms>` — minimum interval between same-class triggers (default 3000)

---

## Named Send/Receive Bus Summary

| Name | Direction | Purpose |
|------|-----------|---------|
| `geosoni_prox` | proximity → crossfade, icon_trigger, water_bus | Proximity signal distribution |
| `geosoni_cov` | coverage → water_bus | Coverage signal for ocean detection |
| `geosoni_buflen` | loop_bus instances → loop_clock | Buffer duration registration |
| `geosoni_loop_go` | loop_clock → all loop_bus instances | Start playback command |
| `geosoni_xfade` | loop_clock → all loop_bus instances | Crossfade command |
| `geosoni_loop_stop` | loop_clock → all loop_bus instances | Stop playback command |

---

## Timing Constants

| Constant | Value | Location | Purpose |
|----------|-------|----------|---------|
| `XFADE_MS` | 1875 ms | loop_voice.js, loop_clock.js | Crossfade duration (1 bar @ 128 BPM) |
| `STARTUP_FADE_MS` | 10 ms | loop_voice.js | Anti-click ramp on start |
| `STOP_FADE_MS` | 20 ms | loop_voice.js | Anti-click ramp on stop |
| `smoothingTime` | 500 ms | crossfade_controller.js, water_bus.js | EMA time constant |
| `EXPECTED_LEN` | 121875 ms | loop_clock.js | Expected WAV duration (2:01.875) |
| Metro interval | 100 ms | main patch (metro_icon) | Icon trigger evaluation rate |
| Volume ramp | 20 ms | loop_bus (vol_pack) | Bus volume smoothing |
| Master trim | 0.2 | main patch (trim_L/R) | −14 dB headroom for 5-bus sum |
