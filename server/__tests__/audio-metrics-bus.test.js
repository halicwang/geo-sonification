// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Tests for bus fold-mapping (computeBusTargets) and ocean detection (computeOceanLevel).
 */

const {
    BUS_NAMES,
    BUS_LC_INDICES,
    computeBusTargets,
    computeOceanLevel,
} = require('../audio-metrics');

// ═════════════════════════════════════════════════════════════════
//  BUS_NAMES and BUS_LC_INDICES constants
// ═════════════════════════════════════════════════════════════════

describe('BUS_NAMES', () => {
    test('has 5 entries in correct order', () => {
        expect(BUS_NAMES).toEqual(['tree', 'crop', 'urban', 'bare', 'water']);
    });

    test('is frozen', () => {
        expect(Object.isFrozen(BUS_NAMES)).toBe(true);
    });
});

describe('BUS_LC_INDICES', () => {
    test('tree bus maps to LC_CLASS_ORDER indices 0,1,2,8,9,10', () => {
        expect(BUS_LC_INDICES[0]).toEqual([0, 1, 2, 8, 9, 10]);
    });

    test('crop bus maps to index 3', () => {
        expect(BUS_LC_INDICES[1]).toEqual([3]);
    });

    test('urban bus maps to index 4', () => {
        expect(BUS_LC_INDICES[2]).toEqual([4]);
    });

    test('bare bus maps to index 5', () => {
        expect(BUS_LC_INDICES[3]).toEqual([5]);
    });

    test('water bus maps to indices 6,7', () => {
        expect(BUS_LC_INDICES[4]).toEqual([6, 7]);
    });

    test('all 11 indices are covered exactly once', () => {
        const all = BUS_LC_INDICES.flat().sort((a, b) => a - b);
        expect(all).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });
});

// ═════════════════════════════════════════════════════════════════
//  computeBusTargets
// ═════════════════════════════════════════════════════════════════

describe('computeBusTargets', () => {
    test('100% tree cover (class 10 only)', () => {
        const fracs = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        expect(computeBusTargets(fracs)).toEqual([1, 0, 0, 0, 0]);
    });

    test('100% crop cover (class 40)', () => {
        const fracs = [0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0];
        expect(computeBusTargets(fracs)).toEqual([0, 1, 0, 0, 0]);
    });

    test('100% urban cover (class 50)', () => {
        const fracs = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0];
        expect(computeBusTargets(fracs)).toEqual([0, 0, 1, 0, 0]);
    });

    test('100% bare cover (class 60)', () => {
        const fracs = [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0];
        expect(computeBusTargets(fracs)).toEqual([0, 0, 0, 1, 0]);
    });

    test('100% water cover (class 80)', () => {
        const fracs = [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
        expect(computeBusTargets(fracs)).toEqual([0, 0, 0, 0, 1]);
    });

    test('tree bus sums multiple constituent classes', () => {
        // tree=0.3, shrub=0.2, grass=0.1, wetland=0.1, mangrove=0.05, moss=0.05
        const fracs = [0.3, 0.2, 0.1, 0, 0, 0, 0, 0, 0.1, 0.05, 0.05];
        const result = computeBusTargets(fracs);
        expect(result[0]).toBeCloseTo(0.8, 6);
        expect(result[1]).toBe(0);
        expect(result[2]).toBe(0);
        expect(result[3]).toBe(0);
        expect(result[4]).toBe(0);
    });

    test('water bus sums snow/ice (70) + water (80)', () => {
        const fracs = [0, 0, 0, 0, 0, 0, 0.4, 0.6, 0, 0, 0];
        const result = computeBusTargets(fracs);
        expect(result[4]).toBeCloseTo(1.0, 6);
    });

    test('clamps bus sums exceeding 1.0', () => {
        const fracs = [0.5, 0.3, 0.3, 0, 0, 0, 0, 0, 0, 0, 0];
        const result = computeBusTargets(fracs);
        expect(result[0]).toBe(1.0);
    });

    test('mixed viewport: tree 60%, urban 20%, water 20%', () => {
        const fracs = [0.6, 0, 0, 0, 0.2, 0, 0, 0.2, 0, 0, 0];
        const result = computeBusTargets(fracs);
        expect(result[0]).toBeCloseTo(0.6, 6);
        expect(result[1]).toBe(0);
        expect(result[2]).toBeCloseTo(0.2, 6);
        expect(result[3]).toBe(0);
        expect(result[4]).toBeCloseTo(0.2, 6);
    });

    test('handles null input', () => {
        expect(computeBusTargets(null)).toEqual([0, 0, 0, 0, 0]);
    });

    test('handles empty array', () => {
        expect(computeBusTargets([])).toEqual([0, 0, 0, 0, 0]);
    });

    test('handles short array', () => {
        expect(computeBusTargets([0.5])).toEqual([0.5, 0, 0, 0, 0]);
    });

    test('handles NaN values', () => {
        const fracs = [NaN, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        const result = computeBusTargets(fracs);
        expect(result[0]).toBe(0);
    });
});

// ═════════════════════════════════════════════════════════════════
//  computeOceanLevel
// ═════════════════════════════════════════════════════════════════

describe('computeOceanLevel', () => {
    test('coverage 0% -> ocean level 1.0', () => {
        expect(computeOceanLevel(0, 0)).toBe(1.0);
    });

    test('coverage 40% or above -> no ocean boost (0.0)', () => {
        expect(computeOceanLevel(0, 0.4)).toBe(0.0);
        expect(computeOceanLevel(0.5, 0.5)).toBe(0.0);
        expect(computeOceanLevel(1.0, 1.0)).toBe(0.0);
    });

    test('coverage between 0% and 40% uses linear interpolation', () => {
        expect(computeOceanLevel(0, 0.1)).toBeCloseTo(0.75, 6);
        expect(computeOceanLevel(0.5, 0.2)).toBeCloseTo(0.5, 6);
        expect(computeOceanLevel(1.0, 0.3)).toBeCloseTo(0.25, 6);
    });

    test('proximity does not affect result under coverage-linear rule', () => {
        expect(computeOceanLevel(0, 0.18)).toBeCloseTo(0.55, 6);
        expect(computeOceanLevel(0.5, 0.18)).toBeCloseTo(0.55, 6);
        expect(computeOceanLevel(1.0, 0.18)).toBeCloseTo(0.55, 6);
    });

    test('handles NaN proximity -> ignored by rule', () => {
        expect(computeOceanLevel(NaN, 0.05)).toBe(0.875);
        expect(computeOceanLevel(NaN, 0.5)).toBe(0.0);
    });

    test('handles NaN coverage -> treated as 0 -> pure ocean', () => {
        expect(computeOceanLevel(0.8, NaN)).toBe(1.0);
        expect(computeOceanLevel(0.5, NaN)).toBe(1.0);
    });

    test('handles undefined inputs', () => {
        expect(computeOceanLevel(undefined, undefined)).toBe(1.0);
    });
});
