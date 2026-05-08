#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Emit a packed binary sidecar `data/tiles/grid_index.bin` consumed by the
 * frontend hover-glow runtime. Contains one entry per grid cell:
 *
 *   { fid: u32, lon: f32, lat: f32, borderDistKm: f32 }
 *
 * Layout:
 *
 *   bytes  0..7    magic                "GSIDX001" (ASCII, 8 bytes)
 *   bytes  8..11   count                u32 little-endian
 *   bytes 12..15   gridSize             f32 little-endian (degrees)
 *   bytes 16..end  body                 count × 16 bytes
 *                                       [fid:u32, lon:f32, lat:f32, dist:f32]
 *
 * lon/lat are the cell *centroid* (origin + GRID_SIZE/2), matching the
 * geometry coordinates emitted into PMTiles by build-tiles.js. fid is the
 * stable integer ID assigned by build-tiles.js (sorted index + 1, starting
 * at 1 to avoid tippecanoe's "ID 0" warning).
 *
 * Frontend parses with `new DataView(buf)` for the header + a single
 * `Float32Array` view over the body's 4-tuple stride. Total size =
 * 16 + 16 × N bytes; for N≈67,331 that's ~1.05 MB.
 *
 * Usage:
 *   node scripts/build-grid-index.js
 *
 * Prereq: node scripts/compute-border-distance.js
 */

const fs = require('fs');
const path = require('path');
const { GRID_SIZE } = require('../server/config');

const TILES_DIR = path.join(__dirname, '../data/tiles');
const OUTPUT = path.join(TILES_DIR, 'grid_index.bin');
const BORDER_CACHE = path.join(__dirname, '../data/cache/border-distance.v1.json');

const MAGIC = 'GSIDX001'; // 8 ASCII bytes
const HEADER_BYTES = 16; // magic(8) + count(4) + gridSize(4)
const ENTRY_BYTES = 16; // fid(4) + lon(4) + lat(4) + dist(4)
const MAX_BORDER_DIST_KM = 300;

/**
 * Encode the sorted grid array into the binary sidecar layout.
 * Returns the Buffer ready to write.
 */
function encodeGridIndex(sortedGrids, gridSize) {
    const n = sortedGrids.length;
    const buf = Buffer.alloc(HEADER_BYTES + n * ENTRY_BYTES);
    buf.write(MAGIC, 0, 8, 'ascii');
    buf.writeUInt32LE(n, 8);
    buf.writeFloatLE(gridSize, 12);
    const half = gridSize / 2;
    let offset = HEADER_BYTES;
    for (let i = 0; i < n; i++) {
        const g = sortedGrids[i];
        buf.writeUInt32LE(g.fid, offset);
        buf.writeFloatLE(g.lon + half, offset + 4);
        buf.writeFloatLE(g.lat + half, offset + 8);
        buf.writeFloatLE(g.border_dist_km, offset + 12);
        offset += ENTRY_BYTES;
    }
    return buf;
}

/**
 * Decode header + body from a Buffer / ArrayBuffer. Used by tests.
 * Returns { count, gridSize, entries: Float32Array view of length 4*N }
 * where entry i is [fid, lon, lat, distKm] (fid bit-cast to f32 — use
 * `new Uint32Array(buf, headerStart, n*4)` for integer-correct fid access).
 */
function decodeGridIndex(buffer) {
    const view = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    const magic = view.toString('ascii', 0, 8);
    if (magic !== MAGIC) {
        throw new Error(`Bad magic: expected ${MAGIC}, got ${JSON.stringify(magic)}`);
    }
    const count = view.readUInt32LE(8);
    const gridSize = view.readFloatLE(12);
    if (view.length !== HEADER_BYTES + count * ENTRY_BYTES) {
        throw new Error(
            `Bad length: expected ${HEADER_BYTES + count * ENTRY_BYTES} bytes, got ${view.length}`
        );
    }
    return { count, gridSize, magic, headerBytes: HEADER_BYTES, entryBytes: ENTRY_BYTES };
}

async function main() {
    if (!fs.existsSync(BORDER_CACHE)) {
        throw new Error(`Missing ${BORDER_CACHE}. Run: node scripts/compute-border-distance.js`);
    }
    const borderCache = JSON.parse(fs.readFileSync(BORDER_CACHE, 'utf8'));
    if (borderCache.gridSize !== GRID_SIZE) {
        throw new Error(
            `Cache gridSize ${borderCache.gridSize} != current ${GRID_SIZE}. Re-run compute-border-distance.`
        );
    }

    const { loadGridData } = require('../server/data-loader');
    const spatial = require('../server/spatial');
    const { gridData, normalizeParams } = await loadGridData();
    spatial.init(gridData, normalizeParams);
    const allGrids = spatial.getGridData();

    // Mirror build-tiles.js: same deterministic sort + fid assignment + join.
    const { assignFids, joinBorderDistance } = require('./build-tiles');
    joinBorderDistance(allGrids, borderCache.distancesByGridId);
    assignFids(allGrids);

    // Sanity: every cell must have a finite distance (joinBorderDistance fills missing with the cap).
    for (const g of allGrids) {
        if (!Number.isFinite(g.border_dist_km)) {
            throw new Error(`Non-finite border_dist_km for ${g.grid_id}`);
        }
        if (g.border_dist_km > MAX_BORDER_DIST_KM + 0.001) {
            throw new Error(`border_dist_km ${g.border_dist_km} exceeds cap for ${g.grid_id}`);
        }
    }

    fs.mkdirSync(TILES_DIR, { recursive: true });
    const buf = encodeGridIndex(allGrids, GRID_SIZE);
    fs.writeFileSync(OUTPUT, buf);
    console.log(
        `[grid-index] wrote ${OUTPUT} (${(buf.length / 1e6).toFixed(2)} MB, ${
            allGrids.length
        } cells, gridSize=${GRID_SIZE})`
    );
}

if (require.main === module) {
    main().catch((err) => {
        console.error('[grid-index] FATAL:', err);
        process.exit(1);
    });
}

module.exports = {
    encodeGridIndex,
    decodeGridIndex,
    MAGIC,
    HEADER_BYTES,
    ENTRY_BYTES,
    MAX_BORDER_DIST_KM,
};
