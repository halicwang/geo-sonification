# Dev Log

Update logs, design decisions, and ideas for Geo-Sonification.

## Recording Guide

- **Order**: Reverse chronological — newest entry first, oldest last.
- **Heading format**: `## YYYY-MM-DD — <Category>: <Short Title>`
- **Categories**: `Feature`, `Fix`, `Refactor`, `Design`, `Milestone`, `Discussion` (pick the most fitting one).
- **Entry body**: Start with a 1–3 sentence summary of _what_ and _why_. Then add subsections (`###`) as needed for details, file lists, formulas, behavior matrices, etc.
- **Scope**: One entry per logical change. If a single session produces multiple independent changes, write separate entries (same date is fine).
- **File lists**: End each entry with a "Files changed" section listing new/modified/deleted files with a one-line description.
- **Idea Backlog**: Undated ideas and future directions go in the `## Idea Backlog` section at the bottom of this file, not as dated entries.
- **Separator**: Use `---` between entries.

---

## 2026-02-22 — Refactor: Remove Max/MSP Code

Removed all Max/MSP and OSC-related code from the project. With Web Audio fully functional (Phase W, 2026-02-21), Max/MSP is no longer needed. The system now uses Web Audio exclusively for sonification.

### Changes

- Deleted `sonification/` directory entirely (6 ES5 JS scripts, 2 .maxpat patches, sample placeholders)
- Deleted `server/osc.js` (UDP transport to Max) and `server/osc_schema.js` (OSC packet definitions)
- Deleted `scripts/osc_simulator.js` (OSC test tool)
- Deleted 3 OSC-specific test files: `osc.test.js`, `osc-disabled.test.js`, `osc-schema.test.js`
- Renamed `server/osc-metrics.js` → `server/audio-metrics.js` (inlined `LC_CLASS_ORDER` and `clamp01`)
- Renamed test files: `osc-metrics.test.js` → `audio-metrics.test.js`, `osc-metrics-bus.test.js` → `audio-metrics-bus.test.js`
- Removed `ENABLE_OSC`, `OSC_HOST`, `OSC_PORT`, `DEBUG_OSC` from `server/config.js` and `.env.example`
- Removed all OSC send calls from `server/viewport-processor.js`
- Removed OSC imports, `/api/manual` endpoint, and `oscReady` from `server/index.js`
- Removed `osc` npm dependency from `server/package.json`
- Simplified `start.command` (removed Max patch opening logic)
- Relocated audio sample directory: `sonification/samples/ambience/` → `frontend/audio/ambience/`
- Updated all documentation: `CLAUDE.md`, `ARCHITECTURE.md`, `README.md`

### Files changed

- `sonification/` — entire directory deleted
- `server/osc.js` — deleted
- `server/osc_schema.js` — deleted
- `scripts/osc_simulator.js` — deleted
- `server/__tests__/osc.test.js` — deleted
- `server/__tests__/osc-disabled.test.js` — deleted
- `server/__tests__/osc-schema.test.js` — deleted
- `server/osc-metrics.js` → `server/audio-metrics.js` — renamed, inlined LC_CLASS_ORDER and clamp01 (modified)
- `server/__tests__/osc-metrics.test.js` → `server/__tests__/audio-metrics.test.js` — renamed (modified)
- `server/__tests__/osc-metrics-bus.test.js` → `server/__tests__/audio-metrics-bus.test.js` — renamed (modified)
- `server/viewport-processor.js` — removed OSC send calls (modified)
- `server/index.js` — removed OSC imports, /api/manual, oscReady (modified)
- `server/config.js` — removed OSC config variables (modified)
- `server/package.json` — removed `osc` dependency (modified)
- `.env.example` — removed OSC variables (modified)
- `start.command` — removed Max/MSP logic (modified)
- `frontend/audio-engine.js` — removed Max references in comments (modified)
- `frontend/audio/ambience/.gitkeep` — new (relocated from sonification/samples/ambience/)
- `CLAUDE.md` — updated (modified)
- `ARCHITECTURE.md` — rewritten for Web Audio only (modified)
- `README.md` — rewritten for Web Audio only (modified)

---

## 2026-02-22 — Fix: Web Audio & WebSocket Bug Fixes (3 rounds)

Three rounds of bug fixes following the Web Audio migration, covering `audio-engine.js`, `websocket.js`, `server/config.js`, and two Max JS scripts.

### Round 1 — Code audit (5 bugs)

- **`server/config.js`**: Replaced unsafe `parseFloat()||fallback` with `parseNonNegativeFloat()` for `PROXIMITY_ZOOM_LOW`/`HIGH`. The `||` pattern silently swallowed `0` (a valid value) and returned the fallback instead.
- **`server/config.js`**: Removed dead `parsePositiveInt` function (lint warning).
- **`frontend/audio-engine.js`**: Reset `loadingStarted` on `stop()` so failed WAV samples can be retried on the next `start()` without a page reload.
- **`frontend/audio-engine.js`**: Clear no-data timers on `visibilitychange` hidden, restart on visible. Previously, the 3-second no-data timer kept running while the tab was hidden, causing audio to snap to silence on return.
- **`frontend/websocket.js`**: Removed duplicate `onDisconnect` call from `onerror` handler — `onclose` always fires after `onerror` per the WebSocket spec, so the callback was invoked twice.

### Round 2 — Auto-suspend resume (1 bug)

- **`frontend/audio-engine.js`**: The no-data timeout (10s idle) called `audioCtx.suspend()` but never set the `suspended` flag (reserved for explicit user stop). When new data arrived, `update()` ran but the context stayed suspended — audio was permanently silent until a visibility toggle or manual stop/start. Fixed by checking `audioCtx.state` in `update()` and calling `resume()` when data flows again.

### Round 3 — Audio system audit (7 bugs)

- **`frontend/audio-engine.js`**: Zero all EMA state (`busSmoothed`, `busTargets`, `oceanTarget`, `oceanSmoothed`) on `start()` to prevent an audible pop from stale values after a stop → navigate → start cycle.
- **`frontend/audio-engine.js`**: Skip buses with `status === 'loading'` in `loadSample()` to prevent duplicate parallel fetches when stop/start is called mid-load.
- **`frontend/audio-engine.js`**: rAF no-data fade now explicitly smooths toward 0 instead of relying on `busTargets` being zeroed by a `setTimeout`. The macrotask timer could fire after rAF, leaving a 1–2 frame gap where smoothing moved toward stale non-zero targets.
- **`frontend/websocket.js`**: Store reconnect timer ID and cancel on re-entry to prevent duplicate connections accumulating during network flapping.
- **`frontend/websocket.js`**: Close previous WebSocket before creating a new one (connection leak).
- **`frontend/websocket.js`**: Wrap `onOpen` callback in try/catch so `refreshServerConfig()` failure doesn't silently skip connection status update and initial viewport send.
- **`sonification/loop_clock.js`**: Clear `bufLengths` array and reset `triggerMs` on `stop()` to prevent unbounded growth across start/stop cycles.
- **`sonification/granulator.js`**: Clamp grain duration to `startRange` so `play~` never reads past the buffer boundary when `durMax` exceeds available range.

### Files changed

- `server/config.js` — safe env parsing for zero-value floats (modified)
- `frontend/audio-engine.js` — EMA reset, load guard, rAF fade, auto-resume, visibility timers (modified)
- `frontend/websocket.js` — reconnect guard, connection leak, onOpen error handling, duplicate callback (modified)
- `sonification/loop_clock.js` — state reset on stop (modified)
- `sonification/granulator.js` — grain duration clamping (modified)

---

## 2026-02-21 — Feature: Web Audio Migration (Phase W)

Added browser-based audio playback using Web Audio API, enabling the sonification system to run without Max/MSP.

### Changes

- **ENABLE_OSC flag:** New `ENABLE_OSC` config variable (default `true`). When `false`, `osc.js` exports a null-object interface and never opens a UDP port. Added `parseBool` helper to `config.js`.
- **Server-side fold mapping:** `osc-metrics.js` gains `computeBusTargets()` (folds 11 LC classes into 5 bus values per the Max patch wiring) and `computeOceanLevel()` (three-level ocean detection per `water_bus.js` logic). `viewport-processor.js` attaches `audioParams` to every stats response.
- **Static audio route:** `/audio/ambience/` serves only the ambience subdirectory of `sonification/samples/`, not the entire samples tree.
- **Frontend audio engine:** New `frontend/audio-engine.js`. Progressive WAV loading with priority (tree/water first). EMA smoothing computed in `update()` using `performance.now()`, applied to GainNodes via `requestAnimationFrame`. Snap threshold set to 2000ms. AudioContext lifecycle: suspend/resume on `visibilitychange`, no-data fade (3s) and suspend (10s) timeout on WS disconnect.
- **Audio UI controls:** Play/stop button and per-bus loading progress bars in the info panel, between stats section and connection status.
- **Icon triggers dropped:** All icon sample folders contain only `.gitkeep`. No icon trigger code implemented (YAGNI).

### Files changed

- `server/config.js` — `parseBool`, `ENABLE_OSC` (modified)
- `server/osc.js` — ENABLE_OSC guard with null object (modified)
- `server/osc-metrics.js` — `computeBusTargets`, `computeOceanLevel`, `BUS_NAMES`, `BUS_LC_INDICES` (modified)
- `server/viewport-processor.js` — `audioParams` in stats (modified)
- `server/index.js` — `/audio/ambience/` route, `ENABLE_OSC` in banner (modified)
- `frontend/audio-engine.js` — Web Audio engine (new)
- `frontend/index.html` — audio controls HTML (modified)
- `frontend/style.css` — audio controls CSS (modified)
- `frontend/main.js` — engine import, update wiring, toggle handler (modified)
- `frontend/config.js` — `audioEnabled` state flag (modified)
- `.env.example` — `ENABLE_OSC` documentation (modified)
- `server/__tests__/osc-disabled.test.js` — ENABLE_OSC=false tests (new)
- `server/__tests__/osc-metrics-bus.test.js` — bus fold + ocean tests (new)

---

## 2026-02-21 — Refactor: JSDoc Type Annotation Coverage

Comprehensive JSDoc `@param`/`@returns` annotations added across all 12 server modules. Previously only ~17% of public functions were annotated (14 of 82); `types.js` defined 5 typedefs but no module actually referenced them.

**Changes:**

- `server/types.js`: Added 5 new cross-module typedefs (`OscPacket`, `OscArg`, `Snapshot`, `DeltaState`, `ModeState`)
- All 12 source files in `server/` now have typed annotations on exported functions
- Existing loose types tightened (e.g. `object[]` → `GridCell[]`, `{Object}` → `{Object<number, number>}`)
- Fixed factual error in `viewport-processor.js` (`deltaState` param had phantom `timestampMs` field)
- `mode-manager.js` inline types updated to reference `ModeState` from `types.js`

**Principles applied:**

- `types.js` only holds types referenced by 2+ modules; single-module types stay inline
- `@type` only added to constants where VS Code can't infer (e.g. `Object.freeze()` results)
- Zero runtime change — all modifications are JSDoc comments only

---

## 2026-02-20 — Refactor: Frontend Module Split: app.js → 6 ES Modules

### Problem

`frontend/app.js` was a 624-line monolith mixing configuration, Mapbox initialization, WebSocket management, UI rendering, and state management. Hard to navigate and maintain.

### Solution

Split into 6 native ES modules using `<script type="module">`. No bundler — browsers handle the import graph natively.

| Module         | Lines | Responsibility                                                                     |
| -------------- | ----- | ---------------------------------------------------------------------------------- |
| `config.js`    | 131   | Shared state (grouped), constants, server config, client ID                        |
| `landcover.js` | 57    | Pure lookup utilities (name, color, XSS escape)                                    |
| `ui.js`        | 115   | `updateUI`, `updateConnectionStatus`, `showToast`                                  |
| `map.js`       | 257   | Mapbox init, grid overlay, viewport debounce, HTTP fallback, `refreshServerConfig` |
| `websocket.js` | 68    | WS connection + reconnect (callback-based, no map/ui dependency)                   |
| `main.js`      | 67    | Entry point — caches DOM refs, wires WS callbacks                                  |

### Key design decisions

1. **ES modules over IIFE**: `<script type="module">` gives real `import`/`export`, file-level scope, automatic strict mode. Only `main.js` needs a `<script>` tag; the import graph handles load order. `config.local.js` stays a classic script (sets `window.MAPBOX_TOKEN`).

2. **Grouped state**: Flat state bag replaced with `state.config` (server-provided values), `state.runtime` (ws/map/timers), `state.els` (cached DOM refs).

3. **Callback-based WebSocket decoupling**: `websocket.js` accepts `{ onOpen, onStats, onError, onDisconnect }` callbacks — zero dependency on map.js or ui.js. `main.js` wires the concrete behavior.

4. **`landcover.js` as 6th module**: Both `map.js` (grid popup) and `ui.js` (breakdown panel) need the same lookup utilities. Extracting them avoids circular import.

### Import graph

```
main.js → config, ui, map, websocket
map.js → config, landcover, ui
websocket.js → config (only)
ui.js → config, landcover
landcover.js → config
```

No circular dependencies.

### Files changed

- **New**: `frontend/config.js`, `frontend/landcover.js`, `frontend/ui.js`, `frontend/map.js`, `frontend/websocket.js`, `frontend/main.js`
- **Modified**: `frontend/index.html` — replaced `<script src="app.js">` with `<script type="module" src="main.js">`
- **Modified**: `eslint.config.js` — frontend `sourceType: 'script'` → `'module'`, separate config for `config.local.js`
- **Deleted**: `frontend/app.js`

---

## 2026-02-20 — Fix: Switch Proximity from Grid-Count to Zoom-Level Mapping

### Problem

The original proximity signal was computed from the number of visible grid cells: `gridCount ≤ 50 → proximity = 1`, `gridCount ≥ 800 → proximity = 0`, linear interpolation between. This hit 0 too early at moderate zoom levels — e.g., zooming into a continent still showed hundreds of cells, pushing proximity to 0 even though the user was clearly looking at a specific region.

### Solution

Replace grid-count mapping with zoom-level mapping. The frontend now sends `zoom` alongside viewport bounds. The server computes proximity as a linear ramp between two configurable thresholds:

- `zoom ≤ PROXIMITY_ZOOM_LOW (default 4)` → proximity = 0 (distant/ocean)
- `zoom ≥ PROXIMITY_ZOOM_HIGH (default 6)` → proximity = 1 (zoomed in)
- Linear interpolation between

This provides a more intuitive mapping: the user's zoom gesture directly controls how "close" the soundscape feels, independent of how many grid cells happen to be visible (which varies wildly by region density and land/ocean ratio).

### New config knobs

- `PROXIMITY_ZOOM_LOW` (default 4) — replaces `PROXIMITY_LOWER`
- `PROXIMITY_ZOOM_HIGH` (default 6) — replaces `PROXIMITY_UPPER`

### Files changed

- **Modified**: `frontend/app.js` — send `zoom` in WebSocket viewport messages
- **Modified**: `server/config.js` — new `PROXIMITY_ZOOM_LOW`/`PROXIMITY_ZOOM_HIGH` env vars (replaced `PROXIMITY_LOWER`/`PROXIMITY_UPPER`)
- **Modified**: `server/index.js` — call `computeProximityFromZoom()` instead of `computeProximityFromGridCount()`
- **Modified**: `server/osc-metrics.js` — add `computeProximityFromZoom()` function
- **Modified**: `server/__tests__/osc-metrics.test.js` — add tests for zoom-based proximity

---

## 2026-02-20 — Fix: Crossfade Controller Proximity Attenuation

### Problem

The crossfade controller multiplied all 11 smoothed outputs by `proximity` before sending them to outlets (`smoothed[i] * proximity`). When zoomed out (`proximity ≈ 0`), this zeroed every land-cover bus. Meanwhile, `water_bus.js` independently output 1.0 for open ocean — producing inverted behavior: water bus on, everything else silent, even over land areas that should still have ambient sound.

### Fix

Removed the `* proximity` attenuation from the crossfade controller output. Smoothed values now pass through directly. Proximity-based mixing is handled downstream where appropriate (e.g., `water_bus.js` already manages its own proximity logic).

### Files changed

- **Modified**: `sonification/crossfade_controller.js` — remove `* proximity` from outlet loop

---

## 2026-02-20 — Feature: Loop Playback: Global Clock + Double-Buffered Crossfade

### Problem

The Max patch had complete data routing (OSC → crossfade controller → 5-bus fold-mapping → flonum displays) but **zero audio objects**. No `buffer~`, `groove~`, or `dac~` existed. To hear anything, a loop playback system was needed.

### Design constraint: harmonic content

All 5 ambience WAVs are produced with Diva synth at 128 BPM with chord progressions — not ambient noise. If each bus crossfaded independently, their crossfade points would drift apart over time, causing chord collisions. Solution: **global clock + local voice manager** architecture.

### WAV format: 2:01.875 with crossfade tail

Each WAV is 2 minutes + 1 bar (1.875 seconds at 128 BPM). The last bar is a copy of the first bar. When the playback reaches the 2:00 mark, a second `groove~` voice starts from 0ms. During the 1.875s overlap, the old voice fades out and the new voice fades in. The identical content in the overlap window ensures a seamless transition.

### Architecture

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

### Max patch changes

- DSP toggle with enforced ordering: ON → `dsp 1` first, then `clock.start()` after 50ms. OFF → `clock.stop()` first, then `dsp 0` after 100ms (fade-out safety).
- All start/stop/crossfade commands flow through `loop_clock.js` — toggle never bypasses clock.
- 5× `loop_bus` instances wired to fold-mapping flonum outputs.
- Stereo summing chain → `*~ 0.2` master trim (-14 dB for 5-bus headroom) → `dac~ 1 2`.
- Namespaced send/receive: `geosoni_loop_go`, `geosoni_xfade`, `geosoni_loop_stop`, `geosoni_buflen`.

### Files

- **New**: `sonification/loop_clock.js` — global crossfade clock
- **New**: `sonification/loop_voice.js` — per-bus voice manager
- **New**: `sonification/loop_bus.maxpat` — per-bus playback abstraction
- **Modified**: `sonification/max_wav_osc.maxpat` — added audio layer (DSP toggle, clock, 5 loop_bus instances, stereo mix, dac~)
- **Modified**: `sonification/samples/README.md` — updated ambience spec (48kHz, 2:01.875, crossfade tail)
- **Modified**: `README.md` — updated file structure and Sound Mapping section
- **No server changes**

---

## 2026-02-19 — Feature: Crop bus: 5th audio bus (class 40 extraction)

### Problem

Cropland (ESA class 40) was folded into the Tree bus along with 6 other natural vegetation classes. As crop-specific audio assets are developed, cropland needs its own independent bus — agricultural landscapes sound different from forests.

### Solution

Extracted class 40 from the Tree bus cascade into a new direct-wired **Crop bus**, matching the Urban/Bare direct-wire pattern.

### Tree bus cascade changes

- Removed the adder that summed class 40 into the tree cascade
- Clean-renumbered remaining adders: `tree_add4→3`, `tree_add5→4`, `tree_add6→5`
- Tree bus now sums 6 classes (was 7): 10, 20, 30, 90, 95, 100
- Cascade: 5 adders (was 6), sequential `tree_add1` through `tree_add5`

### Crop bus wiring

Direct wire: `js_crossfade` outlet 3 → `flonum_crop_bus` (same pattern as Urban/Bare buses).

### Updated fold-mapping (11 classes → 5 buses)

- **Tree bus**: classes 10, 20, 30, 90, 95, 100
- **Crop bus**: class 40
- **Urban bus**: class 50
- **Bare bus**: class 60
- **Water bus**: classes 70, 80 + ocean 3-level detector

### Files changed

- **Modified**: `sonification/max_wav_osc.maxpat` — tree cascade renumber, new Crop bus objects + patchline, updated fold-mapping comment to 5 buses
- **Modified**: `sonification/crossfade_controller.js` — updated wiring hints comment to 5-bus layout
- **Modified**: `sonification/icon_trigger.js` — added class 40 to `ACTIVE_CLASSES`
- **Modified**: `sonification/samples/README.md` — updated fold-mapping to 5 buses
- **Modified**: `README.md` — updated Sound Mapping section
- **New**: `sonification/samples/icons/crop/.gitkeep` — placeholder for crop icon samples
- **No server changes** — fold-mapping is purely a Max patch wiring concern

---

## 2026-02-19 — Feature: Water Bus & 4-Bus Fold-Mapping

### Problem

The original 3-bus fold-mapping grouped classes 60 (Bare), 70 (Snow/Ice), and 80 (Water) into a single "Bare bus". Two issues:

1. Water and snow mixed with desert — semantically wrong and sonically muddled
2. Over open ocean (no grid data), all crossfade outputs = 0 because proximity = 0. The sonification went silent over water, missing the most obvious geographic feature on Earth.

### Solution: Water bus with ocean detection

New 4th audio bus — **Water bus** — combining two signal paths via `[maximum]`:

1. **Crossfade path**: crossfade controller outputs for class 70 + 80, summed with `[+ 0.]`. Provides fine-grained water signal when grid data exists.
2. **Ocean path**: new `water_bus.js` — three-level ocean detector based on `/coverage` (fraction of viewport with grid data). Provides macro ocean signal when grids are absent.

### `water_bus.js` — three-level quantized detection

Ocean is defined as the **absence of grid data**, not a land cover class. The metric is `1 − coverage`.

| Level      | Condition                              | Target |
| ---------- | -------------------------------------- | ------ |
| Pure ocean | `proximity == 0` (no grids at all)     | 1.0    |
| Coastal    | `coverage < 0.1` AND `proximity > 0.7` | 0.7    |
| Land       | otherwise                              | 0.0    |

EMA smoothing (500ms time constant) prevents abrupt jumps. Triggered by `/coverage`, which arrives last in the server send cycle (`/proximity` → `/delta/*` → `/lc/*` → `/coverage`), ensuring proximity is already current when evaluation runs.

### Signal flow

```
crossfade_controller
  out6 (Snow/Ice 70) ──┐
  out7 (Water 80)    ──┤
                       [+ 0.]  (sum)
                         │
                    [maximum 0.] LEFT (triggers)
                         │
  [js water_bus.js] → RIGHT (stores)
   ↑          ↑          │
/proximity  /coverage   flonum (Water bus display)
```

### Behavior matrix

| Scenario                | proximity | coverage | ocean target | crossfade 70+80 | Water bus output |
| ----------------------- | --------- | -------- | ------------ | --------------- | ---------------- |
| Open ocean (no grids)   | 0         | 0        | **1.0**      | 0               | **1.0**          |
| Coastline (few grids)   | 0.8       | 0.05     | **0.7**      | ~0.1            | **0.7**          |
| Inland lake (30% water) | 0.9       | 0.85     | 0            | ~0.27           | **0.27**         |
| Inland no water         | 0.9       | 0.90     | 0            | 0               | **0**            |

### Files changed

- **New**: `sonification/water_bus.js` — 3-level ocean detector + EMA smoothing (2 inlets, 1 outlet)
- **Modified**: `sonification/max_wav_osc.maxpat` — added Water bus objects and wiring, simplified Bare bus to class 60 only, updated fold-mapping comment to 4 buses
- **Modified**: `sonification/crossfade_controller.js` — updated wiring hints comment to reflect 4-bus layout
- **No server changes** — `/coverage` and `/proximity` already provided the needed inputs

---

## 2026-02-19 — Design: Sound Design Architecture & Milestones B–C

### Sound design philosophy

Three-layer structure:

- **Base + texture layer**: ambient loops produced in Ableton (organic synths, drones, noise textures), exported as loopable WAV files per land cover type. Max handles loop playback and volume control.
- **Icon layer**: short auditory icons (bird calls, car horns, wind gusts) triggered by data-driven logic in Max.
- **Crossfade mixing**: data from the server (11 land cover channels + proximity) controls volume envelopes and trigger probabilities.

Listening experience goal: **65% emotional/aesthetic quality, 35% informational legibility**. The sonification should feel like a living soundscape, not a data readout.

### Phase 1 scope and fold-mapping

Only 3 representative land cover types have dedicated audio assets:

- **Tree** (rainforest): organic LFO + humid noise + bird/insect icons
- **Urban** (city): low-frequency drone + mechanical texture + car horn icons
- **Bare** (desert): wind synthesis + sand particles + wind gust icons

To avoid large silent regions during global exploration, 11 output channels are folded into 5 audio buses **in the Max patch wiring** (not in server code or JS scripts):

- **Tree bus**: classes 10 (Tree), 20 (Shrub), 30 (Grass), 90 (Wetland), 95 (Mangrove), 100 (Moss) — natural vegetation
- **Crop bus**: class 40 (Cropland)
- **Urban bus**: class 50 (Urban) only
- **Bare bus**: class 60 (Bare)
- **Water bus**: classes 70 (Snow/Ice), 80 (Water) + ocean 3-level detector (`water_bus.js`)

As new audio assets are added, channels will be unbundled from buses. The crossfade controller and icon trigger always output all 11 independent channels — fold-mapping is purely a downstream wiring concern.

### Close-up vs. distant listening modes

- **Close-up** (zoomed in, proximity → 1): clear soundscape, all three layers active, crossfade follows land cover data, icons trigger, map dragging produces audible change.
- **Distant** (zoomed out, proximity → 0): everything blurs together, heavy reverb, low-pass filter, like hearing Earth hum from space. Icons do not trigger. Dominant land cover may slightly influence tonal character.

Transition is gradual, not abrupt. `/proximity` drives the attenuation curve.

### Crossfade controller (Milestone B, Task 4)

`sonification/crossfade_controller.js` — 12 inlets, 11 outlets.

Key design: **frame-based smoothing** triggered by the last `/lc/100` message (inlet 10). The server sends 11 `/lc/*` messages in rapid succession per viewport update. If smoothing ran per-inlet, the first inlet would see dt ≈ 200ms while remaining 10 see dt ≈ 0ms, causing inconsistent behavior. Solution: inlets 0–9 store targets only; inlet 10 stores AND triggers `updateFrame()` applying EMA to all 11 channels with identical alpha and dt.

Smoothing: EMA with `alpha = 1 - exp(-dt / smoothingTime)`, default tau = 500ms. Outputs pass through directly without proximity attenuation (proximity attenuation was removed — see 2026-02-20 fix entry).

### Icon trigger (Milestone B, Task 5)

`sonification/icon_trigger.js` — 13 inlets, 2 outlets.

Weighted probabilistic triggering on each metro bang:

1. Per-class weight = lcPercent × proximity × cooldown × active
2. Total trigger probability = totalWeight × baseRate (default 0.05)
3. Weighted random selection among eligible classes
4. Per-class cooldown (default 3s) prevents rapid-fire

Phase 1 active classes: Tree (10), Urban (50), Bare (60). Others structurally supported — add to `ACTIVE_CLASSES` array as icon samples are added.

**Delta-driven drama**: the script does NOT receive `/delta` data. Instead, multiply outlet 1 (intensity) by `/delta/magnitude` in the Max patch wiring. This keeps the JS simple while achieving a narrative arc: stable texture when the map is still, active icons when the user explores.

### Granulator (Milestone C, Task 7)

`sonification/granulator.js` — 8 inlets, 8 outlets. Optional granular synthesis module for adding texture to ambient loops or distant-view layers.

- 4-voice polyphony rotation (round-robin: 0→1→2→3→0...) prevents grain interruption
- Max JS `Task` object for scheduling (replaces metro)
- 3-phase envelope (attack/sustain/release, each = grain duration / 3)
- Proximity modulation: as proximity → 0, grain durations shift toward max (longer) and intervals shift toward max (sparser), producing slow blurry ambient wash
- Configurable: grain duration range, trigger interval range, buffer position range, amplitude variation

Companion wiring guide: `sonification/granulator_README.md`.

### Known limitations (accepted)

- Existing per-IP hysteresis for mode switching may cause cross-talk when multiple users share the same public IP (NAT, corporate network). Accepted as future work.
- Aggregated data is always sent regardless of `/mode` (confirmed from README). Phase 1 sound system works at all zoom levels without per-grid awareness.

### Next steps

1. User prepares 3 sets of audio assets in Ableton (tree, urban, bare — base+texture loops + icon samples)
2. Wires Max patch: `/lc/*` → crossfade controller → fold-mapping → audio playback
3. Wires icon trigger: metro → bang, multiply intensity by `/delta/magnitude`
4. Tests full pipeline with OSC simulator: `node scripts/osc_simulator.js gradual-transition`
5. Optionally wires granulator for ambient texture processing

---

## 2026-02-19 — Milestone: Server-Side Foundation

### Scope completed

- Task 6: sample directory structure under `sonification/samples/`
- Task 2: new `/proximity` OSC message
- Task 1: new `/delta/*` OSC messages and per-client delta state
- Task 3: standalone `scripts/osc_simulator.js`

### Key architecture decisions

1. **Global ordering update (insert-only)**:
    - `/mode` -> `/proximity` -> `/delta/*` -> existing messages
    - Existing aggregated payload ordering remains unchanged.
    - Existing per-grid payload logic remains unchanged.
2. **Client-state separation preserved**:
    - Existing mode hysteresis state remains in `mode-manager.js` (no behavior change).
    - Delta state is managed independently in `delta-state.js`.
3. **Delta keying strategy**:
    - WebSocket: per-connection state
    - HTTP: `clientId` from request body first, fallback to IP
    - HTTP delta state uses 5-minute TTL cleanup
4. **Schema single source of truth**:
    - `server/osc_schema.js` centralizes OSC addresses, class order, canonical sequence, and packet builders
    - Both `server/osc.js` and `scripts/osc_simulator.js` import this schema

### New config knobs

- `PROXIMITY_ZOOM_LOW` / `PROXIMITY_ZOOM_HIGH` (originally `PROXIMITY_LOWER` / `PROXIMITY_UPPER` with grid-count mapping; later switched to zoom-level mapping — see 2026-02-20 entry)
- `DT_MIN_MS` / `DT_MAX_MS`
- `DELTA_RATE_CEILING`

All added to `server/config.js` with validation and documented in `.env.example`.

### Formula notes (implemented)

- `proximity` from zoom level (updated 2026-02-20, originally grid-count based):
    - `zoom <= PROXIMITY_ZOOM_LOW` -> `0` (distant/ocean)
    - `zoom >= PROXIMITY_ZOOM_HIGH` -> `1` (zoomed in)
    - linear interpolation in between
- `delta`:
    - `magnitude = clamp(0.5 * sum(abs(current_i - prev_i)), 0, 1)`
    - `dt` clamped to `[DT_MIN_MS, DT_MAX_MS]`
    - `rate = clamp((magnitude / (dt/1000)) / DELTA_RATE_CEILING, 0, 1)`
    - First frame emits all-zero deltas

### Simulator behavior

- Supports:
    - `static-forest`
    - `static-mixed`
    - `gradual-transition`
    - `abrupt-switch`
    - `zoom-sweep`
    - `world-tour`
- CLI:
    - `node scripts/osc_simulator.js <scenario>`
    - No args + TTY -> interactive selection
    - No args + non-TTY -> print usage and exit
- Graceful shutdown on Ctrl+C

### Validation and regression coverage

- Expanded OSC unit tests:
    - `/proximity` send + clamp
    - `/delta` send + canonical addresses
- Added schema tests:
    - class order, address ordering, canonical sequence
- Added pure metrics tests:
    - proximity edge/linear mapping
    - delta magnitude/rate formulas and dt clamping
- Added delta-state tests:
    - clientId-first key derivation and state persistence

---

## 2026-02-08 — Feature: OSC Pipeline Extensions: `/grid/lc`, `/mode`, `/grid/pos`

Three new OSC message types added to complete the per-grid data pipeline. Design principle: **extend with independent addresses, never modify existing message formats**.

### 1. `/grid/lc` — Per-cell landcover distribution (11 floats)

**Problem**: Per-grid mode only sent the dominant landcover class as an integer. Cells with mixed land use (e.g., 60% forest + 30% cropland) lost their distribution detail.

**Solution**: New `/grid/lc` message per cell — 11 floats in the same class order as aggregated `/lc/*` (classes 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100). Each float is a 0-1 fraction. Fallback: if `lc_pct_*` columns are missing, synthesizes 100% from the discrete `landcover_class`.

**Files**: `server/osc.js` (`sendGridsToMax`), `server/landcover.js` (new `getCellLcDistribution()` helper)

### 2. `/mode` — Mode transition notification

**Problem**: MaxMSP had no way to know when the server switched between aggregated and per-grid modes. Needed for crossfade transitions and routing.

**Solution**: `/mode` message (string: `"aggregated"` or `"per-grid"`) sent **before** any data messages on every viewport update. Max can use this to trigger crossfades or route switches.

**Files**: `server/osc.js` (new `sendModeToMax()`), `server/index.js` (`processViewport()` calls it before data send)

### 3. `/grid/pos` — Viewport-relative normalized position (2 floats)

**Problem**: Max received absolute lon/lat per cell but needed viewport-relative coordinates for spatial audio panning. Max would have had to compute `(lon - west) / (east - west)` itself using `/viewport` bounds.

**Solution**: Server pre-computes and sends `/grid/pos` with `xNorm` (0=west, 1=east) and `yNorm` (0=south, 1=north). Max can directly map these to stereo panning or spatial placement.

**Implementation details**:

- Uses **cell center** (lon + GRID_SIZE/2, lat + GRID_SIZE/2), not bottom-left corner — otherwise all cells are offset by half a grid cell
- Date-line crossing (west > east → negative xRange) falls through to 0.5 default — acceptable for current data coverage
- Computed once per viewport update (xRange/yRange outside the per-cell loop)

**Files**: `server/osc.js` (`sendGridsToMax`), imported `GRID_SIZE` from config

### Updated Per-Grid OSC Sequence

```
/mode        "per-grid"                        ← mode notification (always first)
/grid/count  N                                 ← number of cells
/viewport    west south east north             ← viewport bounds
  × N cells:
    /grid      lon lat lc nl pop forest        ← cell data (6 args, unchanged)
    /grid/pos  xNorm yNorm                     ← viewport-relative position
    /grid/lc   f10 f20 f30 f40 f50 f60 f70 f80 f90 f95 f100  ← landcover distribution
```

Aggregated mode unchanged (15 messages: 4 stats + 11 `/lc/*`).

### Max Patch Updates

Updated route from `route /grid/count /grid /viewport` to:

```
route /grid/count /grid/pos /grid/lc /grid /viewport
```

**Defensive ordering**: More specific paths (`/grid/pos`, `/grid/lc`) before shorter `/grid` to prevent prefix-matching issues. 5 routes → 6 outlets (including remainder).

New objects: `unpack f f` for `/grid/pos`, `unpack f f f f f f f f f f f` for `/grid/lc`, corresponding `print` objects for verification.

### Bug Fixes

1. **Max `route` numinlets** — Was incorrectly set to 6 (matching numoutlets); Max `route` always has exactly 1 inlet. Fixed to 1.
2. **Cell center offset** — lon/lat from CSV are bottom-left corners of 0.5° cells. Normalizing with corner values offsets all positions by ~0.25°. Fixed by computing `centerLon = lon + GRID_SIZE / 2`.
3. **Max patch layout** — Several boxes had overlapping/truncated text. Adjusted `patching_rect` coordinates for `grid_data_route`, `print_viewport`, `print_grid_lc`.

### `/forest` vs `/lc/10` — Clarification

Two "forest" values exist in the OSC stream with different semantics:

| Message                                        | Denominator    | Meaning                                           |
| ---------------------------------------------- | -------------- | ------------------------------------------------- |
| `/forest` (aggregated) / `/grid` forest arg    | land area only | forest_area ÷ land_area (excludes water)          |
| `/lc/10` (aggregated) / `/grid/lc` first float | total area     | tree_cover_pixels ÷ total_pixels (includes water) |

For a coastal cell that's 50% water + 50% forest: `/forest` = 1.0, `/lc/10` ≈ 0.5.

**Sonification recommendation**: Use `/lc/*` (or `/grid/lc`) as the primary 11-channel landcover mapping. `/forest` is redundant but available as a convenience if a simpler forest-only control is needed.

---

## 2026-02-06 — Feature: Per-Grid Mode: Design & Initial Implementation

See `docs/2026-02-06-per-grid-devlog.md` for full design rationale.

**Core idea**: When the user zooms in far enough (≤50 grid cells visible), switch from aggregated (1 blended sound) to per-grid mode (N independent voices, spatially distributed). Threshold uses hysteresis (enter at 50, exit at 50) to avoid oscillation.

**Server changes** (`server/osc.js`, `server/index.js`):

- New `sendGridsToMax()` — sends `/grid/count`, `/viewport`, then N × `/grid` (lon, lat, lc, nl, pop, forest)
- New `processViewport()` shared helper — handles hysteresis-based mode switching for both WebSocket and HTTP clients
- Per-client mode state tracked separately (WS: per-connection, HTTP: per-IP with 5-min TTL expiry)
- `normalizeOscValues()` extracted to standalone `normalize.js` for reuse in both modes

**Max patch** (`sonification/max_wav_osc.maxpat`):

- Added `route /grid/count /grid /viewport` branch on per-grid `udpreceive`
- `print` objects for data verification (sound design deferred)

---

## 2026-01-27 — Discussion: Classroom Discussion: Pivot to Real-Time

Key feedback from instructor review of the first working demo (frontend + sine wave mapping):

### What worked

- Interactive map with Mapbox grid overlay — novel that it covers the whole world, not just one city
- Data pipeline from GEE to frontend to Max via OSC is functional
- Real-time interaction: hover over grid cells, get data back

### Design tension identified

- **Historical vs. real-time**: The map shows today's data, but the original plan wants to sonify 20 years of change. Navigating a "now" map while listening to the past is perceptually confusing.
- Instructor recommendation: **drop the historical time-series axis** and focus on real-time "now" data. The interactive map probing is the strong differentiator.

### Sonification strategy shift

- Direct frequency mapping (data → pitch) is not very informative — listeners can't tell actual values
- Sound doesn't need to directly map data with precise numeric fidelity; **loose, indirect mappings are valid sonification**
- Example: green space → one type of music, developed area → different type of music. Switching sounds based on data category is legitimate sonification
- Sound's role: **emotional impact and weight**, not numeric readout. Like a film score enhances visual storytelling.

### New directions discussed

- Add more data dimensions beyond just landcover: **population**, nightlight, forest percentage — more streams = more things to work with in sound design, enables comparisons
- Consider focusing on a specific region (e.g., one city) if detailed historical data is available, or stay global with real-time data
- Acoustic ecology angle mentioned (Nature's Soundscape studies in British Columbia) — not pursued but interesting reference

### Action items from discussion

- Integrate landscape/landcover data into the map (was only using loss rate at this point)
- Add population data as a new dimension
- Focus on "now" data, abandon historical time-series for this project
- Make the sound design more creative — move beyond sine wave pitch mapping

---

## 2026-01-22 — Discussion: Homework: Initial Proposal

**Data source**: Google Earth Engine — draw ROI on map, extract landscape/land-cover composition and ~20-year forest-loss time series (annual loss + cumulative loss). Export as CSV.

**Tech pipeline**: GEE data extraction → Python preprocessing → Max/MSP synthesis & mapping → WAV export. Max handles sound generation (pads/drone/noise/percussion), mapping data to filter, detune, noise ratio, textural fragmentation, rhythmic density. Can also output MIDI to Ableton for arrangement.

**Core problem**: Use sound to make trend, acceleration, and key years perceptually immediate — listeners should hear whether cumulative loss over 20 years is substantial without staring at a chart.

**Sound structure (original plan)**:

- 2D place baseline — land-cover composition defines background timbre (forest = organic/continuous, water = open/floating, built-up = mechanical/regular)
- Time-weighted degradation — cumulative loss drives detune, instability, roughness, fragmentation over time
- Year-based events — annual loss triggers ruptures/noise in high-loss years; annual gain attenuates loss weight

---

## Idea Backlog

- Auditory icons for landcover types (literal nature sounds: crickets, birds, wind)
- City-level deep dive with localized datasets (acoustic ecology, urban soundscape)
- Historical data slider if a self-built map backend is ever created
- Frequency-domain audification for multiple simultaneous data streams
