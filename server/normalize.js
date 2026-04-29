// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Normalization: p1/p99 percentile scaling, fingerprint-based caching.
 * Used by spatial.js to map raw metric averages into [0,1].
 */

const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const NORMALIZE_FILE = path.join(__dirname, '..', 'data', 'cache', 'normalize.json');
const REQUIRED_FIELDS = ['nightlight_p90', 'population_density', 'forest_pct'];

/**
 * JSON.stringify with sorted keys for stable comparison of flat config objects.
 * @param {object} value
 * @returns {string}
 */
function stableStringify(value) {
    return JSON.stringify(value, Object.keys(value ?? {}).sort());
}

/**
 * Compute p1 and p99 percentile values for a field across grid data.
 * @param {import('./types').GridCell[]} data
 * @param {string} field - Field name to extract from each cell
 * @returns {{ p1: number, p99: number }}
 */
function calcPercentiles(data, field) {
    const positive = data
        .map((d) => d[field])
        .filter((v) => v != null && !isNaN(v) && v > 0)
        .sort((a, b) => a - b);
    if (positive.length === 0) return { p1: 0, p99: 1 };
    return {
        p1: positive[Math.floor((positive.length - 1) * 0.01)],
        p99: positive[Math.floor((positive.length - 1) * 0.99)],
    };
}

/**
 * Normalize a value to [0, 1] using p1/p99 percentile range.
 * @param {number} value
 * @param {number} p1 - 1st percentile (lower bound)
 * @param {number} p99 - 99th percentile (upper bound)
 * @param {boolean} [useLog=false] - Use log1p scale
 * @returns {number} Normalized value in [0, 1]
 */
function normalize(value, p1, p99, useLog = false) {
    if (value == null || isNaN(value) || value <= 0) return 0;

    const rawMin = Number.isFinite(p1) ? p1 : 0;
    const rawMax = Number.isFinite(p99) ? p99 : rawMin;
    const min = Math.min(rawMin, rawMax);
    const max = Math.max(rawMin, rawMax);
    const clamped = Math.min(max, Math.max(min, value));

    let out;
    if (useLog) {
        const logMin = Math.log1p(min);
        const logMax = Math.log1p(max);
        const denom = logMax - logMin;
        if (!Number.isFinite(denom) || denom <= 0) return 0;
        const logVal = Math.log1p(clamped);
        out = (logVal - logMin) / denom;
    } else {
        const denom = max - min;
        if (!Number.isFinite(denom) || denom <= 0) return 0;
        out = (clamped - min) / denom;
    }

    if (!Number.isFinite(out)) return 0;
    return Math.max(0, Math.min(1, out));
}

/**
 * Compute a short hash fingerprint from CSV filename, size, and content
 * snippets. mtime is intentionally excluded: it's unstable across Docker
 * image extraction, rsync, and file copies, which would force needless
 * cache invalidation. Size + head/tail content hash catches every real
 * change we care about (re-exports, edits, different files).
 *
 * @param {string[]} csvPaths - Absolute paths to CSV files
 * @returns {string} 12-char hex fingerprint
 */
function calcCsvFingerprint(csvPaths) {
    if (!csvPaths || csvPaths.length === 0) return '';
    const parts = csvPaths.map((p) => {
        try {
            const stat = fs.statSync(p);
            const fd = fs.openSync(p, 'r');
            try {
                const readLen = Math.min(1024, stat.size);
                const headBuf = Buffer.alloc(readLen);
                fs.readSync(fd, headBuf, 0, readLen, 0);
                const tailBuf = Buffer.alloc(readLen);
                const tailPos = Math.max(0, stat.size - readLen);
                fs.readSync(fd, tailBuf, 0, readLen, tailPos);
                const contentSnippet = crypto
                    .createHash('md5')
                    .update(headBuf)
                    .update(tailBuf)
                    .digest('hex')
                    .slice(0, 8);
                return `${path.basename(p)}:${stat.size}:${contentSnippet}`;
            } finally {
                fs.closeSync(fd);
            }
        } catch {
            return path.basename(p);
        }
    });
    return crypto.createHash('md5').update(parts.join('|')).digest('hex').slice(0, 12);
}

/**
 * Check if a cached normalize params object matches current expectations.
 * @param {object} cached - Parsed cache JSON
 * @param {string} expectedFingerprint - CSV fingerprint to match
 * @param {string} expectedAggregationVersion
 * @param {object} expectedAggregationConfig
 * @returns {boolean}
 */
function isValidNormalizeCache(
    cached,
    expectedFingerprint,
    expectedAggregationVersion,
    expectedAggregationConfig
) {
    if (!cached || typeof cached !== 'object') return false;
    if (cached.csv_fingerprint !== expectedFingerprint) return false;
    if (cached.aggregation_version !== expectedAggregationVersion) return false;
    const cachedConfig = cached.aggregation_config ?? {};
    const expectedConfig = expectedAggregationConfig ?? {};
    if (stableStringify(cachedConfig) !== stableStringify(expectedConfig)) return false;
    if (!cached.fields || typeof cached.fields !== 'object') return false;
    return REQUIRED_FIELDS.every((field) => {
        const f = cached.fields[field];
        return f && typeof f === 'object' && Number.isFinite(f.p1) && Number.isFinite(f.p99);
    });
}

/**
 * Load normalization params from cache, or compute from data if cache is stale/missing.
 * @param {import('./types').GridCell[]} data
 * @param {string[]} csvPaths - Absolute paths to source CSV files
 * @param {{ aggregationVersion?: string, aggregationConfig?: object }} [options]
 * @returns {Promise<import('./types').NormalizeParams>}
 */
async function loadOrCalcNormalize(data, csvPaths, options = {}) {
    const currentFingerprint = calcCsvFingerprint(csvPaths || []);
    const aggregationVersion = options.aggregationVersion || 'unknown';
    const aggregationConfig = options.aggregationConfig || {};

    try {
        await fsPromises.access(NORMALIZE_FILE);
        const cached = JSON.parse(await fsPromises.readFile(NORMALIZE_FILE, 'utf-8'));
        if (
            isValidNormalizeCache(cached, currentFingerprint, aggregationVersion, aggregationConfig)
        ) {
            console.log(
                `[Normalize] Loaded params (fingerprint+aggregation matched) v=${aggregationVersion}`
            );
            return cached;
        }
        console.log('[Normalize] Cache invalid or CSV changed, recalculating...');
    } catch (err) {
        if (err.code !== 'ENOENT') {
            console.log('[Normalize] Cache read failed, recalculating...');
        }
    }

    const params = {
        csv_fingerprint: currentFingerprint,
        aggregation_version: aggregationVersion,
        aggregation_config: aggregationConfig,
        vintage: { worldcover: 2021, viirs: 2021, worldpop: 2020 },
        generated_at: new Date().toISOString(),
        fields: {
            nightlight_p90: { ...calcPercentiles(data, 'nightlight_p90'), scale: 'log' },
            population_density: { ...calcPercentiles(data, 'population_density'), scale: 'log' },
            forest_pct: { p1: 0, p99: 100, scale: 'linear' },
        },
    };

    try {
        await fsPromises.writeFile(NORMALIZE_FILE, JSON.stringify(params, null, 2));
        console.log('[Normalize] Saved params to', NORMALIZE_FILE);
    } catch (err) {
        console.warn('[Normalize] Could not write cache:', err.message);
    }
    return params;
}

/**
 * Map raw viewport/cell averages to 0-1 using p1/p99 percentile params.
 *
 * @param {number} avgNightlightP90
 * @param {number} avgPopulation — population density (or per-cell value)
 * @param {number} avgForest — forest percentage
 * @param {import('./types').NormalizeParams} normalizeParams
 * @returns {{ nightlightNorm: number, populationNorm: number, forestNorm: number }}
 */
function normalizeValues(avgNightlightP90, avgPopulation, avgForest, normalizeParams) {
    let nightlightNorm = 0,
        populationNorm = 0,
        forestNorm = 0;
    if (normalizeParams && normalizeParams.fields) {
        const nf = normalizeParams.fields;
        if (nf.nightlight_p90) {
            nightlightNorm = normalize(
                avgNightlightP90,
                nf.nightlight_p90.p1,
                nf.nightlight_p90.p99,
                nf.nightlight_p90.scale === 'log'
            );
        }
        if (nf.population_density) {
            populationNorm = normalize(
                avgPopulation,
                nf.population_density.p1,
                nf.population_density.p99,
                nf.population_density.scale === 'log'
            );
        }
        if (nf.forest_pct) {
            forestNorm = normalize(
                avgForest,
                nf.forest_pct.p1,
                nf.forest_pct.p99,
                nf.forest_pct.scale === 'log'
            );
        }
    }
    return { nightlightNorm, populationNorm, forestNorm };
}

module.exports = {
    calcPercentiles,
    normalize,
    normalizeValues,
    calcCsvFingerprint,
    loadOrCalcNormalize,
};
