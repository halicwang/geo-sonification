// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Pure helpers for audio-parameter computation:
 * proximity, delta, bus fold-mapping, ocean detection.
 *
 * No I/O side effects. Safe for unit tests and reuse.
 */

/** Canonical ESA WorldCover class order (11 classes). @type {readonly number[]} */
const LC_CLASS_ORDER = Object.freeze([10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100]);

/**
 * Clamp a value to [0, 1]; returns 0 if non-finite.
 * @param {number} value
 * @returns {number}
 */
function clamp01(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
}

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
 * Compute per-class delta from current lc fractions and previous snapshot.
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

// ── Bus fold-mapping (11 LC classes → 5 audio buses) ────────────────

/**
 * Bus index-to-name mapping.
 * @type {readonly string[]}
 */
const BUS_NAMES = Object.freeze(['tree', 'crop', 'urban', 'bare', 'water']);

/**
 * LC_CLASS_ORDER index sets for each bus.
 * @type {readonly number[][]}
 */
const BUS_LC_INDICES = Object.freeze([
    [0, 1, 2, 8, 9, 10], // tree: classes 10,20,30,90,95,100
    [3], // crop: class 40
    [4], // urban: class 50
    [5], // bare: class 60
    [6, 7], // water: classes 70,80
]);

/**
 * Fold 11-class LC fractions into 5 bus target values.
 *
 * Each bus value is the sum of its constituent LC class fractions,
 * clamped to [0, 1].
 *
 * @param {number[]} lcFractions - length-11 array of 0-1 fractions (LC_CLASS_ORDER)
 * @returns {number[]} length-5 array [tree, crop, urban, bare, water]
 */
function computeBusTargets(lcFractions) {
    const f = Array.isArray(lcFractions) ? lcFractions : [];
    const safeVal = (i) => {
        const v = f[i];
        return Number.isFinite(v) ? v : 0;
    };
    return BUS_LC_INDICES.map((indices) =>
        clamp01(indices.reduce((sum, i) => sum + safeVal(i), 0))
    );
}

// ── Ocean detection (coverage-threshold mix logic) ───────────────────

/** Coverage at/above this means full land mix (no ocean boost). */
const LAND_FULL_COVERAGE_THRESHOLD = 0.4;

/**
 * Coverage-linear ocean level, pre-smoothing.
 *
 * Smoothing is NOT applied here — the frontend EMA handles it.
 *
 *   coverage 0%                                          → 1.0
 *   coverage 40%                                         → 0.0
 *   linear interpolation between (clamped)
 *
 * @param {number} _proximity - 0-1 zoom-based proximity (unused in current rule)
 * @param {number} coverage  - 0-1 land coverage ratio
 * @returns {number} Raw ocean level target in [0.0, 1.0]
 */
function computeOceanLevel(_proximity, coverage) {
    const cov = Number.isFinite(coverage) ? clamp01(coverage) : 0;
    return clamp01(1 - cov / LAND_FULL_COVERAGE_THRESHOLD);
}

module.exports = {
    LC_CLASS_ORDER,
    clamp01,
    getLcFractionsFromDistribution,
    computeProximityFromGridCount,
    computeProximityFromZoom,
    createZeroDelta,
    computeDeltaMetrics,
    BUS_NAMES,
    BUS_LC_INDICES,
    computeBusTargets,
    computeOceanLevel,
};
