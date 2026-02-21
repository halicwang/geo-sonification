/**
 * Viewport processing orchestrator.
 *
 * Given validated viewport bounds, this module:
 *   1. Queries the spatial index for grid stats
 *   2. Applies mode hysteresis (aggregated ↔ per-grid)
 *   3. Sends the full OSC message sequence to Max/MSP
 *   4. Returns assembled stats for the caller
 *
 * Zero side-effects beyond OSC sends — no timers, no global state.
 */

const { PROXIMITY_ZOOM_LOW, PROXIMITY_ZOOM_HIGH } = require('./config');
const spatial = require('./spatial');
const { validateBounds } = spatial;
const {
    sendToMax,
    sendGridsToMax,
    sendModeToMax,
    sendProximityToMax,
    sendDeltaToMax,
    sendCoverageToMax,
} = require('./osc');
const {
    getLcFractionsFromDistribution,
    computeProximityFromZoom,
    computeDeltaMetrics,
} = require('./osc-metrics');
const {
    applyHysteresis,
    PER_GRID_THRESHOLD_ENTER,
    PER_GRID_THRESHOLD_EXIT,
} = require('./mode-manager');

/**
 * Validate bounds, compute viewport stats, and send to Max.
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

    // Notify MaxMSP of current mode — sent before data messages so Max
    // can prepare for the incoming format (e.g., crossfade on mode change).
    sendModeToMax(modeState.currentMode);

    // /proximity is sent immediately after /mode.
    const proximity = computeProximityFromZoom(zoom, PROXIMITY_ZOOM_LOW, PROXIMITY_ZOOM_HIGH);
    sendProximityToMax(proximity);

    // /delta/lc is sent immediately after /proximity.
    const lcFractions = getLcFractionsFromDistribution(stats.landcoverDistribution);
    const delta = computeDeltaMetrics(lcFractions, deltaState?.previousSnapshot || null);
    sendDeltaToMax(delta.deltaLc);
    if (deltaState) {
        deltaState.previousSnapshot = delta.snapshot;
    }

    // Always send aggregated stats so Max displays/synth never go silent
    sendToMax(
        stats.dominantLandcover,
        stats.nightlightNorm,
        stats.populationNorm,
        stats.forestNorm,
        lcFractions
    );
    sendCoverageToMax(stats.landCoverageRatio);

    // Additionally send per-grid data when zoomed in
    if (modeState.currentMode === 'per-grid') {
        sendGridsToMax(gridsInView, validation.bounds, spatial.getNormalizeParams());
    }

    stats.mode = modeState.currentMode;
    stats.perGridThresholdEnter = PER_GRID_THRESHOLD_ENTER;
    stats.perGridThresholdExit = PER_GRID_THRESHOLD_EXIT;

    const elapsedMs = Date.now() - t0;

    return { stats, gridsInView, elapsedMs };
}

module.exports = { processViewport };
