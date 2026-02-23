// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Tests that Water (class 80) cells are excluded from landcover aggregation
 * in both discrete-fallback and continuous-distribution branches.
 *
 * Uses area-weighted aggregation (default mode).
 */

// Mock normalize to avoid file I/O
jest.mock('../normalize', () => ({
    normalizeValues: () => ({ nightlightNorm: 0, populationNorm: 0, forestNorm: 0 }),
}));

const { init, calculateViewportStats } = require('../spatial');
const { makeCell } = require('./helpers/make-cell');

// Bounds that cover all test cells at lon [0, 1], lat [0, 1]
const bounds = [-0.5, -0.5, 2, 2];

describe('spatial landcover: water cell exclusion (area-weighted)', () => {
    test('discrete fallback: water cell (lc=80) does not contribute to lcCounts', () => {
        const waterCell = makeCell({ grid_id: 'water', lon: 0, lat: 0, landcover_class: 80 });
        const forestCell = makeCell({ grid_id: 'forest', lon: 0.5, lat: 0, landcover_class: 10 });

        init([waterCell, forestCell], null);
        const { dominantLandcover, landcoverDistribution } = calculateViewportStats(bounds);

        expect(dominantLandcover).toBe(10);
        // Water (80) should not appear in distribution
        expect(landcoverDistribution[80]).toBeUndefined();
        // Forest (10) should be present
        expect(landcoverDistribution[10]).toBeGreaterThan(0);
    });

    test('only water cells → dominantLandcover is null', () => {
        const waterOnly = makeCell({ grid_id: 'water1', lon: 0, lat: 0, landcover_class: 80 });
        const waterOnly2 = makeCell({ grid_id: 'water2', lon: 0.5, lat: 0, landcover_class: 80 });

        init([waterOnly, waterOnly2], null);
        const { dominantLandcover, landcoverDistribution } = calculateViewportStats(bounds);

        expect(dominantLandcover).toBeNull();
        expect(Object.keys(landcoverDistribution)).toHaveLength(0);
    });

    test('continuous lc_pct_*: water percentage excluded from distribution', () => {
        const coastalCell = makeCell({
            grid_id: 'coastal',
            lon: 0,
            lat: 0,
            landcover_class: 80,
            lc_pct_80: 96.3,
            lc_pct_10: 2.5,
            lc_pct_30: 1.2,
        });

        init([coastalCell], null);
        const { dominantLandcover, landcoverDistribution } = calculateViewportStats(bounds);

        // Water excluded, land classes renormalized
        expect(landcoverDistribution[80]).toBeUndefined();
        expect(dominantLandcover).toBe(10); // Tree/Forest dominant among land classes
        expect(landcoverDistribution[10]).toBeGreaterThan(0);
        expect(landcoverDistribution[30]).toBeGreaterThan(0);
    });

    test('pure water cell with lc_pct_80=100 → empty distribution', () => {
        const pureWater = makeCell({
            grid_id: 'ocean',
            lon: 0,
            lat: 0,
            landcover_class: 80,
            lc_pct_80: 100,
        });

        init([pureWater], null);
        const { dominantLandcover, landcoverDistribution } = calculateViewportStats(bounds);

        expect(dominantLandcover).toBeNull();
        expect(Object.keys(landcoverDistribution)).toHaveLength(0);
    });

    test('empty viewport (ocean) → dominantLandcover is 80 (Water), /lc/80 = 1', () => {
        init([], null);
        const { dominantLandcover, gridCount, landcoverDistribution } =
            calculateViewportStats(bounds);

        expect(dominantLandcover).toBe(80);
        expect(gridCount).toBe(0);
        expect(landcoverDistribution[80]).toBe(1);
    });
});
