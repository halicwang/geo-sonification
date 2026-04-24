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
        wsPort: 3001,
        gridSize: 0.5,
        apiBase: runtime.apiBase || '',
        mapboxToken: null,
        landcoverMeta: {},
    },
    /** Runtime instances and transient values. */
    runtime: {
        ws: null,
        map: null,
        debounceTimer: null,
        lastViewportSend: 0,
        clientId: null,
        wsUrl: null,
        wsReconnectDelay: 1000,
        audioEnabled: false,
    },
    /** Cached DOM element references (populated in main.js DOMContentLoaded). */
    els: {},
};

// ============ Constants ============

/** Debounce delay for viewport updates (ms). */
export const VIEWPORT_DEBOUNCE = 200;

/** Maximum WebSocket reconnect backoff (ms). */
export const WS_RECONNECT_MAX = 30000;

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

/** Parse WS port from ?ws_port= query param (used when /api/config is unavailable). */
function fallbackWsPort() {
    const urlParams = new URLSearchParams(window.location.search);
    const wsPort = Number(urlParams.get('ws_port') || '3001');
    return Number.isInteger(wsPort) && wsPort >= 1 && wsPort <= 65535 ? wsPort : 3001;
}

/**
 * Build a WebSocket URL from the given port. When a deployment-time
 * wsUrl is configured (production), it wins over the derived localhost URL.
 */
export function buildWsUrl(port) {
    if (runtime.wsUrl) return runtime.wsUrl;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.hostname}:${port}`;
}

/** Return the current WebSocket URL (cached after loadServerConfig). */
export function getWebSocketURL() {
    if (runtime.wsUrl) return runtime.wsUrl;
    if (state.runtime.wsUrl) return state.runtime.wsUrl;
    return buildWsUrl(fallbackWsPort());
}

// ============ Server Config ============

/** Fetch WS port and landcover metadata from server. */
export async function loadServerConfig() {
    try {
        const response = await fetch(`${state.config.apiBase}/api/config`);
        if (response.ok) {
            const config = await response.json();
            state.config.wsPort = config.wsPort || 3001;
            if (config.gridSize && Number.isFinite(config.gridSize) && config.gridSize > 0) {
                state.config.gridSize = config.gridSize;
            }
            if (config.landcoverMeta) {
                state.config.landcoverMeta = config.landcoverMeta;
            }
        } else {
            console.warn(`Server config endpoint returned ${response.status}, using fallback`);
            state.config.wsPort = fallbackWsPort();
        }
    } catch (err) {
        console.warn('Failed to load server config, using defaults:', err);
        state.config.wsPort = fallbackWsPort();
    }

    state.runtime.wsUrl = buildWsUrl(state.config.wsPort);
}

// ============ Client ID ============

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
        state.runtime.clientId = `client-${Math.floor(Math.random() * 1e9)}`;
        return state.runtime.clientId;
    }

    const fallback = `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    state.runtime.clientId = fallback;

    try {
        window.localStorage.setItem(CLIENT_ID_STORAGE_KEY, fallback);
    } catch {
        // localStorage may be unavailable; keep in-memory client id only.
    }

    return state.runtime.clientId;
}

// ============ Audio Loudness Normalization ============

const LOUDNESS_NORM_STORAGE_KEY = 'ENABLE_LOUDNESS_NORM';

/**
 * Whether to route the master output through the loudness-normalization
 * chain (static makeup gain + peak limiter) in audio-engine.js. Reads
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
