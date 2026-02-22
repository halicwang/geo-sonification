/**
 * Geo-Sonification — Map initialization & viewport tracking.
 *
 * Mapbox GL setup, PMTiles grid overlay, viewport change handler
 * (with debounce), HTTP fallback, and server config refresh.
 *
 * @module frontend/map
 */

import { state, VIEWPORT_DEBOUNCE, getClientId } from './config.js';
import { escapeHtml, getLandcoverName } from './landcover.js';
import { updateUI } from './ui.js';

// ============ Grid Overlay ============

/**
 * Build a Mapbox match expression that maps landcover_class → color
 * from state.config.landcoverMeta (single source of truth from server/landcover.js).
 */
function buildLandcoverFillColor() {
    const entries = Object.entries(state.config.landcoverMeta);
    if (entries.length === 0) return 'rgba(255, 255, 255, 0.10)';
    const expr = ['match', ['get', 'landcover_class']];
    for (const [cls, meta] of entries) {
        expr.push(Number(cls), meta.color);
    }
    expr.push('rgba(255, 255, 255, 0.10)'); // fallback for null/unknown
    return expr;
}

/** Add PMTiles vector source + fill/outline layers for the grid overlay. */
async function addGridLayer() {
    const PMTILES_URL = `${window.location.origin}/tiles/grids.pmtiles`;

    // Register the custom PMTiles source type (idempotent)
    mapboxgl.Style.setSourceType(
        mapboxPmTiles.PmTilesSource.SOURCE_TYPE,
        mapboxPmTiles.PmTilesSource
    );

    const header = await mapboxPmTiles.PmTilesSource.getHeader(PMTILES_URL);

    state.runtime.map.addSource('grid-source', {
        type: mapboxPmTiles.PmTilesSource.SOURCE_TYPE,
        url: PMTILES_URL,
        minzoom: header.minZoom,
        maxzoom: header.maxZoom,
    });

    // Grid fill layer (neutral overlay; data values shown in side panel)
    state.runtime.map.addLayer({
        id: 'grid-layer',
        type: 'fill',
        source: 'grid-source',
        'source-layer': 'grids',
        paint: {
            'fill-color': buildLandcoverFillColor(),
            'fill-opacity': ['interpolate', ['linear'], ['zoom'], 2, 0.4, 6, 0.55, 10, 0.7],
            'fill-opacity-transition': { duration: 150, delay: 0 },
            'fill-color-transition': { duration: 150, delay: 0 },
        },
    });

    // Grid outline — zoom-dependent: hidden at globe, visible at region/city
    state.runtime.map.addLayer({
        id: 'grid-outline',
        type: 'line',
        source: 'grid-source',
        'source-layer': 'grids',
        paint: {
            'line-color': 'rgba(255, 255, 255, 0.15)',
            'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0, 5, 0.3, 8, 0.8],
            'line-opacity': ['interpolate', ['linear'], ['zoom'], 2, 0, 5, 0.5, 8, 1],
            'line-opacity-transition': { duration: 150, delay: 0 },
        },
    });
}

// ============ Viewport ============

/** Return current map viewport as [west, south, east, north]. */
function getViewportBounds() {
    const b = state.runtime.map.getBounds();
    return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
}

/** Debounce viewport changes, then send bounds to server for stats + audio params. */
export function onViewportChange() {
    clearTimeout(state.runtime.debounceTimer);
    state.runtime.debounceTimer = setTimeout(() => {
        const boundsArray = getViewportBounds();

        // Send via WebSocket if connected
        if (state.runtime.ws && state.runtime.ws.readyState === WebSocket.OPEN) {
            try {
                state.runtime.ws.send(
                    JSON.stringify({
                        type: 'viewport',
                        bounds: boundsArray,
                        zoom: state.runtime.map.getZoom(),
                    })
                );
            } catch (err) {
                console.error('WebSocket send failed, falling back to HTTP:', err);
                sendViewportHTTP(boundsArray);
            }
        } else {
            // Fallback to HTTP
            sendViewportHTTP(boundsArray);
        }
    }, VIEWPORT_DEBOUNCE);
}

// ============ HTTP Fallback ============

/** POST bounds to /api/viewport when WebSocket is unavailable. */
async function sendViewportHTTP(bounds) {
    try {
        const response = await fetch(`${state.config.apiBase}/api/viewport`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                bounds,
                zoom: state.runtime.map.getZoom(),
                clientId: getClientId(),
            }),
        });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            console.error(
                `HTTP viewport error ${response.status}:`,
                errData.error || response.statusText
            );
            return;
        }
        const stats = await response.json();
        updateUI(stats);
    } catch (err) {
        console.error('HTTP viewport update failed:', err);
    }
}

// ============ Server Config Refresh ============

/**
 * Re-fetch /api/config from the server and update local state.
 * If landcoverMeta changes, also update the map grid layer's fill-color
 * expression so the new colors are reflected without a full page reload.
 */
export async function refreshServerConfig() {
    try {
        const response = await fetch(`${state.config.apiBase}/api/config`);
        if (!response.ok) return;
        const config = await response.json();

        if (config.gridSize && Number.isFinite(config.gridSize) && config.gridSize > 0) {
            state.config.gridSize = config.gridSize;
        }
        if (config.landcoverMeta) {
            const oldKeys = Object.keys(state.config.landcoverMeta).sort().join(',');
            const newKeys = Object.keys(config.landcoverMeta).sort().join(',');
            state.config.landcoverMeta = config.landcoverMeta;

            // Update map layer if metadata changed and map is ready
            if (
                oldKeys !== newKeys &&
                state.runtime.map &&
                state.runtime.map.getLayer('grid-layer')
            ) {
                state.runtime.map.setPaintProperty(
                    'grid-layer',
                    'fill-color',
                    buildLandcoverFillColor()
                );
            }
        }
    } catch (err) {
        console.warn('Failed to refresh server config:', err.message || err);
    }
}

// ============ Map Initialization ============

/** Create the Mapbox GL map, add controls, grid overlay, and event listeners. */
export function initMap() {
    mapboxgl.accessToken = state.config.mapboxToken;

    state.runtime.map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [-55, -10], // Amazon region
        zoom: 4,
        minZoom: 2,
        maxZoom: 12,
    });

    state.runtime.map.addControl(new mapboxgl.NavigationControl(), 'top-left');
    state.runtime.map.addControl(new mapboxgl.ScaleControl(), 'bottom-left');

    state.runtime.map.on('load', async () => {
        console.log('Map loaded');

        // Add vector tile grid overlay (PMTiles)
        try {
            await addGridLayer();
        } catch (err) {
            console.warn(
                'Grid layer failed to load (PMTiles missing?), continuing without overlay:',
                err
            );
        }

        // Set up viewport tracking
        state.runtime.map.on('moveend', () => {
            if (state.els.zoomLevel) {
                state.els.zoomLevel.textContent = state.runtime.map.getZoom().toFixed(2);
            }
            onViewportChange();
        });

        // Initial viewport calculation
        if (state.els.zoomLevel) {
            state.els.zoomLevel.textContent = state.runtime.map.getZoom().toFixed(2);
        }
        onViewportChange();
    });

    // Grid cell click → popup with landcover breakdown
    state.runtime.map.on('click', 'grid-layer', (e) => {
        if (e.features.length > 0) {
            const props = e.features[0].properties;
            const landcoverDisplay =
                props.landcover_class != null
                    ? getLandcoverName(props.landcover_class) || 'Unknown'
                    : 'No data';

            // Build per-cell land-only lc_pct_* breakdown (Water class 80 excluded)
            const lcClasses = [10, 20, 30, 40, 50, 60, 70, 90, 95, 100];
            const lcEntries = lcClasses
                .map((cls) => ({ cls, pct: Number(props[`lc_pct_${cls}`]) || 0 }))
                .filter((e) => e.pct > 0);
            const landTotal = lcEntries.reduce((sum, e) => sum + e.pct, 0);

            let lcBreakdownHtml = '';
            if (lcEntries.length > 0 && landTotal > 0) {
                const top5 = lcEntries
                    .map((e) => ({ ...e, pct: (e.pct / landTotal) * 100 }))
                    .filter((e) => e.pct >= 0.5)
                    .sort((a, b) => b.pct - a.pct)
                    .slice(0, 5);
                if (top5.length > 0) {
                    lcBreakdownHtml =
                        '<br><small>' +
                        top5
                            .map(
                                (e) =>
                                    `${escapeHtml(getLandcoverName(e.cls) || e.cls)}: ${e.pct.toFixed(1)}%`
                            )
                            .join('<br>') +
                        '</small>';
                }
            }

            new mapboxgl.Popup()
                .setLngLat(e.lngLat)
                .setHTML(
                    `
                    <strong>Grid: ${escapeHtml(props.grid_id)}</strong><br>
                    Land Cover: ${escapeHtml(landcoverDisplay)}${lcBreakdownHtml}
                `
                )
                .addTo(state.runtime.map);
        }
    });

    // Change cursor on grid hover
    state.runtime.map.on('mouseenter', 'grid-layer', () => {
        state.runtime.map.getCanvas().style.cursor = 'pointer';
    });
    state.runtime.map.on('mouseleave', 'grid-layer', () => {
        state.runtime.map.getCanvas().style.cursor = '';
    });
}
