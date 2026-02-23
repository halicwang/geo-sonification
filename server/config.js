// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Server configuration: environment variable parsing and constants.
 *
 * All env vars have sensible defaults so the server runs out-of-the-box.
 * Override via environment variables or a .env file.
 */

// ---- Env helpers ----

/**
 * Parse an env var as a valid TCP/UDP port (1-65535), exit on invalid.
 * @param {string} envVar - Environment variable name
 * @param {number} defaultPort - Fallback value
 * @param {string} name - Display name for error messages
 * @returns {number}
 */
function parsePort(envVar, defaultPort, name) {
    const value = process.env[envVar];
    if (value === undefined || value === '') {
        return defaultPort;
    }
    const port = parseInt(value, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
        console.error(
            `ERROR: Invalid ${name} port "${value}". Must be a number between 1 and 65535.`
        );
        process.exit(1);
    }
    return port;
}

/**
 * Parse an env var as a non-negative float, exit on invalid.
 * @param {string} envVar - Environment variable name
 * @param {number} defaultValue - Fallback value
 * @param {string} name - Display name for error messages
 * @returns {number}
 */
function parseNonNegativeFloat(envVar, defaultValue, name) {
    const value = process.env[envVar];
    if (value === undefined || value === '') return defaultValue;
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
        console.error(`ERROR: Invalid ${name} "${value}". Must be a non-negative number.`);
        process.exit(1);
    }
    return parsed;
}

/**
 * Parse an env var as a non-negative integer, exit on invalid.
 * @param {string} envVar - Environment variable name
 * @param {number} defaultValue - Fallback value
 * @param {string} name - Display name for error messages
 * @returns {number}
 */
function parseNonNegativeInt(envVar, defaultValue, name) {
    const value = process.env[envVar];
    if (value === undefined || value === '') return defaultValue;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
        console.error(`ERROR: Invalid ${name} "${value}". Must be a non-negative integer.`);
        process.exit(1);
    }
    return parsed;
}

// ---- Network ports ----

const HTTP_PORT = parsePort('HTTP_PORT', 3000, 'HTTP');
const WS_PORT = parsePort('WS_PORT', 3001, 'WebSocket');

// ---- Aggregation ----
// Two modes: "legacy" (simple grid-count average) vs "v2_area_weighted" (land-area weighted).
// Switch with USE_LEGACY_AGGREGATION=1. Cache keys include the version to avoid mixing.

const USE_LEGACY_AGGREGATION =
    process.env.USE_LEGACY_AGGREGATION === '1' || process.env.USE_LEGACY_AGGREGATION === 'true';
const AGGREGATION_VERSION = USE_LEGACY_AGGREGATION ? 'legacy' : 'v2_area_weighted';

// Controls how coastal cells (partial land) are down-weighted in v2 aggregation.
// 'identity' = no downweight, 'linear' = proportional, 'sqrt'/'pow' = non-linear.
const LAND_FRACTION_WEIGHT_MODE = String(
    process.env.LAND_FRACTION_WEIGHT_MODE || 'identity'
).toLowerCase();
const LAND_FRACTION_WEIGHT_EXP = parseNonNegativeFloat(
    'LAND_FRACTION_WEIGHT_EXP',
    1,
    'LAND_FRACTION_WEIGHT_EXP'
);
// Skip cells with less land than this threshold (km2) during aggregation only.
const MIN_LAND_AREA_KM2 = parseNonNegativeFloat('MIN_LAND_AREA_KM2', 0, 'MIN_LAND_AREA_KM2');

const LAND_FRACTION_WEIGHT_MODES = new Set(['identity', 'linear', 'sqrt', 'pow']);
if (!LAND_FRACTION_WEIGHT_MODES.has(LAND_FRACTION_WEIGHT_MODE)) {
    console.error(
        `ERROR: Invalid LAND_FRACTION_WEIGHT_MODE "${LAND_FRACTION_WEIGHT_MODE}". ` +
            `Must be one of: ${Array.from(LAND_FRACTION_WEIGHT_MODES).join(', ')}`
    );
    process.exit(1);
}

/** @type {Readonly<Record<string, string|number|boolean>>} */
const AGGREGATION_CONFIG = USE_LEGACY_AGGREGATION
    ? { legacy: true }
    : {
          weight_base: 'land_area_km2',
          land_fraction_weight_mode: LAND_FRACTION_WEIGHT_MODE,
          land_fraction_weight_exponent: LAND_FRACTION_WEIGHT_EXP,
          min_land_area_km2: MIN_LAND_AREA_KM2,
      };
console.log(
    `[Aggregation] version=${AGGREGATION_VERSION} config=${JSON.stringify(AGGREGATION_CONFIG)}`
);

/**
 * Compute a multiplier [0,1] for a cell based on its land fraction.
 * Used in v2 aggregation to down-weight coastal/island cells where
 * most of the grid cell is ocean.
 *
 * @param {number} landFraction - 0-1 ratio of land area to cell area
 * @returns {number} Weight multiplier in [0, 1]
 */
function landFractionWeight(landFraction) {
    const lf = Math.max(0, Math.min(1, Number.isFinite(landFraction) ? landFraction : 0));
    switch (LAND_FRACTION_WEIGHT_MODE) {
        case 'linear':
            return lf;
        case 'sqrt':
            return Math.sqrt(lf);
        case 'pow':
            return Math.pow(lf, LAND_FRACTION_WEIGHT_EXP);
        case 'identity':
        default:
            return 1;
    }
}

// ---- CORS ----
// Comma-separated whitelist; defaults to localhost variants.
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : [
          `http://localhost:${HTTP_PORT}`,
          `http://127.0.0.1:${HTTP_PORT}`,
          'http://localhost:3000',
          'http://127.0.0.1:3000',
      ];

// ---- Grid geometry ----
// Size of each grid cell in degrees. Must divide evenly into 360 (lon) and 180 (lat).
// Default 0.5 matches GEE-exported data (0.5° × 0.5° cells).
const GRID_SIZE = (() => {
    const raw = process.env.GRID_SIZE;
    if (raw === undefined || raw === '') return 0.5;
    const val = Number.parseFloat(raw);
    if (!Number.isFinite(val) || val <= 0) {
        console.error(`ERROR: Invalid GRID_SIZE "${raw}". Must be a positive number.`);
        process.exit(1);
    }
    const lonBuckets = 360 / val;
    const latBuckets = 180 / val;
    if (!Number.isInteger(lonBuckets) || !Number.isInteger(latBuckets)) {
        console.error(
            `ERROR: GRID_SIZE=${val} does not divide evenly into 360 (lon buckets=${lonBuckets}) ` +
                `or 180 (lat buckets=${latBuckets}). Try 0.25, 0.5, 1, 2, 5, etc.`
        );
        process.exit(1);
    }
    return val;
})();
const LON_BUCKETS = Math.round(360 / GRID_SIZE);
const LAT_BUCKETS = Math.round(180 / GRID_SIZE);
console.log(`[Grid] GRID_SIZE=${GRID_SIZE}° (${LON_BUCKETS}x${LAT_BUCKETS} buckets)`);

// ---- Per-grid mode switching (with hysteresis) ----
// Two thresholds prevent rapid mode flipping at the boundary:
//   - ENTER: switch from aggregated -> per-grid when gridCount <= this
//   - EXIT:  switch from per-grid -> aggregated when gridCount > this
// Configure via explicit ENTER/EXIT or via center + half-width.
const PER_GRID_THRESHOLD_CENTER = parseNonNegativeInt(
    'PER_GRID_THRESHOLD',
    50,
    'PER_GRID_THRESHOLD'
);
const PER_GRID_HYSTERESIS = parseNonNegativeInt('PER_GRID_HYSTERESIS', 0, 'PER_GRID_HYSTERESIS');

const PER_GRID_THRESHOLD_ENTER = (() => {
    const explicit = process.env.PER_GRID_THRESHOLD_ENTER;
    if (explicit !== undefined && explicit !== '') {
        return parseNonNegativeInt('PER_GRID_THRESHOLD_ENTER', 0, 'PER_GRID_THRESHOLD_ENTER');
    }
    return Math.max(0, PER_GRID_THRESHOLD_CENTER - PER_GRID_HYSTERESIS);
})();

const PER_GRID_THRESHOLD_EXIT = (() => {
    const explicit = process.env.PER_GRID_THRESHOLD_EXIT;
    if (explicit !== undefined && explicit !== '') {
        return parseNonNegativeInt('PER_GRID_THRESHOLD_EXIT', 0, 'PER_GRID_THRESHOLD_EXIT');
    }
    return PER_GRID_THRESHOLD_CENTER + PER_GRID_HYSTERESIS;
})();

if (PER_GRID_THRESHOLD_ENTER > PER_GRID_THRESHOLD_EXIT) {
    console.error(
        `ERROR: PER_GRID_THRESHOLD_ENTER (${PER_GRID_THRESHOLD_ENTER}) > ` +
            `PER_GRID_THRESHOLD_EXIT (${PER_GRID_THRESHOLD_EXIT}). Enter must be <= Exit.`
    );
    process.exit(1);
}
console.log(
    `[PerGrid] thresholds: enter<=${PER_GRID_THRESHOLD_ENTER}, exit>${PER_GRID_THRESHOLD_EXIT}`
);

// ---- Proximity signal ----
// Zoom-level based mapping:
//   zoom >= PROXIMITY_ZOOM_HIGH => 1 (zoomed in — land detail)
//   zoom <= PROXIMITY_ZOOM_LOW  => 0 (zoomed out — ocean/distant)
//   linear interpolation between
const PROXIMITY_ZOOM_LOW = parseNonNegativeFloat('PROXIMITY_ZOOM_LOW', 4, 'PROXIMITY_ZOOM_LOW');
const PROXIMITY_ZOOM_HIGH = parseNonNegativeFloat('PROXIMITY_ZOOM_HIGH', 6, 'PROXIMITY_ZOOM_HIGH');

if (PROXIMITY_ZOOM_LOW >= PROXIMITY_ZOOM_HIGH) {
    console.error(
        `ERROR: PROXIMITY_ZOOM_LOW (${PROXIMITY_ZOOM_LOW}) >= ` +
            `PROXIMITY_ZOOM_HIGH (${PROXIMITY_ZOOM_HIGH}). Low must be < High.`
    );
    process.exit(1);
}
console.log(`[Proximity] zoom thresholds: low=${PROXIMITY_ZOOM_LOW}, high=${PROXIMITY_ZOOM_HIGH}`);

// ---- Cache & broadcast ----
const DISABLE_CACHE = process.env.DISABLE_CACHE === '1' || process.env.DISABLE_CACHE === 'true';
const FORCE_REBUILD_CACHE =
    process.env.FORCE_REBUILD_CACHE === '1' || process.env.FORCE_REBUILD_CACHE === 'true';
// When true, viewport stats are sent to ALL connected WS clients (not just sender).
const BROADCAST_STATS =
    process.env.BROADCAST_STATS === '1' || process.env.BROADCAST_STATS === 'true';

module.exports = {
    HTTP_PORT,
    WS_PORT,
    USE_LEGACY_AGGREGATION,
    AGGREGATION_VERSION,
    AGGREGATION_CONFIG,
    MIN_LAND_AREA_KM2,
    landFractionWeight,
    ALLOWED_ORIGINS,
    GRID_SIZE,
    LON_BUCKETS,
    LAT_BUCKETS,
    PER_GRID_THRESHOLD_ENTER,
    PER_GRID_THRESHOLD_EXIT,
    PROXIMITY_ZOOM_LOW,
    PROXIMITY_ZOOM_HIGH,
    DISABLE_CACHE,
    FORCE_REBUILD_CACHE,
    BROADCAST_STATS,
};
