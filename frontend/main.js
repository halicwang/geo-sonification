/**
 * Geo-Sonification Frontend — Entry point.
 *
 * Mapbox GL map that tracks the user's viewport and streams bounds
 * to the Node server. The server aggregates grid stats and sends
 * them back (via WebSocket or HTTP fallback) for the info panel,
 * and forwards normalized values to MaxMSP via OSC.
 *
 * Data flow:
 *   User pans/zooms map
 *     --> onViewportChange() debounces, sends bounds via WebSocket
 *     --> server calculates stats (spatial.js)
 *     --> server responds with stats JSON + sends OSC to Max
 *     --> updateUI() renders landcover breakdown in the side panel
 *
 * @module frontend/main
 */

import { state, getMapboxToken, loadServerConfig, getClientId } from './config.js';
import { showToast, updateUI, updateConnectionStatus } from './ui.js';
import { initMap, onViewportChange, refreshServerConfig } from './map.js';
import { connectWebSocket } from './websocket.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Cache fixed DOM element references once
    state.els = {
        zoomLevel: document.getElementById('zoom-level'),
        gridCount: document.getElementById('grid-count'),
        oscMode: document.getElementById('osc-mode'),
        landType: document.getElementById('land-type'),
        landcoverList: document.getElementById('landcover-list'),
        wsStatus: document.getElementById('ws-status'),
        wsText: document.getElementById('ws-text'),
        toast: document.getElementById('toast'),
    };

    getClientId();

    // Check for Mapbox token
    state.config.mapboxToken = getMapboxToken();
    if (!state.config.mapboxToken) {
        showToast('Mapbox token not configured. Create config.local.js with your token', 10000);
        console.error('Mapbox token not configured.');
        console.error(
            'Create frontend/config.local.js with: window.MAPBOX_TOKEN = "your-token-here";'
        );
        console.error('Get a token at: https://account.mapbox.com/access-tokens/');
        return;
    }

    // Load server config first to get correct WebSocket port
    await loadServerConfig();

    initMap();

    // Connect WebSocket — wire callbacks to map/ui modules
    connectWebSocket({
        onOpen: async () => {
            await refreshServerConfig();
            updateConnectionStatus(true);
            if (state.runtime.map) {
                onViewportChange();
            }
        },
        onStats: (data) => updateUI(data),
        onError: (msg) => showToast(`Error: ${msg}`, 5000),
        onDisconnect: () => updateConnectionStatus(false),
    });
});
