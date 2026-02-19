# Granulator — Max Patch Wiring Guide

JS-based granular synthesis module for the geo-sonification project.
4-voice polyphony with proximity-driven parameter modulation.

## Wiring Diagram

```
                    [buffer~ mybuf]
                    (read mybuf /path/to/audio.wav)
                          |
              ┌───────────────────────┐
              │   [js granulator.js]  │
              │                       │
              │ in0: bang (start/stop)│
              │ in1: dur min  (500)   │
              │ in2: dur max  (1000)  │
              │ in3: int min  (1000)  │
              │ in4: int max  (2000)  │
              │ in5: start range (ms) │
              │ in6: amp var  (0-1)   │
              │ in7: proximity (0-1)  │
              └─┬──┬──┬──┬──┬──┬──┬──┬┘
                │  │  │  │  │  │  │  │
           out0-3 (play)    out4-7 (envelope)
                │  │  │  │  │  │  │  │
                v  v  v  v  v  v  v  v

    [play~ mybuf] [play~ mybuf] [play~ mybuf] [play~ mybuf]
         |             |             |             |
         |        [line~]       [line~]       [line~]       [line~]
         |             |             |             |
        [*~]          [*~]          [*~]          [*~]
         |             |             |             |
         └──────┬──────┘──────┬──────┘
                |             |
               [+~]         [+~]
                └──────┬──────┘
                       |
                      [+~] ──→ [dac~] or downstream mix
```

## Step-by-Step Wiring

### 1. Create the buffer

- Add `[buffer~ mybuf]` to your patch
- Load audio: send `read mybuf /path/to/audio.wav` or use the `read` message
- Note the buffer length in ms — set this as the `start range` (inlet 5)

### 2. Create the JS object

- Add `[js granulator.js]` to the patch
- It will show 8 inlets (left) and 8 outlets (bottom)

### 3. Create 4 voice chains

For each voice (0, 1, 2, 3):

1. Add `[play~ mybuf]` — connect granulator outlet N to its inlet
2. Add `[line~]` — connect granulator outlet N+4 to its inlet
3. Add `[*~]` — connect `play~` output to left inlet, `line~` output to right inlet

### 4. Mix voices

- Add `[+~]` objects to sum the 4 `*~` outputs into a single audio signal
- Connect to `[dac~]` or your audio routing

### 5. Connect controls

- **Start/stop**: connect a `[toggle]` or `[bang]` to inlet 0
- **Start range**: send the buffer duration (ms) to inlet 5
  - Use `[info~ mybuf]` to get buffer length automatically
- **Proximity**: route `/proximity` from your OSC input to inlet 7

### 6. Optional parameter controls

Add `[number]` or `[flonum]` boxes for real-time parameter adjustment:

| Inlet | Parameter | Default | Range |
|-------|-----------|---------|-------|
| 1 | Duration min (ms) | 500 | 1+ |
| 2 | Duration max (ms) | 1000 | 1+ |
| 3 | Interval min (ms) | 1000 | 1+ |
| 4 | Interval max (ms) | 2000 | 1+ |
| 5 | Start range (ms) | 10000 | 0+ |
| 6 | Amplitude variation | 0 | 0–1 |
| 7 | Proximity | 1 | 0–1 |

## Parameter Tuning Guide

### Dense chatter (close-up texture)

Good for nearby urban/forest soundscapes with lots of micro-detail.

```
dur min:      50 ms
dur max:      200 ms
interval min: 100 ms
interval max: 300 ms
amp variation: 0.5
```

### Sparse ambient wash (distant view)

Slow, dreamy layers — the granulator's natural state when proximity → 0.

```
dur min:      500 ms
dur max:      2000 ms
interval min: 1000 ms
interval max: 3000 ms
amp variation: 0.2
```

### Proximity auto-modulation

With default parameters and proximity connected, the granulator
automatically transitions between these modes:

- **proximity = 1** (zoomed in): grains use full range [min, max] for
  both duration and interval → varied, active texture
- **proximity = 0** (zoomed out): grains lock to max duration and max
  interval → slow, sparse, blurry wash
- **In between**: smooth interpolation

No manual parameter changes needed — just connect `/proximity` to inlet 7.

### Tips

- Use a **long buffer** (30–60 seconds) of ambient texture for best results
- Set `start range` = buffer length − max grain duration to avoid reading past the end
- Increase `amp variation` (0.3–0.7) for more organic, natural-sounding results
- For very dense clouds, set interval min < duration — grains will overlap across voices
