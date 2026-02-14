# Geo‑Sonification Milestone Proposal

Author: Zixiao Wang (Halic) 
Date: 2026-01-29

## Abstract

This project shifts from a historical deforestation time series (“deforestation over time”) to an **interactive map + present-day (now-only) data** approach. As the user pans/zooms the map, the system computes viewport-level geographic statistics in real time and sends them via OSC to Max/MSP to drive sound changes. The core data comes from Google Earth Engine (precomputed and exported as CSV on a global 0.5°×0.5° grid), including landcover, nightlight, population, and forest metrics. The milestone deliverable is a demo-ready interactive prototype that lets listeners hear and compare human activity intensity and surface-type differences across regions.

## 0. What changed from my 01/22 draft

My 01/22 plan centered on **deforestation over time** (20‑year time series) and mapping “annual/cumulative loss” into sound. After class feedback, I am revising the direction to reduce the tension between:

- **Interactive map navigation = “now”**
- **Historical time series = “past”**

The revised project focuses on **interactive exploration of present‑day, global geographic metrics** (“probe the map and hear what’s there now”).

## 1. Project goal

Build an **interactive sound map** where panning/zooming the map continuously updates sound parameters (via OSC into Max/MSP) so listeners can *feel* how different places differ in:

- land cover (forest / urban / water / etc.)
- nightlight intensity
- population density
- forest share

Target outcome: a short live demo (plus screen recording) showing that users can “scan” the world and immediately hear meaningful differences without reading charts.

## 2. Data source (Where will I get the data?)

Primary: **Google Earth Engine (GEE)** exports, precomputed on a global 0.5°×0.5° grid (split by continent to keep exports manageable).

Per grid cell (CSV schema):

- `landcover_class` (ESA WorldCover dominant class)
- `population_total`, `land_area_km2` (density derived in server)
- `nightlight_mean`, `nightlight_p90` (VIIRS DNB; use p90 for more “presence”)
- `forest_pct`, `forest_area_km2`
- `cell_area_km2`, `land_fraction` (coastal/land weighting support)

Data vintage: 2020–2021 (consistent across layers).

## 3. System + technologies (How will it work?)

Pipeline:

1. **GEE** exports continent CSVs → stored locally (`csv/*.csv`)
2. **Node.js server** loads CSVs, caches combined grid, computes **viewport aggregation** when the user pans/zooms
3. **Frontend (Mapbox)** sends viewport bounds to the server (WebSocket/HTTP) and shows a minimal visual context
4. Server streams aggregated metrics to **Max/MSP** via **OSC** (port 7400)
5. **Max/MSP patch** maps metrics → synthesis / mixing parameters (live sound)

## 4. Sonification strategy (What will I sonify and how?)

Core design principle: keep mappings **stable and learnable**, but allow expressive sound design (not strictly “data = frequency”).

### 4.1 Mappings (proposed)

- **Landcover (categorical)** → *timbre family / sound palette switch*
  - e.g., forest = organic drone; urban/built = mechanical pulse; water = airy noise + slow modulation; cropland = patterned arpeggio
- **Population density (continuous)** → *rhythm density / event rate / transient intensity*
- **Nightlight (continuous)** → *brightness (filter cutoff), presence (gain), harmonic density*
- **Forest share (continuous)** → *smoothness vs. roughness, reverb amount, spectral tilt*

### 4.2 Aggregation (why viewport‑level?)

The sound responds to what the user is looking at (viewport), not a single point:

- encourages exploration (“scan” areas)
- avoids “needle” interaction (hard to hit a tiny cell)
- makes the audio experience more like a continuous instrument

## 5. What problem is the sonification illuminating?

This sonification aims to make **spatial differences** perceptually immediate:

- how “human presence” (nightlight + population) clusters and fades
- how landcover categories shift across regions
- how forested vs. built landscapes feel different as you traverse the globe

Instead of communicating exact numbers, the sound should support:

- fast comparison between places
- emotional weight / atmosphere
- discovery (“where does this sound change?”)

## 6. Milestone deliverables (what I will submit)

- Working end‑to‑end system: Map → Server → OSC → Max sound output
- One well‑designed mapping preset inside Max (a coherent “sound world”)
- 2–4 minute screen recording demonstrating exploration of several contrasting regions
- Short write‑up documenting mappings, normalization ranges, and known limitations

## 7. Risks + mitigation

- **Latency / jitter while panning** → smooth values in Max (slew/line), avoid rapid remapping
- **Data sparsity / coastal artifacts** → area‑weighted aggregation + land_fraction handling; sanity checks in multiple regions
- **Sound becomes noisy/unpleasant** → constrain parameter ranges; add musical structure (scales, envelopes) where needed
- **Too abstract (hard to interpret)** → keep a small set of consistent mappings; add subtle auditory icons per landcover if helpful

## 8. Success criteria

- Users can hear clear differences when moving between (a) dense cities, (b) deserts, (c) forests, (d) coastal regions
- Sound changes are smooth enough to “play” the map, without distracting jumps
- The mappings are explainable in 1–2 minutes and match what the map shows
