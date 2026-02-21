/**
 * Pure helpers for proximity and delta calculations.
 *
 * No I/O side effects. Safe for unit tests and simulator reuse.
 */

const { LC_CLASS_ORDER, clamp01 } = require('./osc_schema');

/**
 * Return the value if finite, otherwise 0.
 * @param {number} value
 * @returns {number}
 */
function finiteOrZero(value) {
    return Number.isFinite(value) ? value : 0;
}

/**
 * Convert weighted-area landcover distribution into normalized 0-1 fractions
 * matching the canonical LC class order.
 *
 * @param {Object<number, number>} distribution - { classCode: weightedArea }
 * @returns {number[]} length-11 array aligned with LC_CLASS_ORDER
 */
function getLcFractionsFromDistribution(distribution) {
    const dist = distribution || {};
    const totalWeight = LC_CLASS_ORDER.reduce((sum, cls) => sum + finiteOrZero(dist[cls]), 0);
    if (totalWeight <= 0) {
        return LC_CLASS_ORDER.map(() => 0);
    }
    return LC_CLASS_ORDER.map((cls) => clamp01(finiteOrZero(dist[cls]) / totalWeight));
}

/**
 * Proximity mapping from visible grid count.
 * - gridCount===0 => 0 (forced distant mode for no-data/ocean-only views)
 * - gridCount<=lower => 1
 * - gridCount>=upper => 0
 * - linear interpolation between
 *
 * @param {number} gridCount
 * @param {number} lower - Threshold for fully proximate
 * @param {number} upper - Threshold for fully distant
 * @returns {number} 0-1
 */
function computeProximityFromGridCount(gridCount, lower, upper) {
    const count = Number.isFinite(gridCount) ? Math.max(0, gridCount) : 0;
    if (count === 0) return 0;

    const low = Number.isFinite(lower) ? lower : 50;
    const high = Number.isFinite(upper) ? upper : 800;

    if (low >= high) {
        return count <= low ? 1 : 0;
    }
    if (count <= low) return 1;
    if (count >= high) return 0;
    return clamp01((high - count) / (high - low));
}

/**
 * Proximity mapping from zoom level.
 * - zoom >= zoomHigh => 1 (fully zoomed in — land detail mode)
 * - zoom <= zoomLow  => 0 (fully zoomed out — ocean/distant mode)
 * - linear interpolation between
 *
 * @param {number} zoom
 * @param {number} zoomLow - Lower zoom threshold
 * @param {number} zoomHigh - Upper zoom threshold
 * @returns {number} 0-1
 */
function computeProximityFromZoom(zoom, zoomLow, zoomHigh) {
    const z = Number.isFinite(zoom) ? zoom : 0;
    const low = Number.isFinite(zoomLow) ? zoomLow : 4;
    const high = Number.isFinite(zoomHigh) ? zoomHigh : 6;

    if (low >= high) {
        return z >= high ? 1 : 0;
    }
    if (z >= high) return 1;
    if (z <= low) return 0;
    return clamp01((z - low) / (high - low));
}

/**
 * Normalize a values array to length-11 clamped [0,1].
 * @param {number[]} values
 * @returns {number[]}
 */
function normalizeLcArray(values) {
    return LC_CLASS_ORDER.map((_, index) =>
        clamp01(Array.isArray(values) ? finiteOrZero(values[index]) : 0)
    );
}

/**
 * Validate and normalize a snapshot's lcFractions.
 * @param {import('./types').Snapshot|null|undefined} snapshot
 * @returns {import('./types').Snapshot|null}
 */
function normalizeSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return null;
    if (!Array.isArray(snapshot.lcFractions)) return null;
    return { lcFractions: normalizeLcArray(snapshot.lcFractions) };
}

/**
 * Create a zero-delta result (no change).
 * @returns {{ deltaLc: number[] }}
 */
function createZeroDelta() {
    return { deltaLc: LC_CLASS_ORDER.map(() => 0) };
}

/**
 * Compute /delta/lc from current lc fractions and previous snapshot.
 *
 * @param {number[]} currentLcFractions - length-11 vector (0-1)
 * @param {import('./types').Snapshot|null} previousSnapshot
 * @returns {{ deltaLc: number[], snapshot: import('./types').Snapshot }}
 */
function computeDeltaMetrics(currentLcFractions, previousSnapshot) {
    const current = normalizeLcArray(currentLcFractions);

    const prev = normalizeSnapshot(previousSnapshot);
    if (!prev) {
        return {
            ...createZeroDelta(),
            snapshot: { lcFractions: current },
        };
    }

    const deltaLc = current.map((value, index) => value - prev.lcFractions[index]);
    return { deltaLc, snapshot: { lcFractions: current } };
}

module.exports = {
    getLcFractionsFromDistribution,
    computeProximityFromGridCount,
    computeProximityFromZoom,
    createZeroDelta,
    computeDeltaMetrics,
};
