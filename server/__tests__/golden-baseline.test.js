// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * P0-A Golden baseline regression tests.
 *
 * Locks the current WorldCover demo behavior before M3 refactoring.
 * Four canonical viewport scenarios (dense land, open ocean, coastal mixed,
 * dense urban) are tested against golden fixture files with float-tolerant
 * comparison.
 *
 * IMPORTANT: These tests do NOT mock normalizeValues — the full computation
 * pipeline (spatial query → normalization → hysteresis → audio fold-mapping)
 * is exercised with deterministic synthetic data.
 *
 * Evidence:
 *   EVID-P0-001 — Golden payload fixture set
 *   EVID-P0-002 — Included in npm test CI gate
 */

const { init } = require('../spatial');
const { processViewport } = require('../viewport-processor');
const { createModeState } = require('../mode-manager');
const { createDeltaState } = require('../delta-state');
const { LANDCOVER_META } = require('../landcover');
const {
    GRID_SIZE,
    HTTP_PORT,
    PROXIMITY_ZOOM_LOW,
    PROXIMITY_ZOOM_HIGH,
    PER_GRID_THRESHOLD_ENTER,
    PER_GRID_THRESHOLD_EXIT,
    USE_LEGACY_AGGREGATION,
    BROADCAST_STATS,
} = require('../config');
const { BUS_NAMES } = require('../audio-metrics');
const { expectDeepCloseTo } = require('./helpers/deep-close-to');
const {
    NORMALIZE_PARAMS,
    LAND_CELLS,
    COASTAL_CELLS,
    URBAN_CELLS,
} = require('./helpers/golden-viewports');

const goldenConfig = require('./fixtures/golden-config.json');
const goldenLand = require('./fixtures/golden-viewport-land.json');
const goldenOcean = require('./fixtures/golden-viewport-ocean.json');
const goldenCoastal = require('./fixtures/golden-viewport-coastal.json');
const goldenUrban = require('./fixtures/golden-viewport-urban.json');

// ════════════════════════════════════════════════════════════════
// Tests
// ════════════════════════════════════════════════════════════════

describe('P0-A Environment Pinning Guard', () => {
    test('GRID_SIZE = 0.5', () => {
        expect(GRID_SIZE).toBe(0.5);
    });

    test('PROXIMITY_ZOOM_LOW = 4', () => {
        expect(PROXIMITY_ZOOM_LOW).toBe(4);
    });

    test('PROXIMITY_ZOOM_HIGH = 6', () => {
        expect(PROXIMITY_ZOOM_HIGH).toBe(6);
    });

    test('PER_GRID_THRESHOLD_ENTER = 50', () => {
        expect(PER_GRID_THRESHOLD_ENTER).toBe(50);
    });

    test('PER_GRID_THRESHOLD_EXIT = 50', () => {
        expect(PER_GRID_THRESHOLD_EXIT).toBe(50);
    });

    test('USE_LEGACY_AGGREGATION = false', () => {
        expect(USE_LEGACY_AGGREGATION).toBe(false);
    });

    test('BROADCAST_STATS = false', () => {
        expect(BROADCAST_STATS).toBe(false);
    });
});

// ── Helpers ──

function runViewport(bounds, zoom) {
    const modeState = createModeState();
    const deltaState = createDeltaState();
    const result = processViewport(bounds, modeState, deltaState, zoom);
    expect(result.error).toBeUndefined();
    return result.stats;
}

function stripInternalFields(stats) {
    // eslint-disable-next-line no-unused-vars
    const { gridsInView, theoreticalGridCount, landCoverageRatio, ...publicStats } = stats;
    return publicStats;
}

describe('P0-A Golden Baseline: /api/config', () => {
    test('landcoverMeta matches golden fixture (11 ESA WorldCover classes)', () => {
        expect(LANDCOVER_META).toEqual(goldenConfig.expected.landcoverMeta);
    });

    test('gridSize default is 0.5', () => {
        expect(GRID_SIZE).toBe(goldenConfig.expected.gridSize);
    });

    test('default port matches golden fixture', () => {
        expect(HTTP_PORT).toBe(goldenConfig.expected.port);
    });
});

describe('P0-A Golden Baseline: land viewport', () => {
    beforeAll(() => {
        init(LAND_CELLS, NORMALIZE_PARAMS);
    });

    test('stats match golden fixture', () => {
        const stats = runViewport(goldenLand.input.bounds, goldenLand.input.zoom);
        expectDeepCloseTo(stripInternalFields(stats), goldenLand.expected);
    });
});

describe('P0-A Golden Baseline: ocean viewport', () => {
    beforeAll(() => {
        init(LAND_CELLS, NORMALIZE_PARAMS);
    });

    test('stats match golden fixture', () => {
        const stats = runViewport(goldenOcean.input.bounds, goldenOcean.input.zoom);
        expectDeepCloseTo(stripInternalFields(stats), goldenOcean.expected);
    });

    test('all bus targets are 0 except water', () => {
        const stats = runViewport(goldenOcean.input.bounds, goldenOcean.input.zoom);
        const [forest, shrub, grass, crop, urban, bare, water] = stats.audioParams.busTargets;
        expect(forest).toBe(0);
        expect(shrub).toBe(0);
        expect(grass).toBe(0);
        expect(crop).toBe(0);
        expect(urban).toBe(0);
        expect(bare).toBe(0);
        expect(water).toBe(1);
    });
});

describe('P0-A Golden Baseline: coastal viewport', () => {
    beforeAll(() => {
        init(COASTAL_CELLS, NORMALIZE_PARAMS);
    });

    test('stats match golden fixture', () => {
        const stats = runViewport(goldenCoastal.input.bounds, goldenCoastal.input.zoom);
        expectDeepCloseTo(stripInternalFields(stats), goldenCoastal.expected);
    });

    test('coverage reflects partial land', () => {
        const stats = runViewport(goldenCoastal.input.bounds, goldenCoastal.input.zoom);
        expect(stats.landCoverageRatio).toBeGreaterThan(0);
        expect(stats.landCoverageRatio).toBeLessThan(1);
    });
});

describe('P0-A Golden Baseline: urban viewport', () => {
    beforeAll(() => {
        init(URBAN_CELLS, NORMALIZE_PARAMS);
    });

    test('stats match golden fixture', () => {
        const stats = runViewport(goldenUrban.input.bounds, goldenUrban.input.zoom);
        expectDeepCloseTo(stripInternalFields(stats), goldenUrban.expected);
    });

    test('dominantLandcover is 50 (Built-up/Urban)', () => {
        const stats = runViewport(goldenUrban.input.bounds, goldenUrban.input.zoom);
        expect(stats.dominantLandcover).toBe(50);
    });

    test('urban bus is dominant', () => {
        const stats = runViewport(goldenUrban.input.bounds, goldenUrban.input.zoom);
        const [forest, shrub, grass, crop, urban, bare, water] = stats.audioParams.busTargets;
        expect(urban).toBeGreaterThan(forest);
        expect(urban).toBeGreaterThan(shrub);
        expect(urban).toBeGreaterThan(grass);
        expect(urban).toBeGreaterThan(crop);
        expect(urban).toBeGreaterThan(bare);
        expect(urban).toBeGreaterThan(water);
    });
});

describe('P0-A Golden Baseline: WebSocket stats payload contract', () => {
    beforeAll(() => {
        init(LAND_CELLS, NORMALIZE_PARAMS);
    });

    test('{ type: "stats", ...stats } has expected shape', () => {
        const stats = runViewport(goldenLand.input.bounds, goldenLand.input.zoom);
        const wsPayload = { type: 'stats', ...stripInternalFields(stats) };

        expect(wsPayload.type).toBe('stats');
        expect(wsPayload.audioParams).toBeDefined();
        expect(wsPayload.dominantLandcover).toBeDefined();
        expect(wsPayload.landcoverDistribution).toBeDefined();
        expect(wsPayload.landcoverBreakdown).toBeDefined();
        expect(wsPayload.mode).toBeDefined();
    });
});

describe('P0-A Golden Baseline: 14-channel manifest', () => {
    test('11 distribution channel class codes in LANDCOVER_META', () => {
        const classCodes = Object.keys(LANDCOVER_META)
            .map(Number)
            .sort((a, b) => a - b);
        expect(classCodes).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100]);
    });

    test('7 audio bus names: forest, shrub, grass, crop, urban, bare, water', () => {
        expect(BUS_NAMES).toEqual(['forest', 'shrub', 'grass', 'crop', 'urban', 'bare', 'water']);
    });

    test('3 metric channels present in land stats', () => {
        init(LAND_CELLS, NORMALIZE_PARAMS);
        const stats = runViewport(goldenLand.input.bounds, goldenLand.input.zoom);
        expect(typeof stats.nightlightNorm).toBe('number');
        expect(typeof stats.populationNorm).toBe('number');
        expect(typeof stats.forestNorm).toBe('number');
    });

    test('proximity control signal in [0, 1]', () => {
        init(LAND_CELLS, NORMALIZE_PARAMS);
        const stats = runViewport(goldenLand.input.bounds, goldenLand.input.zoom);
        expect(stats.audioParams.proximity).toBeGreaterThanOrEqual(0);
        expect(stats.audioParams.proximity).toBeLessThanOrEqual(1);
    });

    test('7 bus targets in land stats', () => {
        init(LAND_CELLS, NORMALIZE_PARAMS);
        const stats = runViewport(goldenLand.input.bounds, goldenLand.input.zoom);
        expect(stats.audioParams.busTargets).toHaveLength(7);
        expect(stats.audioParams.busNames).toEqual(BUS_NAMES);
    });
});
