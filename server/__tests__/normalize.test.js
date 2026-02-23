// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

const { calcPercentiles, normalize } = require('../normalize');

describe('calcPercentiles', () => {
    test('returns p1=0, p99=1 for empty array', () => {
        const result = calcPercentiles([], 'nightlight_p90');
        expect(result).toEqual({ p1: 0, p99: 1 });
    });

    test('returns p1=0, p99=1 when all values are zero or negative', () => {
        const data = [{ val: 0 }, { val: -1 }, { val: 0 }];
        const result = calcPercentiles(data, 'val');
        expect(result).toEqual({ p1: 0, p99: 1 });
    });

    test('returns correct percentiles for single positive value', () => {
        const data = [{ val: 5 }];
        const result = calcPercentiles(data, 'val');
        expect(result.p1).toBe(5);
        expect(result.p99).toBe(5);
    });

    test('returns correct percentiles for multiple values', () => {
        // Create 100 values: 1, 2, ..., 100
        const data = Array.from({ length: 100 }, (_, i) => ({ val: i + 1 }));
        const result = calcPercentiles(data, 'val');
        // p1 = value at index floor(99 * 0.01) = floor(0.99) = 0 → value[0] = 1
        expect(result.p1).toBe(1);
        // p99 = value at index floor(99 * 0.99) = floor(98.01) = 98 → value[98] = 99
        expect(result.p99).toBe(99);
    });

    test('filters out null and NaN values', () => {
        const data = [{ val: null }, { val: NaN }, { val: 10 }, { val: 20 }];
        const result = calcPercentiles(data, 'val');
        expect(result.p1).toBe(10);
        // Only 2 positive values: floor(1 * 0.99) = 0 → p99 = sorted[0] = 10
        expect(result.p99).toBe(10);
    });

    test('filters out zero and negative values (only positive)', () => {
        const data = [{ val: 0 }, { val: -5 }, { val: 3 }, { val: 7 }];
        const result = calcPercentiles(data, 'val');
        expect(result.p1).toBe(3);
        // Only 2 positive values: floor(1 * 0.99) = 0 → p99 = sorted[0] = 3
        expect(result.p99).toBe(3);
    });
});

describe('normalize', () => {
    test('returns 0 for null/NaN/zero/negative value', () => {
        expect(normalize(null, 0, 100)).toBe(0);
        expect(normalize(NaN, 0, 100)).toBe(0);
        expect(normalize(0, 0, 100)).toBe(0);
        expect(normalize(-5, 0, 100)).toBe(0);
    });

    test('linear normalization: midpoint returns 0.5', () => {
        const result = normalize(50, 0, 100, false);
        expect(result).toBe(0.5);
    });

    test('linear normalization: clamps to [0, 1]', () => {
        expect(normalize(200, 0, 100, false)).toBe(1);
        expect(normalize(1, 50, 100, false)).toBe(0);
    });

    test('linear normalization: returns 0 when p1 === p99', () => {
        expect(normalize(5, 5, 5, false)).toBe(0);
    });

    test('log normalization: returns value in [0, 1]', () => {
        const result = normalize(50, 1, 100, true);
        expect(result).toBeGreaterThan(0);
        expect(result).toBeLessThanOrEqual(1);
    });

    test('log normalization: higher values map higher', () => {
        const low = normalize(10, 1, 100, true);
        const high = normalize(90, 1, 100, true);
        expect(high).toBeGreaterThan(low);
    });

    test('log normalization: returns 0 when p1 === p99', () => {
        expect(normalize(5, 5, 5, true)).toBe(0);
    });

    test('handles swapped p1 > p99 (auto-corrects)', () => {
        // normalize swaps min/max internally
        const result = normalize(50, 100, 0, false);
        expect(result).toBe(0.5);
    });
});
