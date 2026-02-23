/**
 * Synthetic grid cell factory for test suites.
 *
 * Returns a complete GridCell-shaped object with sensible defaults
 * for area-weighted aggregation (land_area_km2 > 0, land_fraction = 1).
 *
 * Does NOT include lc_pct_* defaults — tests that need continuous
 * distribution must add those explicitly via overrides.
 *
 * @param {Partial<import('../../types').GridCell>} [overrides]
 * @returns {import('../../types').GridCell}
 */
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

module.exports = { makeCell };
