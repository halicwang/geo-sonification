const {
    getLcFractionsFromDistribution,
    computeProximityFromGridCount,
    computeDeltaMetrics
} = require('../osc-metrics');

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
        expect(fracs.every(v => v === 0)).toBe(true);
    });
});

describe('computeDeltaMetrics', () => {
    test('first snapshot returns all-zero delta', () => {
        const result = computeDeltaMetrics(
            [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            null,
            1000,
            { dtMinMs: 50, dtMaxMs: 5000, rateCeiling: 5 }
        );

        expect(result.deltaLc.every(v => v === 0)).toBe(true);
        expect(result.magnitude).toBe(0);
        expect(result.rate).toBe(0);
        expect(result.snapshot.timestampMs).toBe(1000);
    });

    test('magnitude uses 0.5 * L1 and rate uses normalized per-second value', () => {
        const prev = {
            lcFractions: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            timestampMs: 0
        };

        const result = computeDeltaMetrics(
            [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
            prev,
            200,
            { dtMinMs: 50, dtMaxMs: 5000, rateCeiling: 5 }
        );

        // L1=2 (1->0 and 0->1), magnitude=1
        expect(result.magnitude).toBeCloseTo(1.0, 6);
        // dt=200ms => rateRaw = 1 / 0.2 = 5 => normalized by ceiling 5 => 1
        expect(result.rate).toBeCloseTo(1.0, 6);
    });

    test('rate uses dt min clamp for near-zero updates', () => {
        const prev = {
            lcFractions: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            timestampMs: 1000
        };

        const result = computeDeltaMetrics(
            [0.5, 0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0], // L1=1 => magnitude=0.5
            prev,
            1010,
            { dtMinMs: 50, dtMaxMs: 5000, rateCeiling: 5 }
        );

        // dt clamped to 50ms => rateRaw = 0.5 / 0.05 = 10 => normalized => 1
        expect(result.rate).toBeCloseTo(1.0, 6);
    });

    test('rate uses dt max clamp for stale updates', () => {
        const prev = {
            lcFractions: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            timestampMs: 0
        };

        const result = computeDeltaMetrics(
            [0.8, 0.2, 0, 0, 0, 0, 0, 0, 0, 0, 0], // L1=0.4 => magnitude=0.2
            prev,
            20000,
            { dtMinMs: 50, dtMaxMs: 5000, rateCeiling: 5 }
        );

        // dt clamped to 5000ms => rateRaw = 0.2 / 5 = 0.04 => normalized => 0.008
        expect(result.rate).toBeCloseTo(0.008, 6);
    });
});
