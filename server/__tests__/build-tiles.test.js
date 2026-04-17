// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

const { makeCell } = require('./helpers/make-cell');

describe('build-tiles helpers', () => {
    afterEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
    });

    test('gridToFeature emits a centroid Point for the given grid size', () => {
        const { gridToFeature } = require('../../scripts/build-tiles');

        const feature = gridToFeature(makeCell({ lon: 10, lat: 20 }), 1, 2, 8);

        expect(feature.tippecanoe).toEqual({ minzoom: 2, maxzoom: 8 });
        expect(feature.geometry).toEqual({
            type: 'Point',
            coordinates: [10.5, 20.5],
        });
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
