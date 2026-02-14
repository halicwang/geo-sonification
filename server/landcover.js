/**
 * Landcover utilities: ESA WorldCover class metadata and normalization.
 *
 * Single source of truth for class codes, labels, and UI colors.
 * The frontend fetches this via /api/config instead of maintaining its own copy.
 */

// ESA WorldCover class metadata — codes, human-readable names, and UI colors.
const LANDCOVER_META = {
    10:  { name: 'Tree/Forest',     color: '#2D6A4F' },  // muted deep teal-green
    20:  { name: 'Shrubland',       color: '#A67C52' },  // warm brown
    30:  { name: 'Grassland',       color: '#7CB518' },  // olive green
    40:  { name: 'Cropland',        color: '#D4A843' },  // muted gold
    50:  { name: 'Built-up/Urban',  color: '#8D99AE' },  // cool grey (satellite-like)
    60:  { name: 'Bare/Sparse',     color: '#B8A99A' },  // warm grey
    70:  { name: 'Snow/Ice',        color: '#D0E1F9' },  // ice blue-grey
    80:  { name: 'Water',           color: '#4895EF' },  // soft blue
    90:  { name: 'Wetland',         color: '#48BFE3' },  // lake blue
    95:  { name: 'Mangroves',       color: '#40916C' },  // deep green
    100: { name: 'Moss/Lichen',     color: '#8CB369' }   // moss green
};

const VALID_LANDCOVER_CLASSES = Object.keys(LANDCOVER_META).map(Number);

// Column names for continuous landcover percentages (V2 CSV schema, optional)
const LC_PCT_COLUMNS = VALID_LANDCOVER_CLASSES.map(cls => `lc_pct_${cls}`);

/**
 * Normalize landcover_class to nearest valid ESA WorldCover class
 * Handles float precision issues (e.g., 79.999... -> 80)
 * Maps invalid values to nearest valid class
 *
 * IMPORTANT: Returns null for empty/null/undefined values to preserve missing data
 * Do NOT default missing values to 10 (Tree/Forest) - this would skew percentages
 *
 * Also treats values < 10 (e.g., 0) as missing data, since ESA WorldCover
 * valid classes start at 10. If your data uses 0 to encode missing landcover,
 * it will be correctly treated as null (not normalized to 10).
 */
function normalizeLandcoverClass(value) {
    if (value == null || value === '' || (typeof value === 'string' && value.trim() === '')) {
        return null;
    }

    const num = parseFloat(value);
    if (isNaN(num)) {
        return null;
    }

    const rounded = Math.round(num);

    if (rounded < 10) {
        return null;
    }

    if (VALID_LANDCOVER_CLASSES.includes(rounded)) {
        return rounded;
    }

    // Find nearest valid class
    let nearest = VALID_LANDCOVER_CLASSES[0];
    let minDiff = Math.abs(rounded - nearest);

    for (const cls of VALID_LANDCOVER_CLASSES) {
        const diff = Math.abs(rounded - cls);
        if (diff < minDiff) {
            minDiff = diff;
            nearest = cls;
        }
    }

    return nearest;
}

/**
 * Extract per-class landcover percentages from a grid cell.
 * Returns { classCode: pct } for classes with pct > 0 (including Water class 80).
 * Note: lc_pct_* denominator includes all pixels (land + water), so percentages
 * reflect total cell coverage. This is consistent with both continuous and discrete paths.
 */
function getCellLcDistribution(cell) {
    const dist = {};
    for (const cls of VALID_LANDCOVER_CLASSES) {
        const pct = cell[`lc_pct_${cls}`];
        if (Number.isFinite(pct) && pct > 0) {
            dist[cls] = pct;
        }
    }
    return dist;
}

/**
 * Check if a cell has continuous lc_pct_* data.
 * Returns false if all lc_pct_* are 0 or missing (fallback to discrete classification).
 */
function hasContinuousLcData(cell) {
    return LC_PCT_COLUMNS.some(col => Number.isFinite(cell[col]) && cell[col] > 0);
}

module.exports = {
    LANDCOVER_META,
    VALID_LANDCOVER_CLASSES,
    LC_PCT_COLUMNS,
    normalizeLandcoverClass,
    getCellLcDistribution,
    hasContinuousLcData
};
