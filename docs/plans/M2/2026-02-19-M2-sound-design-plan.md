# Geo-Sonification — Claude Code Task Instructions (v3)

## Project Background

This is an interactive map sonification project. Users interact with a Mapbox map in the browser; the frontend sends viewport bounds to a Node.js server via WebSocket. The server queries pre-processed CSV data (exported from Google Earth Engine), computes geographic statistics for the current viewport, and sends normalized values to Max/MSP via OSC (UDP port 7400) for sound generation.

The project repository structure, existing OSC message formats, data pipeline, and all design decisions are documented in `README.md` and `DEVLOG.md`. **Read both files completely, along with all source files in `server/`, before starting any work.** Understand the existing architecture, naming conventions, error handling patterns, and the design principle recorded in DEVLOG: "extend with independent addresses, never modify existing message formats."

---

## Sound Design Overview

The sound design uses a **three-layer structure**:

- **Base layer**: Ambient texture loops produced in Ableton (organic synths, drones, wind synthesis, etc.)
- **Texture layer**: Sonic texture (white noise, granular particle texture, etc.), produced together with the base layer in Ableton, exported as a single combined WAV per land cover type
- **Icon layer**: Auditory icons (bird calls, insect sounds, car horns, wind gusts — short samples), triggered by data-driven logic in Max

The base + texture layers are authored by the user in Ableton and exported as loopable WAV files placed into the project. Max handles loop playback and volume control. Icon samples are also prepared by the user; Max handles trigger logic.

### Phase 1 Scope

Only **3 representative land cover types** have dedicated audio assets for the first milestone:

- **Tree** (rainforest): organic LFO synthesis + humid white noise + bird/insect icons
- **Urban** (city): low-frequency drone + mechanical texture + car horn/city icons
- **Bare** (desert): wind synthesis + sand particle texture + wind gust icons

The remaining 8 ESA WorldCover classes will be added later. **All architecture must support expansion to 11 channels.**

### Phase 1 Fold-Mapping Strategy

Since only 3 audio loops exist but the map is global, many land cover types (Water, Crop, Grass, etc.) would produce silence if unmapped. To avoid large silent regions during global exploration, the user will fold 11 output channels into 3 audio buses **in the Max patch wiring** (not in server code or JS scripts):

- **Tree bus**: classes 10 (Tree), 20 (Shrub), 30 (Grass), 40 (Crop), 90 (Wetland), 95 (Mangrove), 100 (Moss/Lichen) — all natural vegetation
- **Urban bus**: class 50 (Urban) only
- **Bare bus**: classes 60 (Bare/Sparse), 70 (Snow/Ice), 80 (Water) — arid, barren, or open-surface types

This is a temporary measure. As new audio assets are added, channels will be unbundled from buses. **The crossfade controller (Task 4) must still output all 11 independent channels** — the fold-mapping happens downstream in Max patch wiring, not in the JS script. This keeps the architecture clean for future expansion.

### Two Listening Modes

- **Close-up (zoomed in)**: Clear soundscape. All three layers active. Crossfade mix follows land cover data. Icons trigger. Dragging the map produces audible change.
- **Distant (zoomed out)**: Everything blurs together. Heavy reverb, low-pass filter, like hearing Earth hum from space. Icons do not trigger. Dominant land cover may slightly influence tonal character, but the main impression is a diffuse wash.

The transition between close-up and distant is **gradual, not abrupt**. As zoom level changes, reverb amount increases, high frequencies decay, icon trigger probability drops to zero.

### Current Mode Usage

**Only use aggregated mode data for now.** Do not modify or use per-grid mode logic. Per-grid code stays untouched for future spatial audio implementation.

Note: The existing README confirms that per-grid messages are sent **"in addition to"** aggregated messages — aggregated data (including all `/lc/*` values) is always sent regardless of whether the system is in per-grid mode. This means the Phase 1 sound system will work correctly at all zoom levels without any per-grid awareness.

---

## Global OSC Message Ordering Rule

New messages follow these ordering constraints on every viewport update:

1. **`/mode` is always sent first** (existing behavior, unchanged)
2. **`/proximity` is sent immediately after `/mode`** (new — Task 2)
3. **`/delta/*` messages are sent immediately after `/proximity`** (new — Task 1)
4. **All existing messages after that retain their current sending order unchanged** — aggregated messages, per-grid messages, everything else stays exactly as implemented today

This means:

- In aggregated mode: `/mode` → `/proximity` → `/delta/*` → existing 15 aggregated messages
- In per-grid mode: `/mode` → `/proximity` → `/delta/*` → then whatever the current per-grid implementation sends (do NOT rearrange it)

The key principle: **insert new messages after `/mode` but before everything else, without touching the existing send order of old messages.** This avoids any conflict with the "do not modify per-grid logic" constraint.

---

## Task 1: Server-Side `/delta` OSC Messages

Implement viewport change detection in `server/osc.js`. On each viewport update, compare current data against the client's previous data snapshot and send delta information.

### New OSC messages

- `/delta/lc` — 11 floats: current percentage minus previous percentage for each land cover class (same class order as `/lc/*`)
- `/delta/magnitude` — 1 float (0–1): overall magnitude of viewport change
- `/delta/rate` — 1 float (0–1): rate of change, distinguishes slow panning from fast flicking

### Formulas (implement exactly as specified)

Let `p` and `p_prev` be 11-dimensional land cover fraction vectors (each element 0–1).

```
l1 = sum_i( |p_i - p_prev_i| )          // L1 distance, range 0–2
magnitude = clamp(0.5 * l1, 0, 1)        // natural 0–1, no ceiling constant needed

dtMs = now - prevTimestamp
dtClamped = clamp(dtMs, DT_MIN_MS, DT_MAX_MS)   // prevent div-by-zero and outliers
rate_raw = magnitude / (dtClamped / 1000)          // magnitude per second
rate = clamp(rate_raw / DELTA_RATE_CEILING, 0, 1)
```

- `DT_MIN_MS` default: 50 (prevents near-zero dt from tab switching, rapid events)
- `DT_MAX_MS` default: 5000 (prevents stale dt from backgrounded tabs, reconnections)
- `DELTA_RATE_CEILING` default: 5.0 (a magnitude=1 change in 200ms = rate_raw 5.0)
- All three constants go in `config.js` with env var overrides

### Per-client state for delta

- **WebSocket**: per-connection (same as existing hysteresis state)
- **HTTP**: use `clientId` from the request body (the frontend already sends it in `POST /api/viewport`). If `clientId` is present and passes basic validation (non-empty string, ≤128 chars), use it as the state key. If missing, fall back to IP. Apply same 5-min TTL expiry as existing HTTP state.
- **Important**: This `clientId`-first approach applies **only to the new delta state storage**. Do **not** modify the existing per-IP hysteresis logic for mode switching — leave that code untouched to avoid regressions.

### First update handling

On the first viewport update for a client (no previous snapshot), send all-zero deltas: `/delta/lc` all 0.0, `/delta/magnitude` 0.0, `/delta/rate` 0.0.

### Files to modify

- `server/osc.js` — new `sendDeltaToMax()` function
- `server/index.js` — integrate delta calculation into `processViewport()`
- `server/config.js` — new config constants (`DT_MIN_MS`, `DT_MAX_MS`, `DELTA_RATE_CEILING`)
- `.env.example` — document new env vars

Update `DEVLOG.md` with this change.

---

## Task 2: Server-Side `/proximity` OSC Message

Send a `/proximity` message (1 float, 0–1) on every viewport update. 0 = satellite view (distant), 1 = maximum zoom (close-up).

### Calculation approach

Base it on the number of grid cells in the current viewport. Fewer cells = closer. Mapping:

- Grid count ≥ `PROXIMITY_UPPER` (default 800) → proximity = 0
- Grid count ≤ `PROXIMITY_LOWER` (default 50) → proximity = 1
- Linear interpolation between thresholds

The lower threshold of 50 aligns with the existing per-grid mode entry threshold, which semantically represents "close-up density." The upper threshold of 800 represents a wide satellite view. Both are configurable via `config.js` and env vars.

Alternatively, computing from viewport bounding box area is acceptable if it proves more robust. Choose one approach and document the choice.

### Edge case: gridCount = 0

If the viewport contains zero grid cells (ocean-only area, data gap, or extreme edge case), **force proximity to 0**. All `/lc/*` values will naturally be 0 in this case, so the system enters distant wash mode with no audible content — which is the correct behavior. Do not let proximity = 1 when there is no data.

### Message ordering

`/proximity` is sent **immediately after `/mode`**, before `/delta/*`, before all other messages. See the Global OSC Message Ordering Rule above.

### Files to modify

- `server/osc.js` — new `sendProximityToMax()` function
- `server/index.js` — integrate into `processViewport()`
- `server/config.js` — `PROXIMITY_UPPER`, `PROXIMITY_LOWER` constants
- `.env.example` — document new env vars

Update `DEVLOG.md`.

---

## Task 3: OSC Simulator Tool

Create `scripts/osc_simulator.js` — a standalone Node.js script that sends simulated OSC data to Max without needing the browser, map, or full server stack.

### Pre-requisite: Extract shared OSC schema module

Before building the simulator, extract a **pure, side-effect-free module** from the existing `server/osc.js`:

Create `server/osc_schema.js` (or `server/osc_messages.js`) containing:

- The land cover class order array (10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100)
- OSC address constants (`/mode`, `/proximity`, `/delta/lc`, `/delta/magnitude`, `/delta/rate`, `/landcover`, `/nightlight`, `/population`, `/forest`, `/lc/10` through `/lc/100`)
- The canonical message send sequence/ordering
- Any small helper functions needed by both server and simulator

This module must have **zero network I/O, zero UDP initialization, zero env/config side effects**. It is purely data and constants.

Then refactor `server/osc.js` to import from this shared module instead of defining these inline. The simulator will also import from it. This ensures a single source of truth for message structure without importing the full OSC client.

### Supported scenarios

1. **static-forest**: Pure Tree area (Tree = 100%), steady state. For testing stable sound
2. **static-mixed**: 60% Tree + 30% Water + 10% Crop. For testing crossfade blend (this will exercise the fold-mapping: Tree bus gets 70%, Bare bus gets 30%)
3. **gradual-transition**: Linear transition from 100% Tree to 100% Urban over 10 seconds. For testing crossfade smoothness
4. **abrupt-switch**: Instant jump from Tree to Bare. For testing `/delta` response
5. **zoom-sweep**: Proximity sweeps from 1 (close) to 0 (distant) over 15 seconds. For testing reverb/filter transition
6. **world-tour**: Simulated journey from Amazon → Atlantic Ocean → Sahara → European city, ~30–60 seconds. Land cover percentages should change plausibly (not geographically precise, just reasonable transitions)

### Implementation details

- Usage: `node scripts/osc_simulator.js <scenario-name>` or no args to show available scenarios and interactively select
- OSC message format and ordering must **exactly match** what the server sends — including `/mode`, `/proximity`, `/delta/*`, and all 15 aggregated messages in the correct order
- **Import from `server/osc_schema.js`** for all message definitions. Do not hardcode a duplicate copy
- Each scenario should print a brief description to console as it runs
- Graceful exit on Ctrl+C

### Files to create/modify

- `server/osc_schema.js` — new shared schema module (extracted from osc.js)
- `server/osc.js` — refactored to import from osc_schema.js
- `scripts/osc_simulator.js` — the simulator itself

---

## Task 4: Max JS Script — Crossfade Controller

Create `sonification/crossfade_controller.js` — a Max `js` object script.

### Functionality

- Receive 11 land cover percentage values (from `/lc/10` through `/lc/100`)
- Apply per-frame smoothing to prevent volume jumps
- Output 11 smoothed volume values (0–1) via outlets
- Receive `/proximity` value and attenuate overall volume as proximity decreases (zoom out)

### Critical: Frame-based smoothing (not per-inlet)

The server sends 11 `/lc/*` messages in rapid succession on each viewport update (near-zero interval between them). If smoothing is triggered per-inlet, the first inlet will see dt≈200ms while the remaining 10 see dt≈0ms, causing inconsistent smoothing across channels.

**Required approach**: Use `/lc/100` (inlet 10, the last land cover class) as the **frame-end signal**:

- Inlets 0–9: only store the incoming value as the new target. Do NOT output or run smoothing.
- Inlet 10 (`/lc/100`): store its target, then trigger `updateFrame()` which:
    1. Computes dt since last frame
    2. Applies exponential moving average to ALL 11 channels using the same dt
    3. Multiplies all values by a proximity-based attenuation factor
    4. Outputs all 11 smoothed volumes through outlets 0–10

Smoothing time constant: configurable, default ~500ms. Implemented as EMA with `alpha = 1 - exp(-dt / smoothingTime)`.

### Inlet definitions

- inlet 0: land cover class 10 (Tree) percentage (float 0–1) — stores target only
- inlet 1: land cover class 20 (Shrub) percentage — stores target only
- inlet 2: land cover class 30 (Grass) percentage — stores target only
- inlet 3: land cover class 40 (Crop) percentage — stores target only
- inlet 4: land cover class 50 (Urban) percentage — stores target only
- inlet 5: land cover class 60 (Bare/Sparse) percentage — stores target only
- inlet 6: land cover class 70 (Snow/Ice) percentage — stores target only
- inlet 7: land cover class 80 (Water) percentage — stores target only
- inlet 8: land cover class 90 (Wetland) percentage — stores target only
- inlet 9: land cover class 95 (Mangrove) percentage — stores target only
- inlet 10: land cover class 100 (Moss/Lichen) percentage — stores target AND triggers frame update + output
- inlet 11: proximity value (float 0–1) — stores value for attenuation calculation

### Outlet definitions

- outlet 0–10: smoothed volume for each corresponding land cover class (float 0–1, attenuated by proximity)

### Important note on downstream usage

The crossfade controller outputs all 11 independent channels. In Phase 1, the user will fold these into 3 audio buses in the Max patch (see "Phase 1 Fold-Mapping Strategy" in Sound Design Overview). **The JS script must not implement any fold-mapping logic** — it always outputs 11 channels.

### Notes

- This runs inside Max's `js` object, **not Node.js**. Use Max js API: `inlets`, `outlets`, `bang()`, `msg_float()`, `msg_int()`, `setinletassist()`, `setoutletassist()`, etc.
- Include clear header comments documenting every inlet and outlet
- If unsure about Max js API specifics, note assumptions in comments so the user can verify

---

## Task 5: Max JS Script — Icon Trigger

Create `sonification/icon_trigger.js` — a Max `js` object script.

### Functionality

- Receive current 11 land cover percentages (stored as state, not triggering output)
- Receive `/proximity` value
- On metro bang (inlet 12), evaluate trigger conditions and probabilistically trigger icon playback:
    - Higher land cover percentage → higher trigger probability for that type's icons
    - Lower proximity (zoom out) → all icon probabilities trend toward zero
    - Minimum interval between triggers of the same icon type (configurable, default 3 seconds) to prevent rapid-fire
    - On trigger, output: icon category number (which land cover type) and a random intensity value (0–1)

### Inlet definitions

- inlet 0: land cover class 10 (Tree) percentage
- inlet 1: land cover class 20 (Shrub) percentage
- inlet 2: land cover class 30 (Grass) percentage
- inlet 3: land cover class 40 (Crop) percentage
- inlet 4: land cover class 50 (Urban) percentage
- inlet 5: land cover class 60 (Bare/Sparse) percentage
- inlet 6: land cover class 70 (Snow/Ice) percentage
- inlet 7: land cover class 80 (Water) percentage
- inlet 8: land cover class 90 (Wetland) percentage
- inlet 9: land cover class 95 (Mangrove) percentage
- inlet 10: land cover class 100 (Moss/Lichen) percentage
- inlet 11: proximity value (float 0–1)
- inlet 12: bang — clock tick to evaluate trigger conditions (connect to a metro in Max)

### Outlet definitions

- outlet 0: icon category (int — land cover class code: 10, 20, 30, etc.)
- outlet 1: trigger intensity (float 0–1)

### Phase 1 scope

- Only 3 icon types are active: Tree (10), Urban (50), Bare (60). Others are structurally supported but will not trigger until icon samples are added
- Architecture must support all 11 types without code changes — just adding samples

### Notes on delta-driven drama

- The icon_trigger script itself does NOT receive `/delta` data. Its trigger logic is based only on land cover percentages, proximity, and cooldown timing.
- However, the user's aesthetic goal is "stable texture when static, narrative arc when moving." To achieve this, the user can multiply the icon trigger output intensity (outlet 1) by `/delta/magnitude` in the Max patch wiring. This way, icons become more pronounced during viewport changes and quiet during stillness — without adding complexity to the JS script itself.
- This is a Max patch-level routing decision, not a code task. Document this recommended wiring in the header comments of the script.

### Notes

- Max `js` environment, not Node.js
- Inlets 0–11 only store state. Only inlet 12 (bang) triggers evaluation and potential output
- Clear header comments for all inlets and outlets, including the delta multiplication recommendation

---

## Task 6: Audio Sample Directory Structure

Create the directory structure and documentation for audio assets.

### Directory layout

```
sonification/samples/
├── ambience/              # Base + texture layer loops (Ableton WAV exports)
│   ├── tree.wav           # Rainforest ambience
│   ├── urban.wav          # City ambience
│   ├── bare.wav           # Desert ambience
│   └── ...                # Future: shrub.wav, grass.wav, crop.wav, etc.
├── icons/                 # Icon layer short samples
│   ├── tree/              # Rainforest icons (birds, insects — multiple files)
│   ├── urban/             # City icons (car horns, construction — multiple files)
│   ├── bare/              # Desert icons (wind gusts — multiple files)
│   └── ...                # Future: water/, wetland/, etc.
└── README.md              # Format requirements and naming conventions
```

### samples/README.md content

Document the following requirements:

- Ambience files: WAV format, 44100Hz or 48000Hz, stereo, seamlessly loopable, recommended length 1–2 minutes
- Icon samples: WAV format, mono or stereo, short duration (0.5–5 seconds), multiple files per subdirectory (randomly selected on trigger)
- Naming: ambience files use lowercase land cover type name (tree.wav, urban.wav, etc.); icon files can be freely named but must be in the correct type subdirectory
- All 11 ESA WorldCover class names for reference
- Phase 1 fold-mapping reference: which classes map to which audio bus (Tree/Urban/Bare) — so the user knows which loop they'll hear for each class

### .gitignore additions

Add to `.gitignore`:

```
sonification/samples/ambience/*.wav
sonification/samples/icons/**/*.wav
```

Audio files should not be committed to the repository.

---

## Task 7: Max JS Script — Granulator (OPTIONAL)

**This task is optional. Only implement it after Tasks 1–6 are fully complete and tested. It does not affect milestone acceptance.**

Create `sonification/granulator.js` — a Max `js` object script. This is an optional sound processing module for adding granular texture to the icon layer, distant-view layer, or ambience loops.

### Core granular synthesis scheduling

- Read from a specified Max `buffer~` object
- Use Max js `Task` object for timed triggering (replacing Max `metro`)
- On each trigger, randomly generate:
    - Grain start time: random within range 0 to (buffer length − max grain duration)
    - Grain duration: random within configurable min–max range (default 500–1000ms)
    - Trigger interval: random within configurable min–max range (default 1000–2000ms)
- **4-voice polyphony rotation**: cycle a counter through 4 outlet channels (0→1→2→3→0→...) so that a currently playing grain is never interrupted

### Envelope generation

- Each grain gets a 3-phase envelope: attack → sustain → release
- Each phase duration = grain duration / 3
- Envelope ramps from 0 → 1 (attack), holds at 1 (sustain), ramps 1 → 0 (release)
- Output as a Max `line~` compatible list (e.g., `0, 1 333, 1 333, 0 333` for a 1000ms grain)

### Outlet definitions (8 outlets)

- outlet 0–3: grain playback messages for 4 voices, each a list (start_ms, end_ms, duration_ms) for the corresponding `play~` object
- outlet 4–7: envelope messages for 4 voices, each a `line~` compatible list for the corresponding `line~` object

### Inlet definitions (8 inlets)

- inlet 0: bang to start/stop the granulator (toggle)
- inlet 1: grain duration minimum (ms)
- inlet 2: grain duration maximum (ms)
- inlet 3: grain interval minimum (ms)
- inlet 4: grain interval maximum (ms)
- inlet 5: grain start time range upper limit (ms, typically buffer length minus max grain duration)
- inlet 6: amplitude variation range (float 0–1, where 0 = all grains equal amplitude, 1 = fully random amplitude, default 0)
- inlet 7: proximity value (float 0–1) — when proximity decreases, grain durations shift toward maximum (longer), intervals shift toward maximum (sparser), producing slow blurry texture for distant view

### Design requirements

- All parameters have sensible defaults so the granulator works immediately with just a bang
- Proximity influence: smooth mapping, as proximity → 0 effective duration and interval ranges shift upward
- Clear header comments listing every inlet and outlet
- Max `js` environment, not Node.js

### Companion documentation

Create `sonification/granulator_README.md` with:

- Text-based wiring diagram for Max (buffer~ → js → 4× play~ → 4× line~ → 4× \*~ → output)
- Step-by-step wiring instructions (~15 minutes to complete)
- Parameter tuning guide (short grains + fast interval = dense chatter; long grains + slow interval = sparse ambient wash)

---

## Task 8: Update README.md and DEVLOG.md

### README.md updates

Add to the "OSC Messages" section:

**New messages (sent on every viewport update):**

```
/mode              (string, existing, always first)
/proximity         (float 0–1, new — immediately after /mode)
/delta/lc          (11 floats, new — after /proximity)
/delta/magnitude   (float 0–1, new)
/delta/rate        (float 0–1, new)
  ... all existing messages retain their current order unchanged ...
```

**Message descriptions:**

- `/proximity` (float 0–1) — Viewport zoom proximity. 0 = satellite/distant view, 1 = closest zoom. Based on grid cell count with configurable thresholds (default: 50–800). Forced to 0 when gridCount is 0.
- `/delta/lc` (11 floats) — Per-class land cover change since previous update, same class order as `/lc/*`
- `/delta/magnitude` (float 0–1) — Overall change magnitude: `0.5 * sum(|current_i - prev_i|)`. 0 = minimal, 1 = dramatic shift
- `/delta/rate` (float 0–1) — Rate of change: magnitude per second, normalized. Distinguishes slow panning from fast flicking. Uses clamped dt (50–5000ms) to handle edge cases

### DEVLOG.md updates

Add a new dated entry recording:

- Sound design decision: three-layer structure (base+texture in Ableton, icon layer triggered in Max, crossfade mixing controlled by data)
- Listening experience goal: 65% emotional/aesthetic quality, 35% informational legibility
- Phase 1 scope: 3 representative types (Tree, Urban, Bare), expandable to 11
- Phase 1 fold-mapping strategy: 11 channels folded into 3 audio buses in Max patch wiring (natural vegetation → Tree bus, urban → Urban bus, barren/ice/water → Bare bus). Fold-mapping is purely a Max wiring concern, not in server or JS code.
- New OSC messages: `/proximity` and `/delta` series, with design rationale
    - `/proximity`: enables gradual close-up → distant transition (clear soundscape → reverb wash). Forced to 0 when no grid data present.
    - `/delta`: enables sound to respond to the _rate and magnitude of change_, not just static state. Formula: magnitude = 0.5 \* L1 distance of land cover vectors; rate = magnitude / clamped_dt
- Global message ordering: /mode → /proximity → /delta/\* → existing messages (existing order untouched)
- Close-up vs. distant listening experience design
- Crossfade controller: frame-based smoothing triggered by last /lc message to ensure consistent per-channel behavior
- Icon trigger: delta-driven drama achieved via Max patch multiplication, not in JS script
- OSC schema extraction: shared module `server/osc_schema.js` for single source of truth
- Delta state: uses clientId (from frontend) for HTTP clients, per-connection for WebSocket. Existing per-IP hysteresis logic untouched.
- Known limitation: existing per-IP hysteresis for mode switching may cause cross-talk under NAT for public deployment. Accepted as future work.
- Aggregated data is always sent regardless of /mode (confirmed from README), so Phase 1 sound system works at all zoom levels.
- OSC simulator tool purpose and usage
- Granulator module (optional): JS-based for maintainability, 4-voice polyphony with proximity-driven parameter modulation
- Next steps: user prepares 3 sets of audio assets in Ableton, wires Max patch with fold-mapping, tests with OSC simulator

---

## Execution Order

1. **Read all existing code** — `README.md`, `DEVLOG.md`, all files in `server/`, `frontend/app.js`
2. **Task 6** — Create sample directory structure (simplest, establishes foundation)
3. **Task 2** — `/proximity` (simple logic, dependency for later tasks)
4. **Task 1** — `/delta` (builds on existing per-client state, includes shared schema extraction groundwork)
5. **Task 3** — OSC simulator (depends on Task 1 & 2 message formats, requires schema extraction)
6. **Task 4 & 5** — Crossfade controller and icon trigger (core Max JS scripts)
7. **Task 7** — Granulator (**only if Tasks 1–6 are fully complete and tested**)
8. **Task 8** — Documentation updates (last, captures all changes)

---

## Critical Constraints

- **Do not modify existing OSC message formats.** Only add new messages. Recorded design principle: "extend with independent addresses, never modify existing message formats."
- **Do not modify per-grid mode logic.** Keep all per-grid code untouched. New messages are inserted after `/mode` but before existing messages, without rearranging any current send order.
- **Do not modify existing hysteresis per-IP logic.** The new clientId-first approach applies only to delta state storage.
- **Known limitation (accepted):** Existing per-IP hysteresis for mode switching may cause cross-talk when multiple users share the same public IP (NAT, corporate network). This is accepted as a known risk for future resolution and should not be "fixed" as part of this work.
- **All new configurable parameters** go in `config.js` with env var overrides, documented in `.env.example`.
- **Server code style** must match existing patterns in `server/osc.js` — same comment style, error handling, function naming conventions.
- **Max JS scripts** must include detailed header comments explaining every inlet and outlet with expected value types and ranges.
- **OSC schema sharing**: extract a side-effect-free module (`server/osc_schema.js`) for message definitions. Both `server/osc.js` and `scripts/osc_simulator.js` import from it. Never duplicate message structure.
- **Crossfade controller smoothing** must be frame-based (triggered by the last /lc inlet), not per-inlet. See Task 4 for details.
- **Crossfade controller outputs 11 channels.** Fold-mapping to 3 audio buses is a Max patch wiring concern, not a JS script concern.

---

## Implementation Milestones

The 8 tasks are grouped into 3 independently verifiable milestones. Each milestone ends with a concrete verification step — pause, test, adjust, then proceed.

### Milestone A — Server-Side Foundation

**Tasks**: 6 → 2 → 1 → 3 (in order)

| Step | Task                                               | What it delivers                                                                                      |
| ---- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| A.1  | Task 6 — Sample directory structure                | `sonification/samples/` tree with README and `.gitignore` rules                                       |
| A.2  | Task 2 — `/proximity` OSC message                  | Grid-count-based zoom proximity signal (0–1), sent after `/mode`                                      |
| A.3  | Task 1 — `/delta` OSC messages + schema extraction | `/delta/lc`, `/delta/magnitude`, `/delta/rate`; shared `osc_schema.js` module; per-client delta state |
| A.4  | Task 3 — OSC simulator                             | Standalone script with 6 scenarios, imports from `osc_schema.js`                                      |

**Verification**: Run each simulator scenario (`node scripts/osc_simulator.js <scenario>`). In Max, wire `udpreceive 7400` → `route` → `print` and confirm:

- Message ordering: `/mode` → `/proximity` → `/delta/*` → existing 15 aggregated messages
- `/proximity` ranges 0–1, responds to zoom sweep scenario
- `/delta/magnitude` spikes on `abrupt-switch`, ramps on `gradual-transition`
- All `/lc/*` values sum to ≤ 1.0 and match scenario expectations

### Milestone B — Max JS Sound Engine

**Tasks**: 4 → 5 (in order)

| Step | Task                          | What it delivers                                                             |
| ---- | ----------------------------- | ---------------------------------------------------------------------------- |
| B.1  | Task 4 — Crossfade controller | Frame-based smoothed 11-channel volume output with proximity attenuation     |
| B.2  | Task 5 — Icon trigger         | Probabilistic icon triggering based on land cover %, proximity, and cooldown |

**Verification**: Feed simulator data into Max (run `gradual-transition` and `zoom-sweep` scenarios). Wire crossfade controller outlets to `meter~` or `number~` objects and confirm:

- 11 outputs transition smoothly (no abrupt jumps) during `gradual-transition`
- All outputs attenuate toward zero during `zoom-sweep` as proximity → 0
- Icon trigger fires appropriately at high proximity, goes silent at low proximity
- Icon trigger respects cooldown intervals (no rapid-fire)

### Milestone C — Documentation & Optional Extensions

**Tasks**: 8, then optionally 7

| Step | Task                                     | What it delivers                                                                   |
| ---- | ---------------------------------------- | ---------------------------------------------------------------------------------- |
| C.1  | Task 8 — README.md and DEVLOG.md updates | Complete documentation of new OSC messages, sound design decisions, architecture   |
| C.2  | Task 7 — Granulator _(optional)_         | JS-based granular synthesis module with 4-voice polyphony and proximity modulation |

**Verification**:

- Review README OSC message table for accuracy against actual implementation
- DEVLOG entry covers all design decisions listed in Task 8
- _(If Task 7 implemented)_ Test granulator with a loaded `buffer~` — confirm 4-voice cycling, envelope output, and proximity-driven parameter shifts
