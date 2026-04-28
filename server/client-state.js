// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Per-client state for the geo-sonification server.
 *
 * Merges the pre-M4-P4-3 `mode-manager.js` (hysteresis + per-IP HTTP
 * mode persistence) and `delta-state.js` (per-client delta snapshots)
 * into one module with one shared TTL timer (M3 audit D.5 fix). One
 * entry per HTTP client now carries both the hysteresis mode and the
 * delta snapshot, so a client's mode and delta state can never drift
 * across separate Map entries.
 *
 * Per-client state shape: `{ currentMode, previousSnapshot }`.
 *
 * @module server/client-state
 */

const { PER_GRID_THRESHOLD_ENTER, PER_GRID_THRESHOLD_EXIT } = require('./config');

// ============ Constants ============

/** Stale entry expiry — applies to both hysteresis mode and snapshot. */
const HTTP_CLIENT_TTL_MS = 5 * 60 * 1000; // 5 min
/** Sweep frequency for the cleanup timer. */
const HTTP_CLIENT_CLEANUP_INTERVAL_MS = 60 * 1000; // 1 min

// ============ HTTP Per-Client State ============

/**
 * Per-client state map for HTTP `/api/viewport`.
 * @type {Map<string, { currentMode: string, snapshot: import('./types').Snapshot|null, lastSeen: number }>}
 */
const httpClientByKey = new Map();
let httpClientCleanupTimer = null;

/** Sweep callback — extracted from the timer so tests can run it synchronously. */
function runCleanupSweep() {
    const now = Date.now();
    for (const [key, entry] of httpClientByKey) {
        if (now - entry.lastSeen > HTTP_CLIENT_TTL_MS) {
            httpClientByKey.delete(key);
        }
    }
    // Stop the timer when there are no entries left to avoid idle CPU.
    if (httpClientByKey.size === 0 && httpClientCleanupTimer) {
        clearInterval(httpClientCleanupTimer);
        httpClientCleanupTimer = null;
    }
}

/** Start the fixed-interval cleanup timer if not already running. */
function ensureCleanupTimer() {
    if (httpClientCleanupTimer) return;
    httpClientCleanupTimer = setInterval(runCleanupSweep, HTTP_CLIENT_CLEANUP_INTERVAL_MS);
    httpClientCleanupTimer.unref(); // don't prevent process exit
}

// ============ Snapshot Helpers ============

/**
 * Deep-clone a snapshot, returning null if invalid.
 * @param {import('./types').Snapshot|null|undefined} snapshot
 * @returns {import('./types').Snapshot|null}
 */
function cloneSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return null;
    if (!Array.isArray(snapshot.lcFractions)) return null;
    return { lcFractions: snapshot.lcFractions.slice() };
}

// ============ Per-Client State Helpers ============

/**
 * Create a fresh per-client state object (used for WebSocket connections).
 * @returns {{ currentMode: string, previousSnapshot: import('./types').Snapshot|null }}
 */
function createClientState() {
    return { currentMode: 'aggregated', previousSnapshot: null };
}

/**
 * Get or create HTTP client state, restoring snapshot from persisted entry.
 * Returns the previous mode separately so callers can detect transitions.
 *
 * @param {string} clientKey - Unique key from getHttpClientKey()
 * @returns {{ state: { currentMode: string, previousSnapshot: import('./types').Snapshot|null }, previousMode: string }}
 */
function getHttpClientState(clientKey) {
    const entry = httpClientByKey.get(clientKey);
    const previousMode = entry ? entry.currentMode : 'aggregated';
    const state = {
        currentMode: previousMode,
        previousSnapshot: entry ? cloneSnapshot(entry.snapshot) : null,
    };
    return { state, previousMode };
}

/**
 * Persist HTTP client state after a viewport update.
 * @param {string} clientKey
 * @param {{ currentMode: string, previousSnapshot: import('./types').Snapshot|null }} state
 */
function saveHttpClientState(clientKey, state) {
    httpClientByKey.set(clientKey, {
        currentMode: state.currentMode,
        snapshot: cloneSnapshot(state.previousSnapshot),
        lastSeen: Date.now(),
    });
    ensureCleanupTimer();
}

// ============ Hysteresis Logic ============

/**
 * Apply hysteresis-based mode switching to a per-client state (mutated in place).
 *
 * Transitions:
 *   aggregated -> per-grid:  when gridCount > 0 AND gridCount <= ENTER threshold
 *   per-grid -> aggregated:  when gridCount > EXIT threshold OR gridCount === 0
 *
 * @param {{ currentMode: string }} state - Per-client state (mutated)
 * @param {number} gridCount - Number of grid cells in the current viewport
 */
function applyHysteresis(state, gridCount) {
    if (state.currentMode === 'aggregated') {
        if (gridCount > 0 && gridCount <= PER_GRID_THRESHOLD_ENTER) {
            state.currentMode = 'per-grid';
        }
    } else {
        if (gridCount === 0 || gridCount > PER_GRID_THRESHOLD_EXIT) {
            state.currentMode = 'aggregated';
        }
    }
}

// ============ HTTP Client Key ============

/**
 * Validate and trim a client ID value. Handles arrays (e.g. repeated headers)
 * by recursing into the first valid element.
 * @param {*} value
 * @returns {string} Trimmed ID, or empty string if invalid
 */
function normalizeClientId(value) {
    if (Array.isArray(value)) {
        for (const item of value) {
            const normalized = normalizeClientId(item);
            if (normalized) {
                return normalized;
            }
        }
        return '';
    }
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    return trimmed.length > 0 && trimmed.length <= 128 ? trimmed : '';
}

/**
 * Derive a unique key for an HTTP request. Both mode and delta state
 * persist under this single key (P4-3 merger).
 *
 * Priority:
 *   1. body.clientId        → `client:${id}`
 *   2. x-client-id header   → `header-client:${id}`
 *   3. x-forwarded-for IP   → `ip:${first-ip}`
 *   4. req.ip / socket fallback → `ip:${ip}`
 *
 * @param {import('express').Request} req
 * @returns {string}
 */
function getHttpClientKey(req) {
    const body = req.body;
    if (body && typeof body === 'object') {
        const clientId = normalizeClientId(body.clientId);
        if (clientId) {
            return `client:${clientId}`;
        }
    }

    const headerClientId = normalizeClientId(
        req.get ? req.get('x-client-id') : req.headers['x-client-id']
    );
    if (headerClientId) {
        return `header-client:${headerClientId}`;
    }

    const xff = req.headers['x-forwarded-for'];
    const xffValue = Array.isArray(xff) ? xff[0] : xff;
    const ip =
        typeof xffValue === 'string' && xffValue.trim() !== ''
            ? xffValue.split(',')[0].trim()
            : req.ip || req.socket?.remoteAddress || 'unknown';

    return `ip:${ip}`;
}

// ============ Test-only seam ============

/**
 * @internal @test-only
 * Run the cleanup sweep synchronously (skip waiting for `setInterval`).
 */
function _runCleanupNow() {
    runCleanupSweep();
}

/**
 * @internal @test-only
 * Reset the in-memory Map and stop any active timer. Tests call this in
 * `beforeEach` for isolation.
 */
function _resetMap() {
    httpClientByKey.clear();
    if (httpClientCleanupTimer) {
        clearInterval(httpClientCleanupTimer);
        httpClientCleanupTimer = null;
    }
}

module.exports = {
    createClientState,
    applyHysteresis,
    getHttpClientState,
    saveHttpClientState,
    getHttpClientKey,
    PER_GRID_THRESHOLD_ENTER,
    PER_GRID_THRESHOLD_EXIT,
    _runCleanupNow,
    _resetMap,
};
