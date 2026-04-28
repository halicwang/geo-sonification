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
 * Pure computation — no network I/O, no timers, no module-level mutation
 * other than a single-entry bounds-keyed cache (see `_viewportCache` below).
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
} = require('./audio-metrics');
const {
    applyHysteresis,
    PER_GRID_THRESHOLD_ENTER,
    PER_GRID_THRESHOLD_EXIT,
} = require('./client-state');

/**
 * Single-entry bounds-keyed cache for the spatial-pipeline outputs.
 *
 * Keyed on the *validated* bounds (after `validateBounds` wraps longitudes),
 * so two semantically-equivalent bounds with different unwrapped form
 * (e.g. `-370` vs `-10`) hit the same cache entry.
 *
 * Caches `gridsInView`, `lcFractions`, and `baseStats` (the spatial output
 * before any per-client fields are added). Per-client state — `modeState`,
 * `deltaState`, `zoom` — is NOT cached; on every call we still apply
 * hysteresis, compute delta against the caller's `previousSnapshot`, and
 * assemble fresh `audioParams`. The cache only avoids re-running
 * `spatial.calculateViewportStats` and `getLcFractionsFromDistribution`,
 * which together are the dominant cost (~0.3-1ms depending on viewport
 * size; the per-client tail is ~20µs).
 *
 * **Why bounds, not lcFractions.** The original M3 audit (D.2) flagged
 * "viewport-processor doesn't memoize lcFractions"; the M4 P1-2 spec
 * inherited that wording. But `lcFractions` is an *intermediate* output —
 * computing the cache key from it requires already running the full
 * spatial pipeline, which defeats the savings the proposal's DoD
 * (`elapsedMs ≈ 0` on hit) actually targets. Keying on the *input*
 * (bounds) lets a hit short-circuit the entire spatial call. See the
 * P1-2 devlog for the full reasoning.
 *
 * @type {{ key: string, gridsInView: import('./types').GridCell[], lcFractions: number[], baseStats: object } | null}
 */
let _viewportCache = null;

/**
 * @internal @test-only
 * Reset the bounds cache. Tests call this in `beforeEach` to isolate
 * per-test cache state; production code never resets the cache.
 * @returns {void}
 */
function _resetCache() {
    _viewportCache = null;
}

/**
 * Validate bounds, compute viewport stats, and assemble audio parameters.
 * @param {number[]} bounds - [west, south, east, north]
 * @param {{ currentMode: string, previousSnapshot: import('./types').Snapshot|null }} clientState
 *        Per-client merged state (hysteresis mode + delta snapshot). Mutated in place.
 * @param {number} [zoom]
 * @returns {{ stats: import('./types').ViewportStats, gridsInView: import('./types').GridCell[], elapsedMs: number } | { error: string }}
 */
function processViewport(bounds, clientState, zoom) {
    const t0 = Date.now();

    const validation = validateBounds(bounds);
    if (!validation.valid) {
        return { error: validation.error };
    }

    const cacheKey = validation.bounds.map((b) => b.toFixed(6)).join(',');
    let gridsInView;
    let lcFractions;
    let stats;

    if (_viewportCache && _viewportCache.key === cacheKey) {
        gridsInView = _viewportCache.gridsInView;
        lcFractions = _viewportCache.lcFractions;
        // Shallow-clone baseStats so per-call mutations (mode, audioParams,
        // perGridThresholds) don't pollute the cached entry. Nested fields
        // (landcoverDistribution, landcoverBreakdown) are read-only and
        // safe to share by reference across cache hits.
        stats = { ..._viewportCache.baseStats };
    } else {
        const result = spatial.calculateViewportStats(validation.bounds);
        ({ gridsInView, ...stats } = result);
        lcFractions = getLcFractionsFromDistribution(stats.landcoverDistribution);
        _viewportCache = {
            key: cacheKey,
            gridsInView,
            lcFractions,
            baseStats: { ...stats },
        };
    }

    const gridCount = gridsInView.length;

    applyHysteresis(clientState, gridCount);

    const proximity = computeProximityFromZoom(zoom, PROXIMITY_ZOOM_LOW, PROXIMITY_ZOOM_HIGH);

    const delta = computeDeltaMetrics(lcFractions, clientState?.previousSnapshot || null);
    if (clientState) {
        clientState.previousSnapshot = delta.snapshot;
    }

    stats.mode = clientState.currentMode;
    stats.perGridThresholdEnter = PER_GRID_THRESHOLD_ENTER;
    stats.perGridThresholdExit = PER_GRID_THRESHOLD_EXIT;

    // Audio parameters for Web Audio frontend.
    // Server performs fold-mapping so the frontend only receives bus-level data.
    stats.audioParams = {
        busTargets: computeBusTargets(lcFractions),
        busNames: BUS_NAMES,
        proximity,
        coverage: stats.landCoverageRatio,
    };

    const elapsedMs = Date.now() - t0;

    return { stats, gridsInView, elapsedMs };
}

module.exports = { processViewport, _resetCache };
