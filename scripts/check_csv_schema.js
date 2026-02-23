#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

'use strict';

const fs = require('fs').promises;
const path = require('path');
const { parse: parseCSV } = require(
    path.join(__dirname, '..', 'server', 'node_modules', 'csv-parse', 'dist', 'cjs', 'sync.cjs')
);
const { LC_PCT_COLUMNS } = require(path.join(__dirname, '..', 'server', 'landcover.js'));
const GRID_SIZE_EPS = 1e-6;

// Keep this in sync with server/data-loader.js
const GRID_FILES = [
    'south_america_grid.csv',
    'africa_grid.csv',
    'asia_grid.csv',
    'north_america_grid.csv',
    'europe_grid.csv',
    'oceania_grid.csv',
];

const REQUIRED_CSV_COLUMNS = [
    'grid_id',
    'lon',
    'lat',
    'landcover_class',
    'forest_pct',
    'forest_area_km2',
    'population_total',
    'land_area_km2',
    'nightlight_mean',
    'nightlight_p90',
    'cell_area_km2',
    'land_fraction',
];

function parseGridSize() {
    const raw = process.env.GRID_SIZE;
    if (raw === undefined || raw === '') return 0.5;
    const val = Number.parseFloat(raw);
    if (!Number.isFinite(val) || val <= 0) {
        throw new Error(`Invalid GRID_SIZE "${raw}". Must be a positive number.`);
    }
    const lonBuckets = 360 / val;
    const latBuckets = 180 / val;
    if (!Number.isInteger(lonBuckets) || !Number.isInteger(latBuckets)) {
        throw new Error(
            `GRID_SIZE=${val} does not divide evenly into 360 (lon buckets=${lonBuckets}) or 180 (lat buckets=${latBuckets}).`
        );
    }
    return val;
}

const GRID_SIZE = (() => {
    try {
        return parseGridSize();
    } catch (err) {
        console.error('[ERROR]', err && err.message ? err.message : err);
        process.exit(1);
    }
})();

function nearlyEqual(a, b) {
    return Math.abs(a - b) <= GRID_SIZE_EPS;
}

function inferAxisStep(values) {
    const sorted = Array.from(values).sort((a, b) => a - b);
    let minDiff = Infinity;
    for (let i = 1; i < sorted.length; i++) {
        const diff = sorted[i] - sorted[i - 1];
        if (diff > GRID_SIZE_EPS && diff < minDiff) {
            minDiff = diff;
        }
    }
    return Number.isFinite(minDiff) ? minDiff : null;
}

function assertGridResolution(csvContent, sourceLabel) {
    const records = parseCSV(csvContent, {
        columns: true,
        skip_empty_lines: true,
        relax_quotes: true,
        bom: true,
        trim: true,
    });

    const lonSet = new Set();
    const latSet = new Set();
    for (const record of records) {
        const lon = Number.parseFloat(String(record.lon ?? '').trim());
        const lat = Number.parseFloat(String(record.lat ?? '').trim());
        if (Number.isFinite(lon)) lonSet.add(Number(lon.toFixed(6)));
        if (Number.isFinite(lat)) latSet.add(Number(lat.toFixed(6)));
    }

    const lonStep = inferAxisStep(lonSet);
    const latStep = inferAxisStep(latSet);
    if (lonStep == null || latStep == null) {
        throw new Error(`[${sourceLabel}] Could not infer lon/lat resolution from CSV rows.`);
    }
    if (!nearlyEqual(lonStep, latStep)) {
        throw new Error(
            `[${sourceLabel}] Inconsistent resolution: lon step=${lonStep}, lat step=${latStep}.`
        );
    }

    const inferredGridSize = Number(((lonStep + latStep) / 2).toFixed(6));
    if (!nearlyEqual(inferredGridSize, GRID_SIZE)) {
        throw new Error(
            `[${sourceLabel}] GRID_SIZE mismatch: expected ${GRID_SIZE}, inferred ${inferredGridSize} (lon=${lonStep}, lat=${latStep}).`
        );
    }
    return { lonStep, latStep, inferredGridSize };
}

/** Parse the first CSV row. Returns { raw, filtered } where raw may include empty strings. */
function getCsvHeader(csvContent) {
    const headerRecords = parseCSV(csvContent, {
        columns: false,
        to_line: 1,
        skip_empty_lines: true,
        relax_quotes: true,
        bom: true,
        trim: true,
    });
    const raw =
        Array.isArray(headerRecords) && headerRecords.length > 0
            ? headerRecords[0].map((h) => String(h).trim())
            : [];
    return { raw, filtered: raw.filter(Boolean) };
}

async function findCsvFile(filename) {
    const filePath = path.join(__dirname, '..', 'data', 'raw', filename);
    try {
        await fs.access(filePath);
        return filePath;
    } catch {
        return null;
    }
}

function hasLegacyLossColumns(headerSet) {
    return (
        headerSet.has('loss_rate') ||
        headerSet.has('loss_km2') ||
        headerSet.has('loss_density') ||
        headerSet.has('forest2000_km2')
    );
}

async function main() {
    const expectedHeaderLine = REQUIRED_CSV_COLUMNS.join(',');
    let ok = true;

    for (const filename of GRID_FILES) {
        const filePath = await findCsvFile(filename);
        if (!filePath) {
            ok = false;
            console.error(`[MISSING] ${filename}: not found in data/raw/`);
            continue;
        }

        const csv = await fs.readFile(filePath, 'utf8');
        const { raw: headerRaw, filtered: header } = getCsvHeader(csv);
        const headerSet = new Set(header);
        const missing = REQUIRED_CSV_COLUMNS.filter((col) => !headerSet.has(col));

        const emptyCount = headerRaw.length - header.length;
        if (emptyCount > 0) {
            const emptyIndices = headerRaw
                .map((h, i) => (h === '' ? i + 1 : null))
                .filter((i) => i != null);
            console.warn(
                `[WARN] ${filename}: ${emptyCount} empty column name(s) at position(s) ${emptyIndices.join(', ')}`
            );
        }
        if (header.length !== new Set(header).size) {
            const seen = new Set();
            const dups = header.filter((h) => (seen.has(h) ? true : (seen.add(h), false)));
            console.warn(
                `[WARN] ${filename}: duplicate column name(s): ${[...new Set(dups)].join(', ')}`
            );
        }

        if (missing.length === 0) {
            const headerLine = header.join(',');
            if (headerLine === expectedHeaderLine) {
                console.log(`[OK] ${filename}`);
            } else {
                console.warn(`[WARN] ${filename}: columns OK but order differs`);
                console.warn(`  expected: ${expectedHeaderLine}`);
                console.warn(`  actual:   ${headerLine}`);
            }

            // lc_pct_* "all or nothing" check
            const lcPctPresent = LC_PCT_COLUMNS.filter((col) => headerSet.has(col));
            if (lcPctPresent.length === LC_PCT_COLUMNS.length) {
                console.log(
                    `  [INFO] V2 continuous landcover columns detected (${LC_PCT_COLUMNS.length} lc_pct_* columns)`
                );
            } else if (lcPctPresent.length === 0) {
                console.warn(
                    `  [WARN] No lc_pct_* columns — will use discrete landcover_class fallback`
                );
            } else {
                ok = false;
                console.error(
                    `  [FAIL] Incomplete lc_pct_* columns (found ${lcPctPresent.length}/${LC_PCT_COLUMNS.length})`
                );
                console.error(
                    `    missing: ${LC_PCT_COLUMNS.filter((c) => !headerSet.has(c)).join(', ')}`
                );
            }

            try {
                const res = assertGridResolution(csv, filename);
                console.log(
                    `  [INFO] Resolution OK: ${res.inferredGridSize}° (lon step=${res.lonStep}, lat step=${res.latStep})`
                );
            } catch (err) {
                ok = false;
                console.error(`  [FAIL] ${err.message}`);
            }

            // Validate grid_id format: should be "lon_lat" matching the actual lon/lat columns
            try {
                const sampleRecords = parseCSV(csv, {
                    columns: true,
                    skip_empty_lines: true,
                    relax_quotes: true,
                    bom: true,
                    trim: true,
                    to_line: 11,
                });
                let gridIdIssues = 0;
                for (const rec of sampleRecords) {
                    const gridId = String(rec.grid_id || '').trim();
                    if (!gridId.match(/^-?\d+(\.\d+)?_-?\d+(\.\d+)?$/)) {
                        gridIdIssues++;
                        continue;
                    }
                    const [idLon, idLat] = gridId.split('_').map(Number);
                    const recLon = Number(rec.lon);
                    const recLat = Number(rec.lat);
                    if (Math.abs(idLon - recLon) > 0.01 || Math.abs(idLat - recLat) > 0.01) {
                        gridIdIssues++;
                    }
                }
                if (gridIdIssues > 0) {
                    console.warn(
                        `  [WARN] ${gridIdIssues} rows have mismatched or malformed grid_id (checked first ${sampleRecords.length} rows)`
                    );
                }
            } catch (gridIdErr) {
                console.warn(`  [WARN] Could not validate grid_id: ${gridIdErr.message}`);
            }

            continue;
        }

        ok = false;
        const legacyHint = hasLegacyLossColumns(headerSet)
            ? ' (legacy loss_* / forest2000_* detected)'
            : '';
        console.error(`[FAIL] ${filename}${legacyHint}`);
        console.error(`  missing: ${missing.join(', ')}`);
        console.error(`  header:  ${header.join(',') || '(empty)'}`);
        console.error(`  expected:${expectedHeaderLine}`);
    }

    process.exitCode = ok ? 0 : 1;
}

main().catch((err) => {
    console.error('[ERROR]', err && err.stack ? err.stack : err);
    process.exit(1);
});
