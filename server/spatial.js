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
 * The final stats are sent to MaxMSP (via osc.js) for sonification.
 */

const { normalizeOscValues } = require('./normalize');
const { VALID_LANDCOVER_CLASSES, normalizeLandcoverClass, getCellLcDistribution } = require('./landcover');
const { USE_LEGACY_AGGREGATION, MIN_LAND_AREA_KM2, landFractionWeight, GRID_SIZE, LON_BUCKETS, LAT_BUCKETS } = require('./config');
const { NIGHTLIGHT_NO_DATA } = require('./data-loader');

let spatialIndex = null;
let gridData = [];
let normalizeParams = null;

/**
 * Extract a valid landcover class from a grid cell.
 * Returns a valid ESA class (integer) or null if missing/invalid.
 */
function getValidLandcover(cell) {
    if (cell.landcover_class == null || cell.landcover_class === '' || isNaN(cell.landcover_class)) {
        return null;
    }
    return VALID_LANDCOVER_CLASSES.includes(cell.landcover_class)
        ? cell.landcover_class
        : normalizeLandcoverClass(cell.landcover_class);
}

/**
 * Initialize spatial module with loaded data.
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
 */
function lonLatToBucketKey(lon, lat) {
    const ix = Math.min(Math.floor((lon + 180) / GRID_SIZE), LON_BUCKETS - 1);
    const iy = Math.min(Math.floor((lat + 90) / GRID_SIZE), LAT_BUCKETS - 1);
    return ix * LAT_BUCKETS + iy;
}

/**
 * Build spatial index from gridData for O(1) viewport lookups.
 * Map<compositeKey, cell[]>
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
    console.log(`[Index] Built spatial index: ${spatialIndex.size} buckets (GRID_SIZE=${GRID_SIZE}°)`);
}

/**
 * Query grids that intersect the given bounds.
 * Handles date-line crossing (west > east).
 * @param {number[]} bounds - [west, south, east, north]
 * @returns {object[]} grids in viewport
 */
function queryGridsInBounds(bounds) {
    const [west, south, east, north] = bounds;
    let gridsInView = [];

    if (spatialIndex && spatialIndex.size > 0) {
        const crossesDateLine = west > east;
        const ranges = crossesDateLine
            ? [{ west, east: 180 }, { west: -180, east }]
            : [{ west, east }];

        for (const range of ranges) {
            // Convert geographic bounds to bucket index ranges.
            // A bucket (ix, iy) covers [ix*GS-180, (ix+1)*GS-180) x [iy*GS-90, (iy+1)*GS-90).
            // NOTE: ceil()-1 means we exclude the bucket whose left edge == range.east.
            // This is intentional — the fine-grained test below uses strict-less-than (<)
            // for the same edge, so the two are consistent. Do not change one without the other.
            const ixStart = Math.max(0, Math.floor((range.west + 180) / GRID_SIZE));
            const ixEnd   = Math.min(LON_BUCKETS - 1, Math.ceil((range.east + 180) / GRID_SIZE) - 1);
            const iyStart = Math.max(0, Math.floor((south + 90) / GRID_SIZE));
            const iyEnd   = Math.min(LAT_BUCKETS - 1, Math.ceil((north + 90) / GRID_SIZE) - 1);

            for (let ix = ixStart; ix <= ixEnd; ix++) {
                for (let iy = iyStart; iy <= iyEnd; iy++) {
                    const key = ix * LAT_BUCKETS + iy;
                    const cells = spatialIndex.get(key);
                    if (!cells) continue;

                    for (const cell of cells) {
                        // Fine-grained intersection: open boundaries (strict < / >)
                        // to exclude cells that merely touch at an edge.
                        // Coupled with ceil()-1 above — see note.
                        const gridWest  = cell.lon;
                        const gridEast  = cell.lon + GRID_SIZE;
                        const gridSouth = cell.lat;
                        const gridNorth = cell.lat + GRID_SIZE;

                        if (gridWest < range.east && gridEast > range.west &&
                            gridSouth < north && gridNorth > south) {
                            gridsInView.push(cell);
                        }
                    }
                }
            }
        }
    } else {
        // Fallback to O(N) filter if index not available
        const crossesDateLine = west > east;
        gridsInView = gridData.filter(g => {
            const gridEast  = g.lon + GRID_SIZE;
            const gridNorth = g.lat + GRID_SIZE;

            const latOverlap = g.lat < north && gridNorth > south;
            if (!latOverlap) return false;

            if (crossesDateLine) {
                return (g.lon < 180 && gridEast > west) ||
                       (g.lon < east && gridEast > -180);
            }
            return g.lon < east && gridEast > west;
        });
    }

    return gridsInView;
}

/** Assemble the stats object returned to the frontend and OSC pipeline. */
function buildStatsResult({ dominantLandcover, nightlightNorm, populationNorm, forestNorm,
    avgForestPct, avgPopulationDensity, avgNightlightMean, avgNightlightP90,
    gridCount, lcCounts, displayItems }) {
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
        landcoverBreakdown: displayItems ?? []
    };
}

/**
 * Default stats when viewport has no grid data (e.g. open ocean).
 * Uses 80 (Permanent Water Bodies) as the dominant landcover.
 */
function emptyStats(gridCount = 0) {
    return buildStatsResult({ dominantLandcover: 80, gridCount });
}

/**
 * Build the landcover percentage breakdown for the frontend panel.
 * Shows the top 5 classes (each >= 1%), merges the rest into "Other".
 * @param {Object} lcCounts  — { classId: weight } (count or km2)
 * @param {number} totalWeight — denominator for percentage calculation
 * @returns {{ displayItems: Array, dominantLandcover: number }}
 */
function buildLandcoverBreakdown(lcCounts, totalWeight) {
    if (totalWeight <= 0 || Object.keys(lcCounts).length === 0) {
        return { displayItems: [], dominantLandcover: 80 };
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
            percentage: (w / totalWeight) * 100
        }))
        .sort((a, b) => b.percentage - a.percentage);

    const DISPLAY_TOP_N = 5;
    const MIN_PERCENTAGE_THRESHOLD = 1.0;

    let displayItems = [];
    let otherItems = [];
    let otherTotalPercentage = 0;

    landcoverPercentages.forEach((item, index) => {
        if (index < DISPLAY_TOP_N && item.percentage >= MIN_PERCENTAGE_THRESHOLD) {
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
            percentage: otherTotalPercentage
        });
    }

    // Adjust rounding so percentages sum closer to 100%
    if (displayItems.length > 0) {
        const totalPercentage = displayItems.reduce((sum, item) => sum + item.percentage, 0);
        const roundingDiff = 100 - totalPercentage;
        if (Math.abs(roundingDiff) > 0.1) {
            const lastItem = displayItems[displayItems.length - 1];
            lastItem.percentage = Math.max(0, Math.min(100, lastItem.percentage + roundingDiff));
        }
    }

    // Filter out items that rounded down to 0%
    displayItems = displayItems.filter(item => item.percentage > 0);

    return { displayItems, dominantLandcover };
}


/**
 * Calculate viewport stats (legacy aggregation: simple average / grid-count).
 */
function calculateLegacyStats(gridsInView) {
    const n = gridsInView.length;
    const avgForest = n > 0 ? gridsInView.reduce((s, g) => s + (g.forest_pct ?? 0), 0) / n : 0;
    const avgPopulation = n > 0 ? gridsInView.reduce((s, g) => s + (g.population_density ?? 0), 0) / n : 0;
    // Exclude NIGHTLIGHT_NO_DATA sentinel (no VIIRS data) from nightlight averages
    const nlP90Cells = gridsInView.filter(g => (g.nightlight_p90 ?? NIGHTLIGHT_NO_DATA) >= 0);
    const nlMeanCells = gridsInView.filter(g => (g.nightlight_mean ?? NIGHTLIGHT_NO_DATA) >= 0);
    const avgNightlightP90 = nlP90Cells.length > 0 ? nlP90Cells.reduce((s, g) => s + g.nightlight_p90, 0) / nlP90Cells.length : 0;
    const avgNightlightMean = nlMeanCells.length > 0 ? nlMeanCells.reduce((s, g) => s + g.nightlight_mean, 0) / nlMeanCells.length : 0;

    const lcCounts = {};
    let validCount = 0;
    gridsInView.forEach((g) => {
        const cellDist = getCellLcDistribution(g);
        const pctSum = Object.values(cellDist).reduce((s, v) => s + v, 0);
        if (pctSum > 0) {
            for (const [cls, pct] of Object.entries(cellDist)) {
                lcCounts[cls] = (lcCounts[cls] || 0) + (pct / pctSum);
            }
            validCount += 1;
        } else {
            const lc = getValidLandcover(g);
            if (lc == null) return;
            lcCounts[lc] = (lcCounts[lc] || 0) + 1;
            validCount += 1;
        }
    });

    const { displayItems, dominantLandcover } = buildLandcoverBreakdown(lcCounts, validCount > 0 ? validCount : 1);
    const { nightlightNorm, populationNorm, forestNorm } = normalizeOscValues(avgNightlightP90, avgPopulation, avgForest, normalizeParams);

    return buildStatsResult({
        dominantLandcover, nightlightNorm, populationNorm, forestNorm,
        avgForestPct: avgForest, avgPopulationDensity: avgPopulation,
        avgNightlightMean, avgNightlightP90,
        gridCount: gridsInView.length, lcCounts, displayItems
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
 */
function calculateAreaWeightedStats(gridsInView) {
    // lcCounts: { classId: totalWeightedArea } for landcover distribution
    const lcCounts = {};
    let validLandcoverWeight = 0;  // denominator for landcover percentages

    // Accumulators for weighted averages
    let sumLandAreaKm2 = 0;
    let sumForestPctWeighted = 0;
    let sumPopulationTotal = 0;
    let sumNightlightMeanWeighted = 0;
    let sumNightlightP90Weighted = 0;
    let sumNightlightLandArea = 0;  // separate weight for nightlight (excludes -1 sentinel cells)

    gridsInView.forEach(g => {
        const baseLandAreaKm2 = Number.isFinite(g.land_area_km2) ? g.land_area_km2 : 0;
        if (baseLandAreaKm2 <= 0) return;
        if (MIN_LAND_AREA_KM2 > 0 && baseLandAreaKm2 < MIN_LAND_AREA_KM2) return;

        // Compute coastal down-weight multiplier
        const lfRaw = Number.isFinite(g.land_fraction)
            ? g.land_fraction
            : (Number.isFinite(g.cell_area_km2) && g.cell_area_km2 > 0 ? (baseLandAreaKm2 / g.cell_area_km2) : 0);
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
            if (lc != null) {
                lcCounts[lc] = (lcCounts[lc] || 0) + weightLandAreaKm2;
                validLandcoverWeight += weightLandAreaKm2;
            }
        }
    });

    // Weighted averages (divide accumulated sums by total weight)
    // Nightlight uses its own weight sum to exclude cells with -1 sentinel (no VIIRS data)
    const avgNightlightMean = sumNightlightLandArea > 0 ? (sumNightlightMeanWeighted / sumNightlightLandArea) : 0;
    // NOTE: area-weighted mean of cell-level p90, not a true viewport percentile
    const avgNightlightP90 = sumNightlightLandArea > 0 ? (sumNightlightP90Weighted / sumNightlightLandArea) : 0;
    const avgPopulation = sumLandAreaKm2 > 0 ? (sumPopulationTotal / sumLandAreaKm2) : 0;
    const avgForest = sumLandAreaKm2 > 0 ? (sumForestPctWeighted / sumLandAreaKm2) : 0;

    const { nightlightNorm, populationNorm, forestNorm } = normalizeOscValues(avgNightlightP90, avgPopulation, avgForest, normalizeParams);

    if (validLandcoverWeight <= 0) {
        return buildStatsResult({
            dominantLandcover: 80, nightlightNorm, populationNorm, forestNorm,
            avgForestPct: avgForest, avgPopulationDensity: avgPopulation,
            avgNightlightMean, avgNightlightP90,
            gridCount: gridsInView.length
        });
    }

    const { displayItems, dominantLandcover } = buildLandcoverBreakdown(lcCounts, validLandcoverWeight);

    return buildStatsResult({
        dominantLandcover, nightlightNorm, populationNorm, forestNorm,
        avgForestPct: avgForest, avgPopulationDensity: avgPopulation,
        avgNightlightMean, avgNightlightP90,
        gridCount: gridsInView.length, lcCounts, displayItems
    });
}

/**
 * Calculate viewport statistics for the given bounds.
 * @param {number[]} bounds - [west, south, east, north]
 */
function calculateViewportStats(bounds) {
    const gridsInView = queryGridsInBounds(bounds);

    if (gridsInView.length === 0) {
        return { ...emptyStats(0), gridsInView };
    }

    const stats = USE_LEGACY_AGGREGATION
        ? calculateLegacyStats(gridsInView)
        : calculateAreaWeightedStats(gridsInView);

    return { ...stats, gridsInView };
}

/** Get all loaded grid data. */
function getGridData() {
    return gridData;
}

/** Get the normalization params (for per-grid OSC). */
function getNormalizeParams() {
    return normalizeParams;
}

/**
 * Validate bounds array: [west, south, east, north]
 * Returns { valid: true, bounds: [w,s,e,n] } or { valid: false, error: string }
 */
function validateBounds(bounds) {
    if (!bounds || !Array.isArray(bounds) || bounds.length !== 4) {
        return { valid: false, error: 'Invalid bounds. Expected [west, south, east, north] array with 4 elements' };
    }

    const parsed = bounds.map(v => {
        if (typeof v === 'string') {
            const trimmed = v.trim();
            if (trimmed === '') {
                return NaN;
            }
            return Number(trimmed);
        }
        return v;
    });

    if (parsed.some(v => !Number.isFinite(v))) {
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

// ============ Grid Merge (visual simplification for large viewports) ============

/**
 * Merge small grid cells into larger blocks for faster map rendering.
 * Groups 0.5° cells by flooring to `mergeSize` alignment, then aggregates
 * each group into a single synthetic cell.
 *
 * @param {object[]} grids - array of original grid cells
 * @param {number} mergeSize - target cell size in degrees (e.g. 1.0 or 2.0)
 * @returns {object[]} merged cells (same field schema as original cells)
 */
function mergeGrids(grids, mergeSize) {
    if (!grids || grids.length === 0) return grids;

    const groups = new Map();
    for (const cell of grids) {
        // lon/lat are bottom-left corners; floor to mergeSize grid
        const mLon = Math.floor(cell.lon / mergeSize) * mergeSize;
        const mLat = Math.floor(cell.lat / mergeSize) * mergeSize;
        const key = `${mLon}_${mLat}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(cell);
    }

    const merged = [];
    for (const [key, cells] of groups) {
        const [mLon, mLat] = key.split('_').map(Number);
        merged.push(aggregateCells(cells, mLon, mLat, mergeSize));
    }
    return merged;
}

/**
 * Aggregate a group of cells into a single synthetic cell.
 * Weighting is by land_area_km2, consistent with calculateAreaWeightedStats.
 *
 * @param {object[]} cells - cells to merge (1-4 for 1° merge, 1-16 for 2°)
 * @param {number} mLon - merged cell bottom-left longitude
 * @param {number} mLat - merged cell bottom-left latitude
 * @param {number} mergeSize - merged cell size in degrees
 * @returns {object} synthetic cell with same field schema
 */
function aggregateCells(cells, mLon, mLat, mergeSize) {
    // Fast path: single cell (no merge needed, just adjust coordinates)
    if (cells.length === 1) {
        const c = cells[0];
        return {
            ...c,
            grid_id: `merged_${mLon}_${mLat}`,
            lon: mLon,
            lat: mLat
        };
    }

    // --- Additive fields ---
    let sumLandArea = 0;
    let sumCellArea = 0;
    let sumForestArea = 0;
    let sumPopulation = 0;

    // --- Weighted-average accumulators ---
    let sumForestPctW = 0;       // Σ(forest_pct × land_area)
    let sumNlMeanW = 0;          // Σ(nightlight_mean × land_area)  (excl sentinel)
    let sumNlP90W = 0;           // Σ(nightlight_p90  × land_area)  (excl sentinel)
    let sumNlLandArea = 0;       // weight denominator for nightlight

    // --- Landcover distribution (area-weighted) ---
    const lcWeights = {};        // classId → Σ(lc_pct × land_area)
    let lcWeightTotal = 0;
    // Fallback: discrete class voting when lc_pct_* unavailable
    const discreteVotes = {};    // classId → Σ(land_area)
    let discreteVoteTotal = 0;

    const LC_CLASSES = [10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100];

    for (const g of cells) {
        const landArea = Number.isFinite(g.land_area_km2) ? g.land_area_km2 : 0;
        const cellArea = Number.isFinite(g.cell_area_km2) ? g.cell_area_km2 : 0;

        sumLandArea += landArea;
        sumCellArea += cellArea;
        sumForestArea += (Number.isFinite(g.forest_area_km2) ? g.forest_area_km2 : 0);
        sumPopulation += (Number.isFinite(g.population_total) ? g.population_total : 0);

        if (landArea > 0) {
            sumForestPctW += (g.forest_pct ?? 0) * landArea;

            // Nightlight: exclude -1 sentinel
            const nlMean = g.nightlight_mean ?? NIGHTLIGHT_NO_DATA;
            const nlP90 = g.nightlight_p90 ?? NIGHTLIGHT_NO_DATA;
            if (nlMean >= 0 && nlP90 >= 0) {
                sumNlMeanW += nlMean * landArea;
                sumNlP90W += nlP90 * landArea;
                sumNlLandArea += landArea;
            }

            // Landcover distribution
            const cellDist = getCellLcDistribution(g);
            const pctSum = Object.values(cellDist).reduce((s, v) => s + v, 0);
            if (pctSum > 0) {
                for (const [cls, pct] of Object.entries(cellDist)) {
                    lcWeights[cls] = (lcWeights[cls] || 0) + landArea * (pct / pctSum);
                }
                lcWeightTotal += landArea;
            } else {
                // Fallback: discrete class vote
                const lc = getValidLandcover(g);
                if (lc != null) {
                    discreteVotes[lc] = (discreteVotes[lc] || 0) + landArea;
                    discreteVoteTotal += landArea;
                }
            }
        }
    }

    // --- Compute merged lc_pct_* and dominant class ---
    // IMPORTANT: Exclude Water (class 80) from dominant class selection.
    // The original landcover_class in the CSV represents the dominant NON-WATER
    // land cover class (computed by Google Earth Engine). Many coastal/island cells
    // have 70-93% water coverage in lc_pct_80 but their landcover_class is a land
    // type. We must replicate this behavior to avoid blue (Water) grids everywhere.
    const WATER_CLASS = 80;
    const mergedLcPct = {};
    let dominantClass = null;
    let dominantWeight = -1;

    if (lcWeightTotal > 0) {
        // Use continuous distribution
        for (const cls of LC_CLASSES) {
            const w = lcWeights[cls] || 0;
            mergedLcPct[`lc_pct_${cls}`] = (w / lcWeightTotal) * 100;
            // Skip Water when determining dominant class
            if (cls !== WATER_CLASS && w > dominantWeight) {
                dominantWeight = w;
                dominantClass = cls;
            }
        }
    } else if (discreteVoteTotal > 0) {
        // Fallback: discrete voting (already excludes Water since original
        // landcover_class never contains class 80)
        for (const [cls, w] of Object.entries(discreteVotes)) {
            if (w > dominantWeight) {
                dominantWeight = w;
                dominantClass = Number(cls);
            }
        }
    }

    return {
        grid_id: `merged_${mLon}_${mLat}`,
        lon: mLon,
        lat: mLat,
        landcover_class: dominantClass,
        // Continuous landcover percentages
        lc_pct_10:  mergedLcPct.lc_pct_10  || 0,
        lc_pct_20:  mergedLcPct.lc_pct_20  || 0,
        lc_pct_30:  mergedLcPct.lc_pct_30  || 0,
        lc_pct_40:  mergedLcPct.lc_pct_40  || 0,
        lc_pct_50:  mergedLcPct.lc_pct_50  || 0,
        lc_pct_60:  mergedLcPct.lc_pct_60  || 0,
        lc_pct_70:  mergedLcPct.lc_pct_70  || 0,
        lc_pct_80:  mergedLcPct.lc_pct_80  || 0,
        lc_pct_90:  mergedLcPct.lc_pct_90  || 0,
        lc_pct_95:  mergedLcPct.lc_pct_95  || 0,
        lc_pct_100: mergedLcPct.lc_pct_100 || 0,
        // Additive fields
        land_area_km2: sumLandArea,
        cell_area_km2: sumCellArea,
        forest_area_km2: sumForestArea,
        population_total: sumPopulation,
        // Weighted averages
        forest_pct: sumLandArea > 0 ? sumForestPctW / sumLandArea : 0,
        nightlight_mean: sumNlLandArea > 0 ? sumNlMeanW / sumNlLandArea : NIGHTLIGHT_NO_DATA,
        nightlight_p90: sumNlLandArea > 0 ? sumNlP90W / sumNlLandArea : NIGHTLIGHT_NO_DATA,
        // Derived
        land_fraction: sumCellArea > 0 ? sumLandArea / sumCellArea : 0
    };
}

module.exports = {
    init,
    queryGridsInBounds,
    mergeGrids,
    calculateViewportStats,
    validateBounds,
    getGridData,
    getNormalizeParams
};
