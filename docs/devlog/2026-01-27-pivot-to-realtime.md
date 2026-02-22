# 2026-01-27 — Discussion: Classroom Discussion: Pivot to Real-Time

Key feedback from instructor review of the first working demo (frontend + sine wave mapping):

## What worked

- Interactive map with Mapbox grid overlay — novel that it covers the whole world, not just one city
- Data pipeline from GEE to frontend to Max via OSC is functional
- Real-time interaction: hover over grid cells, get data back

## Design tension identified

- **Historical vs. real-time**: The map shows today's data, but the original plan wants to sonify 20 years of change. Navigating a "now" map while listening to the past is perceptually confusing.
- Instructor recommendation: **drop the historical time-series axis** and focus on real-time "now" data. The interactive map probing is the strong differentiator.

## Sonification strategy shift

- Direct frequency mapping (data → pitch) is not very informative — listeners can't tell actual values
- Sound doesn't need to directly map data with precise numeric fidelity; **loose, indirect mappings are valid sonification**
- Example: green space → one type of music, developed area → different type of music. Switching sounds based on data category is legitimate sonification
- Sound's role: **emotional impact and weight**, not numeric readout. Like a film score enhances visual storytelling.

## New directions discussed

- Add more data dimensions beyond just landcover: **population**, nightlight, forest percentage — more streams = more things to work with in sound design, enables comparisons
- Consider focusing on a specific region (e.g., one city) if detailed historical data is available, or stay global with real-time data
- Acoustic ecology angle mentioned (Nature's Soundscape studies in British Columbia) — not pursued but interesting reference

## Action items from discussion

- Integrate landscape/landcover data into the map (was only using loss rate at this point)
- Add population data as a new dimension
- Focus on "now" data, abandon historical time-series for this project
- Make the sound design more creative — move beyond sine wave pitch mapping
