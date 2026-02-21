# Per-Grid Spatial Sonification: Development Log

Date: 2026-02-06

## Current System State

### Aggregated Mode (Complete)

On each viewport update, the server sends **15 OSC messages** to MaxMSP:

**Aggregated stats (4 messages):**

- `/landcover` (int 10-100) — dominant ESA WorldCover class in viewport
- `/nightlight` (float 0-1) — normalized nightlight brightness
- `/population` (float 0-1) — normalized population density
- `/forest` (float 0-1) — normalized forest coverage

**Landcover distribution (11 messages, added today):**

- `/lc/10` through `/lc/100` (float 0-1) — area fraction per ESA class in viewport
- 11 classes: Tree/Forest, Shrubland, Grassland, Cropland, Urban, Bare, Snow/Ice, Water, Wetland, Mangroves, Moss/Lichen
- Classes not present in the viewport send 0.0; all 11 are always sent

Data pipeline: `Frontend (Mapbox) → WebSocket → Node.js Server → spatial.js (area-weighted aggregation) → osc.js → UDP → MaxMSP`

### Existing Infrastructure

Pre-optimizations already completed for per-grid:

- `normalizeOscValues()` extracted from `spatial.js` into standalone `normalize.js`, accepts explicit `normalizeParams` — reusable for per-grid normalization
- `calculateViewportStats()` now returns `gridsInView` array, directly accessible in `processViewport()`
- Spatial index (`spatialIndex`) provides O(1) viewport queries via 2D bucketing

---

## Per-Grid Concept

### Problem

Aggregated mode averages all grid cells in the viewport into a single set of values. The user hears a "regional summary" — regardless of whether the viewport contains forest, city, and river, the result is one blended sound. Spatial detail is lost.

### Solution

When the user zooms in far enough that only a small number of grid cells are visible, switch to **per-grid mode**: each cell sends its own OSC message, Max allocates an independent voice for each cell, and positions it spatially based on its location within the viewport.

```
Aggregated mode (zoom out):  N cells → 1 sound group
Per-grid mode (zoom in):     N cells → N voices, spatially distributed
```

---

## Key Design Decisions

### 1. Threshold-Based Mode Switching

```
gridCount > PER_GRID_THRESHOLD  →  aggregated mode (current behavior)
gridCount <= PER_GRID_THRESHOLD →  per-grid mode
```

**Recommended starting threshold: 20-50 cells.** Do not start with 1000. Rationale:

- Per-grid's value lies in spatial detail when zoomed in; aggregated mode is sufficient when zoomed out
- Max `poly~` performance needs testing — start with fewer voices
- Threshold is adjustable via environment variable, no code changes required

### 2. Spatial Panning

Simplest effective approach: **longitude → stereo L/R**

```javascript
pan = (grid.lon - viewport.west) / (viewport.east - viewport.west);
// 0.0 = hard left, 1.0 = hard right
```

The server only needs to send `lon`, `lat`, and viewport bounds to Max; panning computation happens on the Max side.

Optional advanced dimensions:

- Latitude → pitch/brightness (north = high frequency, south = low frequency)
- Area/weight → volume
- **Start with L/R pan only, validate the effect before adding more**

### 3. Why It Won't Be Chaos

"Won't 1000 grids sounding simultaneously be a mess?"

**No, because:**

**(a) Threshold control.** 1000 grids → aggregated mode. Per-grid only activates when grid count ≤ threshold. In practice, per-grid mode typically involves 10-30 cells.

**(b) Same-class stacking ≠ chaos.** If 25 out of 30 grids are grassland, they produce similar sounds → stacking makes the sound "thicker," like 40 violins in an orchestra playing the same melody. The few different grids (e.g., 2 river cells, 1 urban cell) become spatially locatable "highlights."

**(c) Volume differentiation.** Not every grid needs equal volume. Minority classes can be made more prominent:

```
40 grassland cells → each very quiet (background layer)
2 river cells      → slightly louder
1 urban cell       → most prominent
```

Perceptual result: a grassland bed with a few spatially distinct special points.

### 4. Both Modes Coexist

In per-grid mode, **aggregated OSC messages are still sent** (including the 11-class distribution). This means:

- Max can freely choose which data set to use
- Existing aggregated sound design remains intact
- Frontend stats panel is unaffected

---

## OSC Message Format

### New OSC Messages for Per-Grid Mode

```
/grid/count  N                                    ← tells Max how many grids to expect
/grid        lon lat landcover nl pop forest       ← repeated N times, one per cell
```

Parameters for each `/grid` message:
| Parameter | Type | Description |
|-----------|------|-------------|
| lon | float | Grid cell longitude (lower-left corner) |
| lat | float | Grid cell latitude (lower-left corner) |
| landcover | int | ESA class (10-100) |
| nightlight | float 0-1 | Normalized nightlight |
| population | float 0-1 | Normalized population density |
| forest | float 0-1 | Normalized forest coverage |

Plus optional viewport bounds (for Max-side panning calculation):

```
/viewport  west south east north                   ← viewport bounds for panning
```

---

## Implementation Plan

### Server Side (~40 lines of code)

**`config.js`** — 2 lines:

```javascript
const PER_GRID_THRESHOLD = parseInt(process.env.PER_GRID_THRESHOLD || '50', 10);
// export
```

**`osc.js`** — ~20 lines, new `sendGridsToMax()`:

```javascript
function sendGridsToMax(gridsInView, bounds, normalizeParams) {
    const [west, south, east, north] = bounds;
    // Send /grid/count
    oscPort.send({ address: '/grid/count', args: [{ type: 'i', value: gridsInView.length }] });
    // Send /viewport bounds
    oscPort.send({ address: '/viewport', args: [
        { type: 'f', value: west }, { type: 'f', value: south },
        { type: 'f', value: east }, { type: 'f', value: north }
    ]});
    // Loop through each grid, normalize and send
    for (const g of gridsInView) {
        const { nightlightNorm, populationNorm, forestNorm } = normalizeOscValues(...);
        const lc = getValidLandcover(g) || 80;
        oscPort.send({ address: '/grid', args: [
            { type: 'f', value: g.lon }, { type: 'f', value: g.lat },
            { type: 'i', value: lc },
            { type: 'f', value: nightlightNorm },
            { type: 'f', value: populationNorm },
            { type: 'f', value: forestNorm }
        ]});
    }
}
```

**`index.js`** — ~5 lines, add branch to `processViewport()`:

```javascript
// Aggregated OSC always sent
sendToMax(
    stats.dominantLandcover,
    stats.nightlightNorm,
    stats.populationNorm,
    stats.forestNorm,
    stats.landcoverDistribution
);
// Per-grid: send individual grids when below threshold
if (gridsInView.length <= PER_GRID_THRESHOLD && gridsInView.length > 0) {
    sendGridsToMax(gridsInView, validation.bounds, normalizeParams);
}
```

**Frontend** — ~10 lines:

- Stats panel displays current mode: "Aggregated" or "Per-Grid (N cells)"
- WS response stats includes `mode: 'aggregated' | 'per-grid'`

### Max Side (Data Reception Verification)

Only 3 new objects needed in the main patch:

```
udpreceive 7400
    │
    ├─ route /landcover /nightlight /population /forest  (existing)
    │
    ├─ route /grid/count /grid /viewport                 (new)
    │       │         │        │
    │    [print]   [print]  [print]                      (verify data with print first)
```

`poly~` sound design is a separate, later task — not part of this implementation.

---

## Max Architecture Outlook (Future)

Per-grid sound does not require 1000 patch cords. A single **`poly~`** object handles everything:

```
route /grid/count /grid
         │         │
         │    ┌────┴────────┐
         │    │ poly~       │  ← one object, up to N voices internally
         │    │ grid_voice N│
         │    └────┬────────┘
         │         │
         │      dac~
```

The subpatch inside `poly~` (`grid_voice.maxpat`) contains each voice's logic:

```
[in 1]  ← /grid parameters (lon lat lc nl pop forest)
   │
 unpack → pan~ (lon mapped to L/R) → synth/sampler → envelope → [out~ 1 2]
```

Max automatically manages N copies; the main patch visually gains only 3-4 objects.

---

## Open Questions

1. **Threshold value?** Start at 50, adjust based on Max performance testing
2. **Per-grid sound design?** Spatialized version of aggregated sound, or fundamentally different texture?
3. **Stereo vs multichannel?** Start with stereo L/R panning, consider quad/ambisonics later if effective
4. **Mode switching transition?** Crossing the threshold during zoom needs ~500ms crossfade to avoid pops — handled on Max side
5. **Grids entering/leaving viewport?** Need fade-in/fade-out envelopes, no hard pop in/out
6. **Volume strategy for same-class grids?** Minority prominence vs equal volume — requires listening tests

---

## Implementation Order

1. **Server data pipeline** — config + osc.js + index.js (~40 lines, 30 minutes)
2. **Frontend mode display** — stats panel (~10 lines, 10 minutes)
3. **Max data verification** — route + print (5 minutes)
4. **Max sound prototype** — simple poly~ + sine tone + pan (independent experimentation)
5. **Parameter tuning** — threshold, volume, transition timing (iterative)
