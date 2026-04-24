// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

const { makeCell } = require('./helpers/make-cell');

describe('build-tiles helpers', () => {
    afterEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
    });

    test('gridToFeature emits a centroid Point with sub-grid minzoom', () => {
        const { gridToFeature } = require('../../scripts/build-tiles');

        // (lon=10, lat=20) with gridSize=1 → (i, j) = (10, 20): both even
        // → first-tier "1° sub-grid" cell, visible from zoom 0.
        const onGrid = gridToFeature(makeCell({ lon: 10, lat: 20 }), 1, 8);
        expect(onGrid.tippecanoe).toEqual({ minzoom: 0, maxzoom: 8 });
        expect(onGrid.geometry).toEqual({
            type: 'Point',
            coordinates: [10.5, 20.5],
        });

        // (lon=11, lat=20) → i=11 is odd → second-tier cell, visible from
        // zoom 4 (the full-resolution 0.5° grid reveal).
        const offGrid = gridToFeature(makeCell({ lon: 11, lat: 20 }), 1, 8);
        expect(offGrid.tippecanoe).toEqual({ minzoom: 4, maxzoom: 8 });
    });

    test('buildTileFeatures defaults to the configured GRID_SIZE', () => {
        jest.isolateModules(() => {
            jest.doMock('../config', () => ({ GRID_SIZE: 1 }));

            const { buildTileFeatures } = require('../../scripts/build-tiles');
            const [feature] = buildTileFeatures([makeCell({ lon: -5, lat: 7 })]);

            expect(feature.geometry).toEqual({
                type: 'Point',
                coordinates: [-4.5, 7.5],
            });
        });
    });
});
