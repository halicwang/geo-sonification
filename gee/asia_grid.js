// ========== Asia Grid (MVP: landcover + nightlight + population) ==========
// Paste into GEE Code Editor and run. Data vintage: 2020-2021.

// West boundary at 40°E aligns with Europe's east edge — avoids ~2800-cell overlap.
// 25-40°E is covered by Europe (>=35°N) and Africa (<38°N). No land missed.
// Extended north to 84°N for Novaya Zemlya, Franz Josef Land, Severnaya Zemlya.
// East boundary at 190°E (= -170°W) covers Chukotka across the date line,
// seamlessly joining North America's west boundary at -170°.
var region = ee.Geometry.Rectangle([40, -10, 190, 84]);
var gridSize = 0.5;
// Tuning knobs
var MIN_LAND_FRACTION = 0.02; // set to 0 to disable; 0.02–0.05 recommended to drop mostly-ocean cells
var TILE_SCALE = 8; // higher = more reliable (slower)
// Forest/land area aggregation:
// - AREA_METHOD = 'fast' uses sampling at AREA_SCALE (fast, may miss small patches)
// - AREA_METHOD = 'fractional' uses reduceResolution(sum) on pixelArea (more accurate, slower)
var AREA_METHOD = 'fast';
var AREA_SCALE = 1000;
var FRACTIONAL_MAX_PIXELS = 16384;

// IMPORTANT: ee.List.sequence end is inclusive. Use max - gridSize to avoid creating overflow cells.
// East extends to 190° (= -170°W) to cover Chukotka; GEE wraps coordinates automatically.
var lonList = ee.List.sequence(40, 190 - gridSize, gridSize);
var latList = ee.List.sequence(-10, 84 - gridSize, gridSize);

var grid = ee.FeatureCollection(
    lonList
        .map(function (lon) {
            return latList.map(function (lat) {
                var geom = ee.Geometry.Rectangle([
                    lon,
                    lat,
                    ee.Number(lon).add(gridSize),
                    ee.Number(lat).add(gridSize),
                ]);
                return ee.Feature(geom, {
                    lon: lon,
                    lat: lat,
                    grid_id: ee
                        .String(ee.Number(lon).format('%.1f'))
                        .cat('_')
                        .cat(ee.Number(lat).format('%.1f')),
                });
            });
        })
        .flatten()
);

// Optional small test (recommended): uncomment to run ~100 cells only, then Export a *_TEST CSV
// var testRegion = ee.Geometry.Rectangle([100, 20, 110, 30]);
// grid = grid.filterBounds(testRegion);
// print('Test grid size:', grid.size());

var worldcover = ee.Image('ESA/WorldCover/v200/2021').select('Map');
// IMPORTANT: If this collection becomes unavailable (renamed/deprecated), the script
// will still work but nightlight values will all be -1 (sentinel). Check the GEE
// data catalog for the current VIIRS annual asset ID. Known valid IDs:
//   - NOAA/VIIRS/DNB/ANNUAL_V22 (as of 2024)
//   - NOAA/VIIRS/DNB/ANNUAL_V21 (previous version)
var viirsCol = ee.ImageCollection('NOAA/VIIRS/DNB/ANNUAL_V22');
var viirsYearCol = viirsCol.filter(ee.Filter.eq('year', 2021));
var viirsRaw = ee.Image(
    ee.Algorithms.If(
        viirsCol.size().gt(0),
        ee.Algorithms.If(
            viirsYearCol.size().gt(0),
            viirsYearCol.first(),
            viirsCol.sort('system:time_start', false).first()
        ),
        ee.Image.constant(0)
    )
);
var viirsBandNames = viirsRaw.bandNames();
var viirsBand = ee.String(
    ee.Algorithms.If(viirsBandNames.contains('average'), 'average', viirsBandNames.get(0))
);
var viirs = viirsRaw.select([viirsBand]).rename('nightlight');
print('VIIRS collection size:', viirsCol.size());
print('VIIRS 2021 matches:', viirsYearCol.size());
print('VIIRS band used:', viirsBand);
// WorldPop at native 100m - reduceRegion at scale:100 for accurate population sums
var worldpop = ee
    .ImageCollection('WorldPop/GP/100m/pop')
    .filter(ee.Filter.eq('year', 2020))
    .mosaic()
    .rename('pop');
var pixelArea = ee.Image.pixelArea();
var landMask = worldcover.gte(10).and(worldcover.neq(80));
var forestMask = worldcover.eq(10);
var sumStack;
if (AREA_METHOD === 'fractional') {
    var proj = worldcover.projection();
    var landArea1km = pixelArea
        .updateMask(landMask)
        .setDefaultProjection({ crs: proj })
        .reduceResolution({
            reducer: ee.Reducer.sum(),
            maxPixels: FRACTIONAL_MAX_PIXELS,
            bestEffort: true,
        })
        .reproject({ crs: proj, scale: AREA_SCALE })
        .rename('land_area');
    var forestArea1km = pixelArea
        .updateMask(forestMask.and(landMask))
        .setDefaultProjection({ crs: proj })
        .reduceResolution({
            reducer: ee.Reducer.sum(),
            maxPixels: FRACTIONAL_MAX_PIXELS,
            bestEffort: true,
        })
        .reproject({ crs: proj, scale: AREA_SCALE })
        .rename('forest_area');
    sumStack = ee.Image.cat([landArea1km, forestArea1km]);
} else {
    sumStack = ee.Image.cat([
        pixelArea.updateMask(landMask).rename('land_area'),
        pixelArea.updateMask(forestMask.and(landMask)).rename('forest_area'),
    ]);
}

// Safe dictionary getter — avoids reliance on ee.Dictionary.get(key, default) which may not
// be supported in all GEE versions. Uses the canonical ee.Algorithms.If(contains, get, fallback).
function safeDictGet(dict, key, fallback) {
    return ee.Algorithms.If(dict.contains(key), dict.get(key), fallback);
}

// Pass 1: compute land/forest area metrics and filter early (avoid expensive stats on ocean cells)
var areaResults = grid.map(function (cell) {
    var geom = cell.geometry();
    var sumStats = sumStack.reduceRegion({
        reducer: ee.Reducer.sum(),
        geometry: geom,
        scale: AREA_SCALE,
        maxPixels: 1e8,
        tileScale: TILE_SCALE,
    });
    var landAreaM2 = ee.Number(safeDictGet(sumStats, 'land_area', 0));
    var forestAreaM2 = ee.Number(safeDictGet(sumStats, 'forest_area', 0));
    var cellAreaM2 = ee.Number(geom.area(1));

    var landAreaKm2 = ee.Algorithms.If(landAreaM2.gt(0), landAreaM2.divide(1e6), 0);
    var forestAreaKm2 = ee.Algorithms.If(forestAreaM2.gt(0), forestAreaM2.divide(1e6), 0);
    var cellAreaKm2 = ee.Algorithms.If(cellAreaM2.gt(0), cellAreaM2.divide(1e6), 0);
    var landFraction = ee.Algorithms.If(
        cellAreaM2.gt(0),
        landAreaM2.divide(cellAreaM2).max(0).min(1),
        0
    );
    var forestPct = ee.Algorithms.If(
        landAreaM2.gt(0),
        forestAreaM2.divide(landAreaM2).multiply(100),
        0
    );
    return cell.set({
        forest_pct: forestPct,
        forest_area_km2: forestAreaKm2,
        land_area_km2: landAreaKm2,
        cell_area_km2: cellAreaKm2,
        land_fraction: landFraction,
    });
});

var landCells = areaResults.filter(
    ee.Filter.and(
        ee.Filter.gt('land_area_km2', 0),
        ee.Filter.gte('land_fraction', MIN_LAND_FRACTION)
    )
);

// Pass 2: expensive stats only on land cells
var results = landCells.map(function (cell) {
    var geom = cell.geometry();

    // Landcover: frequency histogram on ALL WorldCover pixels (including water class 80)
    // scale:1000 → ~1km sampling resolution (pixel count ratio, not strict 10m area ratio)
    var lcHist = worldcover.reduceRegion({
        reducer: ee.Reducer.frequencyHistogram(),
        geometry: geom,
        scale: 1000,
        maxPixels: 1e8,
        tileScale: TILE_SCALE,
    });
    var histRaw = lcHist.get('Map');
    var hist = ee.Dictionary(ee.Algorithms.If(histRaw, histRaw, ee.Dictionary({})));
    var histVals = hist.values();
    var totalPixels = ee.Number(
        ee.Algorithms.If(histVals.size().gt(0), histVals.reduce(ee.Reducer.sum()), ee.Number(0))
    );

    // Extract pixel percentage for a given class code
    function lcPct(classCode) {
        var key = ee.Number(classCode).format('%d');
        var count = ee.Number(
            ee.Algorithms.If(hist.contains(key), hist.getNumber(key), ee.Number(0))
        );
        return ee.Number(
            ee.Algorithms.If(
                totalPixels.gt(0),
                count.divide(totalPixels).multiply(100),
                ee.Number(0)
            )
        );
    }

    // Dominant class: fixed order iteration, strict > for determinism (ties → smallest class code)
    // Excludes water (80) to match server-side /lc/* semantics
    var landClassOrder = ee.List([10, 20, 30, 40, 50, 60, 70, 90, 95, 100]);
    var bestClass = landClassOrder.iterate(
        function (cls, best) {
            cls = ee.Number(cls);
            best = ee.List(best);
            var key = cls.format('%d');
            var count = ee.Number(
                ee.Algorithms.If(hist.contains(key), hist.getNumber(key), ee.Number(0))
            );
            var bestCount = ee.Number(best.get(1));
            return ee.Algorithms.If(count.gt(bestCount), ee.List([cls, count]), best);
        },
        ee.List([ee.Number(0), ee.Number(0)])
    );
    var bestList = ee.List(bestClass);
    var dominantClass = ee.Algorithms.If(
        ee.Number(bestList.get(1)).gt(0),
        ee.Number(bestList.get(0)),
        null
    );

    // Population: sum at native 100m for accurate totals (other optimizations keep overall memory in check)
    var popResult = worldpop.reduceRegion({
        reducer: ee.Reducer.sum(),
        geometry: geom,
        scale: 100,
        maxPixels: 1e8,
        bestEffort: true,
        tileScale: TILE_SCALE,
    });
    var popRaw = popResult.get('pop');
    var popTotal = ee.Algorithms.If(
        ee.Algorithms.IsEqual(popRaw, null),
        ee.Number(0),
        ee.Number(popRaw)
    );

    // Combine mean + p90 into a single reduceRegion call to save memory
    var nlResult = viirs.updateMask(landMask).reduceRegion({
        reducer: ee.Reducer.mean().combine({
            reducer2: ee.Reducer.percentile([90]),
            sharedInputs: true,
        }),
        geometry: geom,
        scale: 1000,
        maxPixels: 1e8,
        tileScale: TILE_SCALE,
    });
    var meanRaw = nlResult.get('nightlight_mean');
    var nightlightMean = ee.Algorithms.If(
        ee.Algorithms.IsEqual(meanRaw, null),
        ee.Number(-1),
        ee.Number(meanRaw)
    );
    var p90Raw = nlResult.get('nightlight_p90');
    var p90 = ee.Algorithms.If(
        ee.Algorithms.IsEqual(p90Raw, null),
        ee.Number(-1),
        ee.Number(p90Raw)
    );

    return cell.set({
        landcover_class: ee.Algorithms.If(dominantClass, ee.Number(dominantClass).round(), null),
        lc_pct_10: lcPct(10),
        lc_pct_20: lcPct(20),
        lc_pct_30: lcPct(30),
        lc_pct_40: lcPct(40),
        lc_pct_50: lcPct(50),
        lc_pct_60: lcPct(60),
        lc_pct_70: lcPct(70),
        lc_pct_80: lcPct(80),
        lc_pct_90: lcPct(90),
        lc_pct_95: lcPct(95),
        lc_pct_100: lcPct(100),
        population_total: popTotal,
        nightlight_mean: nightlightMean,
        nightlight_p90: p90,
    });
});

// print('Asia grids:', results.size());  // Skip .size() to avoid memory limit on large regions
Map.centerObject(region, 3);
Export.table.toDrive({
    collection: results,
    description: 'asia_grid',
    folder: 'geo_sonification',
    fileNamePrefix: 'asia_grid',
    fileFormat: 'CSV',
    selectors: [
        'grid_id',
        'lon',
        'lat',
        'landcover_class',
        'lc_pct_10',
        'lc_pct_20',
        'lc_pct_30',
        'lc_pct_40',
        'lc_pct_50',
        'lc_pct_60',
        'lc_pct_70',
        'lc_pct_80',
        'lc_pct_90',
        'lc_pct_95',
        'lc_pct_100',
        'forest_pct',
        'forest_area_km2',
        'population_total',
        'land_area_km2',
        'nightlight_mean',
        'nightlight_p90',
        'cell_area_km2',
        'land_fraction',
    ],
});
