# Sonification Sample Library

This folder stores audio assets used by the Max patch.

## Directory Layout

- `ambience/`: long loopable base textures (e.g., `tree.wav`, `crop.wav`, `urban.wav`, `bare.wav`, `water.wav`)
- `icons/`: short event samples grouped by landcover type (`icons/tree/`, `icons/crop/`, `icons/urban/`, `icons/bare/`, `icons/water/`, ...)

## File Format Requirements

### Ambience loops
- WAV format
- Recommended sample rate: **48 kHz** (1875ms crossfade = exactly 90000 samples)
- Stereo
- Duration: **2:01.875** (2 minutes + 1 bar at 128 BPM)
- The last 1.875 seconds (1 bar) must be a copy of the first bar — this overlap enables seamless crossfade looping
- Loop mechanism: global clock (`loop_clock.js`) + double-buffered `groove~` per bus (`loop_voice.js` inside `loop_bus.maxpat`) with 1875ms crossfade window

### Icon samples
- WAV format
- Mono or stereo
- Short one-shots
- Recommended duration: 0.5-5 seconds
- Keep multiple files per type for random selection variety

## Naming Rules

- Ambience files: lowercase landcover names, e.g. `tree.wav`, `crop.wav`, `urban.wav`, `bare.wav`, `water.wav`
- Icon files: filename is flexible, but each file must be placed in the correct type folder

## ESA WorldCover Class Reference (11 classes)

- `10` Tree/Forest
- `20` Shrubland
- `30` Grassland
- `40` Cropland
- `50` Built-up/Urban
- `60` Bare/Sparse
- `70` Snow/Ice
- `80` Water
- `90` Wetland
- `95` Mangroves
- `100` Moss/Lichen

## Fold-Mapping (11 classes -> 5 buses)

- Tree bus: `10`, `20`, `30`, `90`, `95`, `100`
- Crop bus: `40`
- Urban bus: `50`
- Bare bus: `60`
- Water bus: `70`, `80` + ocean 3-level detector (`water_bus.js`)

This fold-mapping is a Max patch routing decision; the server still outputs all 11 channels.
