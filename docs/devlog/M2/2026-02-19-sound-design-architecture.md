# 2026-02-19 — Design: Sound Design Architecture & Milestones B–C

## Sound design philosophy

Three-layer structure:

- **Base + texture layer**: ambient loops produced in Ableton (organic synths, drones, noise textures), exported as loopable WAV files per land cover type. Max handles loop playback and volume control.
- **Icon layer**: short auditory icons (bird calls, car horns, wind gusts) triggered by data-driven logic in Max.
- **Crossfade mixing**: data from the server (11 land cover channels + proximity) controls volume envelopes and trigger probabilities.

Listening experience goal: **65% emotional/aesthetic quality, 35% informational legibility**. The sonification should feel like a living soundscape, not a data readout.

## Phase 1 scope and fold-mapping

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

## Close-up vs. distant listening modes

- **Close-up** (zoomed in, proximity → 1): clear soundscape, all three layers active, crossfade follows land cover data, icons trigger, map dragging produces audible change.
- **Distant** (zoomed out, proximity → 0): everything blurs together, heavy reverb, low-pass filter, like hearing Earth hum from space. Icons do not trigger. Dominant land cover may slightly influence tonal character.

Transition is gradual, not abrupt. `/proximity` drives the attenuation curve.

## Crossfade controller (Milestone B, Task 4)

`sonification/crossfade_controller.js` — 12 inlets, 11 outlets.

Key design: **frame-based smoothing** triggered by the last `/lc/100` message (inlet 10). The server sends 11 `/lc/*` messages in rapid succession per viewport update. If smoothing ran per-inlet, the first inlet would see dt ≈ 200ms while remaining 10 see dt ≈ 0ms, causing inconsistent behavior. Solution: inlets 0–9 store targets only; inlet 10 stores AND triggers `updateFrame()` applying EMA to all 11 channels with identical alpha and dt.

Smoothing: EMA with `alpha = 1 - exp(-dt / smoothingTime)`, default tau = 500ms. Outputs pass through directly without proximity attenuation (proximity attenuation was removed — see 2026-02-20 fix entry).

## Icon trigger (Milestone B, Task 5)

`sonification/icon_trigger.js` — 13 inlets, 2 outlets.

Weighted probabilistic triggering on each metro bang:

1. Per-class weight = lcPercent × proximity × cooldown × active
2. Total trigger probability = totalWeight × baseRate (default 0.05)
3. Weighted random selection among eligible classes
4. Per-class cooldown (default 3s) prevents rapid-fire

Phase 1 active classes: Tree (10), Urban (50), Bare (60). Others structurally supported — add to `ACTIVE_CLASSES` array as icon samples are added.

**Delta-driven drama**: the script does NOT receive `/delta` data. Instead, multiply outlet 1 (intensity) by `/delta/magnitude` in the Max patch wiring. This keeps the JS simple while achieving a narrative arc: stable texture when the map is still, active icons when the user explores.

## Granulator (Milestone C, Task 7)

`sonification/granulator.js` — 8 inlets, 8 outlets. Optional granular synthesis module for adding texture to ambient loops or distant-view layers.

- 4-voice polyphony rotation (round-robin: 0→1→2→3→0...) prevents grain interruption
- Max JS `Task` object for scheduling (replaces metro)
- 3-phase envelope (attack/sustain/release, each = grain duration / 3)
- Proximity modulation: as proximity → 0, grain durations shift toward max (longer) and intervals shift toward max (sparser), producing slow blurry ambient wash
- Configurable: grain duration range, trigger interval range, buffer position range, amplitude variation

Companion wiring guide: `sonification/granulator_README.md`.

## Known limitations (accepted)

- Existing per-IP hysteresis for mode switching may cause cross-talk when multiple users share the same public IP (NAT, corporate network). Accepted as future work.
- Aggregated data is always sent regardless of `/mode` (confirmed from README). Phase 1 sound system works at all zoom levels without per-grid awareness.

## Next steps

1. User prepares 3 sets of audio assets in Ableton (tree, urban, bare — base+texture loops + icon samples)
2. Wires Max patch: `/lc/*` → crossfade controller → fold-mapping → audio playback
3. Wires icon trigger: metro → bang, multiply intensity by `/delta/magnitude`
4. Tests full pipeline with OSC simulator: `node scripts/osc_simulator.js gradual-transition`
5. Optionally wires granulator for ambient texture processing
