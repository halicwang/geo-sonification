/**
 * Pure helpers for proximity and delta calculations.
 *
 * No I/O side effects. Safe for unit tests and simulator reuse.
 */

const { LC_CLASS_ORDER, clamp01 } = require('./osc_schema');

function finiteOrZero(value) {
    return Number.isFinite(value) ? value : 0;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

/**
 * Convert weighted-area landcover distribution into normalized 0-1 fractions
 * matching the canonical LC class order.
 *
 * @param {Object} distribution - { classCode: weightedArea }
 * @returns {number[]} length-11 array aligned with LC_CLASS_ORDER
 */
function getLcFractionsFromDistribution(distribution) {
    const dist = distribution || {};
    const totalWeight = LC_CLASS_ORDER.reduce((sum, cls) => sum + finiteOrZero(dist[cls]), 0);
    if (totalWeight <= 0) {
        return LC_CLASS_ORDER.map(() => 0);
    }
    return LC_CLASS_ORDER.map(cls => clamp01(finiteOrZero(dist[cls]) / totalWeight));
}

/**
 * Proximity mapping from visible grid count.
 * - gridCount===0 => 0 (forced distant mode for no-data/ocean-only views)
 * - gridCount<=lower => 1
 * - gridCount>=upper => 0
 * - linear interpolation between
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

function normalizeLcArray(values) {
    return LC_CLASS_ORDER.map((_, index) => clamp01(Array.isArray(values) ? finiteOrZero(values[index]) : 0));
}

function normalizeSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return null;
    if (!Array.isArray(snapshot.lcFractions)) return null;
    if (!Number.isFinite(snapshot.timestampMs)) return null;
    return {
        lcFractions: normalizeLcArray(snapshot.lcFractions),
        timestampMs: snapshot.timestampMs
    };
}

function createZeroDelta() {
    return {
        deltaLc: LC_CLASS_ORDER.map(() => 0),
        magnitude: 0,
        rate: 0
    };
}

/**
 * Compute /delta payload from current lc fractions and previous snapshot.
 *
 * @param {number[]} currentLcFractions - length-11 vector (0-1)
 * @param {{ lcFractions:number[], timestampMs:number }|null} previousSnapshot
 * @param {number} nowMs
 * @param {{ dtMinMs:number, dtMaxMs:number, rateCeiling:number }} options
 */
function computeDeltaMetrics(currentLcFractions, previousSnapshot, nowMs, options = {}) {
    const current = normalizeLcArray(currentLcFractions);
    const safeNowMs = Number.isFinite(nowMs) ? nowMs : Date.now();

    const dtMinMs = Number.isFinite(options.dtMinMs) && options.dtMinMs > 0 ? options.dtMinMs : 50;
    const dtMaxMs = Number.isFinite(options.dtMaxMs) && options.dtMaxMs >= dtMinMs ? options.dtMaxMs : 5000;
    const rateCeiling = Number.isFinite(options.rateCeiling) && options.rateCeiling > 0 ? options.rateCeiling : 5;

    const prev = normalizeSnapshot(previousSnapshot);
    if (!prev) {
        const zero = createZeroDelta();
        return {
            ...zero,
            snapshot: { lcFractions: current, timestampMs: safeNowMs }
        };
    }

    const deltaLc = current.map((value, index) => value - prev.lcFractions[index]);
    const l1 = deltaLc.reduce((sum, delta) => sum + Math.abs(delta), 0);
    const magnitude = clamp01(0.5 * l1);

    const dtRaw = safeNowMs - prev.timestampMs;
    const dtMs = clamp(Number.isFinite(dtRaw) ? dtRaw : dtMaxMs, dtMinMs, dtMaxMs);
    const rateRaw = magnitude / (dtMs / 1000);
    const rate = clamp01(rateRaw / rateCeiling);

    return {
        deltaLc,
        magnitude,
        rate,
        snapshot: { lcFractions: current, timestampMs: safeNowMs }
    };
}

module.exports = {
    getLcFractionsFromDistribution,
    computeProximityFromGridCount,
    createZeroDelta,
    computeDeltaMetrics
};
