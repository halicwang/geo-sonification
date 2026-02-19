# Sonification Sample Library

This folder stores audio assets used by the Max patch.

## Directory Layout

- `ambience/`: long loopable base textures (e.g., `tree.wav`, `urban.wav`, `bare.wav`, `water.wav`)
- `icons/`: short event samples grouped by landcover type (`icons/tree/`, `icons/urban/`, `icons/bare/`, `icons/water/`, ...)

## File Format Requirements

### Ambience loops
- WAV format
- 44.1kHz or 48kHz
- Stereo
- Seamlessly loopable
- Recommended duration: 1-2 minutes per file

### Icon samples
- WAV format
- Mono or stereo
- Short one-shots
- Recommended duration: 0.5-5 seconds
- Keep multiple files per type for random selection variety

## Naming Rules

- Ambience files: lowercase landcover names, e.g. `tree.wav`, `urban.wav`, `bare.wav`, `water.wav`
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

## Phase 1 Fold-Mapping (11 classes -> 4 buses)

- Tree bus: `10`, `20`, `30`, `40`, `90`, `95`, `100`
- Urban bus: `50`
- Bare bus: `60`
- Water bus: `70`, `80` + ocean 3-level detector (`water_bus.js`)

This fold-mapping is a Max patch routing decision; the server still outputs all 11 channels.
