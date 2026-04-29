// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Geo-Sonification — Configuration & shared state.
 *
 * Initializes the shared state object and provides server-config
 * loading, Mapbox token reading, and client-ID management.
 *
 * @module frontend/config
 */

// ============ Runtime Deployment Config ============

/**
 * Deployment-specific configuration injected via frontend/config.runtime.js.
 * That file ships as an empty placeholder in the repo and is overwritten at
 * deploy time with real values; during local dev every field stays empty
 * and the frontend falls back to same-origin defaults so the existing
 * Node.js server keeps serving assets and APIs unchanged.
 *
 * Recognized keys (see frontend/config.runtime.example.js for the template):
 *   basePath   — URL prefix the app is mounted under (e.g. '/geo-sonification').
 *   apiBase    — Absolute URL of the Node backend ('' = same origin).
 *   wsUrl      — Full WebSocket URL, including scheme and host ('' = derive from hostname+port).
 *   assetBase  — Absolute URL prefix for large static assets (PMTiles, ambience WAVs).
 *                Defaults to basePath when omitted.
 *   mapboxToken — Production Mapbox token; overrides config.local.js when set.
 */
const runtime = (typeof window !== 'undefined' && window.GEO_SONIFICATION_CONFIG) || {};

/** URL prefix the app is mounted under; '' means root. No trailing slash. */
export const BASE_PATH = (runtime.basePath || '').replace(/\/$/, '');

/** Absolute URL prefix for large static assets (PMTiles, ambience WAVs). */
export const ASSET_BASE = (runtime.assetBase || BASE_PATH).replace(/\/$/, '');

// ============ Shared State ============

/** @type {{ config: Object, runtime: Object, els: Object }} */
export const state = {
    /** Server-provided configuration (populated by loadServerConfig). */
    config: {
        gridSize: 0.5,
        apiBase: runtime.apiBase || '',
        mapboxToken: null,
        landcoverMeta: {},
        // Proximity-zoom thresholds drive the low-pass filter cutoff
        // locally (frontend/map.js → engine.updateProximity). Defaults
        // mirror server/config.js so a missing /api/config field still
        // produces sane behaviour; the canonical values arrive via
        // loadServerConfig() and refreshServerConfig().
        proximityZoomLow: 4,
        proximityZoomHigh: 6,
    },
    /** Runtime instances and transient values. */
    runtime: {
        ws: null,
        map: null,
        debounceTimer: null,
        lastViewportSend: 0,
        clientId: null,
        wsReconnectDelay: 1000,
        audioEnabled: false,
    },
    /** Cached DOM element references (populated in main.js DOMContentLoaded). */
    els: {},
};

// ============ Constants ============

/**
 * Debounce delay for viewport updates (ms). The throttle in
 * `frontend/map.js` `onViewportChange` is hybrid leading+trailing — the
 * value here also caps the leading-fire frequency, so dropping it cuts
 * drag-stop latency by the same amount it raises the message rate.
 *
 * 120 ms is paired with the server's measured ~1–2 ms / viewport compute
 * cost (`server/index.js` `_statsCounter`); the resulting ~8 Hz upper
 * bound stays well below the `WS_MAX_BUFFERED = 64 KB` backpressure
 * threshold. Values below ~80 ms start to risk buffer accumulation under
 * concurrent clients.
 */
export const VIEWPORT_DEBOUNCE = 120;

/** Maximum WebSocket reconnect backoff (ms). */
export const WS_RECONNECT_MAX = 30000;

/**
 * Grace period (ms) before marking panel data as stale after a disconnect.
 * Tuned to absorb transient reconnect cycles (single onclose → onopen
 * round-trip is typically <2 s in healthy networks). Real outages persist
 * past this window and surface the warning.
 */
export const STALE_GRACE_MS = 5000;

const CLIENT_ID_STORAGE_KEY = 'GEO_SONIFICATION_CLIENT_ID';

// ============ Mapbox Token ============

const PLACEHOLDER_TOKENS = new Set(['YOUR_MAPBOX_ACCESS_TOKEN_HERE', 'your-token-here']);

/**
 * Read Mapbox token, preferring the deployment-time value from
 * config.runtime.js over the local-dev value from config.local.js.
 */
export function getMapboxToken() {
    if (runtime.mapboxToken && !PLACEHOLDER_TOKENS.has(runtime.mapboxToken)) {
        return runtime.mapboxToken;
    }
    if (window.MAPBOX_TOKEN && !PLACEHOLDER_TOKENS.has(window.MAPBOX_TOKEN)) {
        return window.MAPBOX_TOKEN;
    }
    return null;
}

// ============ WebSocket URL ============

/** Optional ?ws_port= query override (debug only, e.g. when a dev proxy remaps the port). */
function wsPortOverride() {
    const raw = new URLSearchParams(window.location.search).get('ws_port');
    if (!raw) return null;
    const port = Number(raw);
    return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null;
}

/**
 * Build the WebSocket URL. Priority:
 *   1. Deployment-time override (runtime.wsUrl) — full absolute URL.
 *   2. Same origin + same port as the page — matches the server's
 *      single-port model where HTTP and WS share the listener.
 *   3. ?ws_port= query param overrides the port (local debugging only).
 */
export function buildWsUrl() {
    if (runtime.wsUrl) return runtime.wsUrl;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const override = wsPortOverride();
    const host =
        override != null ? `${window.location.hostname}:${override}` : window.location.host;
    return `${protocol}//${host}`;
}

/** Return the current WebSocket URL. */
export function getWebSocketURL() {
    return buildWsUrl();
}

// ============ Server Config ============

/** Fetch grid size and landcover metadata from the server. */
export async function loadServerConfig() {
    try {
        const response = await fetch(`${state.config.apiBase}/api/config`);
        if (!response.ok) {
            console.warn(`Server config endpoint returned ${response.status}, using fallback`);
            return;
        }
        const config = await response.json();
        if (Number.isFinite(config.gridSize) && config.gridSize > 0) {
            state.config.gridSize = config.gridSize;
        }
        if (config.landcoverMeta) {
            state.config.landcoverMeta = config.landcoverMeta;
        }
        if (Number.isFinite(config.proximityZoomLow)) {
            state.config.proximityZoomLow = config.proximityZoomLow;
        }
        if (Number.isFinite(config.proximityZoomHigh)) {
            state.config.proximityZoomHigh = config.proximityZoomHigh;
        }
    } catch (err) {
        console.warn('Failed to load server config, using defaults:', err);
    }
}

// ============ Client ID ============

function generateClientId() {
    return `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Retrieve or generate a unique client ID (persisted in localStorage). */
export function getClientId() {
    if (state.runtime.clientId) {
        return state.runtime.clientId;
    }

    try {
        const existing = window.localStorage.getItem(CLIENT_ID_STORAGE_KEY);
        if (existing && existing.trim()) {
            state.runtime.clientId = existing.trim();
            return state.runtime.clientId;
        }
    } catch {
        state.runtime.clientId = generateClientId();
        return state.runtime.clientId;
    }

    state.runtime.clientId = generateClientId();

    try {
        window.localStorage.setItem(CLIENT_ID_STORAGE_KEY, state.runtime.clientId);
    } catch {
        // localStorage may be unavailable; keep in-memory client id only.
    }

    return state.runtime.clientId;
}

// ============ Audio Loudness Normalization ============

const LOUDNESS_NORM_STORAGE_KEY = 'ENABLE_LOUDNESS_NORM';

/**
 * Whether to route the master output through the loudness-normalization
 * chain (static makeup gain + peak limiter) in audio/engine.js. Reads
 * localStorage so it can be flipped from the browser console without
 * redeploying:
 *   localStorage.setItem('ENABLE_LOUDNESS_NORM', 'false'); location.reload();
 * Defaults to true; only the literal string 'false' disables the chain
 * so a missing or unreadable storage entry leaves the default on.
 */
export function getLoudnessNormEnabled() {
    try {
        return window.localStorage.getItem(LOUDNESS_NORM_STORAGE_KEY) !== 'false';
    } catch {
        return true;
    }
}
