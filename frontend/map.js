// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Geo-Sonification — Map initialization & viewport tracking.
 *
 * Mapbox GL setup, PMTiles grid overlay, viewport change handler
 * (with debounce), HTTP fallback, and server config refresh.
 *
 * @module frontend/map
 */

import { state, VIEWPORT_DEBOUNCE, getClientId, buildWsUrl } from './config.js';
import { escapeHtml, getLandcoverName } from './landcover.js';
import { updateUI } from './ui.js';
import { engine } from './audio-engine.js';

// ============ Motion Tracking ============

/** Max expected drag speed in degrees/second for normalization. */
const MAX_VELOCITY_DEG_PER_SEC = 50;

let prevCenterLat = 0;
let prevCenterLon = 0;
let prevMoveTime = 0;

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
            'fill-opacity': ['interpolate', ['linear'], ['zoom'], 2, 0.4, 4, 0.55, 6, 0],
            'fill-opacity-transition': { duration: 150, delay: 0 },
            'fill-color-transition': { duration: 150, delay: 0 },
        },
    });

    // Grid outline — zoom-dependent: fades out as crosshairs fade in
    state.runtime.map.addLayer({
        id: 'grid-outline',
        type: 'line',
        source: 'grid-source',
        'source-layer': 'grids',
        paint: {
            'line-color': 'rgba(255, 255, 255, 0.15)',
            'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0, 5, 0.3, 8, 0.8],
            'line-opacity': ['interpolate', ['linear'], ['zoom'], 2, 0, 4, 0.5, 6, 0],
            'line-opacity-transition': { duration: 150, delay: 0 },
        },
    });

    // Crosshair overlay — corner marks that fade in at higher zoom
    const emptyFC = { type: 'FeatureCollection', features: [] };
    state.runtime.map.addSource('crosshair-source', { type: 'geojson', data: emptyFC });
    state.runtime.map.addLayer({
        id: 'crosshair-layer',
        type: 'line',
        source: 'crosshair-source',
        paint: {
            'line-color': buildLandcoverFillColor(),
            'line-width': 2,
            'line-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0, 6, 1],
            'line-opacity-transition': { duration: 150, delay: 0 },
        },
        layout: {
            'line-cap': 'butt',
        },
    });
}

/**
 * Add floating white-glow country border layers.
 * Reads source/filter from the built-in admin-0-boundary layer so we stay
 * in sync with whatever tileset version dark-v11 ships.
 */
function addBorderGlowLayers() {
    const map = state.runtime.map;

    // Read source/filter from the built-in admin-0-boundary style spec
    // so we stay in sync with whatever tileset version dark-v11 ships.
    const styleLayers = map.getStyle().layers;
    const builtinLayer = styleLayers.find((l) => l.id === 'admin-0-boundary');
    if (!builtinLayer) {
        console.warn('admin-0-boundary layer not found, skipping border glow');
        return;
    }

    const src = builtinLayer.source;
    const srcLayer = builtinLayer['source-layer'];
    const filter = builtinLayer.filter;

    // Hide built-in admin-0 layers to avoid visual doubling
    for (const id of ['admin-0-boundary', 'admin-0-boundary-bg', 'admin-0-boundary-disputed']) {
        if (map.getLayer(id)) {
            map.setLayoutProperty(id, 'visibility', 'none');
        }
    }

    // Shadow layer: dark offset line for depth
    map.addLayer({
        id: 'border-shadow',
        type: 'line',
        source: src,
        'source-layer': srcLayer,
        filter,
        paint: {
            'line-color': 'rgba(0, 0, 0, 0.4)',
            'line-width': ['interpolate', ['linear'], ['zoom'], 2, 6, 5, 10, 10, 14],
            'line-blur': ['interpolate', ['linear'], ['zoom'], 2, 6, 5, 10, 10, 14],
            'line-translate': [0, 3],
            'line-opacity': 0.6,
        },
    });

    // Core line: sharp bright white border
    map.addLayer({
        id: 'border-core',
        type: 'line',
        source: src,
        'source-layer': srcLayer,
        filter,
        paint: {
            'line-color': 'rgba(255, 255, 255, 0.9)',
            'line-width': ['interpolate', ['linear'], ['zoom'], 2, 1.5, 5, 2.5, 10, 3.5],
            'line-blur': 0,
            'line-opacity': 1.0,
        },
    });
}

/** Zoom threshold below which crosshair generation is skipped. */
const CROSSHAIR_MIN_ZOOM = 4;

/** Minimum interval (ms) between crosshair rebuilds during continuous interaction. */
const CROSSHAIR_THROTTLE = 150;
let lastCrosshairUpdate = 0;
let crosshairTrailingTimer = 0;

/** Throttled wrapper: rebuilds crosshairs at most once per CROSSHAIR_THROTTLE ms, with trailing call. */
function throttledUpdateCrosshairs() {
    clearTimeout(crosshairTrailingTimer);
    crosshairTrailingTimer = setTimeout(updateCrosshairs, CROSSHAIR_THROTTLE);

    const now = performance.now();
    if (now - lastCrosshairUpdate >= CROSSHAIR_THROTTLE) {
        lastCrosshairUpdate = now;
        updateCrosshairs();
    }
}

/**
 * Build crosshair corner-mark LineStrings for a single grid cell.
 * Returns an array of 8 coordinate pairs (4 corners × 2 arms).
 */
function gridCrosshairLines(lon, lat, gridSize) {
    const s = gridSize;
    const l = s / 5; // arm length = 1/5 of grid size
    return [
        // Bottom-left corner
        [
            [lon, lat],
            [lon + l, lat],
        ],
        [
            [lon, lat],
            [lon, lat + l],
        ],
        // Bottom-right corner
        [
            [lon + s, lat],
            [lon + s - l, lat],
        ],
        [
            [lon + s, lat],
            [lon + s, lat + l],
        ],
        // Top-left corner
        [
            [lon, lat + s],
            [lon + l, lat + s],
        ],
        [
            [lon, lat + s],
            [lon, lat + s - l],
        ],
        // Top-right corner
        [
            [lon + s, lat + s],
            [lon + s - l, lat + s],
        ],
        [
            [lon + s, lat + s],
            [lon + s, lat + s - l],
        ],
    ];
}

/** Cache key for the last crosshair rebuild (sorted grid_id set). */
let crosshairCacheKey = '';

/**
 * Query visible grid cells and update the crosshair GeoJSON source
 * with corner-mark line features. Skipped at low zoom for performance.
 */
function updateCrosshairs() {
    const map = state.runtime.map;
    if (!map.getSource('crosshair-source') || !map.getSource('grid-source')) return;

    const zoom = map.getZoom();

    if (zoom < CROSSHAIR_MIN_ZOOM) {
        if (crosshairCacheKey !== '') {
            crosshairCacheKey = '';
            map.getSource('crosshair-source').setData({
                type: 'FeatureCollection',
                features: [],
            });
        }
        return;
    }

    // Get all grid cells loaded in the current tile set
    const raw = map.querySourceFeatures('grid-source', { sourceLayer: 'grids' });

    // Deduplicate by grid_id (tiles at boundaries duplicate features)
    const seen = new Set();
    const cells = [];
    const gridSize = state.config.gridSize || 0.5;

    for (const f of raw) {
        const id = f.properties.grid_id;
        if (id == null || seen.has(id)) continue;
        seen.add(id);
        cells.push(f);
    }

    // Skip rebuild if the set of visible cells hasn't changed
    const ids = Array.from(seen);
    ids.sort();
    const cacheKey = ids.join(',');
    if (cacheKey === crosshairCacheKey) return;
    crosshairCacheKey = cacheKey;

    // Build crosshair features
    const features = new Array(cells.length);
    for (let ci = 0; ci < cells.length; ci++) {
        const f = cells[ci];

        // Snap polygon centroid to grid origin (robust against tile-boundary clipping)
        const ring = f.geometry.coordinates[0];
        let sumLon = 0;
        let sumLat = 0;
        const n = ring.length - 1; // exclude closing vertex
        for (let i = 0; i < n; i++) {
            sumLon += ring[i][0];
            sumLat += ring[i][1];
        }
        const lon = Math.floor((sumLon / n + 180) / gridSize) * gridSize - 180;
        const lat = Math.floor((sumLat / n + 90) / gridSize) * gridSize - 90;

        features[ci] = {
            type: 'Feature',
            properties: { landcover_class: f.properties.landcover_class },
            geometry: {
                type: 'MultiLineString',
                coordinates: gridCrosshairLines(lon, lat, gridSize),
            },
        };
    }

    map.getSource('crosshair-source').setData({ type: 'FeatureCollection', features });
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
 * If landcoverMeta changes, also update the map grid layer's fill-color
 * expression so the new colors are reflected without a full page reload.
 */
export async function refreshServerConfig() {
    try {
        const response = await fetch(`${state.config.apiBase}/api/config`);
        if (!response.ok) return;
        const config = await response.json();

        if (config.wsPort && Number.isFinite(config.wsPort)) {
            state.config.wsPort = config.wsPort;
            // Rebuild cached WS URL so reconnects use the updated port
            state.runtime.wsUrl = buildWsUrl(config.wsPort);
        }
        if (config.gridSize && Number.isFinite(config.gridSize) && config.gridSize > 0) {
            state.config.gridSize = config.gridSize;
        }
        if (config.landcoverMeta) {
            const oldKeys = Object.keys(state.config.landcoverMeta).sort().join(',');
            const newKeys = Object.keys(config.landcoverMeta).sort().join(',');
            state.config.landcoverMeta = config.landcoverMeta;

            // Update map layers if metadata changed and map is ready
            if (
                oldKeys !== newKeys &&
                state.runtime.map &&
                state.runtime.map.getLayer('grid-layer')
            ) {
                const colorExpr = buildLandcoverFillColor();
                state.runtime.map.setPaintProperty('grid-layer', 'fill-color', colorExpr);
                if (state.runtime.map.getLayer('crosshair-layer')) {
                    state.runtime.map.setPaintProperty('crosshair-layer', 'line-color', colorExpr);
                }
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

        // Add floating border glow overlay
        addBorderGlowLayers();

        // Update crosshair corner marks: throttled during drag, full on stop & tile load
        state.runtime.map.on('move', throttledUpdateCrosshairs);
        state.runtime.map.on('moveend', updateCrosshairs);
        state.runtime.map.on('sourcedata', (e) => {
            if (e.sourceId === 'grid-source' && e.isSourceLoaded) updateCrosshairs();
        });
        updateCrosshairs();

        // Set up viewport tracking
        state.runtime.map.on('move', () => {
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
