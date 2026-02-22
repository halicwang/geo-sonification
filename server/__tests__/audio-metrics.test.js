const {
    getLcFractionsFromDistribution,
    computeProximityFromGridCount,
    computeProximityFromZoom,
    computeDeltaMetrics,
} = require('../audio-metrics');

describe('computeProximityFromGridCount', () => {
    test('gridCount=0 is forced to 0', () => {
        expect(computeProximityFromGridCount(0, 50, 800)).toBe(0);
    });

    test('count <= lower maps to 1', () => {
        expect(computeProximityFromGridCount(50, 50, 800)).toBe(1);
        expect(computeProximityFromGridCount(10, 50, 800)).toBe(1);
    });

    test('count >= upper maps to 0', () => {
        expect(computeProximityFromGridCount(800, 50, 800)).toBe(0);
        expect(computeProximityFromGridCount(1600, 50, 800)).toBe(0);
    });

    test('linear interpolation between thresholds', () => {
        // Midpoint between 50 and 800 is 425 => proximity 0.5
        expect(computeProximityFromGridCount(425, 50, 800)).toBeCloseTo(0.5, 6);
    });
});

describe('computeProximityFromZoom', () => {
    test('zoom >= high maps to 1', () => {
        expect(computeProximityFromZoom(6, 4, 6)).toBe(1);
        expect(computeProximityFromZoom(10, 4, 6)).toBe(1);
    });

    test('zoom <= low maps to 0', () => {
        expect(computeProximityFromZoom(4, 4, 6)).toBe(0);
        expect(computeProximityFromZoom(2, 4, 6)).toBe(0);
    });

    test('linear interpolation between thresholds', () => {
        expect(computeProximityFromZoom(5, 4, 6)).toBeCloseTo(0.5, 6);
        expect(computeProximityFromZoom(4.5, 4, 6)).toBeCloseTo(0.25, 6);
        expect(computeProximityFromZoom(5.5, 4, 6)).toBeCloseTo(0.75, 6);
    });

    test('non-finite zoom defaults to 0', () => {
        expect(computeProximityFromZoom(undefined, 4, 6)).toBe(0);
        expect(computeProximityFromZoom(NaN, 4, 6)).toBe(0);
    });
});

describe('getLcFractionsFromDistribution', () => {
    test('returns 11-length normalized vector', () => {
        const fracs = getLcFractionsFromDistribution({ 10: 60, 30: 40 });
        expect(fracs).toHaveLength(11);
        expect(fracs[0]).toBeCloseTo(0.6, 6); // class 10
        expect(fracs[2]).toBeCloseTo(0.4, 6); // class 30
        const sum = fracs.reduce((s, v) => s + v, 0);
        expect(sum).toBeCloseTo(1.0, 6);
    });

    test('returns all zeros when total weight is empty', () => {
        const fracs = getLcFractionsFromDistribution({});
        expect(fracs.every((v) => v === 0)).toBe(true);
    });
});

describe('computeDeltaMetrics', () => {
    test('first snapshot returns all-zero deltaLc', () => {
        const result = computeDeltaMetrics([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], null);

        expect(result.deltaLc.every((v) => v === 0)).toBe(true);
        expect(result.snapshot.lcFractions[0]).toBeCloseTo(1, 6);
    });

    test('computes per-class differences from previous snapshot', () => {
        const prev = { lcFractions: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] };

        const result = computeDeltaMetrics([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0], prev);

        expect(result.deltaLc[0]).toBeCloseTo(-1, 6);
        expect(result.deltaLc[5]).toBeCloseTo(1, 6);
        expect(result.deltaLc[1]).toBe(0);
    });
});
