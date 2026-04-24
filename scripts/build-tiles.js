#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Build PMTiles from grid data for the map overlay.
 *
 * Generates a single .pmtiles file with base cells (size from GRID_SIZE) across all zoom levels (0-12).
 *
 * Usage:
 *   node scripts/build-tiles.js
 *
 * Requires: tippecanoe (brew install tippecanoe)
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { GRID_SIZE } = require('../server/config');

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

/**
 * Emit every cell at every zoom level. The dot overlay relies on the
 * frontend's circle-radius paint curve to handle low-zoom density by
 * shrinking dots to sub-pixel size, which lets Mapbox's antialiasing
 * dissolve the regular 0.5° grid into a smooth gray wash instead of
 * beating against the screen pixel grid. No feature is dropped or
 * moved — every emitted dot sits at its exact original centroid.
 */
function gridToFeature(grid, gridSize, minzoom, maxzoom) {
    const half = gridSize / 2;
    return {
        type: 'Feature',
        tippecanoe: { minzoom, maxzoom },
        properties: stripProps(grid),
        geometry: {
            type: 'Point',
            coordinates: [grid.lon + half, grid.lat + half],
        },
    };
}

function buildTileFeatures(grids, gridSize = GRID_SIZE, minzoom = 0, maxzoom = 12) {
    return grids.map((grid) => gridToFeature(grid, gridSize, minzoom, maxzoom));
}

async function main() {
    // Reuse server modules for data loading
    const { loadGridData } = require('../server/data-loader');
    const spatial = require('../server/spatial');

    // 1. Load grid data
    console.log('[build-tiles] Loading grid data...');
    const { gridData, normalizeParams } = await loadGridData();
    spatial.init(gridData, normalizeParams);
    const allGrids = spatial.getGridData();
    console.log(`[build-tiles] Loaded ${allGrids.length} base cells (${GRID_SIZE}°)`);

    // 2. Build GeoJSON — all cells at configured base resolution across all zoom levels
    const features = buildTileFeatures(allGrids);

    const geojson = { type: 'FeatureCollection', features };
    console.log(`[build-tiles] ${features.length} features (${GRID_SIZE}° base cells, zoom 0-12)`);

    // 3. Write temporary GeoJSON
    fs.mkdirSync(SRC_DIR, { recursive: true });
    const json = JSON.stringify(geojson);
    fs.writeFileSync(GEOJSON_PATH, json);
    console.log(
        `[build-tiles] Wrote ${(json.length / 1e6).toFixed(1)}MB GeoJSON → ${GEOJSON_PATH}`
    );

    // 4. Run tippecanoe
    // LOD strategy: each feature carries its own `tippecanoe.minzoom`
    // computed from its integer grid position (see gridMinZoom above).
    // Tippecanoe just honors those minzooms — it doesn't need
    // cluster-distance / drop-rate / drop-densest tricks. The result:
    //   * Every emitted dot sits at its original 0.5° grid centroid —
    //     no averaging, no position drift.
    //   * Zooming in strictly reveals more cells at the same aligned
    //     positions (nested power-of-2 sub-grids).
    //   * Tile size stays bounded automatically because the low-zoom
    //     tiles carry O(1/zoom²) of the full 67k feature set.
    //
    // History: earlier attempts with `--base-zoom=N --drop-rate=R`
    // alone were no-ops (those flags need a `--drop-*-as-needed`
    // partner). `--cluster-distance=N` did drop features but merged
    // them into synthetic cluster centroids, shifting dot positions
    // off the 0.5° grid — visually read as "scrambled" to the user.
    // The per-feature minzoom approach avoids both pitfalls.
    const tippecanoeArgs = [
        '-o',
        OUTPUT,
        '--force',
        '--layer=grids',
        '--minimum-zoom=0',
        '--maximum-zoom=12',
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

if (require.main === module) {
    main().catch((err) => {
        console.error('[build-tiles] FATAL:', err);
        process.exit(1);
    });
}

module.exports = {
    stripProps,
    gridToFeature,
    buildTileFeatures,
};
