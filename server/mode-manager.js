/**
 * Mode manager: hysteresis-based switching between "aggregated" and "per-grid" OSC modes.
 *
 * Responsibilities:
 *   - Per-client mode state (WebSocket: per-connection, HTTP: per-IP with TTL)
 *   - Hysteresis thresholds to prevent mode flickering at zoom boundaries
 *   - HTTP client key derivation (IP + User-Agent or explicit clientId)
 *   - Stale HTTP entry cleanup
 *
 * Extracted from index.js to keep the entry point focused on HTTP/WS routing.
 */

const { PER_GRID_THRESHOLD_ENTER, PER_GRID_THRESHOLD_EXIT } = require('./config');

// ============ Constants ============

const HTTP_MODE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ============ HTTP Per-Client State ============

// Per-IP hysteresis state for HTTP /api/viewport fallback.
// Entries expire after HTTP_MODE_TTL_MS of inactivity to prevent unbounded growth.
const httpModeByClient = new Map(); // key -> { currentMode, lastSeen }
let httpModeCleanupTimer = null;

/** Lazily schedule a single cleanup pass for stale httpModeByClient entries. */
function scheduleHttpModeCleanup() {
    if (httpModeCleanupTimer) return; // already scheduled
    httpModeCleanupTimer = setTimeout(() => {
        httpModeCleanupTimer = null;
        const now = Date.now();
        for (const [key, entry] of httpModeByClient) {
            if (now - entry.lastSeen > HTTP_MODE_TTL_MS) {
                httpModeByClient.delete(key);
            }
        }
        // If there are still entries, schedule another pass
        if (httpModeByClient.size > 0) {
            scheduleHttpModeCleanup();
        }
    }, HTTP_MODE_TTL_MS);
    httpModeCleanupTimer.unref(); // don't prevent process exit
}

// ============ Mode State Helpers ============

/**
 * Create a fresh per-client mode state object (used for WebSocket connections).
 * @returns {{ currentMode: string }}
 */
function createModeState() {
    return { currentMode: 'aggregated' };
}

/**
 * Get or create HTTP client mode state, updating lastSeen timestamp.
 * @param {string} clientKey — unique key from getHttpClientKey()
 * @returns {{ modeState: { currentMode: string }, previousMode: string }}
 */
function getHttpModeState(clientKey) {
    const entry = httpModeByClient.get(clientKey);
    const previousMode = entry ? entry.currentMode : 'aggregated';
    const modeState = { currentMode: previousMode };
    return { modeState, previousMode };
}

/**
 * Persist HTTP client mode state after a viewport update.
 * @param {string} clientKey
 * @param {{ currentMode: string }} modeState
 */
function saveHttpModeState(clientKey, modeState) {
    httpModeByClient.set(clientKey, { currentMode: modeState.currentMode, lastSeen: Date.now() });
    scheduleHttpModeCleanup();
}

// ============ Hysteresis Logic ============

/**
 * Apply hysteresis-based mode switching to a mode state object (mutated in place).
 *
 * Transitions:
 *   aggregated -> per-grid:  when gridCount > 0 AND gridCount <= ENTER threshold
 *   per-grid -> aggregated:  when gridCount > EXIT threshold OR gridCount === 0
 *
 * @param {{ currentMode: string }} modeState — per-client state (mutated)
 * @param {number} gridCount — number of grid cells in the current viewport
 */
function applyHysteresis(modeState, gridCount) {
    if (modeState.currentMode === 'aggregated') {
        if (gridCount > 0 && gridCount <= PER_GRID_THRESHOLD_ENTER) {
            modeState.currentMode = 'per-grid';
        }
    } else {
        if (gridCount === 0 || gridCount > PER_GRID_THRESHOLD_EXIT) {
            modeState.currentMode = 'aggregated';
        }
    }
}

// ============ HTTP Client Key ============

/**
 * Derive a unique key for an HTTP request (for per-client hysteresis state).
 * Priority: body.clientId > x-client-id header > IP + User-Agent.
 *
 * @param {import('express').Request} req
 * @returns {string}
 */
function getHttpClientKey(req) {
    const normalizeClientId = (value) => {
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
    };

    const body = req.body;
    if (body && typeof body === 'object') {
        const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : '';
        if (clientId && clientId.length <= 128) {
            return `client:${clientId}`;
        }
    }

    const headerClientId = normalizeClientId(req.get ? req.get('x-client-id') : req.headers['x-client-id']);
    if (headerClientId) {
        return `header-client:${headerClientId}`;
    }

    const xff = normalizeClientId(req.headers['x-forwarded-for']);
    const ip = (typeof xff === 'string' && xff.trim() !== '')
        ? xff.split(',')[0].trim()
        : (req.ip || req.socket?.remoteAddress || 'unknown');

    const safeUa = normalizeClientId(req.get ? req.get('user-agent') : req.headers['user-agent']) || 'unknown';
    return `${ip}|${safeUa}`;
}

module.exports = {
    createModeState,
    getHttpModeState,
    saveHttpModeState,
    applyHysteresis,
    getHttpClientKey,
    PER_GRID_THRESHOLD_ENTER,
    PER_GRID_THRESHOLD_EXIT
};
