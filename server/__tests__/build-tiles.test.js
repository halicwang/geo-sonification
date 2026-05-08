// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

const fs = require('fs');
const path = require('path');
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

    test('TILE_PROPERTIES includes fid + border_dist_km for hover-glow', () => {
        const { TILE_PROPERTIES } = require('../../scripts/build-tiles');
        expect(TILE_PROPERTIES).toContain('fid');
        expect(TILE_PROPERTIES).toContain('border_dist_km');
    });

    test('assignFids sorts by grid_id and starts at 1 (avoids tippecanoe ID 0 warning)', () => {
        const { assignFids } = require('../../scripts/build-tiles');
        const grids = [{ grid_id: '5.0_5.0' }, { grid_id: '-1.0_-1.0' }, { grid_id: '10.0_0.0' }];
        assignFids(grids);
        // Lex sort: '-1.0_-1.0' < '10.0_0.0' < '5.0_5.0'
        expect(grids[0].grid_id).toBe('-1.0_-1.0');
        expect(grids[0].fid).toBe(1);
        expect(grids[1].grid_id).toBe('10.0_0.0');
        expect(grids[1].fid).toBe(2);
        expect(grids[2].grid_id).toBe('5.0_5.0');
        expect(grids[2].fid).toBe(3);
    });

    test('joinBorderDistance fills missing entries with the cap', () => {
        const { joinBorderDistance } = require('../../scripts/build-tiles');
        const grids = [{ grid_id: 'a' }, { grid_id: 'b' }, { grid_id: 'c' }];
        joinBorderDistance(grids, { a: 12.5, c: 0 });
        expect(grids[0].border_dist_km).toBeCloseTo(12.5);
        expect(grids[1].border_dist_km).toBe(300); // cap default
        expect(grids[2].border_dist_km).toBe(0);
    });

    test('build-tiles.js source declares --use-attribute-for-id=fid for tippecanoe', () => {
        // Source-level assertion. Cross-checks the HISTORICAL: footgun
        // about not pairing this with promoteId on the addSource call.
        const src = fs.readFileSync(path.join(__dirname, '../../scripts/build-tiles.js'), 'utf8');
        expect(src).toMatch(/--use-attribute-for-id=fid/);
    });

    test('frontend/map.js does NOT set promoteId on the grid source', () => {
        // The MVT feature.id field is populated at build-time by tippecanoe's
        // --use-attribute-for-id=fid. Setting promoteId on the source would
        // shadow it (Mapbox would look for an attribute that no longer
        // exists in the tile) and break setFeatureState. See HISTORICAL:
        // notes in scripts/build-tiles.js.
        const src = fs.readFileSync(path.join(__dirname, '../../frontend/map.js'), 'utf8');
        expect(src).not.toMatch(/promoteId/);
    });
});
