/**
 * Spatial index and viewport calculations.
 *
 * Grid cells are GRID_SIZE x GRID_SIZE degrees. The spatial index
 * uses integer bucket keys: ix = floor((lon+180)/GRID_SIZE),
 * iy = floor((lat+90)/GRID_SIZE), compositeKey = ix * LAT_BUCKETS + iy.
 * This avoids floating-point string issues and gives O(1) lookups.
 *
 * Two aggregation strategies:
 *   - Legacy:        simple average across grid count
 *   - Area-weighted: weighted by land_area_km2 * landFractionWeight()
 *
 * The final stats are used for sonification via the Web Audio engine.
 */

const { normalizeOscValues } = require('./normalize');
const {
    VALID_LANDCOVER_CLASSES,
    WATER_CLASS,
    normalizeLandcoverClass,
    getCellLcDistribution,
} = require('./landcover');
const {
    USE_LEGACY_AGGREGATION,
    MIN_LAND_AREA_KM2,
    landFractionWeight,
    GRID_SIZE,
    LON_BUCKETS,
    LAT_BUCKETS,
} = require('./config');
const { NIGHTLIGHT_NO_DATA } = require('./data-loader');

// ============ Constants ============

/** Maximum number of landcover classes shown in the frontend breakdown panel. */
const LANDCOVER_DISPLAY_TOP_N = 5;

/** Minimum percentage for a landcover class to be shown individually (rest → "Other"). */
const LANDCOVER_MIN_DISPLAY_PCT = 1.0;

// ============ Module State ============

let spatialIndex = null;
let gridData = [];
let normalizeParams = null;

/**
 * Extract a valid landcover class from a grid cell.
 * Returns a valid ESA class (integer) or null if missing/invalid.
 *
 * @param {import('./types').GridCell} cell
 * @returns {number|null}
 */
function getValidLandcover(cell) {
    if (
        cell.landcover_class == null ||
        cell.landcover_class === '' ||
        isNaN(cell.landcover_class)
    ) {
        return null;
    }
    return VALID_LANDCOVER_CLASSES.includes(cell.landcover_class)
        ? cell.landcover_class
        : normalizeLandcoverClass(cell.landcover_class);
}

/**
 * Initialize spatial module with loaded data.
 *
 * @param {import('./types').GridCell[]} data
 * @param {import('./types').NormalizeParams} normParams
 * @returns {void}
 */
function init(data, normParams) {
    gridData = data;
    normalizeParams = normParams;
    buildSpatialIndex();
}

/**
 * Convert geographic lon/lat to a single integer bucket key.
 * ix = floor((lon + 180) / GRID_SIZE)  — range [0, LON_BUCKETS)
 * iy = floor((lat + 90)  / GRID_SIZE)  — range [0, LAT_BUCKETS)
 * Composite key = ix * LAT_BUCKETS + iy — single integer for Map lookup.
 *
 * @param {number} lon
 * @param {number} lat
 * @returns {number} Composite bucket key
 */
function lonLatToBucketKey(lon, lat) {
    const ix = Math.min(Math.floor((lon + 180) / GRID_SIZE), LON_BUCKETS - 1);
    const iy = Math.min(Math.floor((lat + 90) / GRID_SIZE), LAT_BUCKETS - 1);
    return ix * LAT_BUCKETS + iy;
}

/**
 * Build spatial index from gridData for O(1) viewport lookups.
 * Map<compositeKey, cell[]>
 * @returns {void}
 */
function buildSpatialIndex() {
    spatialIndex = new Map();
    for (const cell of gridData) {
        const key = lonLatToBucketKey(cell.lon, cell.lat);
        if (!spatialIndex.has(key)) {
            spatialIndex.set(key, []);
        }
        spatialIndex.get(key).push(cell);
    }
    console.log(
        `[Index] Built spatial index: ${spatialIndex.size} buckets (GRID_SIZE=${GRID_SIZE}°)`
    );
}

/**
 * Query grids that intersect the given bounds.
 * Handles date-line crossing (west > east).
 * @param {number[]} bounds - [west, south, east, north]
 * @returns {{ gridsInView: import('./types').GridCell[], theoreticalGridCount: number }}
 */
function queryGridsInBounds(bounds) {
    const [west, south, east, north] = bounds;
    let gridsInView = [];
    let theoreticalGridCount = 0;

    const crossesDateLine = west > east;
    const ranges = crossesDateLine
        ? [
              { west, east: 180 },
              { west: -180, east },
          ]
        : [{ west, east }];

    // Count theoretical grid cells (all possible 0.5° buckets in the viewport)
    // using the same bucket-index ranges and fine-grained intersection test as
    // the data query, so the two counts are perfectly consistent.
    for (const range of ranges) {
        const ixStart = Math.max(0, Math.floor((range.west + 180) / GRID_SIZE));
        const ixEnd = Math.min(LON_BUCKETS - 1, Math.ceil((range.east + 180) / GRID_SIZE) - 1);
        const iyStart = Math.max(0, Math.floor((south + 90) / GRID_SIZE));
        const iyEnd = Math.min(LAT_BUCKETS - 1, Math.ceil((north + 90) / GRID_SIZE) - 1);

        for (let ix = ixStart; ix <= ixEnd; ix++) {
            const gw = ix * GRID_SIZE - 180;
            const ge = gw + GRID_SIZE;
            if (!(gw < range.east && ge > range.west)) continue;

            for (let iy = iyStart; iy <= iyEnd; iy++) {
                const gs = iy * GRID_SIZE - 90;
                const gn = gs + GRID_SIZE;
                if (gs < north && gn > south) {
                    theoreticalGridCount++;
                }
            }
        }
    }

    if (spatialIndex && spatialIndex.size > 0) {
        for (const range of ranges) {
            // Convert geographic bounds to bucket index ranges.
            // A bucket (ix, iy) covers [ix*GS-180, (ix+1)*GS-180) x [iy*GS-90, (iy+1)*GS-90).
            // NOTE: ceil()-1 means we exclude the bucket whose left edge == range.east.
            // This is intentional — the fine-grained test below uses strict-less-than (<)
            // for the same edge, so the two are consistent. Do not change one without the other.
            const ixStart = Math.max(0, Math.floor((range.west + 180) / GRID_SIZE));
            const ixEnd = Math.min(LON_BUCKETS - 1, Math.ceil((range.east + 180) / GRID_SIZE) - 1);
            const iyStart = Math.max(0, Math.floor((south + 90) / GRID_SIZE));
            const iyEnd = Math.min(LAT_BUCKETS - 1, Math.ceil((north + 90) / GRID_SIZE) - 1);

            for (let ix = ixStart; ix <= ixEnd; ix++) {
                for (let iy = iyStart; iy <= iyEnd; iy++) {
                    const key = ix * LAT_BUCKETS + iy;
                    const cells = spatialIndex.get(key);
                    if (!cells) continue;

                    for (const cell of cells) {
                        // Fine-grained intersection: open boundaries (strict < / >)
                        // to exclude cells that merely touch at an edge.
                        // Coupled with ceil()-1 above — see note.
                        const gridWest = cell.lon;
                        const gridEast = cell.lon + GRID_SIZE;
                        const gridSouth = cell.lat;
                        const gridNorth = cell.lat + GRID_SIZE;

                        if (
                            gridWest < range.east &&
                            gridEast > range.west &&
                            gridSouth < north &&
                            gridNorth > south
                        ) {
                            gridsInView.push(cell);
                        }
                    }
                }
            }
        }
    } else {
        // Fallback to O(N) filter if index not available
        gridsInView = gridData.filter((g) => {
            const gridEast = g.lon + GRID_SIZE;
            const gridNorth = g.lat + GRID_SIZE;

            const latOverlap = g.lat < north && gridNorth > south;
            if (!latOverlap) return false;

            if (crossesDateLine) {
                return (g.lon < 180 && gridEast > west) || (g.lon < east && gridEast > -180);
            }
            return g.lon < east && gridEast > west;
        });
    }

    return { gridsInView, theoreticalGridCount };
}

/**
 * Assemble the stats object returned to the frontend and OSC pipeline.
 *
 * @param {{ dominantLandcover?: number|null, nightlightNorm?: number, populationNorm?: number, forestNorm?: number, avgForestPct?: number, avgPopulationDensity?: number, avgNightlightMean?: number, avgNightlightP90?: number, gridCount?: number, lcCounts?: Object<string, number>, displayItems?: import('./types').LandcoverBreakdownItem[] }} params
 * @returns {import('./types').ViewportStats}
 */
function buildStatsResult({
    dominantLandcover,
    nightlightNorm,
    populationNorm,
    forestNorm,
    avgForestPct,
    avgPopulationDensity,
    avgNightlightMean,
    avgNightlightP90,
    gridCount,
    lcCounts,
    displayItems,
}) {
    return {
        dominantLandcover,
        nightlightNorm: nightlightNorm ?? 0,
        populationNorm: populationNorm ?? 0,
        forestNorm: forestNorm ?? 0,
        avgForestPct: avgForestPct ?? 0,
        avgPopulationDensity: avgPopulationDensity ?? 0,
        avgNightlightMean: avgNightlightMean ?? 0,
        avgNightlightP90: avgNightlightP90 ?? 0,
        gridCount: gridCount ?? 0,
        landcoverDistribution: lcCounts ?? {},
        landcoverBreakdown: displayItems ?? [],
    };
}

/**
 * Default stats when viewport has no grid data (e.g. open ocean).
 * dominantLandcover is 80 (Water); OSC sends /landcover 80, /lc/80 1.0.
 *
 * @param {number} [gridCount=0]
 * @returns {import('./types').ViewportStats}
 */
function emptyStats(gridCount = 0) {
    return buildStatsResult({ dominantLandcover: 80, gridCount, lcCounts: { 80: 1 } });
}

/**
 * Build the landcover percentage breakdown for the frontend panel.
 * Shows the top 5 classes (each >= 1%), merges the rest into "Other".
 * @param {Object<string, number>} lcCounts - { classId: weight } (count or km2)
 * @param {number} totalWeight - Denominator for percentage calculation
 * @returns {{ displayItems: import('./types').LandcoverBreakdownItem[], dominantLandcover: number|null }}
 */
function buildLandcoverBreakdown(lcCounts, totalWeight) {
    if (totalWeight <= 0 || Object.keys(lcCounts).length === 0) {
        return { displayItems: [], dominantLandcover: null };
    }

    // Find dominant
    let dominantLandcover = 10;
    let maxWeight = 0;
    Object.entries(lcCounts).forEach(([lc, w]) => {
        if (w > maxWeight) {
            maxWeight = w;
            dominantLandcover = Number(lc);
        }
    });

    const landcoverPercentages = Object.entries(lcCounts)
        .map(([lc, w]) => ({
            class: Number(lc),
            count: w,
            percentage: (w / totalWeight) * 100,
        }))
        .sort((a, b) => b.percentage - a.percentage);

    let displayItems = [];
    let otherItems = [];
    let otherTotalPercentage = 0;

    landcoverPercentages.forEach((item, index) => {
        if (index < LANDCOVER_DISPLAY_TOP_N && item.percentage >= LANDCOVER_MIN_DISPLAY_PCT) {
            displayItems.push(item);
        } else {
            otherItems.push(item);
            otherTotalPercentage += item.percentage;
        }
    });

    if (otherItems.length > 0 && otherTotalPercentage > 0) {
        displayItems.push({
            class: null,
            count: otherItems.reduce((sum, item) => sum + item.count, 0),
            percentage: otherTotalPercentage,
        });
    }

    // Adjust rounding so percentages sum closer to 100%.
    // Distribute the delta proportionally to the largest items (by percentage)
    // to avoid skewing any single item.
    if (displayItems.length > 0) {
        const totalPercentage = displayItems.reduce((sum, item) => sum + item.percentage, 0);
        const roundingDiff = 100 - totalPercentage;
        if (Math.abs(roundingDiff) > 0.1 && totalPercentage > 0) {
            for (const item of displayItems) {
                const share = item.percentage / totalPercentage;
                item.percentage = Math.max(
                    0,
                    Math.min(100, item.percentage + roundingDiff * share)
                );
            }
        }
    }

    // Filter out items that rounded down to 0%
    displayItems = displayItems.filter((item) => item.percentage > 0);

    return { displayItems, dominantLandcover };
}

/**
 * Calculate viewport stats (legacy aggregation: simple average / grid-count).
 *
 * @param {import('./types').GridCell[]} gridsInView
 * @returns {import('./types').ViewportStats}
 */
function calculateLegacyStats(gridsInView) {
    const n = gridsInView.length;
    const avgForest = n > 0 ? gridsInView.reduce((s, g) => s + (g.forest_pct ?? 0), 0) / n : 0;
    const avgPopulation =
        n > 0 ? gridsInView.reduce((s, g) => s + (g.population_density ?? 0), 0) / n : 0;
    // Exclude NIGHTLIGHT_NO_DATA sentinel (no VIIRS data) from nightlight averages
    const nlP90Cells = gridsInView.filter((g) => (g.nightlight_p90 ?? NIGHTLIGHT_NO_DATA) >= 0);
    const nlMeanCells = gridsInView.filter((g) => (g.nightlight_mean ?? NIGHTLIGHT_NO_DATA) >= 0);
    const avgNightlightP90 =
        nlP90Cells.length > 0
            ? nlP90Cells.reduce((s, g) => s + g.nightlight_p90, 0) / nlP90Cells.length
            : 0;
    const avgNightlightMean =
        nlMeanCells.length > 0
            ? nlMeanCells.reduce((s, g) => s + g.nightlight_mean, 0) / nlMeanCells.length
            : 0;

    const lcCounts = {};
    let validCount = 0;
    gridsInView.forEach((g) => {
        const cellDist = getCellLcDistribution(g);
        const pctSum = Object.values(cellDist).reduce((s, v) => s + v, 0);
        if (pctSum > 0) {
            for (const [cls, pct] of Object.entries(cellDist)) {
                lcCounts[cls] = (lcCounts[cls] || 0) + pct / pctSum;
            }
            validCount += 1;
        } else {
            const lc = getValidLandcover(g);
            if (lc == null || lc === WATER_CLASS) return;
            lcCounts[lc] = (lcCounts[lc] || 0) + 1;
            validCount += 1;
        }
    });

    const { displayItems, dominantLandcover } = buildLandcoverBreakdown(
        lcCounts,
        validCount > 0 ? validCount : 1
    );
    const { nightlightNorm, populationNorm, forestNorm } = normalizeOscValues(
        avgNightlightP90,
        avgPopulation,
        avgForest,
        normalizeParams
    );

    return buildStatsResult({
        dominantLandcover,
        nightlightNorm,
        populationNorm,
        forestNorm,
        avgForestPct: avgForest,
        avgPopulationDensity: avgPopulation,
        avgNightlightMean,
        avgNightlightP90,
        gridCount: gridsInView.length,
        lcCounts,
        displayItems,
    });
}

/**
 * Calculate viewport stats using area-weighted aggregation (v2).
 *
 * Each cell's contribution is weighted by:
 *   weight = land_area_km2 * landFractionWeight(land_fraction)
 *
 * This gives larger / more-land cells proportionally more influence,
 * reducing the bias from tiny coastal slivers.
 *
 * @param {import('./types').GridCell[]} gridsInView
 * @returns {import('./types').ViewportStats}
 */
function calculateAreaWeightedStats(gridsInView) {
    // lcCounts: { classId: totalWeightedArea } for landcover distribution
    const lcCounts = {};
    let validLandcoverWeight = 0; // denominator for landcover percentages

    // Accumulators for weighted averages
    let sumLandAreaKm2 = 0;
    let sumForestPctWeighted = 0;
    let sumPopulationTotal = 0;
    let sumNightlightMeanWeighted = 0;
    let sumNightlightP90Weighted = 0;
    let sumNightlightLandArea = 0; // separate weight for nightlight (excludes -1 sentinel cells)

    gridsInView.forEach((g) => {
        const baseLandAreaKm2 = Number.isFinite(g.land_area_km2) ? g.land_area_km2 : 0;
        if (baseLandAreaKm2 <= 0) return;
        if (MIN_LAND_AREA_KM2 > 0 && baseLandAreaKm2 < MIN_LAND_AREA_KM2) return;

        // Compute coastal down-weight multiplier
        const lfRaw = Number.isFinite(g.land_fraction)
            ? g.land_fraction
            : Number.isFinite(g.cell_area_km2) && g.cell_area_km2 > 0
              ? baseLandAreaKm2 / g.cell_area_km2
              : 0;
        const wMult = landFractionWeight(lfRaw);
        if (!Number.isFinite(wMult) || wMult <= 0) return;

        const weightLandAreaKm2 = baseLandAreaKm2 * wMult;
        if (weightLandAreaKm2 <= 0) return;

        sumLandAreaKm2 += weightLandAreaKm2;
        sumForestPctWeighted += (g.forest_pct ?? 0) * weightLandAreaKm2;
        // Population density: sum(pop * wMult) / sum(area * wMult) gives the area-weighted
        // average density. wMult (coastal down-weight) appears in both numerator and denominator,
        // so the ratio is a valid weighted average of per-cell density = pop_i / area_i.
        sumPopulationTotal += (g.population_total ?? 0) * wMult;
        // Exclude NIGHTLIGHT_NO_DATA sentinel (no VIIRS data) from nightlight weighted averages
        const nlMean = g.nightlight_mean ?? NIGHTLIGHT_NO_DATA;
        const nlP90 = g.nightlight_p90 ?? NIGHTLIGHT_NO_DATA;
        if (nlMean >= 0 && nlP90 >= 0) {
            sumNightlightMeanWeighted += nlMean * weightLandAreaKm2;
            sumNightlightP90Weighted += nlP90 * weightLandAreaKm2;
            sumNightlightLandArea += weightLandAreaKm2;
        }

        const cellDist = getCellLcDistribution(g);
        const pctSum = Object.values(cellDist).reduce((s, v) => s + v, 0);
        if (pctSum > 0) {
            for (const [cls, pct] of Object.entries(cellDist)) {
                lcCounts[cls] = (lcCounts[cls] || 0) + weightLandAreaKm2 * (pct / pctSum);
            }
            validLandcoverWeight += weightLandAreaKm2;
        } else {
            const lc = getValidLandcover(g);
            if (lc != null && lc !== WATER_CLASS) {
                lcCounts[lc] = (lcCounts[lc] || 0) + weightLandAreaKm2;
                validLandcoverWeight += weightLandAreaKm2;
            }
        }
    });

    // Weighted averages (divide accumulated sums by total weight)
    // Nightlight uses its own weight sum to exclude cells with -1 sentinel (no VIIRS data)
    const avgNightlightMean =
        sumNightlightLandArea > 0 ? sumNightlightMeanWeighted / sumNightlightLandArea : 0;
    // NOTE: area-weighted mean of cell-level p90, not a true viewport percentile
    const avgNightlightP90 =
        sumNightlightLandArea > 0 ? sumNightlightP90Weighted / sumNightlightLandArea : 0;
    const avgPopulation = sumLandAreaKm2 > 0 ? sumPopulationTotal / sumLandAreaKm2 : 0;
    const avgForest = sumLandAreaKm2 > 0 ? sumForestPctWeighted / sumLandAreaKm2 : 0;

    const { nightlightNorm, populationNorm, forestNorm } = normalizeOscValues(
        avgNightlightP90,
        avgPopulation,
        avgForest,
        normalizeParams
    );

    if (validLandcoverWeight <= 0) {
        return buildStatsResult({
            dominantLandcover: null,
            nightlightNorm,
            populationNorm,
            forestNorm,
            avgForestPct: avgForest,
            avgPopulationDensity: avgPopulation,
            avgNightlightMean,
            avgNightlightP90,
            gridCount: gridsInView.length,
        });
    }

    const { displayItems, dominantLandcover } = buildLandcoverBreakdown(
        lcCounts,
        validLandcoverWeight
    );

    return buildStatsResult({
        dominantLandcover,
        nightlightNorm,
        populationNorm,
        forestNorm,
        avgForestPct: avgForest,
        avgPopulationDensity: avgPopulation,
        avgNightlightMean,
        avgNightlightP90,
        gridCount: gridsInView.length,
        lcCounts,
        displayItems,
    });
}

/**
 * Calculate viewport statistics for the given bounds.
 * @param {number[]} bounds - [west, south, east, north]
 * @returns {import('./types').ViewportStats & { theoreticalGridCount: number, landCoverageRatio: number, gridsInView: import('./types').GridCell[] }}
 */
function calculateViewportStats(bounds) {
    const { gridsInView, theoreticalGridCount } = queryGridsInBounds(bounds);

    const landCoverageRatio =
        theoreticalGridCount > 0 ? gridsInView.length / theoreticalGridCount : 0;

    if (gridsInView.length === 0) {
        return { ...emptyStats(0), theoreticalGridCount, landCoverageRatio, gridsInView };
    }

    const stats = USE_LEGACY_AGGREGATION
        ? calculateLegacyStats(gridsInView)
        : calculateAreaWeightedStats(gridsInView);

    return { ...stats, theoreticalGridCount, landCoverageRatio, gridsInView };
}

/**
 * Get all loaded grid data.
 * @returns {import('./types').GridCell[]}
 */
function getGridData() {
    return gridData;
}

/**
 * Get the normalization params (for per-grid OSC).
 * @returns {import('./types').NormalizeParams|null}
 */
function getNormalizeParams() {
    return normalizeParams;
}

/**
 * Validate bounds array: [west, south, east, north]
 *
 * @param {*} bounds
 * @returns {{ valid: true, bounds: number[] } | { valid: false, error: string }}
 */
function validateBounds(bounds) {
    if (!bounds || !Array.isArray(bounds) || bounds.length !== 4) {
        return {
            valid: false,
            error: 'Invalid bounds. Expected [west, south, east, north] array with 4 elements',
        };
    }

    const parsed = bounds.map((v) => {
        if (typeof v === 'string') {
            const trimmed = v.trim();
            if (trimmed === '') {
                return NaN;
            }
            return Number(trimmed);
        }
        return v;
    });

    if (parsed.some((v) => !Number.isFinite(v))) {
        return { valid: false, error: 'Bounds contain non-numeric values' };
    }

    const [west, south, east, north] = parsed;

    // Wrap longitude to [-180, 180] — Mapbox getBounds() can return unwrapped
    // values (e.g. -210, 195) when the user pans past the antimeridian.
    const wrapLon = (lon) => ((((lon + 180) % 360) + 360) % 360) - 180;

    // If the unwrapped span covers the full globe, clamp to full extent
    // instead of wrapping (which would collapse e.g. (-350,10) to (10,10)).
    let wrappedWest, wrappedEast;
    if (east - west >= 360) {
        wrappedWest = -180;
        wrappedEast = 180;
    } else {
        wrappedWest = wrapLon(west);
        wrappedEast = wrapLon(east);
    }

    if (south < -90 || south > 90 || north < -90 || north > 90) {
        return { valid: false, error: 'Latitude out of range. Valid: -90 to 90' };
    }
    if (south > north) {
        return { valid: false, error: 'Invalid bounds: south > north' };
    }

    return { valid: true, bounds: [wrappedWest, south, wrappedEast, north] };
}

module.exports = {
    init,
    queryGridsInBounds,
    calculateViewportStats,
    validateBounds,
    getGridData,
    getNormalizeParams,
};
