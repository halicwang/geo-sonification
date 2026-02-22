# GEE Export (MVP: landcover + nightlight + population)

Data vintage: 2020-2021.

## Export schema

Full field spec (types, units, allowed ranges): see `data/raw/SCHEMA.md`.

Only rows with `land_area_km2 > 0` are exported. By default, the scripts also apply a coastal filter
`land_fraction >= MIN_LAND_FRACTION` to drop mostly-ocean cells; set `MIN_LAND_FRACTION = 0` to disable.

If `reduceRegion` occasionally fails on large / high-latitude cells, increase `TILE_SCALE` (slower but more reliable).

Forest / land area accuracy:

- `AREA_METHOD = 'fast'` is the current default with `AREA_SCALE = 1000` (fast, may miss small patches).
- Switch to `AREA_METHOD = 'fractional'` to preserve small patches via `reduceResolution(sum)` on `pixelArea` (slower).
- Alternatively, decrease `AREA_SCALE` to `250` or `100` for more detail (slower).

### Expected CSV header (copy/paste check)

Must match `data/raw/SCHEMA.md`, `scripts/check_csv_schema.js`, and `server/data-loader.js`.

**V1** (required columns only — old CSVs still accepted):

```
grid_id,lon,lat,landcover_class,forest_pct,forest_area_km2,population_total,land_area_km2,nightlight_mean,nightlight_p90,cell_area_km2,land_fraction
```

**V2** (with continuous landcover percentages — current GEE scripts):

```
grid_id,lon,lat,landcover_class,lc_pct_10,lc_pct_20,lc_pct_30,lc_pct_40,lc_pct_50,lc_pct_60,lc_pct_70,lc_pct_80,lc_pct_90,lc_pct_95,lc_pct_100,forest_pct,forest_area_km2,population_total,land_area_km2,nightlight_mean,nightlight_p90,cell_area_km2,land_fraction
```

The `lc_pct_*` columns are **optional** (all 11 must be present or all absent). The Node server auto-detects the mode and falls back to discrete `landcover_class` when `lc_pct_*` columns are missing.

**Landcover method:** GEE scripts use `ee.Reducer.frequencyHistogram()` (replaced `mode()`) at `scale:1000` to compute pixel-count ratios per ESA WorldCover class. The `landcover_class` column is now derived as the argmax of the histogram (excluding Water class 80; ties go to smallest class code).

**Nightlight no-data sentinel:** Missing `nightlight_mean` / `nightlight_p90` (null from `reduceRegion`) are coerced to `-1` during export. The value -1 is unambiguous since VIIRS radiance is always ≥ 0. The server excludes -1 from aggregation averages; the normalization function already maps values ≤ 0 to 0. Old CSVs that used 0-coercion remain backward compatible.

**VIIRS diagnostics:** Each script prints `VIIRS collection size`, `VIIRS 2021 matches`, and `VIIRS band used` to the GEE console, so you can verify which data year was actually selected.

**Continent boundary overlaps:** Some regions intentionally overlap (e.g. Africa↔Europe at 35-38°N, Oceania↔Asia at -10-0°N). The server's `deduplicateGrids()` handles duplicates by preferring continuous landcover data, then larger `land_area_km2`. Oceania uses full longitude [-180, 180] to capture Pacific islands that cross the date line (Samoa, Tonga, Cook Islands).

Current resolution is 0.5°×0.5° (~78k cells globally). For even finer resolution (0.25°), data volume and export time increase ~4×.

## Steps

1. Open [Google Earth Engine Code Editor](https://code.earthengine.google.com/).
2. For each required region, open the corresponding script (`south_america`, `africa`, `asia`, `europe`, `north_america`, `oceania`), paste its contents into the editor, and run.
3. In the **Tasks** tab, click **Run** on the export task. Choose folder `geo_sonification` (or create it).
4. Wait for completion (per continent ~5–15 min). Download the CSV from Google Drive.
5. Place CSVs in the project `data/raw/` directory with names: `south_america_grid.csv`, `africa_grid.csv`, `asia_grid.csv`, `europe_grid.csv`, `north_america_grid.csv`, `oceania_grid.csv`.
    - Optional: you can also export `antarctica_grid.csv` for offline analysis, but current server startup and `npm run check:csv` do not require it.

## Run prerequisites (before starting Node)

1. **Confirm CSV files + headers + resolution**: all 6 required CSVs in `data/raw/` must exist, match `data/raw/SCHEMA.md`, and have lon/lat resolution consistent with server `GRID_SIZE` (default `0.5`). If you still have old `loss_*` / `forest2000_*` CSVs, do **not** start the server—re-export with the GEE scripts above and replace the files in `data/raw/`.
    - Validate: `npm run check:csv` (from project root)
2. **Clear caches**: `rm -rf data/cache`, then start the Node server.

The Node server validates required files, CSV headers, and grid resolution at startup. If any check fails, startup exits with a clear error.

## Small test first (recommended)

In any `gee/*_grid.js` script, uncomment the test block near the top:

```javascript
// var testRegion = ee.Geometry.Rectangle([-70, -20, -60, -10]);
// grid = grid.filterBounds(testRegion);
// print('Test grid size:', grid.size());
```

Then change the Export name to `*_TEST` and run. Download the TEST CSV and check column names and values (especially `population_total` for a big city). If sanity check is OK, comment the test block again and run the full export.
