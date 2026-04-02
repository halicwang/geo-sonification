// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

const { makeCell } = require('./helpers/make-cell');

describe('build-tiles helpers', () => {
    afterEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
    });

    test('gridToFeature uses the provided grid size for polygon geometry', () => {
        const { gridToFeature } = require('../../scripts/build-tiles');

        const feature = gridToFeature(makeCell({ lon: 10, lat: 20 }), 1, 2, 8);

        expect(feature.tippecanoe).toEqual({ minzoom: 2, maxzoom: 8 });
        expect(feature.geometry.coordinates[0]).toEqual([
            [10, 20],
            [11, 20],
            [11, 21],
            [10, 21],
            [10, 20],
        ]);
    });

    test('buildTileFeatures defaults to the configured GRID_SIZE', () => {
        jest.isolateModules(() => {
            jest.doMock('../config', () => ({ GRID_SIZE: 1 }));

            const { buildTileFeatures } = require('../../scripts/build-tiles');
            const [feature] = buildTileFeatures([makeCell({ lon: -5, lat: 7 })]);

            expect(feature.geometry.coordinates[0]).toEqual([
                [-5, 7],
                [-4, 7],
                [-4, 8],
                [-5, 8],
                [-5, 7],
            ]);
        });
    });
});
