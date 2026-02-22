# CSV Grid Schema

Single source of truth for the data contract between GEE export scripts and the Node server.

Data vintage: ESA WorldCover 2021, VIIRS nightlight 2021, WorldPop 2020.
Resolution: 0.5 x 0.5 degree grid cells. One CSV per required region.

## Header (exact order)

V1 (required columns only):

```
grid_id,lon,lat,landcover_class,forest_pct,forest_area_km2,population_total,land_area_km2,nightlight_mean,nightlight_p90,cell_area_km2,land_fraction
```

V2 (with continuous landcover percentages):

```
grid_id,lon,lat,landcover_class,lc_pct_10,lc_pct_20,lc_pct_30,lc_pct_40,lc_pct_50,lc_pct_60,lc_pct_70,lc_pct_80,lc_pct_90,lc_pct_95,lc_pct_100,forest_pct,forest_area_km2,population_total,land_area_km2,nightlight_mean,nightlight_p90,cell_area_km2,land_fraction
```

## Columns

### Required (V1)

| Column             | Type   | Unit / Range         | Description                                                                  |
| ------------------ | ------ | -------------------- | ---------------------------------------------------------------------------- |
| `grid_id`          | string | e.g. `-18.0_-35.0`   | `lon_lat` identifier                                                         |
| `lon`              | float  | [-180, 180]          | Cell origin longitude (degrees)                                              |
| `lat`              | float  | [-90, 90]            | Cell origin latitude (degrees)                                               |
| `landcover_class`  | int    | 10-100 (ESA classes) | Dominant ESA WorldCover class (argmax of lc*pct*\*, excl. Water 80), or null |
| `forest_pct`       | float  | [0, 100]             | Forest share of land area (%)                                                |
| `forest_area_km2`  | float  | >= 0, km^2           | Absolute forest area                                                         |
| `population_total` | float  | >= 0                 | Total population in cell                                                     |
| `land_area_km2`    | float  | > 0, km^2            | Land area (ocean excluded)                                                   |
| `nightlight_mean`  | float  | >= -1                | VIIRS DNB mean radiance (land mask). -1 = no data                            |
| `nightlight_p90`   | float  | >= -1                | VIIRS DNB 90th percentile (land mask). -1 = no data                          |
| `cell_area_km2`    | float  | > 0, km^2            | Total cell area (land + ocean)                                               |
| `land_fraction`    | float  | [0, 1]               | `land_area_km2 / cell_area_km2`                                              |

### Optional — continuous landcover (V2)

All 11 columns must be present or all absent ("all or nothing").
Computed via `ee.Reducer.frequencyHistogram()` at scale:1000 (~1km sampling resolution).
Values are pixel count ratios (not strict 10m area ratios). Sum ≈ 100% (may differ slightly due to NoData/boundary/float effects); Node server re-normalizes.

| Column       | Type  | Unit / Range | Description                                                                                                       |
| ------------ | ----- | ------------ | ----------------------------------------------------------------------------------------------------------------- |
| `lc_pct_10`  | float | [0, 100]     | Tree/Forest pixel percentage                                                                                      |
| `lc_pct_20`  | float | [0, 100]     | Shrubland pixel percentage                                                                                        |
| `lc_pct_30`  | float | [0, 100]     | Grassland pixel percentage                                                                                        |
| `lc_pct_40`  | float | [0, 100]     | Cropland pixel percentage                                                                                         |
| `lc_pct_50`  | float | [0, 100]     | Built-up/Urban pixel percentage                                                                                   |
| `lc_pct_60`  | float | [0, 100]     | Bare/Sparse pixel percentage                                                                                      |
| `lc_pct_70`  | float | [0, 100]     | Snow/Ice pixel percentage                                                                                         |
| `lc_pct_80`  | float | [0, 100]     | Water pixel percentage (included in CSV, excluded from land-only server distribution and bus fold-mapping inputs) |
| `lc_pct_90`  | float | [0, 100]     | Wetland pixel percentage                                                                                          |
| `lc_pct_95`  | float | [0, 100]     | Mangroves pixel percentage                                                                                        |
| `lc_pct_100` | float | [0, 100]     | Moss/Lichen pixel percentage                                                                                      |

## ESA WorldCover Classes

| Code | Label          |
| ---- | -------------- |
| 10   | Tree/Forest    |
| 20   | Shrubland      |
| 30   | Grassland      |
| 40   | Cropland       |
| 50   | Built-up/Urban |
| 60   | Bare/Sparse    |
| 70   | Snow/Ice       |
| 80   | Water          |
| 90   | Wetland        |
| 95   | Mangroves      |
| 100  | Moss/Lichen    |

## Derived fields (computed by server, not in CSV)

| Field                | Formula                            |
| -------------------- | ---------------------------------- |
| `population_density` | `population_total / land_area_km2` |

## Constraints

- Only rows with `land_area_km2 > 0` are exported
- All required CSV files must be present in `data/raw/`: Africa, Asia, Europe, North America, Oceania, South America
- Each CSV's inferred lon/lat grid step must match server `GRID_SIZE` (default `0.5`)
- GEE scripts apply a coastal filter (`land_fraction >= MIN_LAND_FRACTION`) by default
- Missing `nightlight_mean` / `nightlight_p90` are coerced to `-1` (sentinel for "no data") at export time. The server excludes -1 values from aggregation averages. Old CSVs with 0-coercion are backward compatible
- Continent regions intentionally overlap at boundaries (e.g. Africa↔Europe, Oceania↔S.America); the server deduplicates by (lon, lat), preferring continuous landcover data then larger land area
- Validate with: `npm run check:csv` (from project root)

## Files

| File                     | Continent     |
| ------------------------ | ------------- |
| `africa_grid.csv`        | Africa        |
| `asia_grid.csv`          | Asia          |
| `europe_grid.csv`        | Europe        |
| `north_america_grid.csv` | North America |
| `oceania_grid.csv`       | Oceania       |
| `south_america_grid.csv` | South America |
