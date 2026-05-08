#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Download Natural Earth 1:10m coastline + country boundary GeoJSONs into
 * `data/sources/natural-earth/`. Idempotent — skips files already present
 * with a non-zero size.
 *
 * These two files feed `scripts/compute-border-distance.js`, which bakes a
 * `border_dist_km` property into each grid cell. The vendor copies used here
 * are from the upstream `nvkelso/natural-earth-vector` repo (the same files
 * that ship in the official Natural Earth shapefile bundle, just pre-converted
 * to GeoJSON so we don't need GDAL/ogr2ogr in the build chain).
 *
 * Usage:
 *   node scripts/download-natural-earth.js
 *   node scripts/download-natural-earth.js --force   # re-download even if present
 *
 * Requires: Node 18+ (uses global fetch).
 */

const fs = require('fs');
const path = require('path');

const DEST_DIR = path.join(__dirname, '../data/sources/natural-earth');

const FILES = [
    {
        name: 'ne_10m_coastline.geojson',
        url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_coastline.geojson',
        minBytes: 5000000, // sanity: real file is ~10 MB
    },
    {
        name: 'ne_10m_admin_0_boundary_lines_land.geojson',
        url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_boundary_lines_land.geojson',
        minBytes: 1000000, // sanity: real file is ~2 MB
    },
];

function isPresent(filePath, minBytes) {
    try {
        const stat = fs.statSync(filePath);
        return stat.isFile() && stat.size >= minBytes;
    } catch {
        return false;
    }
}

async function downloadOne(file, force) {
    const dest = path.join(DEST_DIR, file.name);
    if (!force && isPresent(dest, file.minBytes)) {
        console.log(`[download-ne] skip ${file.name} (present, ${fs.statSync(dest).size} bytes)`);
        return;
    }

    console.log(`[download-ne] fetching ${file.url}`);
    const res = await fetch(file.url);
    if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${file.url}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < file.minBytes) {
        throw new Error(
            `Downloaded ${file.name} is only ${buf.length} bytes — expected at least ${file.minBytes}. Aborting.`
        );
    }
    fs.writeFileSync(dest, buf);
    console.log(`[download-ne] wrote ${dest} (${buf.length} bytes)`);
}

async function main() {
    const force = process.argv.includes('--force');
    fs.mkdirSync(DEST_DIR, { recursive: true });

    for (const file of FILES) {
        await downloadOne(file, force);
    }
    console.log('[download-ne] done');
}

if (require.main === module) {
    main().catch((err) => {
        console.error('[download-ne] FATAL:', err.message);
        process.exit(1);
    });
}

module.exports = { FILES, DEST_DIR };
