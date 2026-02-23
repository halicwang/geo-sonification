// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Viewport processing orchestrator.
 *
 * Given validated viewport bounds, this module:
 *   1. Queries the spatial index for grid stats
 *   2. Applies mode hysteresis (aggregated ↔ per-grid)
 *   3. Computes audio parameters for the Web Audio frontend
 *   4. Returns assembled stats for the caller
 *
 * Pure computation — no network I/O, no timers, no global state.
 */

const { PROXIMITY_ZOOM_LOW, PROXIMITY_ZOOM_HIGH } = require('./config');
const spatial = require('./spatial');
const { validateBounds } = spatial;
const {
    getLcFractionsFromDistribution,
    computeProximityFromZoom,
    computeDeltaMetrics,
    BUS_NAMES,
    computeBusTargets,
    computeOceanLevel,
} = require('./audio-metrics');
const {
    applyHysteresis,
    PER_GRID_THRESHOLD_ENTER,
    PER_GRID_THRESHOLD_EXIT,
} = require('./mode-manager');

/**
 * Validate bounds, compute viewport stats, and assemble audio parameters.
 * @param {number[]} bounds - [west, south, east, north]
 * @param {import('./types').ModeState} modeState - Per-client hysteresis state (mutated in place)
 * @param {import('./types').DeltaState} deltaState - Per-client delta state (mutated in place)
 * @param {number} [zoom]
 * @returns {{ stats: import('./types').ViewportStats, gridsInView: import('./types').GridCell[], elapsedMs: number } | { error: string }}
 */
function processViewport(bounds, modeState, deltaState, zoom) {
    const t0 = Date.now();

    const validation = validateBounds(bounds);
    if (!validation.valid) {
        return { error: validation.error };
    }
    const { gridsInView, ...stats } = spatial.calculateViewportStats(validation.bounds);
    const gridCount = gridsInView.length;

    applyHysteresis(modeState, gridCount);

    const proximity = computeProximityFromZoom(zoom, PROXIMITY_ZOOM_LOW, PROXIMITY_ZOOM_HIGH);

    const lcFractions = getLcFractionsFromDistribution(stats.landcoverDistribution);
    const delta = computeDeltaMetrics(lcFractions, deltaState?.previousSnapshot || null);
    if (deltaState) {
        deltaState.previousSnapshot = delta.snapshot;
    }

    stats.mode = modeState.currentMode;
    stats.perGridThresholdEnter = PER_GRID_THRESHOLD_ENTER;
    stats.perGridThresholdExit = PER_GRID_THRESHOLD_EXIT;

    // Audio parameters for Web Audio frontend.
    // Server performs fold-mapping so the frontend only receives bus-level data.
    stats.audioParams = {
        busTargets: computeBusTargets(lcFractions),
        busNames: BUS_NAMES,
        oceanLevel: computeOceanLevel(proximity, stats.landCoverageRatio),
        proximity,
        coverage: stats.landCoverageRatio,
    };

    const elapsedMs = Date.now() - t0;

    return { stats, gridsInView, elapsedMs };
}

module.exports = { processViewport };
