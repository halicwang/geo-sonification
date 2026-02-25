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

// ============ Shared State ============

/** @type {{ config: Object, runtime: Object, els: Object }} */
export const state = {
    /** Server-provided configuration (populated by loadServerConfig). */
    config: {
        wsPort: 3001,
        gridSize: 0.5,
        apiBase: '',
        mapboxToken: null,
        landcoverMeta: {},
    },
    /** Runtime instances and transient values. */
    runtime: {
        ws: null,
        map: null,
        debounceTimer: null,
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

/** Read token from config.local.js (not committed to repo). */
export function getMapboxToken() {
    if (window.MAPBOX_TOKEN && window.MAPBOX_TOKEN !== 'YOUR_MAPBOX_ACCESS_TOKEN_HERE') {
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

/** Build a WebSocket URL from the given port. */
export function buildWsUrl(port) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.hostname}:${port}`;
}

/** Return the current WebSocket URL (cached after loadServerConfig). */
export function getWebSocketURL() {
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
