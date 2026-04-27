// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Tests for the bounds-keyed single-entry cache in viewport-processor.js
 * (M4 P1-2). Asserts:
 *   - identical bounds → spatial.calculateViewportStats called once
 *   - different bounds → cache replaces, spatial called again
 *   - cache hit still mutates per-client modeState / deltaState correctly
 *   - cache hit still produces correct audioParams (busTargets, proximity)
 *
 * `init([cell])` and a `_resetCache()` helper isolate per-test state.
 */

jest.mock('../normalize', () => ({
    normalizeValues: () => ({ nightlightNorm: 0, populationNorm: 0, forestNorm: 0 }),
}));

const spatial = require('../spatial');
const { processViewport, _resetCache } = require('../viewport-processor');
const { createModeState } = require('../mode-manager');
const { createDeltaState } = require('../delta-state');
const { makeCell } = require('./helpers/make-cell');

beforeEach(() => {
    _resetCache();
    spatial.init(
        [
            makeCell({
                grid_id: 'a',
                lon: 0,
                lat: 0,
                landcover_class: 10,
                lc_pct_10: 100,
            }),
            makeCell({
                grid_id: 'b',
                lon: 50,
                lat: 50,
                landcover_class: 40,
                lc_pct_40: 100,
            }),
        ],
        null
    );
});

describe('processViewport bounds cache', () => {
    test('identical bounds → spatial.calculateViewportStats called once', () => {
        const spy = jest.spyOn(spatial, 'calculateViewportStats');

        const modeState = createModeState();
        const deltaState = createDeltaState();
        const r1 = processViewport([0.1, 0.1, 0.4, 0.4], modeState, deltaState, 5);
        const r2 = processViewport([0.1, 0.1, 0.4, 0.4], modeState, deltaState, 5);

        expect(r1.error).toBeUndefined();
        expect(r2.error).toBeUndefined();
        expect(spy).toHaveBeenCalledTimes(1);
        expect(r1.stats.gridCount).toBe(r2.stats.gridCount);

        spy.mockRestore();
    });

    test('different bounds → cache replaces → spatial called twice', () => {
        const spy = jest.spyOn(spatial, 'calculateViewportStats');

        const modeState = createModeState();
        const deltaState = createDeltaState();
        processViewport([0.1, 0.1, 0.4, 0.4], modeState, deltaState, 5);
        processViewport([49.5, 49.5, 50.4, 50.4], modeState, deltaState, 5);

        expect(spy).toHaveBeenCalledTimes(2);

        spy.mockRestore();
    });

    test('cache hit still applies per-client hysteresis to modeState', () => {
        // Two separate client modeStates, both querying the same bounds.
        const clientA = createModeState();
        const clientB = createModeState();
        const deltaA = createDeltaState();
        const deltaB = createDeltaState();

        const rA = processViewport([0.1, 0.1, 0.4, 0.4], clientA, deltaA, 5);
        const rB = processViewport([0.1, 0.1, 0.4, 0.4], clientB, deltaB, 5);

        // Both should have applied hysteresis to their own modeState; the
        // mode field on each result reflects that client's state.
        expect(rA.stats.mode).toBe(clientA.currentMode);
        expect(rB.stats.mode).toBe(clientB.currentMode);
        // Both should report the same gridCount (cache hit on second call
        // returns the same gridsInView).
        expect(rA.stats.gridCount).toBe(rB.stats.gridCount);
    });

    test('cache hit still updates per-client deltaState.previousSnapshot', () => {
        const deltaState = createDeltaState();
        expect(deltaState.previousSnapshot).toBeNull();

        const modeState = createModeState();
        processViewport([0.1, 0.1, 0.4, 0.4], modeState, deltaState, 5);
        const snapAfterFirst = deltaState.previousSnapshot;
        expect(snapAfterFirst).not.toBeNull();
        expect(Array.isArray(snapAfterFirst.lcFractions)).toBe(true);

        // Second call (cache hit) should still produce a snapshot — and it
        // should equal the first snapshot (same lcFractions in, same out).
        processViewport([0.1, 0.1, 0.4, 0.4], modeState, deltaState, 5);
        expect(deltaState.previousSnapshot.lcFractions).toEqual(snapAfterFirst.lcFractions);
    });

    test('cache hit produces identical audioParams.busTargets', () => {
        const modeState = createModeState();
        const deltaState = createDeltaState();
        const r1 = processViewport([0.1, 0.1, 0.4, 0.4], modeState, deltaState, 5);
        const r2 = processViewport([0.1, 0.1, 0.4, 0.4], modeState, deltaState, 5);

        expect(r1.stats.audioParams.busTargets).toEqual(r2.stats.audioParams.busTargets);
        expect(r1.stats.audioParams.busNames).toBe(r2.stats.audioParams.busNames);
    });

    test('cache hit reflects updated zoom in audioParams.proximity', () => {
        // proximity is per-call (depends on zoom), not cached.
        const modeState = createModeState();
        const deltaState = createDeltaState();
        const r1 = processViewport([0.1, 0.1, 0.4, 0.4], modeState, deltaState, 3); // zoom < low
        const r2 = processViewport([0.1, 0.1, 0.4, 0.4], modeState, deltaState, 7); // zoom > high

        expect(r1.stats.audioParams.proximity).toBe(0);
        expect(r2.stats.audioParams.proximity).toBe(1);
    });

    test('cache hit does not mutate cached baseStats (no field leak)', () => {
        const modeState = createModeState();
        const deltaState = createDeltaState();
        const r1 = processViewport([0.1, 0.1, 0.4, 0.4], modeState, deltaState, 5);

        // r1.stats has been augmented with mode, perGridThresholdEnter/Exit,
        // audioParams. A subsequent cache-hit call must NOT inherit those
        // mutations from r1's per-call mutation of stats.
        const r2 = processViewport([0.1, 0.1, 0.4, 0.4], createModeState(), deltaState, 5);

        // Mutate r1's stats after the call — this is a misuse but a robust
        // cache should still produce correct r2 anyway.
        r1.stats.mode = 'tampered';
        const r3 = processViewport([0.1, 0.1, 0.4, 0.4], createModeState(), deltaState, 5);

        expect(r2.stats.mode).not.toBe('tampered');
        expect(r3.stats.mode).not.toBe('tampered');
    });

    test('invalid bounds → cache not consulted, no entry written', () => {
        const spy = jest.spyOn(spatial, 'calculateViewportStats');
        const modeState = createModeState();
        const deltaState = createDeltaState();
        const result = processViewport([1, 2, 3], modeState, deltaState, 5); // wrong length
        expect(result.error).toBeDefined();
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });

    test('antimeridian wrap → cache key uses validated (wrapped) bounds', () => {
        const spy = jest.spyOn(spatial, 'calculateViewportStats');
        const modeState = createModeState();
        const deltaState = createDeltaState();
        // wrapLon(-200) === 160, wrapLon(-190) === 170. Both calls should
        // produce the same wrapped bounds [160, 0, 170, 1].
        processViewport([-200, 0, -190, 1], modeState, deltaState, 5);
        processViewport([160, 0, 170, 1], modeState, deltaState, 5);
        // Two calls with semantically equivalent (post-wrap) bounds → 1 spatial call.
        expect(spy).toHaveBeenCalledTimes(1);
        spy.mockRestore();
    });
});
