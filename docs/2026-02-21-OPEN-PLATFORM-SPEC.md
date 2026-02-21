# Open Platform Specification (DRAFT)

**Author:** Zixiao Wang (Halic)
**Date:** February 21, 2026
**Version:** 0.1.0-draft

This document defines the technical specification for evolving Geo-Sonification from a closed land cover sonification tool into an open geographic sonification framework.

---

## Motivation and Use Cases

Geo-Sonification is an **auditory monitoring layer for geographic situational awareness**. It converts continuous, multi-source spatial data into low-attention ambient sound cues that a human operator can absorb without diverting visual focus from other tasks.

**Primary scenario — Air quality monitoring:** An operations center monitors regional PM2.5 levels from a network of sensors (e.g., PurpleAir). Each sensor reading is encoded to an H3 cell and fed into the platform via the adapter pipeline. As the operator pans the map, ambient tonal shifts reflect the spatial gradient of pollution levels across the viewport. When any cell crosses an AQI threshold, an auditory icon fires immediately — no dashboard tab-switching or visual scanning required. Land cover data provides a semantic context layer (urban, forest, water) so the operator hears both the environmental baseline and the anomaly.

**Additional use cases:**
- **Wildfire situational monitoring** — ingest authoritative fire hotspot data (NASA FIRMS near real-time active fire detections, Copernicus EFFIS) as point events (lat/lon + time + fire radiative power + detection confidence). Each hotspot is encoded to an H3 cell and aggregated within a sliding time window (e.g., 6–24 hours). Per-cell metrics — active fire count, peak intensity (FRP), and recency of latest detection — drive auditory icon triggers and ambient tension. The platform does *not* perform fire detection from raw satellite imagery (that is the job of upstream remote sensing pipelines such as VIIRS/MODIS); it monitors and sonifies the processed, authoritative outputs of those pipelines.
- **Maritime patrol** — AIS vessel density sonified as continuous texture; anomalous clustering or route deviation triggers alerts.
- **Power grid outage monitoring** — outage event feeds mapped to H3 cells; auditory cues track affected area expansion and restoration.
- **Accessibility** — non-visual exploration of geographic data for visually impaired users.

**Platform value proposition:** Data sources are pluggable (adapters), audio outputs are pluggable (OSC to any synthesis engine), channel-to-sound mappings are user-configurable, and the system natively supports both real-time streams and static/offline batches. This spec defines the data model and extension points that make these use cases possible.

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

> **Note on parameter vs. storage order:** The `[lon, lat]` convention applies to coordinate *arrays* and GeoJSON output. Function call signatures (h3-js `latLngToCell()`, `CellEncoder.encode()`) use the geographic convention `(lat, lon)`. Callers must be aware of the difference — arrays are `[lon, lat]`, function parameters are `(lat, lon)`.

---

## 3. Canonical Internal Representation

### 3.1 Data Record (DataRecord)

All data within the system is unified into the following structure (JSON representation):

```jsonc
{
  "cellId": "85283473fffffff", // H3 hexagonal Cell ID (see §4)
  "source": "worldcover",      // Data source identifier
  "channels": {                // Key-value pairs: namespaced channel key → normalized value (0–1)
    "worldcover.tree": 0.42,
    "worldcover.urban": 0.15,
    "worldcover.bare": 0.03
    // ... each data source defines its own channel set; keys are sourceId.channelName (see §6.2)
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

Phase 1 implements `static`. Phase 4 implements `stream` (poll scheduler + sliding time window). `timeseries` is reserved for future extension.

### 3.3 Internal Exchange Format

**Internal (in-process):** Modules within the same Node.js process pass data as plain `DataRecord[]` arrays (see §3.1). This avoids the overhead of wrapping every record in GeoJSON `Feature` / `FeatureCollection` envelopes for purely in-memory communication.

**External (API boundary / future export):** When data is exported to external GIS tools or explicitly requested via a future `/api/export` endpoint, it is serialized as GeoJSON FeatureCollection (RFC 7946). Note: the current migration plan (Phases 0–4) does not implement GeoJSON export endpoints — internal REST APIs (`/api/config`, `/api/streams`, `/api/import`) use plain JSON. The GeoJSON format is defined here for future interoperability; a `toGeoJSON(records)` utility will be implemented when the first GeoJSON-consuming endpoint is added. Format example:

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

This guarantees interoperability with external GIS tools — any tool that reads GeoJSON can directly consume the export output.

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
const { latLngToCell, cellToBoundary, cellToParent,
        gridDisk, polygonToCells, getResolution } = require('h3-js');

// Lat/lon → H3 cell ID
const cellId = latLngToCell(37.7749, -122.4194, 5);
// → "85283473fffffff"

// Cell ID → hexagonal boundary (returns [lat, lng] pairs — NOT GeoJSON order)
const boundary = cellToBoundary(cellId);
// → [[37.77, -122.42], [37.78, -122.41], ...]
// ⚠ To use with GeoJSON/Mapbox, flip each pair: boundary.map(([lat, lng]) => [lng, lat])

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

> **Coordinate order caution:** h3-js uses `(lat, lon)` parameter order and returns `[lat, lng]` arrays — opposite of GeoJSON `[lon, lat]`. Specifically: `latLngToCell(lat, lon, res)` takes lat-first; `cellToBoundary()` returns `[lat, lng]` pairs that must be flipped to `[lng, lat]` for GeoJSON/Mapbox; `polygonToCells()` accepts GeoJSON-style `[lon, lat]` arrays (exception). When converting from GeoJSON coordinates: `latLngToCell(coord[1], coord[0], res)`. Verify the version-specific coordinate convention in h3-js v4 docs.

### 4.3 Resolution and Existing System Comparison

| Resolution | Hex Edge Length | Hex Area | Use Case | Relation to Existing System |
| ---------- | --------------- | -------- | -------- | --------------------------- |
| 1 | ~418 km | ~607,221 km² | Continental | — |
| 2 | ~158 km | ~86,746 km² | Large regions | — |
| 3 | ~60 km | ~12,393 km² | Country/province level | ~4× larger than 0.5° grid — too coarse for migration |
| 4 | ~23 km | ~1,770 km² | Metropolitan areas | **Closest to existing 0.5° grid (~3,080 km² at equator); same order of magnitude** |
| 5 | ~8 km | ~253 km² | City level | Per-grid mode trigger range |
| 7 | ~1.2 km | ~5.16 km² | Neighborhood level | Future fine-grained soundscapes |

**Default operating level:** Resolution 4 (closest to the existing 0.5° grid; hex area ~1,770 km² vs. grid cell ~3,080 km² at equator).
**Configurable:** Via `DEFAULT_H3_RESOLUTION` in `config.js`.
**Dynamic adjustment:** Resolution can be auto-selected based on map zoom level — zoom 3–5 uses res 3, zoom 6–8 uses res 4, zoom 9–11 uses res 5, and so on.

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

> **Implementation note:** Since only H3 is planned for the foreseeable future, Phase 0 may implement `h3-encoder.js` directly without the `cell-encoder.js` abstract interface. The abstraction can be extracted later when a second encoder is actually needed, following YAGNI principles. This reduces Phase 0 scope and cognitive overhead.

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
 * @property {string} [version] - Semantic version of this adapter (e.g., "1.0.0")
 * @property {Object} [requiredConfig] - Configuration keys this adapter needs at registration
 *   (e.g., { apiKey: "string", region: "string" }). Validated by the adapter framework at startup.
 * @property {(rawData: any, encoder: CellEncoder, precision: number) => DataRecord[]} ingest
 * @property {Object} [importFormats] - Supported import formats and their parsers
 */
// For `stream` type adapters, see the extended StreamAdapter interface in §5.3.
//
// The fields `id`, `version`, `channels`, `temporalType`, and `requiredConfig` together form
// the **adapter manifest** — the minimum metadata needed for a registry or marketplace to list,
// validate, and instantiate an adapter without running it.

/**
 * @typedef {Object} ChannelManifest
 * @property {string} name - Channel name (e.g., "tree", "urban", "pm25")
 * @property {string} label - Display label (e.g., "Tree / Forest", "PM2.5")
 * @property {number[]} range - Raw value range [min, max]
 * @property {string} unit - Unit (e.g., "fraction", "μg/m³", "count")
 * @property {string} normalization - Normalization method: "linear" | "log" | "percentile"
 * @property {string} [color] - Suggested visualization color
 * @property {string} [group] - Semantic grouping (e.g., "distribution" for channels that sum to ~1, "metric" for independent indicators). Used by Phase 3 console for bus mapping UI and by /ch/register for downstream consumers to distinguish channel semantics.
 */
```

### 5.3 Adapter Lifecycle (Stream / Timeseries Types)

For `static` adapters, the `ingest()` method is called once at startup. For `stream` adapters (Phase 4), the adapter extends `DataAdapter` with streaming-specific properties and a `fetch()` method that replaces `ingest()`:

```javascript
/**
 * @typedef {Object} StreamAdapter
 * @extends DataAdapter
 * @property {string} temporalType - Fixed to "stream"
 * @property {number} pollIntervalMs - Poll interval (milliseconds)
 * @property {number} windowMs - Time window width (milliseconds)
 * @property {string} windowAggregate - Window aggregation operator: "count" | "mean" | "max" | "last"
 * @property {(encoder: CellEncoder, precision: number) => Promise<DataRecord[]>} fetch
 *   Fetch latest data and return DataRecord array (replaces static adapter's ingest)
 */
```

The `stream-scheduler` manages the lifecycle of all stream adapters:

```javascript
/**
 * @typedef {Object} StreamLifecycle
 * @property {() => Promise<void>} start - Begin polling / open connection
 * @property {() => Promise<void>} stop - Gracefully shut down
 * @property {() => Promise<void>} pause - Temporarily suspend polling
 * @property {() => Promise<void>} resume - Resume polling after pause
 * @property {(error: Error) => void} onError - Error callback (log, retry, or degrade)
 * @property {number} maxRetries - Maximum consecutive failures before giving up
 */
```

**Sliding time window:** Each stream adapter declares a `windowMs` (e.g., 24 hours for earthquakes). The `time-window` module maintains per-cell event arrays sorted by time. On each new event arrival or window tick:

1. Delete expired events where `timestamp < now - windowMs`
2. Recompute aggregated values using the adapter's `windowAggregate` operator
3. If aggregated change exceeds `STREAM_CHANGE_THRESHOLD`, trigger incremental OSC push

**Memory safeguards:** Configure `MAX_EVENTS_PER_CELL` (default: 1000) and `MAX_STREAM_CELLS` (default: 50000). When a cell exceeds the per-cell limit, oldest events are evicted regardless of window expiry. When total active cells exceed the global limit, least-recently-updated cells are evicted. These limits prevent unbounded memory growth from high-frequency or wide-window data sources.

**Error handling strategy:**
- On transient failure (network timeout, 5xx): retry with exponential backoff up to `maxRetries`.
- On permanent failure (4xx, malformed data): log the error, emit an OSC `/adapter/error` message, and continue operating with stale data.
- On adapter crash: the channel registry keeps the last known values; the adapter can be restarted without affecting other adapters.

**Example: NASA FIRMS Fire Hotspot Adapter**

NASA FIRMS (Fire Information for Resource Management System) provides near real-time active fire detections from VIIRS and MODIS sensors. The FIRMS API supports spatial filtering by bounding box, making it a natural fit for the `"aoi"` subscription strategy (§5.4). A FIRMS stream adapter would declare:

```javascript
{
    id: 'firms-fire',
    name: 'NASA FIRMS Active Fire',
    temporalType: 'stream',
    aoiStrategy: 'aoi',                // Spatial filtering — only fetch fires within viewport AOI
    pollIntervalMs: 10 * 60_000,       // 10 minutes (aligned with FIRMS NRT update cadence)
    windowMs: 24 * 60 * 60_000,        // Retain last 24 hours
    windowAggregate: 'max',            // Per-cell: max FRP
    channels: [
        { name: 'fire_count',     label: 'Active Fire Count',    range: [0, 100], unit: 'count', normalization: 'log',    group: 'metric' },
        { name: 'fire_intensity', label: 'Fire Radiative Power', range: [0, 500], unit: 'MW',    normalization: 'log',    group: 'metric' },
        { name: 'fire_newness',   label: 'Time Since Detection', range: [0, 1],   unit: 'ratio', normalization: 'linear', group: 'metric' },
    ],
}
```

Copernicus EFFIS provides similar fire data for Europe and can be integrated as an alternative or complementary adapter with the same channel schema.

Phase 1 only implements `static` adapters. Phase 4 introduces `stream` adapters with full lifecycle management. `timeseries` adapters are reserved for future extension.

### 5.4 AOI / Subscription Strategy for Stream Adapters

Stream data sources with global coverage (fire hotspots, flight tracks, vessel positions) can produce high event volumes. Ingesting everything without spatial filtering causes memory and bandwidth pressure. The platform provides two strategies, selectable per stream adapter via the `aoiStrategy` field:

**Strategy A — Global pull, viewport-scoped aggregation (`"global"`):**
The stream adapter fetches all events within its time window (or up to `MAX_STREAM_CELLS`). Aggregation to H3 cells happens globally, but OSC output only includes cells within each client's current viewport. This is simple to implement (one fetch schedule regardless of client count) but memory-intensive for high-volume sources. Suitable for moderate-volume sources like USGS earthquakes (thousands of events per day globally).

**Strategy B — AOI-scoped pull (`"aoi"`):**
The stream adapter accepts an Area of Interest (bounding box or polygon) and only requests events within that region from the upstream API. The AOI tracks each client's viewport (with debounce and a configurable expansion margin to reduce thrashing). When multiple clients have overlapping viewports, the scheduler merges their AOIs into a union bounding box to avoid duplicate requests. Suitable for high-volume sources like NASA FIRMS (~300K detections/day globally) where full ingestion is impractical.

**Default recommendation:** Use `"global"` for sources with < 10K events/day. Use `"aoi"` for sources with > 10K events/day or where the upstream API supports spatial filtering (FIRMS and most real-time APIs do).

```javascript
/**
 * @typedef {Object} StreamAdapter
 * @property {"global" | "aoi"} [aoiStrategy] - Spatial filtering strategy (default: "global")
 * @property {number} [aoiMarginDeg] - AOI expansion margin in degrees (default: 1.0, only used when aoiStrategy is "aoi")
 * @property {number} [aoiDebounceSec] - Debounce delay before updating AOI after viewport change (default: 5)
 */
```

Configuration in `config.js`: `DEFAULT_AOI_STRATEGY`, `AOI_MARGIN_DEG`, `AOI_DEBOUNCE_SEC`.

### 5.5 WorldCover Adapter (Existing System Refactor)

The existing `data-loader.js` + `landcover.js` + `normalize.js` are refactored into the first adapter:

```javascript
// server/adapters/worldcover.js
module.exports = {
    id: 'worldcover',
    name: 'ESA WorldCover 2021',
    temporalType: 'static',
    channels: [
        // Land cover distribution channels (sum to ~1 within each cell)
        { name: 'tree',     label: 'Tree / Forest',    range: [0, 1], unit: 'fraction', normalization: 'linear', group: 'distribution' },
        { name: 'shrub',    label: 'Shrubland',        range: [0, 1], unit: 'fraction', normalization: 'linear', group: 'distribution' },
        { name: 'grass',    label: 'Grassland',        range: [0, 1], unit: 'fraction', normalization: 'linear', group: 'distribution' },
        { name: 'crop',     label: 'Cropland',         range: [0, 1], unit: 'fraction', normalization: 'linear', group: 'distribution' },
        { name: 'urban',    label: 'Urban / Built-up', range: [0, 1], unit: 'fraction', normalization: 'linear', group: 'distribution' },
        { name: 'bare',     label: 'Bare / Sparse',    range: [0, 1], unit: 'fraction', normalization: 'linear', group: 'distribution' },
        { name: 'snow',     label: 'Snow / Ice',       range: [0, 1], unit: 'fraction', normalization: 'linear', group: 'distribution' },
        { name: 'water',    label: 'Water',            range: [0, 1], unit: 'fraction', normalization: 'linear', group: 'distribution' },
        { name: 'wetland',  label: 'Herbaceous Wetland', range: [0, 1], unit: 'fraction', normalization: 'linear', group: 'distribution' },
        { name: 'mangrove', label: 'Mangroves',        range: [0, 1], unit: 'fraction', normalization: 'linear', group: 'distribution' },
        { name: 'moss',     label: 'Moss / Lichen',    range: [0, 1], unit: 'fraction', normalization: 'linear', group: 'distribution' },
        // Independent metric channels (each independently normalized)
        { name: 'nightlight', label: 'Nightlight',     range: [0, 1], unit: 'normalized', normalization: 'percentile', group: 'metric' },
        { name: 'population', label: 'Population',     range: [0, 1], unit: 'normalized', normalization: 'log', group: 'metric' },
        { name: 'forest',     label: 'Forest Cover',   range: [0, 1], unit: 'fraction', normalization: 'linear', group: 'metric' },
    ],
    ingest(csvRows, encoder, precision) { /* ... */ },
    importFormats: { csv: parseContinentCsv },
};
```

### 5.6 Minimum Column Set for CSV Import

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
    { index: 0,  key: 'worldcover.tree',              source: 'worldcover',    name: 'tree',            ... },
    { index: 1,  key: 'worldcover.shrub',              source: 'worldcover',    name: 'shrub',           ... },
    // ...
    { index: 11, key: 'worldcover.nightlight',         source: 'worldcover',    name: 'nightlight',      ... },
    { index: 14, key: 'purpleair.pm25',                source: 'purpleair',     name: 'pm25',            ... },
    { index: 15, key: 'flightradar24.flight_density',  source: 'flightradar24', name: 'flight_density',  ... },
  ],
  busMapping: {
    // Bus mapping uses namespaced keys
    'nature_bus': ['worldcover.tree', 'worldcover.shrub', 'worldcover.grass', 'worldcover.wetland', 'worldcover.mangrove', 'worldcover.moss'],
    'crop_bus':   ['worldcover.crop'],
    'urban_bus':  ['worldcover.urban'],
    'bare_bus':   ['worldcover.bare'],
    'water_bus':  ['worldcover.snow', 'worldcover.water'],
  }
}
```

### 6.2 Channel Namespace Strategy

When multiple adapters coexist, bare channel names (e.g., `tree`, `temperature`) will inevitably collide. The registry uses **namespaced keys** to eliminate collisions structurally.

**Internal key format:** `sourceId.channelName` (dot-separated). The `sourceId` is the adapter's `id` property; `channelName` is the channel's `name` from its manifest. Examples: `worldcover.tree`, `purpleair.pm25`, `usgs_earthquake.quake_mag`.

This namespaced key is the canonical identifier used in:
- The channel registry (the `key` field above)
- The `DataRecord.channels` object (see §3.1)
- Bus mapping configuration (see §7.1)

**Display aliases:** The Phase 3 web console allows users to assign short aliases for frequently used channels (e.g., display `purpleair.pm25` as `pm25`). Aliases are cosmetic — they appear in the console UI only and do not affect OSC output, bus mapping keys, or internal data. Alias mappings are stored in `audio_mapping.json` under a `channelAliases` key.

**Backward compatibility:** The WorldCover adapter uses `id: 'worldcover'`, so its channels become `worldcover.tree`, `worldcover.shrub`, etc. internally. For backward-compatible OSC output (`/lc/*` addresses), the mapping in `osc_schema.js` strips the namespace prefix — no Max patch changes required.

### 6.3 Relationship with the OSC Protocol

**Phase 1 (backward-compatible):** When only the WorldCover adapter is loaded, OSC output is fully identical to the current format — `/lc/10` through `/lc/100`, plus `/nightlight`, `/population`, and `/forest`. The Max patch requires no changes.

**Phase 2 (generic mode):** When multiple adapters are loaded, generic channel addresses are used:

```
/ch/0   0.42    (worldcover.tree)
/ch/1   0.08    (worldcover.shrub)
...
/ch/14  0.65    (purpleair.pm25)
/ch/15  0.12    (flightradar24.flight_density)
```

A one-time channel registration message is sent at startup so Max knows what each index represents:

```
/ch/register  0 "worldcover.tree" "worldcover" "distribution"
/ch/register  1 "worldcover.shrub" "worldcover" "distribution"
...
/ch/register  14 "purpleair.pm25" "purpleair" "metric"
```

The fourth argument (`group`) is optional — omitting it defaults to `"metric"`. This allows downstream consumers (Max patch, web console) to distinguish distribution channels (values sum to ~1) from independent metric channels.

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
      "channels": ["worldcover.tree", "worldcover.shrub", "worldcover.grass", "worldcover.wetland", "worldcover.mangrove", "worldcover.moss"],
      "foldMethod": "sum",           // "sum" | "max" | "weighted"
      "sample": "samples/ambience/tree.wav",
      "volume": { "min": 0.0, "max": 1.0 }
    },
    {
      "name": "city",
      "channels": ["worldcover.urban", "worldcover.nightlight"],
      "foldMethod": "max",
      "sample": "samples/ambience/urban.wav",
      "volume": { "min": 0.0, "max": 1.0 }
    }
    // ... users can freely add/remove buses
  ],
  "icons": [
    {
      "triggerChannel": "worldcover.tree",
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
| KML | P1 | Post-1 | Integration with Fog of World / Google Earth ecosystem (not in current migration plan) |
| GPX | P1 | Post-1 | Integration with track-based apps (FR24, etc.) (not in current migration plan) |
| API adapter (HTTP poll / WebSocket) | P2 | 4 | Integration with real-time data sources (earthquakes, air quality, flights, etc.) |

> **Note:** The "Phase" column indicates the *earliest migration phase after which* the format could be added. KML/GPX are not included in the current migration plan (Phases 0–4) but can be implemented as additional adapters once the Phase 1 adapter framework is in place.

---

## 9. Non-Functional Requirements Roadmap

Phases 0–4 focus on functional capabilities. The items below are not in scope for the current migration plan but are documented here as a roadmap for production and enterprise deployment.

### 9.1 Authentication and Isolation

Current phases assume a single-user, local-network deployment. For multi-tenant or public-facing deployment, the following endpoints require authentication and authorization:

- `POST /api/import` — data ingestion
- `POST /api/streams/:id/pause|resume` — stream lifecycle control
- `GET /console` — audio mapping configuration UI

Roadmap items: API key or JWT bearer token validation middleware; per-tenant adapter isolation (each tenant sees only their own imported data and stream adapters); audit log for data imports and configuration changes.

### 9.2 Resource Governance

- **Upload limits** for `POST /api/import`: maximum file size (default 50 MB), maximum row count (default 500,000), maximum column count (default 100). Enforced before parsing begins.
- **Stream adapter caps:** `MAX_EVENTS_PER_CELL` and `MAX_STREAM_CELLS` (defined in §5.3). Additionally: per-adapter memory high-water mark monitoring.
- **Per-source rate limiting:** limit `POST /api/import` to N requests per minute per source IP. For stream adapters, enforce a minimum `pollIntervalMs` floor (e.g., 10 seconds) to prevent upstream API abuse.

### 9.3 Frontend Dependency Supply Chain

Phase 2 considers loading `h3-js` (~1.2 MB WASM) in the frontend via CDN (`unpkg.com`). Enterprise environments may reject external CDN links due to CSP policies, air-gapped networks, or supply chain audit requirements.

**Recommendation:** Prefer the server-computed approach (`/api/h3` returning pre-computed GeoJSON) as the default. If client-side h3-js is needed, vendor the file to `frontend/vendor/h3-js.min.js` and serve from the same origin rather than fetching from a third-party CDN at runtime.

### 9.4 Observability

For a platform targeting monitoring and situational awareness use cases, the system itself must be observable. Key metrics to expose via `GET /api/metrics` or structured log output:

- **Viewport pipeline latency:** time from WebSocket viewport message receipt to OSC send completion (p50, p95, p99).
- **Active cells:** number of H3 cells in the spatial index, broken down by source adapter.
- **OSC send rate:** messages per second to Max, broken down by address prefix (`/lc/*`, `/ch/*`, `/adapter/*`).
- **Per-adapter health:** for each stream adapter — last successful fetch time, fetch latency (p50, p95), error count, current status (running / paused / failed).
- **Import throughput:** for `POST /api/import` — parse time, encode time, total cells ingested.

Implementation: lightweight in-process metrics accumulator (no external dependency such as Prometheus required at this stage). JSON endpoint for programmatic access; structured logs for integration with external monitoring systems.

---

## 10. Compatibility and Migration Strategy

### 10.1 Existing grid_id to H3 Mapping

The existing `grid_id` format is `"lon_-55.0_lat_-10.0"` — each ID corresponds to a 0.5-degree x 0.5-degree grid cell.

Migration path:

1. Take the cell center point `(lon + 0.25, lat + 0.25)`
2. Call `latLngToCell(centerLat, centerLon, DEFAULT_H3_RESOLUTION)`
3. Obtain the H3 Cell ID (e.g., `"832a34fffffffff"`)

Note: 0.5-degree squares and H3 hexagons have different geometries, so no exact 1:1 mapping exists. At resolution 4, each H3 hexagon (~1,770 km²) is smaller than the existing 0.5° grid cell (~3,080 km² at equator). One old grid cell may overlap 1–3 H3 cells, but only the cell containing the center point receives data. This means some H3 cells will have no data (sparser coverage), but no information is lost through aggregation. If denser coverage is needed, a spatial interpolation step can be added later.

During the transition period, the `GridCell` type retains both `grid_id` (legacy) and `cellId` (new), with downstream consumers migrating incrementally.

### 10.2 OSC Backward Compatibility

Generic channel addresses (`/ch/*`) are added in `osc_schema.js` while retaining all existing `/lc/*` addresses. When only the WorldCover adapter is loaded, both address sets are sent simultaneously. The Max patch requires no immediate changes.

---

## 11. Glossary

| Term | Definition |
| ---- | ---------- |
| Cell | The smallest spatial unit produced by grid encoding |
| Cell ID | Unique identifier for a cell (H3 hexadecimal string in Phase 1) |
| Channel | A single normalized data dimension (e.g., "tree", "pm25") |
| Bus | An audio output channel, produced by folding one or more channels |
| Adapter | A module that converts an external data source into DataRecords |
| Fold | The operation of combining multiple channel values into a single bus volume |
| Canonical | The unified internal data representation format |
| Namespace | Dot-separated prefix (`sourceId.channelName`) that uniquely identifies a channel across adapters |
| Alias | A user-facing display name mapped to a namespaced channel key |
| Adapter Manifest | The combination of `id`, `version`, `channels`, `temporalType`, and `requiredConfig` that describes an adapter to the registry |
