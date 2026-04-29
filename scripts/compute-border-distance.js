#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Compute per-grid-cell distance to the nearest country border or coastline.
 *
 * Inputs:
 *   - data/sources/natural-earth/ne_10m_coastline.geojson
 *   - data/sources/natural-earth/ne_10m_admin_0_boundary_lines_land.geojson
 *   - All loaded grid cells (via server/data-loader)
 *
 * Output:
 *   - data/cache/border-distance.v1.json
 *     {
 *       schemaVersion: 1,
 *       sourceFingerprint: <hash of NE files mtime+size>,
 *       gridSize: GRID_SIZE,
 *       distancesByGridId: { [grid_id]: km, ... }
 *     }
 *
 * Algorithm: hand-rolled bbox-prefiltered point-to-segment scan.
 *   1. Flatten both NE GeoJSONs into a packed Float32Array of segments.
 *   2. Build a 1° bbox-grid index of segment indices, antimeridian-aware.
 *   3. For each grid cell, query a 3-cell ring around the centroid (~7x7 = 49
 *      cells, covers up to ~330 km) and take the min distance to any
 *      candidate segment, in equirectangular meters with the cell as origin.
 *   4. Cap at MAX_BORDER_DIST_KM (300) when no segment is found in range.
 *
 * Cache invalidation: NE file fingerprints (path, mtime, size) + GRID_SIZE.
 *
 * Usage:
 *   node scripts/compute-border-distance.js
 *   node scripts/compute-border-distance.js --force      # ignore cache
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { GRID_SIZE } = require('../server/config');

const NE_DIR = path.join(__dirname, '../data/sources/natural-earth');
const NE_FILES = [
    path.join(NE_DIR, 'ne_10m_coastline.geojson'),
    path.join(NE_DIR, 'ne_10m_admin_0_boundary_lines_land.geojson'),
];
const CACHE_PATH = path.join(__dirname, '../data/cache/border-distance.v1.json');

const SCHEMA_VERSION = 1;
const MAX_BORDER_DIST_KM = 300; // cap for cells with no segment in query ring
const QUERY_RING = 3; // how many 1° cells out to query around centroid (7x7=49 cells)
const EARTH_RADIUS_KM = 6371;
const DEG_TO_RAD = Math.PI / 180;

// ============ Distance math ============

/**
 * Distance from point P (plng, plat) to the line segment A→B in km, using
 * an equirectangular projection centered on P. Antimeridian-aware: lng
 * differences are normalized into [-180, 180] before scaling.
 *
 * Inside the 250 km radius we care about, equirectangular error vs full
 * geodesic is < 0.5% at all latitudes used (and dwarfed by GRID_SIZE
 * quantization).
 */
function pointToSegmentDistKm(plng, plat, alng, alat, blng, blat) {
    const cosLat0 = Math.cos(plat * DEG_TO_RAD);
    const factor = DEG_TO_RAD * EARTH_RADIUS_KM;

    let dLonA = alng - plng;
    let dLonB = blng - plng;
    if (dLonA > 180) dLonA -= 360;
    else if (dLonA < -180) dLonA += 360;
    if (dLonB > 180) dLonB -= 360;
    else if (dLonB < -180) dLonB += 360;

    const ax = dLonA * factor * cosLat0;
    const ay = (alat - plat) * factor;
    const bx = dLonB * factor * cosLat0;
    const by = (blat - plat) * factor;

    // Distance from (0,0) to segment (ax,ay)→(bx,by).
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-9) {
        return Math.sqrt(ax * ax + ay * ay);
    }
    let t = -(ax * dx + ay * dy) / lenSq;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    return Math.sqrt(cx * cx + cy * cy);
}

// ============ GeoJSON loading ============

/**
 * Walk a GeoJSON FeatureCollection and emit every line segment as
 * [lonA, latA, lonB, latB] tuples. Handles LineString, MultiLineString.
 * Antimeridian normalization happens later at index-build time.
 */
function* iterSegments(geojson) {
    if (!geojson || !Array.isArray(geojson.features)) return;
    for (const f of geojson.features) {
        const g = f.geometry;
        if (!g) continue;
        if (g.type === 'LineString') {
            yield* lineToSegments(g.coordinates);
        } else if (g.type === 'MultiLineString') {
            for (const line of g.coordinates) {
                yield* lineToSegments(line);
            }
        }
        // Polygons / MultiPolygons not expected in NE coastline + boundary files.
    }
}

function* lineToSegments(coords) {
    for (let i = 0; i < coords.length - 1; i++) {
        const [alng, alat] = coords[i];
        const [blng, blat] = coords[i + 1];
        yield [alng, alat, blng, blat];
    }
}

function loadAllSegments() {
    const segs = [];
    for (const file of NE_FILES) {
        if (!fs.existsSync(file)) {
            throw new Error(`Missing ${file}. Run: node scripts/download-natural-earth.js`);
        }
        const json = JSON.parse(fs.readFileSync(file, 'utf8'));
        let count = 0;
        for (const seg of iterSegments(json)) {
            segs.push(seg);
            count++;
        }
        console.log(`[border-dist] ${path.basename(file)}: ${count} segments`);
    }
    // Pack into Float32Array for cache locality during the inner loop.
    const arr = new Float32Array(segs.length * 4);
    for (let i = 0; i < segs.length; i++) {
        arr[4 * i] = segs[i][0];
        arr[4 * i + 1] = segs[i][1];
        arr[4 * i + 2] = segs[i][2];
        arr[4 * i + 3] = segs[i][3];
    }
    return arr;
}

// ============ 1° bbox-grid spatial index ============

/**
 * Build a Map<"ix_iy", number[]> of segment indices, where each segment is
 * inserted into every 1° cell its bbox overlaps. Antimeridian: when a
 * segment's |Δlon| > 180, we shift one endpoint by ±360 so the bbox is
 * contiguous in extended coords, then wrap each integer ix into the
 * canonical [-180, 179] range when inserting.
 */
function buildSegmentIndex(segArr) {
    const index = new Map();
    const n = segArr.length / 4;
    for (let i = 0; i < n; i++) {
        let alng = segArr[4 * i];
        const alat = segArr[4 * i + 1];
        let blng = segArr[4 * i + 2];
        const blat = segArr[4 * i + 3];

        // Antimeridian: normalize so |bLng - aLng| ≤ 180.
        if (blng - alng > 180) blng -= 360;
        else if (alng - blng > 180) blng += 360;

        const ixMin = Math.floor(Math.min(alng, blng));
        const ixMax = Math.floor(Math.max(alng, blng));
        const iyMin = Math.floor(Math.min(alat, blat));
        const iyMax = Math.floor(Math.max(alat, blat));

        for (let ix = ixMin; ix <= ixMax; ix++) {
            // Wrap ix into canonical [-180, 179].
            let cIx = ix;
            while (cIx < -180) cIx += 360;
            while (cIx > 179) cIx -= 360;
            for (let iy = iyMin; iy <= iyMax; iy++) {
                const cIy = Math.max(-90, Math.min(89, iy));
                const key = `${cIx}_${cIy}`;
                let arr = index.get(key);
                if (!arr) {
                    arr = [];
                    index.set(key, arr);
                }
                arr.push(i);
            }
        }
    }
    return index;
}

// ============ Per-cell distance query ============

/**
 * Find the minimum distance from grid cell centroid (plng, plat) to any
 * indexed segment within QUERY_RING cells in each direction. Returns a
 * value in km, capped at MAX_BORDER_DIST_KM if nothing found in range.
 */
function queryDistance(plng, plat, segArr, index) {
    const ix0 = Math.floor(plng);
    const iy0 = Math.floor(plat);

    let best = MAX_BORDER_DIST_KM;
    // Use a Set to dedupe: a segment can appear in multiple bbox cells.
    const seen = new Set();

    for (let dx = -QUERY_RING; dx <= QUERY_RING; dx++) {
        for (let dy = -QUERY_RING; dy <= QUERY_RING; dy++) {
            let ix = ix0 + dx;
            const iy = Math.max(-90, Math.min(89, iy0 + dy));
            while (ix < -180) ix += 360;
            while (ix > 179) ix -= 360;
            const key = `${ix}_${iy}`;
            const candidates = index.get(key);
            if (!candidates) continue;
            for (const segIdx of candidates) {
                if (seen.has(segIdx)) continue;
                seen.add(segIdx);
                const d = pointToSegmentDistKm(
                    plng,
                    plat,
                    segArr[4 * segIdx],
                    segArr[4 * segIdx + 1],
                    segArr[4 * segIdx + 2],
                    segArr[4 * segIdx + 3]
                );
                if (d < best) best = d;
            }
        }
    }
    return best;
}

// ============ Cache fingerprint ============

function fingerprintSourceFiles() {
    const h = crypto.createHash('sha1');
    for (const file of NE_FILES) {
        const stat = fs.statSync(file);
        h.update(`${path.basename(file)}\t${stat.size}\t${stat.mtimeMs}\n`);
    }
    return h.digest('hex');
}

// ============ Main pipeline ============

async function main() {
    const force = process.argv.includes('--force');

    const fingerprint = fingerprintSourceFiles();

    // Cache hit?
    if (!force && fs.existsSync(CACHE_PATH)) {
        try {
            const cached = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
            if (
                cached.schemaVersion === SCHEMA_VERSION &&
                cached.sourceFingerprint === fingerprint &&
                cached.gridSize === GRID_SIZE
            ) {
                console.log(
                    `[border-dist] cache hit (${CACHE_PATH}, ${
                        Object.keys(cached.distancesByGridId).length
                    } cells)`
                );
                return;
            }
            console.log('[border-dist] cache miss (fingerprint or schema changed)');
        } catch (err) {
            console.warn('[border-dist] cache unreadable, recomputing:', err.message);
        }
    }

    // 1. Load + flatten segments.
    const t0 = Date.now();
    console.log('[border-dist] loading Natural Earth segments...');
    const segArr = loadAllSegments();
    const segCount = segArr.length / 4;
    console.log(
        `[border-dist] ${segCount} segments loaded in ${((Date.now() - t0) / 1000).toFixed(1)}s`
    );

    // 2. Build index.
    const t1 = Date.now();
    const index = buildSegmentIndex(segArr);
    console.log(
        `[border-dist] indexed into ${index.size} 1° cells in ${((Date.now() - t1) / 1000).toFixed(
            1
        )}s`
    );

    // 3. Load grid data.
    const t2 = Date.now();
    const { loadGridData } = require('../server/data-loader');
    const spatial = require('../server/spatial');
    const { gridData, normalizeParams } = await loadGridData();
    spatial.init(gridData, normalizeParams);
    const allGrids = spatial.getGridData();
    console.log(
        `[border-dist] ${allGrids.length} grid cells loaded in ${((Date.now() - t2) / 1000).toFixed(
            1
        )}s`
    );

    // 4. Compute per-cell distance.
    const t3 = Date.now();
    const half = GRID_SIZE / 2;
    const distancesByGridId = {};
    let progressLast = 0;
    for (let i = 0; i < allGrids.length; i++) {
        const g = allGrids[i];
        const plng = g.lon + half;
        const plat = g.lat + half;
        const d = queryDistance(plng, plat, segArr, index);
        // Round to 0.1 km — dwarfs error budget, halves JSON size.
        distancesByGridId[g.grid_id] = Math.round(d * 10) / 10;

        if (i - progressLast >= 5000) {
            progressLast = i;
            console.log(
                `[border-dist]   ${i}/${allGrids.length} (${((i / allGrids.length) * 100).toFixed(
                    1
                )}%)`
            );
        }
    }
    console.log(
        `[border-dist] computed ${allGrids.length} distances in ${(
            (Date.now() - t3) /
            1000
        ).toFixed(1)}s`
    );

    // 5. Persist.
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
    const out = {
        schemaVersion: SCHEMA_VERSION,
        sourceFingerprint: fingerprint,
        gridSize: GRID_SIZE,
        distancesByGridId,
    };
    fs.writeFileSync(CACHE_PATH, JSON.stringify(out));
    const sz = fs.statSync(CACHE_PATH).size;
    console.log(
        `[border-dist] wrote ${CACHE_PATH} (${(sz / 1e6).toFixed(2)} MB, fingerprint ${fingerprint.slice(0, 8)})`
    );
    console.log(`[border-dist] total: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

if (require.main === module) {
    main().catch((err) => {
        console.error('[border-dist] FATAL:', err);
        process.exit(1);
    });
}

module.exports = {
    pointToSegmentDistKm,
    buildSegmentIndex,
    queryDistance,
    iterSegments,
    MAX_BORDER_DIST_KM,
    QUERY_RING,
};
