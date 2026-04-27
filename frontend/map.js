// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Geo-Sonification — Map initialization & viewport tracking.
 *
 * Mapbox GL (globe projection) + PMTiles grid dots, viewport change
 * handler with debounce, HTTP fallback, and server config refresh.
 *
 * @module frontend/map
 */

import { state, ASSET_BASE, VIEWPORT_DEBOUNCE, getClientId } from './config.js';
import { updateUI, showToast } from './ui.js';
import { engine } from './audio-engine.js';
import { attachPopup } from './popup.js';

// ============ Motion Tracking ============

/** Max expected drag speed in degrees/second for normalization. */
const MAX_VELOCITY_DEG_PER_SEC = 50;

let prevCenterLat = 0;
let prevCenterLon = 0;
let prevMoveTime = 0;

// ============ Grid Overlay ============

/** Layer id for the per-grid dot overlay. */
const GRID_DOT_LAYER = 'grid-dots';

/** Fixed neutral grey for the dot overlay (landcover is surfaced in popups, not colors). */
const DOT_COLOR = '#606060';

/**
 * Per-zoom stroke width for the dot layer. Pulled out as a module-level
 * constant so the drag-suppression handlers below can restore the exact
 * same expression after `movestart` zeros it out (see `initMap`).
 */
const STROKE_WIDTH_BY_ZOOM = [
    'interpolate',
    ['linear'],
    ['zoom'],
    2,
    0.15,
    5,
    0.35,
    8,
    0.6,
    12,
    0.9,
];

/** Add PMTiles vector source + single circle layer for per-grid dots. */
async function addGridLayer() {
    const PMTILES_URL = ASSET_BASE
        ? `${ASSET_BASE}/tiles/grids.pmtiles`
        : `${window.location.origin}/tiles/grids.pmtiles`;

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

    // Per-grid dot layer. pitch-alignment defaults to 'viewport' and
    // pitch-scale defaults to 'map' — leaving both at defaults avoids the
    // globe→mercator transition bug around zoom 6 where explicitly setting
    // both to 'viewport' caused circles to cull themselves to invisible.
    state.runtime.map.addLayer({
        id: GRID_DOT_LAYER,
        type: 'circle',
        source: 'grid-source',
        'source-layer': 'grids',
        paint: {
            'circle-color': DOT_COLOR,
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 1.1, 5, 2.8, 8, 4.9, 12, 8.2],
            'circle-opacity': ['interpolate', ['linear'], ['zoom'], 2, 0.92, 5, 0.96, 8, 1],
            'circle-stroke-color': 'rgba(255, 255, 255, 0.18)',
            'circle-stroke-width': STROKE_WIDTH_BY_ZOOM,
            'circle-stroke-opacity': 0.8,
            'circle-blur': 0,
        },
    });
}

/**
 * Paint every non-background layer transparent and force the background
 * to pure black. Combined with dark-v10, this keeps the globe view focused
 * on the dot overlay without extra basemap clutter.
 */
function applyMinimalBasemap() {
    const map = state.runtime.map;
    const layers = map.getStyle().layers || [];

    for (const layer of layers) {
        if (layer.type === 'background') {
            map.setPaintProperty(layer.id, 'background-color', '#000');
        } else {
            map.setLayoutProperty(layer.id, 'visibility', 'none');
        }
    }
}

// ============ Viewport ============

/** Return current map viewport as [west, south, east, north]. */
function getViewportBounds() {
    const b = state.runtime.map.getBounds();
    return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
}

/** Send the current viewport bounds to the server and update motion signals. */
function sendViewport() {
    const boundsArray = getViewportBounds();

    // Compute velocity and latitude for audio engine (client-side, no round-trip)
    const lat = (boundsArray[1] + boundsArray[3]) / 2;
    const lon = (boundsArray[0] + boundsArray[2]) / 2;
    const now = performance.now();
    const dt = now - prevMoveTime;

    let velocity = 0;
    if (dt > 0 && dt < 2000) {
        const dlat = lat - prevCenterLat;
        const dlon = lon - prevCenterLon;
        const dist = Math.sqrt(dlat * dlat + dlon * dlon);
        velocity =
            Math.min(dist / (dt / 1000), MAX_VELOCITY_DEG_PER_SEC) / MAX_VELOCITY_DEG_PER_SEC;
    }
    prevCenterLat = lat;
    prevCenterLon = lon;
    prevMoveTime = now;

    engine.updateMotion(velocity, lat);

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
}

/** Throttle viewport changes: fire at most once per VIEWPORT_DEBOUNCE ms, with a trailing call. */
export function onViewportChange() {
    // Trailing: always schedule a final send after activity stops
    clearTimeout(state.runtime.debounceTimer);
    state.runtime.debounceTimer = setTimeout(sendViewport, VIEWPORT_DEBOUNCE);

    // Leading/throttle: send immediately if enough time has elapsed
    const now = performance.now();
    if (now - state.runtime.lastViewportSend >= VIEWPORT_DEBOUNCE) {
        state.runtime.lastViewportSend = now;
        sendViewport();
    }
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
        if (stats.audioParams) {
            engine.update(stats.audioParams);
        }
    } catch (err) {
        console.error('HTTP viewport update failed:', err);
    }
}

// ============ Server Config Refresh ============

/**
 * Re-fetch /api/config from the server and update local state.
 * The dot layer uses a fixed colour, so landcoverMeta updates only affect
 * side-panel labels (handled by ui.js) and popup text.
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
            state.config.landcoverMeta = config.landcoverMeta;
        }
    } catch (err) {
        console.warn('Failed to refresh server config:', err.message || err);
    }
}

// ============ Map Initialization ============

/** Create the Mapbox GL map, add controls, grid overlay, and event listeners. */
export function initMap() {
    mapboxgl.accessToken = state.config.mapboxToken;

    // Keep the globe view, but use a static v8 style to avoid dark-v11
    // imports changing the layer stack after our overlay is added.
    state.runtime.map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/dark-v10',
        projection: 'globe',
        center: [-55, -10], // Amazon region
        zoom: 4,
        minZoom: 2,
        maxZoom: 12,
    });

    state.runtime.map.addControl(new mapboxgl.NavigationControl(), 'top-left');
    state.runtime.map.addControl(new mapboxgl.ScaleControl(), 'bottom-left');

    // Using 'style.load' rather than 'load' — dark-v10 is a v8 style, but
    // keeping 'style.load' keeps the setup path generic.
    let setupDone = false;
    state.runtime.map.on('style.load', async () => {
        if (setupDone) return;
        setupDone = true;

        applyMinimalBasemap();

        state.runtime.map.setFog(null);

        // Mapbox's globe projection renders the circle layer as pitch
        // black at assorted zoom levels past ~5 (visible as "all dots
        // disappear" around zoom 5.5, 6.0, 6.44, etc.). Mercator doesn't
        // have this bug. Keep globe for the low-zoom "sphere" view and
        // switch to mercator as soon as the user zooms in — this also
        // matches the intent: globe for the overview, mercator for
        // detail work.
        let currentProjectionIsGlobe = true;
        const GLOBE_ZOOM_CUTOFF = 5;
        function updateProjection() {
            const wantGlobe = state.runtime.map.getZoom() < GLOBE_ZOOM_CUTOFF;
            if (wantGlobe === currentProjectionIsGlobe) return;
            currentProjectionIsGlobe = wantGlobe;
            state.runtime.map.setProjection(wantGlobe ? 'globe' : 'mercator');
        }
        state.runtime.map.on('zoom', updateProjection);

        try {
            await addGridLayer();
        } catch (err) {
            console.warn(
                'Grid layer failed to load (PMTiles missing?), continuing without overlay:',
                err
            );
            showToast(
                'Grid tiles failed to load \u2014 run npm run build:tiles to regenerate.',
                8000
            );
        }

        state.runtime.map.on('move', () => {
            if (state.els.zoomLevel) {
                state.els.zoomLevel.textContent = state.runtime.map.getZoom().toFixed(2);
            }
            onViewportChange();
        });

        // Drag-suppress the per-dot stroke. Stroke is per-fragment work on
        // 67k features every frame; zeroing it out during motion roughly
        // halves the fragment shader cost at low zoom. The dots' fill,
        // size, and color are unchanged, and `moveend` restores the stroke
        // within one frame so the resting visual is identical. Distinct
        // from the rolled-back LOD experiments — those changed which
        // features render at rest; this only changes a paint property
        // during motion.
        state.runtime.map.on('movestart', () => {
            if (state.runtime.map.getLayer(GRID_DOT_LAYER)) {
                state.runtime.map.setPaintProperty(GRID_DOT_LAYER, 'circle-stroke-width', 0);
            }
        });
        state.runtime.map.on('moveend', () => {
            if (state.runtime.map.getLayer(GRID_DOT_LAYER)) {
                state.runtime.map.setPaintProperty(
                    GRID_DOT_LAYER,
                    'circle-stroke-width',
                    STROKE_WIDTH_BY_ZOOM
                );
            }
        });

        if (state.els.zoomLevel) {
            state.els.zoomLevel.textContent = state.runtime.map.getZoom().toFixed(2);
        }
        onViewportChange();

        // Kick the renderer in case the container measured 0 during init.
        requestAnimationFrame(() => {
            state.runtime.map.resize();
            state.runtime.map.triggerRepaint();
        });
    });

    // Dot click → popup; hover → pointer cursor.
    attachPopup(state.runtime.map, GRID_DOT_LAYER);
}
