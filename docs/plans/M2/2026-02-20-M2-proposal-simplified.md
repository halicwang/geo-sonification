# Geo-Sonification: Milestone 2 Progress Report

**Author:** Zixiao Wang (Halic)
**Date:** February 20, 2026
**Course:** Sonification Seminar

---

## 1. Introduction

Milestone 1 established the data pipeline: Google Earth Engine exports geographic data, a Node.js server aggregates it in real time as the user pans and zooms a world map, and the results are streamed to Max/MSP via OSC. By the end of Milestone 1, the server was sending 11 land cover class percentages per viewport update --- one for each ESA WorldCover category (forest, shrubland, grassland, cropland, built-up, bare, snow/ice, water, wetland, mangrove, moss/lichen). The data arrived in Max, but produced no sound.

The central design challenge of Milestone 2 was: how do you turn 11 simultaneous, continuously changing land cover percentages into a coherent listening experience? Playing 11 independent audio streams would be chaotic and unlistenable. The solution was a **fold-mapping** architecture: the 11 ESA classes are grouped by sonic similarity into **5 audio buses** --- Tree, Crop, Urban, Bare, and Water --- each driving a single ambient loop authored in Ableton Live. A crossfade controller smooths the 11 raw percentages with exponential moving average filtering and sums the grouped channels into 5 bus volumes. As the user pans the map, the 5 loops play simultaneously and their relative volumes shift in real time, producing a continuous soundscape where forest fades into desert, city gives way to ocean, and the listener can feel the geography change without reading a single number.

---

## 2. Improving the Data Foundation

### 2.1 Grid Resolution

The global data grid was re-exported from Google Earth Engine at 0.5 x 0.5 degree resolution, replacing the 1 x 1 degree grid used in Milestone 1. This quadrupled the number of grid cells worldwide and improved spatial accuracy from roughly 110 km to 55 km at the equator. The finer resolution means that land cover boundaries, coastlines, and urban edges are captured with significantly more detail, which directly translates to more precise and responsive sonification.

### 2.2 Visual Feedback

The frontend map was updated to render grid cells in colors corresponding to their dominant land cover type. Forests appear as dark green, cropland as yellow, built-up areas as grey, water as blue, and so on. Previously, all grid cells were displayed in uniform grey. This color-coding gives the user immediate visual context that pairs with the audio --- as you pan across the map, you can see the landscape shift at the same time you hear it.

---

## 3. New Server-Side Control Signals

Milestone 1's server sent 15 messages per viewport update (the dominant land cover class, normalized nightlight/population/forest values, and 11 per-class land cover fractions). Milestone 2 added six new signal types that give the sound engine much richer context about what the user is doing and what they are looking at.

### 3.1 Mode Signal

The server now sends a `/mode` message (string: "aggregated" or "per-grid") at the start of every update. This tells Max/MSP which listening mode is active, enabling the sound engine to handle transitions --- for example, crossfading between aggregate and per-cell audio when the user zooms in or out past the mode threshold.

### 3.2 Proximity Signal

A `/proximity` signal (float, 0 to 1) encodes how zoomed-in the user is. A value of 0 means satellite-level view with hundreds of grid cells visible; a value of 1 means street-level with only a few cells in the viewport. This signal is derived from the grid cell count using linear interpolation between configurable thresholds. The sound engine uses proximity to drive volume attenuation: zooming out causes the entire soundscape to fade toward silence, creating the sensation of hearing the Earth from a distance.

### 3.3 Land Cover Delta Signal

The `/delta/lc` signal sends 11 float values representing the per-class change in land cover composition since the previous viewport update. This allows the sound engine to respond to exploration _movement_ rather than only static position. When the user pans from forest into desert, the delta signal captures that shift as it happens, enabling the audio to react to the act of traversing the landscape.

### 3.4 Coverage Signal

The `/coverage` signal (float, 0 to 1) reports the ratio of land grid cells to the theoretical total number of cells that could fit in the viewport. This is the key mechanism for ocean detection: when the user pans over open ocean, no land grid data exists, so coverage drops to approximately zero. The sound engine uses this to activate ocean ambience even in the absence of any grid data.

### 3.5 Per-Cell Land Cover Distribution

In per-grid mode (when zoomed in), the server now sends `/grid/lc` --- the full 11-class land cover distribution for each visible grid cell. This replaces the single discrete land cover class integer from Milestone 1 with a continuous 11-dimensional vector, giving the sound engine a much more nuanced picture of each cell's composition.

### 3.6 Per-Cell Viewport Position

Also in per-grid mode, `/grid/pos` sends the viewport-relative normalized position (x and y, each 0 to 1) for each grid cell. The server pre-computes these coordinates from the cell's geographic center, making them immediately usable for stereo panning or spatial placement in Max.

---

## 4. Server Infrastructure

### 4.1 OSC Schema Module

All OSC addresses, the canonical land cover class ordering, the full message sequence, and packet builder functions were extracted into a single shared module (`osc_schema.js`). Both the main server and the simulator import from it, eliminating any possibility of address mismatches or ordering discrepancies between components.

### 4.2 Per-Client Delta State

Delta computation requires remembering each client's previous land cover snapshot. The server now maintains independent delta state per WebSocket connection and per HTTP client (keyed by client ID with IP fallback). Inactive clients are cleaned up after a 5-minute TTL to prevent memory leaks.

### 4.3 OSC Simulator

A standalone Node.js script (`scripts/osc_simulator.js`) sends realistic OSC data directly to Max/MSP without requiring the browser, map, or any user interaction. This was essential for developing and testing the Max patch in isolation. The simulator includes six built-in scenarios: a static forest, a blended mixed landscape, a gradual 10-second transition from forest to urban, an abrupt jump from forest to bare, a proximity sweep from close to distant, and a simulated world tour across contrasting biomes.

---

## 5. Sound Engine Design

### 5.1 Design Philosophy

The target listening experience is approximately 65% aesthetic and 35% informational. The sonification should feel like a living, evocative soundscape that happens to carry geographic meaning, rather than a sterile data readout that happens to use audio. The current implementation focuses on the ambient base layer --- loopable WAV files produced in Ableton Live, mixed in real time by a crossfade controller and a water bus module inside Max/MSP.

### 5.2 Crossfade Controller

The crossfade controller (`crossfade_controller.js`) is a Max-side JavaScript module with 12 inlets and 11 outlets. It receives the 11 per-class land cover fractions and the proximity value, applies exponential moving average (EMA) smoothing with a 500 ms time constant, and outputs 11 smoothed volume values. All outputs are attenuated by the proximity signal. The frame-based design ensures that all 11 channels are processed with identical timing --- the arrival of the last land cover message triggers computation for the entire frame.

### 5.3 Water Bus

The water bus (`water_bus.js`) solves a specific problem: how to produce ocean sound when no land data exists. It uses the coverage and proximity signals to implement three-level ocean detection. Over open ocean with no visible grid cells, the output is 1.0 (full ocean). Near coastlines with very low coverage but some proximity, the output is 0.7 (coastal). Over land, the output is 0.0. This signal is combined with the crossfade controller's outputs for the water and snow/ice land cover classes, so the Water audio bus responds to both land-cover-based water and open ocean.

---

## 6. Five-Bus Fold-Mapping

The crossfade controller outputs 11 independent volume channels, one for each ESA WorldCover class. In the Max patch, these 11 channels are folded into five audio buses, each driving one ambient loop:

**Tree** encompasses forest (class 10), shrubland (20), grassland (30), wetland (90), mangroves (95), and moss/lichen (100) --- all natural vegetation types. The corresponding ambient loop features organic textures, a humid atmosphere, and layered natural drones.

**Crop** maps to cropland (class 40). Its ambient loop evokes open agricultural fields with wind and gentle organic texture.

**Urban** maps to built-up areas (class 50). The loop features a low-frequency mechanical drone with distant traffic and industrial hum.

**Bare** maps to bare soil and sparse vegetation (class 60). The loop uses wind synthesis, dry air texture, and sparse particle sounds to evoke arid desert landscapes.

**Water** combines snow/ice (class 70), permanent water bodies (class 80), and the ocean detector signal. The loop features deep water movement, wave textures, and subaquatic resonance.

All five WAV files are authored in Ableton Live as seamlessly loopable stereo files at 44.1 or 48 kHz, with durations of 1 to 2 minutes. In the Max patch, each bus has a `buffer~` and `play~` object for continuous loop playback, with gain controlled by the corresponding bus output from the crossfade controller. All five loops play simultaneously; their relative volumes shift in real time as the user pans and zooms the map.

---

## 7. Close-Up and Distant Listening

The proximity signal creates a continuous spectrum between two listening experiences. When zoomed in close (proximity approaching 1), the soundscape is clear and detailed --- individual land cover types are distinctly audible, and panning the map produces immediate, perceptible changes in the mix. When zoomed out to satellite view (proximity approaching 0), all volumes attenuate smoothly toward silence, creating a diffuse, quiet wash. The transition between these two modes is gradual, with no hard threshold or abrupt switch.

---

## 8. Testing

The server codebase includes 94 automated tests organized into 10 test suites, covering OSC metric computation, delta state management, the OSC schema module, mode manager hysteresis, spatial queries and aggregation, normalization, land cover utilities, CSV data loading, OSC message sending, and configuration parsing. All 94 tests pass.

---

## 9. The Listening Experience

To convey what the system sounds like in practice:

Panning from the Amazon rainforest to the Sahara desert, the lush organic tree ambience gradually fades out while a dry, wind-driven desert texture fades in. The crossfade is smooth and continuous, with no clicks or jumps. Zooming out to satellite view causes everything to fade toward silence, as if the listener is rising above the surface and losing contact with the ground. Panning across the Pacific Ocean activates the water ambience loop even though no land grid data exists in that region --- the coverage signal drops to zero, and the water bus responds accordingly. Zooming into Tokyo brings the urban drone forward as the built-up land cover fraction rises and proximity increases.

---

## 10. Future Goals

Several capabilities are planned for future milestones. The code infrastructure for each already exists in the codebase; what remains is authoring the audio content and wiring the modules into the Max patch to produce audible output.

The **auditory icon layer** will add short, characteristic sounds --- bird calls in forested areas, traffic noise in cities, wind gusts over deserts --- triggered probabilistically by a dedicated module (`icon_trigger.js`). The trigger logic is code-complete; the remaining work is authoring the samples and connecting them in the Max patch.

The **granulator** will add granular texture processing to the ambient base layer, creating richer and more varied soundscapes. A 4-voice granular synthesis module (`granulator.js`) is code-complete and ready for integration.

**Per-grid spatial panning** will position individual grid cell voices in the stereo field when zoomed in, using the viewport-relative positions already computed and sent by the server. The Max-side spatialization has not yet been built.

---

## 11. Deliverables

1. Five ambient WAV loops (tree, crop, urban, bare, water) driving five audio buses in Max/MSP
2. A real-time sonification engine: crossfade controller and water bus driving 5-bus loop playback
3. Six new OSC control signals with full server-side computation
4. A 0.5-degree global grid with color-coded frontend visualization
5. An OSC simulator with six test scenarios for development without the browser
6. 94 passing automated tests

---

## 12. System Architecture

```
  Google Earth Engine (0.5 x 0.5 degree global grid)
                          |
                          v
                  CSV data (local)
                          |
                          v
  +---------------------------------------------------+
  |                  Node.js Server                    |
  |                                                    |
  |   Spatial index / viewport aggregation             |
  |   Normalization (nightlight, population, forest)   |
  |   Land cover distribution computation              |
  |   Proximity / delta / coverage computation  [NEW]  |
  |   OSC schema and packet construction        [NEW]  |
  |   Per-client delta state management         [NEW]  |
  +---------------------------------------------------+
          |                              |
          | WebSocket                    | OSC (UDP 7400)
          v                              v
  +----------------+          +--------------------------+
  |    Frontend    |          |       Max/MSP Patch      |
  |  (Mapbox GL)   |          |                          |
  |                |          |  Crossfade controller     |
  |  Color-coded   |          |  Water bus (ocean detect) |
  |  grid overlay  |          |                          |
  |       [NEW]    |          |                          |
  +----------------+          |                          |
                              |  5-bus fold-mapping       |
                              |  buffer~/play~ loops      |
                              |          |                |
                              |       [SOUND]             |
                              +--------------------------+
```
