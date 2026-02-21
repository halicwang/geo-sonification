/**
 * Canonical OSC schema and packet builders shared by server + simulator.
 *
 * This module is side-effect free by design:
 * - No UDP initialization
 * - No environment reads
 * - No network/file I/O
 */

/** @type {readonly number[]} */
const LC_CLASS_ORDER = Object.freeze([10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100]);

/** @type {Readonly<Record<string, string>>} */
const OSC_ADDRESSES = Object.freeze({
    MODE: '/mode',
    PROXIMITY: '/proximity',
    DELTA_LC: '/delta/lc',
    LANDCOVER: '/landcover',
    NIGHTLIGHT: '/nightlight',
    POPULATION: '/population',
    FOREST: '/forest',
    COVERAGE: '/coverage',
    GRID_COUNT: '/grid/count',
    VIEWPORT: '/viewport',
    GRID: '/grid',
    GRID_POS: '/grid/pos',
    GRID_LC: '/grid/lc',
});

/** @type {Readonly<Record<number, string>>} */
const LC_ADDRESS_BY_CLASS = Object.freeze(
    Object.fromEntries(LC_CLASS_ORDER.map((cls) => [cls, `/lc/${cls}`]))
);

/** @type {readonly string[]} */
const LC_ADDRESS_ORDER = Object.freeze(LC_CLASS_ORDER.map((cls) => LC_ADDRESS_BY_CLASS[cls]));

/** @type {readonly string[]} */
const AGGREGATED_OSC_ORDER = Object.freeze([
    OSC_ADDRESSES.LANDCOVER,
    OSC_ADDRESSES.NIGHTLIGHT,
    OSC_ADDRESSES.POPULATION,
    OSC_ADDRESSES.FOREST,
    ...LC_ADDRESS_ORDER,
]);

/** @type {readonly string[]} */
const OSC_SEQUENCE_WITH_DELTA = Object.freeze([
    OSC_ADDRESSES.MODE,
    OSC_ADDRESSES.PROXIMITY,
    OSC_ADDRESSES.DELTA_LC,
    ...AGGREGATED_OSC_ORDER,
    OSC_ADDRESSES.COVERAGE,
]);

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
 * Normalize mode string to one of the valid modes.
 * @param {string} mode
 * @returns {'per-grid' | 'aggregated'}
 */
function normalizeMode(mode) {
    return mode === 'per-grid' ? 'per-grid' : 'aggregated';
}

/**
 * Clamp a landcover class to the valid ESA range; returns 0 for null/invalid.
 * @param {number|null|undefined} landcoverClass
 * @returns {number}
 */
function clampLandcoverClass(landcoverClass) {
    if (landcoverClass == null || !Number.isFinite(landcoverClass)) return 0;
    const rounded = Math.round(landcoverClass);
    if (rounded <= 0) return 0;
    const minClass = LC_CLASS_ORDER[0];
    const maxClass = LC_CLASS_ORDER[LC_CLASS_ORDER.length - 1];
    return Math.max(minClass, Math.min(maxClass, rounded));
}

/**
 * Normalize an lc fractions array to length-11, clamped to [0,1].
 * @param {number[]} lcFractions
 * @returns {number[]}
 */
function normalizeLcFractionArray(lcFractions) {
    return LC_CLASS_ORDER.map((_, index) => {
        const value = Array.isArray(lcFractions) ? lcFractions[index] : 0;
        return clamp01(value);
    });
}

/**
 * Normalize a delta-lc array to length-11, replacing non-finite values with 0.
 * @param {number[]} deltaLc
 * @returns {number[]}
 */
function normalizeDeltaArray(deltaLc) {
    return LC_CLASS_ORDER.map((_, index) => {
        const value = Array.isArray(deltaLc) ? deltaLc[index] : 0;
        return Number.isFinite(value) ? value : 0;
    });
}

/**
 * Build an OSC packet for the /mode address.
 * @param {string} mode
 * @returns {import('./types').OscPacket}
 */
function buildModePacket(mode) {
    return {
        address: OSC_ADDRESSES.MODE,
        args: [{ type: 's', value: normalizeMode(mode) }],
    };
}

/**
 * Build an OSC packet for the /proximity address.
 * @param {number} proximity - 0-1 zoom proximity
 * @returns {import('./types').OscPacket}
 */
function buildProximityPacket(proximity) {
    return {
        address: OSC_ADDRESSES.PROXIMITY,
        args: [{ type: 'f', value: clamp01(proximity) }],
    };
}

/**
 * Build an OSC packet for the /delta/lc address.
 * @param {number[]} deltaLc - length-11 per-class delta vector
 * @returns {import('./types').OscPacket}
 */
function buildDeltaPacket(deltaLc) {
    return {
        address: OSC_ADDRESSES.DELTA_LC,
        args: normalizeDeltaArray(deltaLc).map((value) => ({ type: 'f', value })),
    };
}

/**
 * Build an OSC packet for the /coverage address.
 * @param {number} ratio - 0-1 land coverage ratio
 * @returns {import('./types').OscPacket}
 */
function buildCoveragePacket(ratio) {
    return {
        address: OSC_ADDRESSES.COVERAGE,
        args: [{ type: 'f', value: clamp01(ratio) }],
    };
}

/**
 * Build the full set of aggregated-mode OSC packets.
 * @param {{ landcoverClass: number, nightlightNorm: number, populationNorm: number, forestNorm: number, lcFractions: number[] }} params
 * @returns {import('./types').OscPacket[]}
 */
function buildAggregatedPackets({
    landcoverClass,
    nightlightNorm,
    populationNorm,
    forestNorm,
    lcFractions,
}) {
    const safeFractions = normalizeLcFractionArray(lcFractions);
    return [
        {
            address: OSC_ADDRESSES.LANDCOVER,
            args: [{ type: 'i', value: clampLandcoverClass(landcoverClass) }],
        },
        {
            address: OSC_ADDRESSES.NIGHTLIGHT,
            args: [{ type: 'f', value: clamp01(nightlightNorm) }],
        },
        {
            address: OSC_ADDRESSES.POPULATION,
            args: [{ type: 'f', value: clamp01(populationNorm) }],
        },
        { address: OSC_ADDRESSES.FOREST, args: [{ type: 'f', value: clamp01(forestNorm) }] },
        ...LC_CLASS_ORDER.map((cls, index) => ({
            address: LC_ADDRESS_BY_CLASS[cls],
            args: [{ type: 'f', value: safeFractions[index] }],
        })),
    ];
}

module.exports = {
    LC_CLASS_ORDER,
    OSC_ADDRESSES,
    LC_ADDRESS_BY_CLASS,
    LC_ADDRESS_ORDER,
    AGGREGATED_OSC_ORDER,
    OSC_SEQUENCE_WITH_DELTA,
    clamp01,
    clampLandcoverClass,
    normalizeLcFractionArray,
    buildModePacket,
    buildProximityPacket,
    buildDeltaPacket,
    buildCoveragePacket,
    buildAggregatedPackets,
};
