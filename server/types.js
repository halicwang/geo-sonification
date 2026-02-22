/**
 * JSDoc type definitions for geo-sonification server.
 *
 * This file contains no runtime code — only @typedef comments for IDE support.
 * Import with: const Types = require('./types');  // for @type references
 */

/**
 * A single 0.5° grid cell loaded from CSV.
 * @typedef {Object} GridCell
 * @property {string} grid_id - Unique cell identifier (e.g. "lon_-55.0_lat_-10.0")
 * @property {number} lon - Bottom-left longitude (-180 to 180)
 * @property {number} lat - Bottom-left latitude (-90 to 90)
 * @property {number|null} landcover_class - Dominant ESA WorldCover class (10-100) or null
 * @property {number} nightlight_mean - Mean VIIRS nightlight radiance (-1 = no data)
 * @property {number} nightlight_p90 - 90th percentile VIIRS nightlight (-1 = no data)
 * @property {number} forest_pct - Forest cover percentage (0-100)
 * @property {number} forest_area_km2 - Absolute forest area in km²
 * @property {number} population_total - Total population count (WorldPop)
 * @property {number} population_density - Derived: population_total / land_area_km2
 * @property {number} land_area_km2 - Land area in km²
 * @property {number} cell_area_km2 - Total cell area in km² (land + water)
 * @property {number} land_fraction - Ratio of land_area / cell_area (0-1)
 * @property {number} [lc_pct_10] - Tree/Forest cover percentage
 * @property {number} [lc_pct_20] - Shrubland cover percentage
 * @property {number} [lc_pct_30] - Grassland cover percentage
 * @property {number} [lc_pct_40] - Cropland cover percentage
 * @property {number} [lc_pct_50] - Built-up/Urban cover percentage
 * @property {number} [lc_pct_60] - Bare/Sparse cover percentage
 * @property {number} [lc_pct_70] - Snow/Ice cover percentage
 * @property {number} [lc_pct_80] - Water cover percentage
 * @property {number} [lc_pct_90] - Wetland cover percentage
 * @property {number} [lc_pct_95] - Mangroves cover percentage
 * @property {number} [lc_pct_100] - Moss/Lichen cover percentage
 */

/**
 * Stats returned to the frontend from a viewport query.
 * @typedef {Object} ViewportStats
 * @property {number|null} dominantLandcover - Most common ESA land class in viewport (null = no land data)
 * @property {number} nightlightNorm - 0-1 normalized nightlight brightness
 * @property {number} populationNorm - 0-1 normalized population density
 * @property {number} forestNorm - 0-1 normalized forest cover
 * @property {number} avgForestPct - Weighted-average forest percentage
 * @property {number} avgPopulationDensity - Weighted-average population density
 * @property {number} avgNightlightMean - Weighted-average nightlight mean
 * @property {number} avgNightlightP90 - Weighted-average nightlight p90
 * @property {number} gridCount - Number of grid cells in viewport
 * @property {Object<string, number>} landcoverDistribution - { classId: weight }
 * @property {LandcoverBreakdownItem[]} landcoverBreakdown - Top classes for display
 * @property {string} [mode] - "aggregated" or "per-grid"
 */

/**
 * A single entry in the landcover breakdown list.
 * @typedef {Object} LandcoverBreakdownItem
 * @property {number|null} class - ESA class code, or null for "Other"
 * @property {number} count - Raw weight (count or km²)
 * @property {number} percentage - Display percentage (0-100)
 */

/**
 * Normalization parameters computed from data percentiles.
 * @typedef {Object} NormalizeParams
 * @property {string} csv_fingerprint - Hash of source CSV files
 * @property {string} aggregation_version - Version of aggregation config
 * @property {Object} aggregation_config - Aggregation settings
 * @property {Object} vintage - Data vintage years
 * @property {string} generated_at - ISO timestamp of generation
 * @property {Object<string, FieldNormParams>} fields - Per-field normalization params
 */

/**
 * Per-field normalization parameters.
 * @typedef {Object} FieldNormParams
 * @property {number} p1 - 1st percentile value
 * @property {number} p99 - 99th percentile value
 * @property {string} scale - "log" or "linear"
 */

// ============ Per-client state types (used by delta-state.js, mode-manager.js, viewport-processor.js, audio-metrics.js) ============

/**
 * Per-client landcover snapshot for delta computation.
 * @typedef {Object} Snapshot
 * @property {number[]} lcFractions - length-11 array aligned with LC_CLASS_ORDER
 */

/**
 * Per-client delta state.
 * @typedef {Object} DeltaState
 * @property {Snapshot|null} previousSnapshot
 */

/**
 * Per-client mode state (hysteresis).
 * @typedef {Object} ModeState
 * @property {string} currentMode - 'aggregated' or 'per-grid'
 */

module.exports = {};
