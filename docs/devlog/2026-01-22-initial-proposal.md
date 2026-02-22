# 2026-01-22 — Discussion: Homework: Initial Proposal

**Data source**: Google Earth Engine — draw ROI on map, extract landscape/land-cover composition and ~20-year forest-loss time series (annual loss + cumulative loss). Export as CSV.

**Tech pipeline**: GEE data extraction → Python preprocessing → Max/MSP synthesis & mapping → WAV export. Max handles sound generation (pads/drone/noise/percussion), mapping data to filter, detune, noise ratio, textural fragmentation, rhythmic density. Can also output MIDI to Ableton for arrangement.

**Core problem**: Use sound to make trend, acceleration, and key years perceptually immediate — listeners should hear whether cumulative loss over 20 years is substantial without staring at a chart.

**Sound structure (original plan)**:

- 2D place baseline — land-cover composition defines background timbre (forest = organic/continuous, water = open/floating, built-up = mechanical/regular)
- Time-weighted degradation — cumulative loss drives detune, instability, roughness, fragmentation over time
- Year-based events — annual loss triggers ruptures/noise in high-loss years; annual gain attenuates loss weight
