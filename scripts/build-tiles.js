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
//
// `fid` is a deterministic integer ID assigned per cell (sorted by
// grid_id) — it is consumed by tippecanoe's --use-attribute-for-id flag
// and promoted into MVT feature.id. The frontend's hover-glow runtime
// uses these IDs to address `setFeatureState` calls.
//
// HISTORICAL: do NOT pair `--use-attribute-for-id=fid` with `promoteId`
// on the source declaration in frontend/map.js. tippecanoe consumes the
// attribute at encode time, leaving the property absent in the tile;
// promoteId then looks for an attribute that no longer exists and
// returns null, breaking setFeatureState entirely. Build-time only.
//
// `border_dist_km` is the minimum great-circle distance (km) from the
// cell centroid to the nearest country border or coastline, capped at
// 300 km. Computed offline by scripts/compute-border-distance.js.
const TILE_PROPERTIES = [
    'fid',
    'grid_id',
    'border_dist_km',
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

/**
 * Sort cells by grid_id and assign a stable integer `fid` = sorted index + 1.
 * The sort is deterministic across rebuilds, so the same lon_lat string
 * always maps to the same fid. Mutates the cells in place.
 *
 * Fids start at 1: tippecanoe / MVT treat ID=0 as "no ID assigned" and
 * warn "Can't represent too-large feature ID 0" while dropping the value.
 */
function assignFids(grids) {
    grids.sort((a, b) => (a.grid_id < b.grid_id ? -1 : a.grid_id > b.grid_id ? 1 : 0));
    for (let i = 0; i < grids.length; i++) {
        grids[i].fid = i + 1;
    }
}

/**
 * Join the per-cell border distance from the cache produced by
 * scripts/compute-border-distance.js. Cells without an entry get
 * MAX_BORDER_DIST_KM (the same cap the compute script uses), so paint
 * expressions never see undefined.
 */
function joinBorderDistance(grids, distancesByGridId) {
    const MAX_BORDER_DIST_KM = 300;
    let missing = 0;
    for (const g of grids) {
        const d = distancesByGridId[g.grid_id];
        if (d === undefined) {
            g.border_dist_km = MAX_BORDER_DIST_KM;
            missing++;
        } else {
            g.border_dist_km = d;
        }
    }
    if (missing > 0) {
        console.warn(
            `[build-tiles] ${missing} cells missing border distance, defaulted to ${MAX_BORDER_DIST_KM}`
        );
    }
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

    // 1b. Load border distances (must be precomputed —
    //     run: node scripts/compute-border-distance.js)
    const BORDER_CACHE = path.join(__dirname, '../data/cache/border-distance.v1.json');
    if (!fs.existsSync(BORDER_CACHE)) {
        throw new Error(
            `Missing border distance cache at ${BORDER_CACHE}. ` +
                `Run: node scripts/compute-border-distance.js`
        );
    }
    const borderCache = JSON.parse(fs.readFileSync(BORDER_CACHE, 'utf8'));
    if (borderCache.gridSize !== GRID_SIZE) {
        throw new Error(
            `Border cache gridSize ${borderCache.gridSize} != current ${GRID_SIZE}. ` +
                `Re-run: node scripts/compute-border-distance.js --force`
        );
    }
    joinBorderDistance(allGrids, borderCache.distancesByGridId);
    assignFids(allGrids);
    console.log(`[build-tiles] Joined border distances + assigned ${allGrids.length} fids`);

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
    //
    // --use-attribute-for-id=fid promotes the `fid` property into the MVT
    // feature.id field at encode time. The frontend then addresses
    // setFeatureState by these IDs.
    //
    // HISTORICAL: do NOT also set `promoteId` on the addSource call in
    // frontend/map.js — see TILE_PROPERTIES comment above.
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
        '--use-attribute-for-id=fid',
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

    // 7. Emit the frontend grid_index.bin sidecar from the same allGrids
    //    array (already sorted + fid-assigned + border-distance-joined).
    const { encodeGridIndex } = require('./build-grid-index');
    const indexBuf = encodeGridIndex(allGrids, GRID_SIZE);
    const INDEX_OUTPUT = path.join(TILES_DIR, 'grid_index.bin');
    fs.writeFileSync(INDEX_OUTPUT, indexBuf);
    console.log(
        `[build-tiles] Wrote grid_index.bin (${(indexBuf.length / 1e6).toFixed(2)}MB, ${
            allGrids.length
        } cells)`
    );

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
    assignFids,
    joinBorderDistance,
    TILE_PROPERTIES,
};
