/**
 * Tests for land coverage ratio (theoreticalGridCount / landCoverageRatio).
 * Uses area-weighted aggregation (default mode).
 */

jest.mock('../normalize', () => ({
    normalizeValues: () => ({ nightlightNorm: 0, populationNorm: 0, forestNorm: 0 }),
}));

const { init, calculateViewportStats } = require('../spatial');

function makeCell(overrides) {
    return {
        grid_id: 'test',
        lon: 0,
        lat: 0,
        landcover_class: 10,
        land_area_km2: 100,
        cell_area_km2: 100,
        land_fraction: 1,
        nightlight_mean: 0,
        nightlight_p90: 0,
        forest_pct: 0,
        forest_area_km2: 0,
        population_total: 0,
        population_density: 0,
        ...overrides,
    };
}

describe('land coverage ratio', () => {
    test('single cell in tight viewport: ratio = 1.0', () => {
        init([makeCell({ lon: 0, lat: 0 })], null);
        // Viewport strictly inside the 0.5° cell [0, 0.5) × [0, 0.5)
        const stats = calculateViewportStats([0.1, 0.1, 0.4, 0.4]);
        expect(stats.theoreticalGridCount).toBe(1);
        expect(stats.gridCount).toBe(1);
        expect(stats.landCoverageRatio).toBeCloseTo(1.0);
    });

    test('no data in viewport (ocean): ratio = 0, theoreticalGridCount > 0', () => {
        // Data at (50, 50), query far away
        init([makeCell({ lon: 50, lat: 50 })], null);
        const stats = calculateViewportStats([-10, -10, 10, 10]);
        expect(stats.theoreticalGridCount).toBeGreaterThan(0);
        expect(stats.gridCount).toBe(0);
        expect(stats.landCoverageRatio).toBe(0);
    });

    test('2 cells out of 4 theoretical: ratio = 0.5', () => {
        // 2x2 grid of theoretical cells: (0,0), (0.5,0), (0,0.5), (0.5,0.5)
        // Only provide data for 2 of them
        init(
            [
                makeCell({ grid_id: 'a', lon: 0, lat: 0 }),
                makeCell({ grid_id: 'b', lon: 0.5, lat: 0 }),
            ],
            null
        );
        // Viewport covering exactly the 2x2 block (bounds inside all 4 cells)
        const stats = calculateViewportStats([0.1, 0.1, 0.9, 0.9]);
        expect(stats.theoreticalGridCount).toBe(4);
        expect(stats.gridCount).toBe(2);
        expect(stats.landCoverageRatio).toBeCloseTo(0.5);
    });

    test('empty init (no data at all): ratio = 0', () => {
        init([], null);
        const stats = calculateViewportStats([-10, -10, 10, 10]);
        expect(stats.theoreticalGridCount).toBeGreaterThan(0);
        expect(stats.gridCount).toBe(0);
        expect(stats.landCoverageRatio).toBe(0);
    });

    test('antimeridian crossing counts from both ranges', () => {
        init(
            [
                makeCell({ grid_id: 'east', lon: 179.5, lat: 0 }),
                makeCell({ grid_id: 'west', lon: -180, lat: 0 }),
            ],
            null
        );
        // Viewport crossing the date line: 179°E to 179°W
        const stats = calculateViewportStats([179, -0.5, -179, 0.6]);
        expect(stats.theoreticalGridCount).toBeGreaterThanOrEqual(2);
        expect(stats.gridCount).toBe(2);
        expect(stats.landCoverageRatio).toBeGreaterThan(0);
        expect(stats.landCoverageRatio).toBeLessThanOrEqual(1);
    });

    test('theoreticalGridCount is consistent with gridCount', () => {
        // Fill a 3x3 block completely: (0,0)-(1.0,1.0) in 0.5° steps
        const cells = [];
        for (let lon = 0; lon <= 1; lon += 0.5) {
            for (let lat = 0; lat <= 1; lat += 0.5) {
                cells.push(makeCell({ grid_id: `${lon}-${lat}`, lon, lat }));
            }
        }
        init(cells, null);
        // Viewport covering exactly the 3x3 block (inside all cells)
        const stats = calculateViewportStats([0.1, 0.1, 1.4, 1.4]);
        expect(stats.gridCount).toBe(9);
        expect(stats.theoreticalGridCount).toBe(9);
        expect(stats.landCoverageRatio).toBeCloseTo(1.0);
    });
});
