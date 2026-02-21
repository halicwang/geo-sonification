#!/usr/bin/env node
/**
 * Build PMTiles from grid data for the map overlay.
 *
 * Generates a single .pmtiles file with 0.5° base cells across all zoom levels (0-12).
 *
 * Usage:
 *   node scripts/build-tiles.js
 *
 * Requires: tippecanoe (brew install tippecanoe)
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// Reuse server modules for data loading
const { loadGridData } = require('../server/data-loader');
const spatial = require('../server/spatial');

const TILES_DIR = path.join(__dirname, '../data/tiles');
const SRC_DIR = path.join(TILES_DIR, '_src');
const OUTPUT = path.join(TILES_DIR, 'grids.pmtiles');
const GEOJSON_PATH = path.join(SRC_DIR, 'all.geojson');

// Only these properties go into tiles (rendering only).
// Server-only fields (population, nightlight, forest, etc.) are stripped.
const TILE_PROPERTIES = [
    'grid_id',
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
];

function stripProps(grid) {
    const out = {};
    for (const key of TILE_PROPERTIES) {
        if (grid[key] !== undefined) out[key] = grid[key];
    }
    return out;
}

function gridToFeature(grid, gridSize, minzoom, maxzoom) {
    return {
        type: 'Feature',
        tippecanoe: { minzoom, maxzoom },
        properties: stripProps(grid),
        geometry: {
            type: 'Polygon',
            coordinates: [
                [
                    [grid.lon, grid.lat],
                    [grid.lon + gridSize, grid.lat],
                    [grid.lon + gridSize, grid.lat + gridSize],
                    [grid.lon, grid.lat + gridSize],
                    [grid.lon, grid.lat],
                ],
            ],
        },
    };
}

async function main() {
    // 1. Load grid data
    console.log('[build-tiles] Loading grid data...');
    const { gridData, normalizeParams } = await loadGridData();
    spatial.init(gridData, normalizeParams);
    const allGrids = spatial.getGridData();
    console.log(`[build-tiles] Loaded ${allGrids.length} base cells (0.5°)`);

    // 2. Build GeoJSON — all cells at full 0.5° resolution across all zoom levels
    const features = allGrids.map((g) => gridToFeature(g, 0.5, 0, 12));

    const geojson = { type: 'FeatureCollection', features };
    console.log(`[build-tiles] ${features.length} features (0.5° base cells, zoom 0-12)`);

    // 3. Write temporary GeoJSON
    fs.mkdirSync(SRC_DIR, { recursive: true });
    const json = JSON.stringify(geojson);
    fs.writeFileSync(GEOJSON_PATH, json);
    console.log(
        `[build-tiles] Wrote ${(json.length / 1e6).toFixed(1)}MB GeoJSON → ${GEOJSON_PATH}`
    );

    // 4. Run tippecanoe
    const tippecanoeArgs = [
        '-o',
        OUTPUT,
        '--force',
        '--layer=grids',
        '--minimum-zoom=0',
        '--maximum-zoom=12',
        '--no-feature-limit',
        '--no-tile-size-limit',
        '--no-tile-compression',
        GEOJSON_PATH,
    ];
    console.log(`[build-tiles] Running: tippecanoe ${tippecanoeArgs.join(' ')}`);
    const t1 = Date.now();
    execFileSync('tippecanoe', tippecanoeArgs, { stdio: 'inherit' });
    console.log(`[build-tiles] tippecanoe finished in ${((Date.now() - t1) / 1000).toFixed(1)}s`);

    // 5. Report output size
    const stat = fs.statSync(OUTPUT);
    console.log(`[build-tiles] Output: ${OUTPUT} (${(stat.size / 1e6).toFixed(1)}MB)`);

    // 6. Clean up temp files
    fs.rmSync(SRC_DIR, { recursive: true, force: true });
    console.log('[build-tiles] Cleaned up temp files');
    console.log('[build-tiles] Done!');
}

main().catch((err) => {
    console.error('[build-tiles] FATAL:', err);
    process.exit(1);
});
