/**
 * Grid data loading: CSV parsing, schema validation, caching, deduplication.
 *
 * Load order:
 *   1. Try data/cache/all_grids.json cache (fast, ~17k grids in one JSON)
 *   2. Fall back to individual CSV files exported from Google Earth Engine
 *
 * CSVs are read from data/raw/ only.
 * After loading, grids are deduplicated by (lon, lat) and cached as JSON.
 */

const fs = require('fs').promises;
const path = require('path');
const { parse: parseCSV } = require('csv-parse/sync');
const { loadOrCalcNormalize, calcCsvFingerprint } = require('./normalize');
const { normalizeLandcoverClass, LC_PCT_COLUMNS, hasContinuousLcData } = require('./landcover');
const {
    DISABLE_CACHE,
    FORCE_REBUILD_CACHE,
    AGGREGATION_VERSION,
    AGGREGATION_CONFIG,
    GRID_SIZE,
} = require('./config');

const CACHE_SCHEMA_VERSION = 3; // bump when cache format changes (v3: nightlight -1 sentinel)
const GRID_SIZE_EPS = 1e-6;
const NIGHTLIGHT_NO_DATA = -1; // sentinel: no VIIRS data for this cell

// One CSV per continent, exported from GEE (0.5x0.5 degree grid cells)
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

/**
 * Ensure all required CSV files exist before any cache path is used.
 * This prevents stale cache from masking missing continent datasets.
 */
async function assertRequiredCsvFiles(csvDir, filenames) {
    const missing = [];
    const paths = [];
    for (const filename of filenames) {
        const filePath = path.join(csvDir, filename);
        try {
            await fs.access(filePath);
            paths.push(filePath);
        } catch {
            missing.push(filename);
        }
    }
    if (missing.length > 0) {
        const err = new Error(
            `[CSV] Missing required CSV files in data/raw/: ${missing.join(', ')}.\n` +
                'Please export/copy all required continent CSVs before starting the server.'
        );
        err.code = 'CSV_REQUIRED_FILES_MISSING';
        throw err;
    }
    return paths;
}

/** Extract the first row of a CSV as an array of column names. */
function getCsvHeader(csvContent) {
    const headerRecords = parseCSV(csvContent, {
        columns: false,
        to_line: 1,
        skip_empty_lines: true,
        relax_quotes: true,
        bom: true,
        trim: true,
    });
    const header = Array.isArray(headerRecords) && headerRecords.length > 0 ? headerRecords[0] : [];
    return header.map((h) => String(h).trim()).filter(Boolean);
}

/** Throw if the CSV header is missing required columns (detects stale exports). */
function assertCsvSchema(csvHeader, sourceLabel) {
    const headerSet = new Set(csvHeader);
    const missing = REQUIRED_CSV_COLUMNS.filter((col) => !headerSet.has(col));
    if (missing.length === 0) return;

    const hasLegacyLoss =
        headerSet.has('loss_rate') ||
        headerSet.has('loss_km2') ||
        headerSet.has('loss_density') ||
        headerSet.has('forest2000_km2');
    const legacyHint = hasLegacyLoss ? ' (detected legacy loss_* / forest2000_* columns)' : '';

    console.error('Please re-export new CSV and clear cache first');
    const err = new Error(
        `[CSV] Header does not match new schema: ${sourceLabel}${legacyHint}\n` +
            `Missing columns: ${missing.join(', ')}\n` +
            `Please re-export new CSV and clear cache: delete data/cache/, then restart.`
    );
    err.code = 'CSV_SCHEMA_MISMATCH';
    throw err;
}

/**
 * Parse a single CSV file into an array of grid objects.
 * Numeric fields are coerced to numbers. Empty values become 0, while invalid
 * non-empty values are treated as parse errors and cause load failure.
 * Also computes derived field: population_density = population_total / land_area_km2.
 */
function parseCSVFile(csvContent, sourceLabel) {
    const header = getCsvHeader(csvContent);
    if (header.length === 0) {
        throw new Error(`[CSV] Empty file or unable to read header: ${sourceLabel}`);
    }
    assertCsvSchema(header, sourceLabel);

    // lc_pct_* "all or nothing" header-level validation
    const headerSet = new Set(header);
    const lcPctPresent = LC_PCT_COLUMNS.filter((col) => headerSet.has(col));
    if (lcPctPresent.length > 0 && lcPctPresent.length < LC_PCT_COLUMNS.length) {
        const err = new Error(
            `[CSV] lc_pct_* columns incomplete (${lcPctPresent.length}/${LC_PCT_COLUMNS.length}): ${sourceLabel}\n` +
                `All ${LC_PCT_COLUMNS.length} columns must either be present or absent. Missing: ${LC_PCT_COLUMNS.filter((c) => !headerSet.has(c)).join(', ')}`
        );
        err.code = 'CSV_SCHEMA_MISMATCH';
        throw err;
    }

    const records = parseCSV(csvContent, {
        columns: true,
        skip_empty_lines: true,
        relax_quotes: true,
        bom: true,
        trim: true,
    });

    const parseErrors = [];

    const parsedRows = records.map((record, rowIndex) => {
        const row = {};
        const numericKeys = new Set([
            'lon',
            'lat',
            'forest_pct',
            'forest_area_km2',
            'population_total',
            'land_area_km2',
            'nightlight_mean',
            'nightlight_p90',
            'cell_area_km2',
            'land_fraction',
            ...LC_PCT_COLUMNS,
        ]);
        for (const [key, val] of Object.entries(record)) {
            if (numericKeys.has(key)) {
                const trimmed = String(val).trim();

                // Nightlight: empty/NaN means "no VIIRS data" (sentinel -1), not zero
                if (key === 'nightlight_mean' || key === 'nightlight_p90') {
                    const num = Number(trimmed);
                    row[key] = trimmed !== '' && Number.isFinite(num) ? num : NIGHTLIGHT_NO_DATA;
                    continue;
                }

                if (trimmed === '') {
                    row[key] = 0;
                    continue;
                }

                const num = Number(trimmed);
                if (!Number.isFinite(num)) {
                    parseErrors.push({
                        row: rowIndex + 2, // +2: account for header row and 0-based index
                        field: key,
                        value: String(val),
                        file: sourceLabel,
                    });
                    row[key] = 0;
                    continue;
                }
                row[key] = num;
            } else if (key === 'landcover_class') {
                row[key] = normalizeLandcoverClass(val);
            } else {
                row[key] = val;
            }
        }
        // Wrap longitude to [-180, 180) — GEE exports may exceed 180°E (e.g. Asia → 190°E for Chukotka)
        if (Number.isFinite(row.lon)) {
            row.lon = ((((row.lon + 180) % 360) + 360) % 360) - 180;
        }
        // Validate coordinate ranges: lon ∈ [-180,180), lat ∈ [-90,90)
        if (
            !Number.isFinite(row.lon) ||
            row.lon < -180 ||
            row.lon >= 180 ||
            !Number.isFinite(row.lat) ||
            row.lat < -90 ||
            row.lat >= 90
        ) {
            parseErrors.push({
                row: rowIndex + 2,
                field: 'lon/lat',
                value: `${row.lon},${row.lat}`,
                file: sourceLabel,
            });
        }
        row.population_density =
            row.land_area_km2 != null && row.land_area_km2 > 0 && row.population_total != null
                ? row.population_total / row.land_area_km2
                : 0;
        if (!Number.isFinite(row.land_fraction) || row.land_fraction < 0) {
            row.land_fraction = row.cell_area_km2 > 0 ? row.land_area_km2 / row.cell_area_km2 : 0;
        }
        row.land_fraction = Math.max(0, Math.min(1, row.land_fraction));
        return row;
    });

    if (parseErrors.length > 0) {
        const shown = parseErrors
            .slice(0, 5)
            .map((e) => `  row ${e.row}, field "${e.field}": got ${JSON.stringify(e.value)}`)
            .join('\n');
        const suffix = parseErrors.length > 5 ? `\n  ... and ${parseErrors.length - 5} more` : '';
        const err = new Error(
            `[CSV] ${parseErrors.length} parse error(s) in ${sourceLabel}:\n${shown}${suffix}\n` +
                'Hint: ensure all numeric columns contain valid numbers. Empty values are treated as 0.'
        );
        err.code = 'CSV_PARSE_ERROR';
        throw err;
    }

    return parsedRows;
}

/**
 * Deduplicate grids based on lon_lat key (overlapping continent boundaries).
 * Priority: continuous lc_pct_* > discrete landcover_class > land_area_km2 (higher) > first occurrence
 */
function deduplicateGrids(grids) {
    const seen = new Map();
    for (const grid of grids) {
        const key = `${grid.lon}_${grid.lat}`;
        if (!seen.has(key)) {
            seen.set(key, grid);
        } else {
            const existing = seen.get(key);
            const gridHasLC =
                hasContinuousLcData(grid) ||
                (grid.landcover_class != null && grid.landcover_class >= 10);
            const existingHasLC =
                hasContinuousLcData(existing) ||
                (existing.landcover_class != null && existing.landcover_class >= 10);

            if (gridHasLC && !existingHasLC) {
                seen.set(key, grid);
            } else if (!gridHasLC && existingHasLC) {
                // Keep existing
            } else {
                const gridLand = Number.isFinite(grid.land_area_km2) ? grid.land_area_km2 : 0;
                const existingLand = Number.isFinite(existing.land_area_km2)
                    ? existing.land_area_km2
                    : 0;
                if (gridLand > existingLand) {
                    seen.set(key, grid);
                }
            }
        }
    }
    return Array.from(seen.values());
}

/** Infer minimum positive coordinate step on an axis (lon or lat). */
function inferAxisStep(grids, key) {
    const values = new Set();
    for (const g of grids) {
        const v = g[key];
        if (Number.isFinite(v)) {
            // Round to reduce floating-point noise from CSV parsing.
            values.add(Number(v.toFixed(6)));
        }
    }
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

function nearlyEqual(a, b) {
    return Math.abs(a - b) <= GRID_SIZE_EPS;
}

/**
 * Fail fast if configured GRID_SIZE does not match actual CSV/cache resolution.
 * Prevents incorrect viewport hits when index bucket size and data cell size differ.
 */
function assertGridResolution(gridData, sourceLabel) {
    const lonStep = inferAxisStep(gridData, 'lon');
    const latStep = inferAxisStep(gridData, 'lat');

    if (lonStep == null || latStep == null) {
        console.warn(
            `[Grid] Could not infer data resolution from ${sourceLabel}; skipping GRID_SIZE consistency check.`
        );
        return;
    }

    console.log(
        `[Grid] Inferred resolution from ${sourceLabel}: lon step=${lonStep}, lat step=${latStep}`
    );

    if (!nearlyEqual(lonStep, latStep)) {
        const err = new Error(
            `[Grid] Inconsistent data resolution in ${sourceLabel}: lon step=${lonStep}, lat step=${latStep}.`
        );
        err.code = 'GRID_SIZE_MISMATCH';
        throw err;
    }

    const inferredGridSize = Number(((lonStep + latStep) / 2).toFixed(6));
    if (!nearlyEqual(inferredGridSize, GRID_SIZE)) {
        const err = new Error(
            `[Grid] GRID_SIZE mismatch: configured GRID_SIZE=${GRID_SIZE}, but data resolution is ${inferredGridSize} (${sourceLabel}). ` +
                'Set GRID_SIZE to match the exported CSV resolution.'
        );
        err.code = 'GRID_SIZE_MISMATCH';
        throw err;
    }
}

/**
 * Re-validate numeric fields in cached grids.
 * Old caches may contain stale landcover values (e.g. 79 instead of 80)
 * or missing derived fields. This ensures consistency without a full re-parse.
 */
function normalizeCachedGrids(grids) {
    return grids.map((g) => {
        const out = {
            ...g,
            landcover_class: normalizeLandcoverClass(g.landcover_class),
            forest_pct: Number.isFinite(g.forest_pct) ? g.forest_pct : 0,
            forest_area_km2: Number.isFinite(g.forest_area_km2) ? g.forest_area_km2 : 0,
            population_total: Number.isFinite(g.population_total) ? g.population_total : 0,
            land_area_km2: Number.isFinite(g.land_area_km2) ? g.land_area_km2 : 0,
            cell_area_km2: Number.isFinite(g.cell_area_km2) ? g.cell_area_km2 : 0,
            land_fraction: Number.isFinite(g.land_fraction)
                ? Math.max(0, Math.min(1, g.land_fraction))
                : g.cell_area_km2 > 0
                  ? Math.max(0, Math.min(1, g.land_area_km2 / g.cell_area_km2))
                  : 0,
            nightlight_mean: Number.isFinite(g.nightlight_mean)
                ? g.nightlight_mean
                : NIGHTLIGHT_NO_DATA,
            nightlight_p90: Number.isFinite(g.nightlight_p90)
                ? g.nightlight_p90
                : NIGHTLIGHT_NO_DATA,
            population_density: Number.isFinite(g.population_density)
                ? g.population_density
                : Number.isFinite(g.land_area_km2) &&
                    g.land_area_km2 > 0 &&
                    Number.isFinite(g.population_total)
                  ? g.population_total / g.land_area_km2
                  : 0,
        };
        // Validate lc_pct_* fields if present: clamp to [0, 100]
        for (const col of LC_PCT_COLUMNS) {
            if (col in g) {
                out[col] = Number.isFinite(g[col]) ? Math.max(0, Math.min(100, g[col])) : 0;
            }
        }
        return out;
    });
}

/**
 * Load grid data from cache or CSV files.
 * Returns { gridData, normalizeParams }.
 */
async function loadGridData() {
    const cacheDir = path.join(__dirname, '../data/cache');
    const combinedJsonPath = path.join(cacheDir, 'all_grids.json');
    const csvDir = path.join(__dirname, '../data/raw');

    const REQUIRED_GRID_KEYS = REQUIRED_CSV_COLUMNS;

    const assertGridSchema = (sample, sourceLabel) => {
        if (!sample || typeof sample !== 'object') {
            const err = new Error(
                `[Cache] Unable to read cache data: ${sourceLabel}\nPlease delete data/cache/ and retry.`
            );
            err.code = 'CACHE_SCHEMA_MISMATCH';
            throw err;
        }
        const missing = REQUIRED_GRID_KEYS.filter((k) => !(k in sample));
        if (missing.length > 0) {
            const err = new Error(
                `[Cache] Cache schema is outdated: ${sourceLabel}\n` +
                    `Missing fields: ${missing.join(', ')}\n` +
                    `Please delete data/cache/, then re-export new CSV using the GEE scripts.`
            );
            err.code = 'CACHE_SCHEMA_MISMATCH';
            throw err;
        }
    };

    await fs.mkdir(cacheDir, { recursive: true });

    // Require all continent CSV files up front (including Antarctica),
    // even if cache exists and fingerprint matches.
    const requiredCsvPaths = await assertRequiredCsvFiles(csvDir, GRID_FILES);

    // Compute CSV fingerprint for cache validation
    const currentFingerprint = calcCsvFingerprint(requiredCsvPaths);

    // Try to load combined JSON first (unless cache is disabled or force rebuild)
    if (!DISABLE_CACHE && !FORCE_REBUILD_CACHE) {
        try {
            const jsonContent = await fs.readFile(combinedJsonPath, 'utf-8');
            const cached = JSON.parse(jsonContent);

            // Detect old Array-format cache vs new wrapper format
            let grids;
            if (Array.isArray(cached)) {
                console.log('[Cache] Old array-format cache detected, invalidating...');
                throw new Error('old cache format');
            } else if (cached && typeof cached === 'object' && Array.isArray(cached.grids)) {
                if (cached.schemaVersion !== CACHE_SCHEMA_VERSION) {
                    console.log(
                        `[Cache] Schema version mismatch (cache=${cached.schemaVersion}, expected=${CACHE_SCHEMA_VERSION}), invalidating...`
                    );
                    throw new Error('schema version mismatch');
                }
                if (cached.csvFingerprint !== currentFingerprint) {
                    console.log('[Cache] CSV fingerprint changed, invalidating...');
                    throw new Error('csv fingerprint mismatch');
                }
                grids = cached.grids;
            } else {
                throw new Error('unrecognized cache format');
            }

            console.log(`[Cache] Loading from all_grids.json (${grids.length} grids)`);
            if (grids.length === 0) {
                throw new Error('cache empty');
            }
            assertGridSchema(grids[0], 'data/cache/all_grids.json');
            const gridData = normalizeCachedGrids(grids);
            assertGridResolution(gridData, 'data/cache/all_grids.json');
            console.log(`[Cache] Loaded ${gridData.length} grid cells from cache`);
            const normalizeParams = await loadOrCalcNormalize(gridData, requiredCsvPaths, {
                aggregationVersion: AGGREGATION_VERSION,
                aggregationConfig: AGGREGATION_CONFIG,
            });
            return { gridData, normalizeParams };
        } catch (err) {
            if (err && err.code === 'CACHE_SCHEMA_MISMATCH') {
                throw err;
            }
            const reason = err && err.message ? err.message : String(err);
            console.log(`[CSV] Cache not usable (${reason}), loading from CSV files...`);
        }
    } else if (FORCE_REBUILD_CACHE) {
        console.log(
            '[CSV] Force rebuild mode, loading from CSV files (will write cache after load)'
        );
    } else if (DISABLE_CACHE) {
        console.log(
            '[CSV] Cache disabled, loading from CSV files (cache disabled, skipping write)'
        );
    }

    // Load and merge all available CSV files
    console.log('[CSV] Loading grid data from CSV files...');
    let gridData = [];
    const loadedCsvPaths = [];
    const failedCsvLoads = [];

    for (const filename of GRID_FILES) {
        const filePath = path.join(csvDir, filename);

        try {
            const sourceLabel = `data/raw/${filename}`;
            console.log(`[CSV] Loading: ${filename} from ${sourceLabel}`);
            const csv = await fs.readFile(filePath, 'utf-8');
            const parsed = parseCSVFile(csv, sourceLabel);
            assertGridResolution(parsed, sourceLabel);
            gridData = gridData.concat(parsed);
            loadedCsvPaths.push(filePath);
        } catch (err) {
            if (
                err &&
                (err.code === 'CSV_SCHEMA_MISMATCH' ||
                    err.code === 'GRID_SIZE_MISMATCH' ||
                    err.code === 'CSV_PARSE_ERROR')
            ) {
                throw err;
            }
            const message = err && err.message ? err.message : String(err);
            const stack = err && err.stack ? err.stack : '';
            console.error(`[CSV] Error loading ${filename}: ${message}`);
            if (stack) {
                console.error(
                    `[CSV]   Stack: ${stack.split('\n').slice(1, 4).join('\n          ')}`
                );
            }
            failedCsvLoads.push({
                filename,
                message,
            });
        }
    }

    if (failedCsvLoads.length > 0) {
        const details = failedCsvLoads
            .map((item) => `  - ${item.filename}: ${item.message}`)
            .join('\n');
        const err = new Error(
            `[CSV] ${failedCsvLoads.length} continent grid file(s) failed to load:\n` +
                `${details}\n` +
                'Hint: check that the CSV files are valid UTF-8, have correct headers (see data/raw/SCHEMA.md), and are not truncated.'
        );
        err.code = 'CSV_LOAD_FAILED';
        throw err;
    }

    if (gridData.length === 0) {
        throw new Error(
            '[CSV] No usable grid data found.\n' +
                'Please run gee/*.js in GEE to export new CSVs into data/raw/, ensure headers include new columns like nightlight_p90, then delete data/cache/ and restart.'
        );
    }

    const beforeCount = gridData.length;
    gridData = deduplicateGrids(gridData);
    console.log(`[CSV] Deduplicated: ${beforeCount} -> ${gridData.length} grids`);
    assertGridResolution(gridData, 'loaded CSV files');

    // Detect landcover mode
    const continuousCount = gridData.filter((g) => 'lc_pct_10' in g).length;
    const discreteCount = gridData.length - continuousCount;
    if (continuousCount > 0 && discreteCount > 0) {
        console.log(
            `[Data] Landcover mode: MIXED (${continuousCount} continuous, ${discreteCount} discrete) — per-cell fallback active`
        );
    } else if (continuousCount > 0) {
        console.log('[Data] Landcover mode: continuous (lc_pct_*)');
    } else {
        console.log('[Data] Landcover mode: discrete (landcover_class only)');
    }

    const normalizeParams = await loadOrCalcNormalize(gridData, loadedCsvPaths, {
        aggregationVersion: AGGREGATION_VERSION,
        aggregationConfig: AGGREGATION_CONFIG,
    });

    // Write JSON cache with wrapper (write to .tmp then rename for crash safety)
    if (!DISABLE_CACHE) {
        try {
            const cachePayload = {
                schemaVersion: CACHE_SCHEMA_VERSION,
                csvFingerprint: calcCsvFingerprint(loadedCsvPaths),
                grids: gridData,
            };
            const tempPath = `${combinedJsonPath}.tmp`;
            await fs.writeFile(tempPath, JSON.stringify(cachePayload));
            await fs.rename(tempPath, combinedJsonPath);
            console.log(`[Cache] Writing to all_grids.json (${gridData.length} grids)`);
        } catch (err) {
            console.error(
                `[Cache] Warning: Failed to write cache to ${combinedJsonPath}: ${err.message}`
            );
        }
    }

    console.log(`[CSV] Total loaded: ${gridData.length} grid cells`);
    return { gridData, normalizeParams };
}

module.exports = { loadGridData, NIGHTLIGHT_NO_DATA };
