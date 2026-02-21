# Open Platform Specification (DRAFT)

**Author:** Zixiao Wang (Halic)
**Date:** February 21, 2026
**Version:** 0.1.0-draft

This document defines the technical specification for evolving Geo-Sonification from a closed land cover sonification tool into an open geographic sonification framework.

---

## 1. Design Goals

1. **Data-source agnostic:** Any data source that can provide `(lat, lon, value)` tuples can be integrated — not limited to ESA WorldCover.
2. **Unified grid encoding:** All data entering the system is mapped to a single discrete grid Cell ID scheme.
3. **Configurable audio mapping:** Users can customize channel-to-audio-bus mapping, thresholds, and timbre selection.
4. **Backward-compatible:** The existing WorldCover pipeline continues to work as the "default data adapter," preserving all existing demos.

---

## 2. Coordinate Reference System

**Sole internal CRS: WGS84 (EPSG:4326)**

- Coordinate order is fixed as `[longitude, latitude]` (consistent with GeoJSON RFC 7946).
- Elevation is optional, stored as a third dimension: `[lon, lat, alt]`.
- All import adapters must perform coordinate conversion at the entry point.

---

## 3. Canonical Internal Representation

### 3.1 Data Record (DataRecord)

All data within the system is unified into the following structure (JSON representation):

```jsonc
{
  "cellId": "85283473fffffff", // H3 hexagonal Cell ID (see §4)
  "source": "worldcover",      // Data source identifier
  "channels": {                // Key-value pairs: channel name → normalized value (0–1)
    "tree": 0.42,
    "urban": 0.15,
    "bare": 0.03
    // ... each data source defines its own channel set
  },
  "timestamp": null,           // ISO 8601 or null (static data)
  "temporalType": "static",   // "static" | "stream" | "timeseries"
  "meta": {                    // Optional metadata
    "land_area_km2": 1523.4,
    "confidence": 0.87
  }
}
```

### 3.2 Temporal Dimension Classification

| `temporalType` | Meaning | Aggregation Strategy | Examples |
| -------------- | ------- | -------------------- | -------- |
| `static` | Update cycle >= 1 year | Spatial aggregation, no time window | WorldCover, terrain |
| `stream` | Real-time updates (seconds to hours) | Sliding time-window aggregation | Flight tracks, real-time air quality |
| `timeseries` | Historical time series | Time-slice playback | Annual forest loss |

Phase 1 implements `static` only. `stream` and `timeseries` are reserved for future extension.

### 3.3 Internal Exchange Format

Inter-module geographic data is passed as GeoJSON FeatureCollection (RFC 7946):

```jsonc
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [-55.25, -10.25] },
      "properties": {
        "cellId": "85283473fffffff",
        "source": "worldcover",
        "channels": { "tree": 0.42, "urban": 0.15 },
        "temporalType": "static"
      }
    }
  ]
}
```

This guarantees interoperability with external GIS tools — any tool that reads GeoJSON can directly consume intermediate data.

---

## 4. Grid Encoding: H3 (Primary Choice)

### 4.1 Selection Rationale

| Factor | H3 | Quadkey | Geohash |
| ------ | -- | ------- | ------- |
| Industry ecosystem adoption | Widest (BigQuery, Snowflake, CARTO, Databricks native support) | Map tile ecosystem only | Database indexing is widespread, analytics ecosystem is weak |
| Area consistency | Highly consistent (within the same resolution) | Varies with latitude (Mercator) | Varies with latitude |
| Neighbor queries | Native kRing, 6 equidistant neighbors | Requires computation, 4 neighbors with corner adjacency | Requires boundary-jump handling |
| Hierarchical nesting | Approximate (7 child hexes, not exact tessellation) | Exact quadtree | Exact prefix truncation |
| Viewport enumeration | `polygonToCells()`, millisecond-level | Two nested for-loops, extremely fast | Moderate |
| Mapbox alignment | Not directly aligned; requires `cellToBoundary()` conversion to GeoJSON polygon | Fully aligned | Not aligned |
| Third-party data interop | Strongest — an increasing number of data vendors publish H3 cell IDs directly | Weak | Moderate |

**Conclusion:** H3 has a clear ecosystem advantage for an open platform with multi-source data integration. Third-party data vendors (air quality, traffic, population heatmaps) increasingly publish data with H3 cell IDs, enabling zero-conversion direct consumption. Viewport enumeration performance is fully adequate at this system's update frequency (200–500 ms). Mapbox integration is achieved through `cellToBoundary()` conversion to GeoJSON polygons, which Mapbox renders natively.

### 4.2 H3 Encoding Rules

H3 divides the Earth's surface into hexagonal grids (plus a small number of pentagons), with 16 resolution levels (0–15). Each cell is identified by a 64-bit integer, typically represented as a 15-character hexadecimal string (e.g., `"85283473fffffff"`).

Core API (`h3-js` npm package):

```javascript
import { latLngToCell, cellToBoundary, cellToParent,
         gridDisk, polygonToCells, getResolution } from 'h3-js';

// Lat/lon → H3 cell ID
const cellId = latLngToCell(37.7749, -122.4194, 5);
// → "85283473fffffff"

// Cell ID → hexagonal boundary (GeoJSON coordinate array)
const boundary = cellToBoundary(cellId);
// → [[37.77, -122.42], [37.78, -122.41], ...]

// Parent (lower resolution)
const parent = cellToParent(cellId, 3);

// Neighbor ring (radius k cells)
const neighbors = gridDisk(cellId, 1);  // self + 6 neighbors

// Viewport rectangle → all covered cells
const cells = polygonToCells(
    [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
    resolution
);
```

### 4.3 Resolution and Existing System Comparison

| Resolution | Hex Edge Length | Hex Area | Use Case | Relation to Existing System |
| ---------- | --------------- | -------- | -------- | --------------------------- |
| 1 | ~418 km | ~607,221 km² | Continental | — |
| 2 | ~158 km | ~86,746 km² | Large regions | — |
| 3 | ~60 km | ~12,393 km² | Country/province level | Closest to existing 0.5-degree grid (~55 km x 55 km at mid-latitudes) |
| 4 | ~23 km | ~1,770 km² | Metropolitan areas | — |
| 5 | ~8 km | ~253 km² | City level | Per-grid mode trigger range |
| 7 | ~1.2 km | ~5.16 km² | Neighborhood level | Future fine-grained soundscapes |

**Default operating level:** Resolution 3 (closest to the existing 0.5-degree grid; approximately 60 km edge length at the equator).
**Configurable:** Via `DEFAULT_H3_RESOLUTION` in `config.js`.
**Dynamic adjustment:** Resolution can be auto-selected based on map zoom level — zoom 3–5 uses res 2, zoom 6–8 uses res 3, zoom 9–11 uses res 4, and so on.

### 4.4 CellEncoder Abstract Interface

Reserved for future replacement with Quadkey or other encoding schemes:

```javascript
/**
 * @typedef {Object} CellEncoder
 * @property {(lat: number, lon: number, precision: number) => string} encode
 * @property {(cellId: string) => { lat: number, lon: number, boundary: number[][] }} decode
 * @property {(cellId: string) => string} parent
 * @property {(cellId: string) => number} precision
 * @property {(zoomLevel: number) => number} precisionForZoom
 * @property {(bounds: [number,number,number,number], precision: number) => string[]} enumerateBounds
 * @property {(cellId: string, k: number) => string[]} neighbors
 */
```

Phase 1 provides an `H3Encoder` implementation. Once the interface is frozen, new encoders (e.g., Quadkey) only need to implement the same interface.

Note that H3 includes an additional `neighbors(cellId, k)` method compared to Quadkey — this is a native H3 advantage, useful for spatial analysis scenarios such as "blended soundscape from surrounding N cells." A Quadkey encoder could implement the same interface via quadtree neighbor computation.

---

## 5. Data Adapter Interface

### 5.1 Adapter Responsibilities

Each data adapter is responsible for:

1. Reading the raw format (CSV / KML / GPX / API response / ...)
2. Converting coordinates to WGS84 (if necessary)
3. Mapping data into `DataRecord[]` (see §3.1), including cellId encoding
4. Declaring its channel list (channel manifest)

### 5.2 Adapter Interface

```javascript
/**
 * @typedef {Object} DataAdapter
 * @property {string} id - Unique identifier (e.g., "worldcover", "flightradar24", "purpleair")
 * @property {string} name - Display name
 * @property {ChannelManifest[]} channels - Channel manifest for this adapter
 * @property {string} temporalType - "static" | "stream" | "timeseries"
 * @property {(rawData: any, encoder: CellEncoder, precision: number) => DataRecord[]} ingest
 * @property {Object} [importFormats] - Supported import formats and their parsers
 */

/**
 * @typedef {Object} ChannelManifest
 * @property {string} name - Channel name (e.g., "tree", "urban", "pm25")
 * @property {string} label - Display label (e.g., "Tree / Forest", "PM2.5")
 * @property {number[]} range - Raw value range [min, max]
 * @property {string} unit - Unit (e.g., "fraction", "μg/m³", "count")
 * @property {string} normalization - Normalization method: "linear" | "log" | "percentile"
 * @property {string} [color] - Suggested visualization color
 */
```

### 5.3 WorldCover Adapter (Existing System Refactor)

The existing `data-loader.js` + `landcover.js` + `normalize.js` are refactored into the first adapter:

```javascript
// server/adapters/worldcover.js
module.exports = {
    id: 'worldcover',
    name: 'ESA WorldCover 2021',
    temporalType: 'static',
    channels: [
        { name: 'tree',     label: 'Tree / Forest',    range: [0, 1], unit: 'fraction', normalization: 'linear' },
        { name: 'shrub',    label: 'Shrubland',        range: [0, 1], unit: 'fraction', normalization: 'linear' },
        { name: 'grass',    label: 'Grassland',        range: [0, 1], unit: 'fraction', normalization: 'linear' },
        { name: 'crop',     label: 'Cropland',         range: [0, 1], unit: 'fraction', normalization: 'linear' },
        { name: 'urban',    label: 'Urban / Built-up', range: [0, 1], unit: 'fraction', normalization: 'linear' },
        { name: 'bare',     label: 'Bare / Sparse',    range: [0, 1], unit: 'fraction', normalization: 'linear' },
        { name: 'snow',     label: 'Snow / Ice',       range: [0, 1], unit: 'fraction', normalization: 'linear' },
        { name: 'water',    label: 'Water',            range: [0, 1], unit: 'fraction', normalization: 'linear' },
        { name: 'wetland',  label: 'Herbaceous Wetland', range: [0, 1], unit: 'fraction', normalization: 'linear' },
        { name: 'mangrove', label: 'Mangroves',        range: [0, 1], unit: 'fraction', normalization: 'linear' },
        { name: 'moss',     label: 'Moss / Lichen',    range: [0, 1], unit: 'fraction', normalization: 'linear' },
        // Additional channels (from other CSV columns)
        { name: 'nightlight', label: 'Nightlight',     range: [0, 1], unit: 'normalized', normalization: 'percentile' },
        { name: 'population', label: 'Population',     range: [0, 1], unit: 'normalized', normalization: 'log' },
        { name: 'forest',     label: 'Forest Cover',   range: [0, 1], unit: 'fraction', normalization: 'linear' },
    ],
    ingest(csvRows, encoder, precision) { /* ... */ },
    importFormats: { csv: parseContinentCsv },
};
```

### 5.4 Minimum Column Set for CSV Import

When users import custom CSV data, the system requires:

| Column | Required | Type | Description |
| ------ | -------- | ---- | ----------- |
| `lat` | Yes | float | Latitude (WGS84, -90 to 90) |
| `lon` | Yes | float | Longitude (WGS84, -180 to 180) |
| `timestamp` | No | ISO 8601 or unix ms | Event time |
| `alt` | No | float | Elevation (meters) |
| `*` | No | float | Any numeric column is auto-registered as a channel |

Automatic processing logic:

1. Identify `lat` / `lon` (or `latitude` / `longitude`) columns
2. Remaining numeric columns are auto-registered as channels (column name = channel name)
3. Each row's `(lat, lon)` is encoded to a cellId via `CellEncoder.encode()`
4. Multiple rows within the same cellId are aggregated using a configurable operator (mean / sum / max / last)

---

## 6. Channel Registry

### 6.1 Concept

Replaces the existing hardcoded 11 ESA classes. At startup, each loaded adapter declares its channels to the registry. The registry maintains a global channel list and assigns channel indices (used for OSC transmission).

```javascript
// Registry internal structure
{
  channels: [
    { index: 0, name: 'tree',       source: 'worldcover', ... },
    { index: 1, name: 'shrub',      source: 'worldcover', ... },
    // ...
    { index: 11, name: 'nightlight', source: 'worldcover', ... },
    { index: 14, name: 'pm25',       source: 'purpleair', ... },
    { index: 15, name: 'flight_density', source: 'flightradar24', ... },
  ],
  busMapping: {
    // Channel → audio bus mapping (user-configurable)
    'tree_bus':  ['tree', 'shrub', 'grass', 'wetland', 'mangrove', 'moss'],
    'crop_bus':  ['crop'],
    'urban_bus': ['urban'],
    'bare_bus':  ['bare'],
    'water_bus': ['snow', 'water'],
  }
}
```

### 6.2 Relationship with the OSC Protocol

**Phase 1 (backward-compatible):** When only the WorldCover adapter is loaded, OSC output is fully identical to the current format — `/lc/10` through `/lc/100`. The Max patch requires no changes.

**Phase 2 (generic mode):** When multiple adapters are loaded, generic channel addresses are used:

```
/ch/0   0.42    (tree)
/ch/1   0.08    (shrub)
...
/ch/14  0.65    (pm25)
/ch/15  0.12    (flight_density)
```

A one-time channel registration message is sent at startup so Max knows what each index represents:

```
/ch/register  0 "tree" "worldcover"
/ch/register  1 "shrub" "worldcover"
...
/ch/register  14 "pm25" "purpleair"
```

---

## 7. Audio Mapping Configuration

### 7.1 Configuration File Format

Users define channel-to-audio mapping via a JSON configuration file:

```jsonc
// audio_mapping.json
{
  "version": "1.0",
  "buses": [
    {
      "name": "nature",
      "channels": ["tree", "shrub", "grass", "wetland", "mangrove", "moss"],
      "foldMethod": "sum",           // "sum" | "max" | "weighted"
      "sample": "samples/ambience/tree.wav",
      "volume": { "min": 0.0, "max": 1.0 }
    },
    {
      "name": "city",
      "channels": ["urban", "nightlight"],
      "foldMethod": "max",
      "sample": "samples/ambience/urban.wav",
      "volume": { "min": 0.0, "max": 1.0 }
    }
    // ... users can freely add/remove buses
  ],
  "icons": [
    {
      "triggerChannel": "tree",
      "threshold": 0.3,
      "cooldownMs": 3000,
      "samples": ["samples/icons/tree/bird1.wav", "samples/icons/tree/bird2.wav"]
    }
  ],
  "smoothing": {
    "emaTimeConstant": 500,
    "volumeRampMs": 20
  }
}
```

### 7.2 Web Console (Phase 3)

A web page (`/console`) provides real-time adjustment of:

- Channel-to-bus mapping (drag-and-drop)
- Per-bus volume range and fold method
- EMA smoothing parameters
- Icon trigger thresholds and cooldown intervals
- Preview playback ("auditory legend")

Changes are pushed in real time via WebSocket to the Node.js server, which then updates Max via OSC configuration messages.

---

## 8. Import Format Support Roadmap

| Format | Priority | Phase | Notes |
| ------ | -------- | ----- | ----- |
| CSV (lat/lon + arbitrary numeric columns) | P0 | 1 | Lowest barrier, immediate support |
| GeoJSON | P0 | 1 | Internal canonical format, direct consumption |
| KML | P1 | 2 | Integration with Fog of World / Google Earth ecosystem |
| GPX | P1 | 2 | Integration with track-based apps (FR24, etc.) |
| API adapter (HTTP poll / WebSocket) | P2 | 3 | Integration with real-time data sources (air quality, flights, etc.) |

---

## 9. Compatibility and Migration Strategy

### 9.1 Existing grid_id to H3 Mapping

The existing `grid_id` format is `"lon_-55.0_lat_-10.0"` — each ID corresponds to a 0.5-degree x 0.5-degree grid cell.

Migration path:

1. Take the cell center point `(lon + 0.25, lat + 0.25)`
2. Call `latLngToCell(centerLat, centerLon, DEFAULT_H3_RESOLUTION)`
3. Obtain the H3 Cell ID (e.g., `"832a34fffffffff"`)

Note: 0.5-degree squares and H3 hexagons have different geometries, so no exact 1:1 mapping exists. One old square may correspond to multiple H3 cells, and vice versa. The migration strategy assigns all data from an old square to the H3 cell containing its center point. Precision loss at resolution 3 is acceptable (hexagon edge length ~60 km vs. square edge length ~55 km).

During the transition period, the `GridCell` type retains both `grid_id` (legacy) and `cellId` (new), with downstream consumers migrating incrementally.

### 9.2 OSC Backward Compatibility

Generic channel addresses (`/ch/*`) are added in `osc_schema.js` while retaining all existing `/lc/*` addresses. When only the WorldCover adapter is loaded, both address sets are sent simultaneously. The Max patch requires no immediate changes.

---

## 10. Glossary

| Term | Definition |
| ---- | ---------- |
| Cell | The smallest spatial unit produced by grid encoding |
| Cell ID | Unique identifier for a cell (H3 hexadecimal string in Phase 1) |
| Channel | A single normalized data dimension (e.g., "tree", "pm25") |
| Bus | An audio output channel, produced by folding one or more channels |
| Adapter | A module that converts an external data source into DataRecords |
| Fold | The operation of combining multiple channel values into a single bus volume |
| Canonical | The unified internal data representation format |
