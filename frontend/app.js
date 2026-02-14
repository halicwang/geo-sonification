/**
 * Geo-Sonification Frontend
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
 */

// ============ Configuration ============

/** Read token from config.local.js (not committed to repo). */
function getMapboxToken() {
    if (window.MAPBOX_TOKEN && window.MAPBOX_TOKEN !== 'YOUR_MAPBOX_ACCESS_TOKEN_HERE') {
        return window.MAPBOX_TOKEN;
    }

    return null;
}

const MAPBOX_TOKEN = getMapboxToken();

// Port configuration — fetched from GET /api/config on startup.
// HTTP API uses same-origin relative paths; WebSocket needs an explicit port.
let WS_URL = null;
let WS_PORT = 3001;
let OSC_READY = false;  // Approximate; UDP has no handshake
let GRID_SIZE = 0.5;    // Overridden by server /api/config
const API_BASE = '';

/** Parse WS port from ?ws_port= query param (used when /api/config is unavailable). */
function fallbackWsPort() {
    const urlParams = new URLSearchParams(window.location.search);
    const wsPort = Number(urlParams.get('ws_port') || '3001');
    return (Number.isInteger(wsPort) && wsPort >= 1 && wsPort <= 65535) ? wsPort : 3001;
}

/** Build a WebSocket URL from the given port. */
function buildWsUrl(port) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.hostname}:${port}`;
}

/** Fetch WS port, OSC status, and landcover metadata from server. */
async function loadServerConfig() {
    try {
        const response = await fetch(`${API_BASE}/api/config`);
        if (response.ok) {
            const config = await response.json();
            WS_PORT = config.wsPort || 3001;
            OSC_READY = config.oscReady || false;
            if (config.gridSize && Number.isFinite(config.gridSize) && config.gridSize > 0) {
                GRID_SIZE = config.gridSize;
            }
            if (config.landcoverMeta) {
                LANDCOVER_META = config.landcoverMeta;
            }
        } else {
            console.warn(`Server config endpoint returned ${response.status}, using fallback`);
            WS_PORT = fallbackWsPort();
        }
    } catch (err) {
        console.warn('Failed to load server config, using defaults:', err);
        WS_PORT = fallbackWsPort();
    }

    WS_URL = buildWsUrl(WS_PORT);
}

function getWebSocketURL() {
    if (WS_URL) return WS_URL;
    return buildWsUrl(fallbackWsPort());
}

// Debounce delay for viewport updates (ms)
const VIEWPORT_DEBOUNCE = 200;

// ============ Land Cover (Names + UI Colors) ============
// Fetched from server /api/config (single source of truth in server/landcover.js).
// Keys are string class codes ("10", "20", …); values are { name, color }.
let LANDCOVER_META = {};

// Throttle console warnings for unknown classes
const warnedUnknownLandcoverClasses = new Set();

/** Coerce raw value to integer class; returns null if missing/invalid. */
function parseLandcoverClass(landcoverClass) {
    if (landcoverClass == null || landcoverClass === '') return null;
    const num = Number(landcoverClass);
    if (!Number.isFinite(num)) return null;
    const cls = Math.round(num);
    return cls >= 0 ? cls : null;
}

/** Map numeric class to human-readable name; logs warning once per unknown class. */
function getLandcoverName(landcoverClass) {
    const cls = parseLandcoverClass(landcoverClass);
    if (cls == null) return null;
    const meta = LANDCOVER_META[cls];
    if (meta) return meta.name;
    const rawKey = String(landcoverClass);
    if (!warnedUnknownLandcoverClasses.has(rawKey)) {
        warnedUnknownLandcoverClasses.add(rawKey);
        if (warnedUnknownLandcoverClasses.size <= 20) {
            console.warn('Unknown landcover_class received:', landcoverClass);
        }
    }
    return 'Unknown';
}

function getLandcoverColor(landcoverClass) {
    const cls = parseLandcoverClass(landcoverClass);
    if (cls == null) return null;
    return LANDCOVER_META[cls]?.color || null;
}

// ============ State ============
let ws = null;
let map = null;
let debounceTimer = null;
const CLIENT_ID_STORAGE_KEY = 'GEO_SONIFICATION_CLIENT_ID';
let CLIENT_ID = null;

// Cached DOM element references — populated in DOMContentLoaded, avoids repeated getElementById.
// Only fixed-structure elements are cached; dynamic lists (landcover-list) use innerHTML batch writes.
let _els = {};

/** Return current map viewport as [west, south, east, north]. */
function getViewportBounds() {
    const b = map.getBounds();
    return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
}

function getClientId() {
    if (CLIENT_ID) {
        return CLIENT_ID;
    }

    try {
        const existing = window.localStorage.getItem(CLIENT_ID_STORAGE_KEY);
        if (existing && existing.trim()) {
            CLIENT_ID = existing.trim();
            return CLIENT_ID;
        }
    } catch {
        CLIENT_ID = `client-${Math.floor(Math.random() * 1e9)}`;
        return CLIENT_ID;
    }

    const fallback = `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    CLIENT_ID = fallback;

    try {
        window.localStorage.setItem(CLIENT_ID_STORAGE_KEY, fallback);
    } catch {
        // localStorage may be unavailable; keep in-memory client id only.
    }

    return CLIENT_ID;
}

// ============ Initialize Map ============
function initMap() {
    mapboxgl.accessToken = MAPBOX_TOKEN;
    
    map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [-55, -10],  // Amazon region
        zoom: 4,
        minZoom: 2,
        maxZoom: 12
    });
    
    map.addControl(new mapboxgl.NavigationControl(), 'top-left');
    map.addControl(new mapboxgl.ScaleControl(), 'bottom-left');
    
    map.on('load', async () => {
        console.log('Map loaded');

        // Add vector tile grid overlay (PMTiles)
        await addGridLayer();

        // Set up viewport tracking
        map.on('moveend', () => {
            onViewportChange();
        });

        // Initial viewport calculation
        onViewportChange();
    });
    
    // Show coordinates on click (for debugging)
    map.on('click', 'grid-layer', (e) => {
        if (e.features.length > 0) {
            const props = e.features[0].properties;
            // Handle missing landcover_class (null/undefined) - show "No data" instead of defaulting to 10
            const landcoverDisplay = (props.landcover_class != null)
                ? (getLandcoverName(props.landcover_class) || 'Unknown')
                : 'No data';

            // Build per-cell lc_pct_* breakdown if available
            const lcClasses = [10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100];
            const lcEntries = lcClasses
                .map(cls => ({ cls, pct: props[`lc_pct_${cls}`] || 0 }))
                .filter(e => e.pct >= 0.5)
                .sort((a, b) => b.pct - a.pct);

            let lcBreakdownHtml = '';
            if (lcEntries.length > 0) {
                const top5 = lcEntries.slice(0, 5);
                lcBreakdownHtml = '<br><small>' + top5.map(e =>
                    `${getLandcoverName(e.cls) || e.cls}: ${e.pct.toFixed(1)}%`
                ).join('<br>') + '</small>';
            }

            new mapboxgl.Popup()
                .setLngLat(e.lngLat)
                .setHTML(`
                    <strong>Grid: ${props.grid_id}</strong><br>
                    Land Cover: ${landcoverDisplay}${lcBreakdownHtml}
                `)
                .addTo(map);
        }
    });
    
    // Change cursor on grid hover
    map.on('mouseenter', 'grid-layer', () => {
        map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'grid-layer', () => {
        map.getCanvas().style.cursor = '';
    });
}

// ============ Grid Overlay ============
/** Build a Mapbox match expression that maps landcover_class → color
 *  from LANDCOVER_META (single source of truth from server/landcover.js). */
function buildLandcoverFillColor() {
    const entries = Object.entries(LANDCOVER_META);
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
    mapboxgl.Style.setSourceType(mapboxPmTiles.PmTilesSource.SOURCE_TYPE, mapboxPmTiles.PmTilesSource);

    const header = await mapboxPmTiles.PmTilesSource.getHeader(PMTILES_URL);

    map.addSource('grid-source', {
        type: mapboxPmTiles.PmTilesSource.SOURCE_TYPE,
        url: PMTILES_URL,
        minzoom: header.minZoom,
        maxzoom: header.maxZoom
    });

    // Grid fill layer (neutral overlay; data values shown in side panel)
    map.addLayer({
        id: 'grid-layer',
        type: 'fill',
        source: 'grid-source',
        'source-layer': 'grids',
        paint: {
            'fill-color': buildLandcoverFillColor(),
            'fill-opacity': [
                'interpolate', ['linear'], ['zoom'],
                2, 0.4,
                6, 0.55,
                10, 0.7
            ],
            'fill-opacity-transition': { duration: 150, delay: 0 },
            'fill-color-transition': { duration: 150, delay: 0 }
        }
    });

    // Grid outline — zoom-dependent: hidden at globe, visible at region/city
    map.addLayer({
        id: 'grid-outline',
        type: 'line',
        source: 'grid-source',
        'source-layer': 'grids',
        paint: {
            'line-color': 'rgba(255, 255, 255, 0.15)',
            'line-width': [
                'interpolate', ['linear'], ['zoom'],
                2, 0,
                5, 0.3,
                8, 0.8
            ],
            'line-opacity': [
                'interpolate', ['linear'], ['zoom'],
                2, 0,
                5, 0.5,
                8, 1
            ],
            'line-opacity-transition': { duration: 150, delay: 0 }
        }
    });
}

// ============ Viewport Change Handler ============
/** Debounce viewport changes, then send bounds to server for stats + OSC. */
function onViewportChange() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        const boundsArray = getViewportBounds();

        // Send via WebSocket if connected
        if (ws && ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(JSON.stringify({
                    type: 'viewport',
                    bounds: boundsArray
                }));
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
        const response = await fetch(`${API_BASE}/api/viewport`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                bounds,
                clientId: getClientId()
            })
        });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            console.error(`HTTP viewport error ${response.status}:`, errData.error || response.statusText);
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
 * If LANDCOVER_META changes, also update the map grid layer's fill-color expression
 * so the new colors are reflected without a full page reload.
 */
async function refreshServerConfig() {
    try {
        const response = await fetch(`${API_BASE}/api/config`);
        if (!response.ok) return;
        const config = await response.json();

        OSC_READY = config.oscReady || false;
        if (config.gridSize && Number.isFinite(config.gridSize) && config.gridSize > 0) {
            GRID_SIZE = config.gridSize;
        }
        if (config.landcoverMeta) {
            const oldKeys = Object.keys(LANDCOVER_META).sort().join(',');
            const newKeys = Object.keys(config.landcoverMeta).sort().join(',');
            LANDCOVER_META = config.landcoverMeta;

            // Update map layer if metadata changed and map is ready
            if (oldKeys !== newKeys && map && map.getLayer('grid-layer')) {
                map.setPaintProperty('grid-layer', 'fill-color', buildLandcoverFillColor());
            }
        }
    } catch (err) {
        console.warn('Failed to refresh server config:', err.message || err);
    }
}

// ============ WebSocket Connection ============
/** Connect to server WS; auto-reconnects on close with exponential backoff. */
let wsReconnectDelay = 1000;   // initial delay: 1s
const WS_RECONNECT_MAX = 30000; // max delay: 30s

function connectWebSocket() {
    const wsUrl = getWebSocketURL();
    ws = new WebSocket(wsUrl);
    
    ws.onopen = async () => {
        console.log('WebSocket connected');
        wsReconnectDelay = 1000; // reset backoff on successful connection

        // Refresh config from server (OSC status, landcover meta, grid size)
        await refreshServerConfig();

        updateConnectionStatus(true);

        // Send initial viewport
        if (map) {
            onViewportChange();
        }
    };
    
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'stats') {
                updateUI(data);
            } else if (data.type === 'error') {
                // Handle validation errors from server
                console.error('Server error:', data.error);
                showToast(`Error: ${data.error}`, 5000);
            }
        } catch (err) {
            console.error('WebSocket message parse error:', err);
        }
    };
    
    ws.onclose = () => {
        console.log(`WebSocket disconnected, reconnecting in ${wsReconnectDelay / 1000}s...`);
        updateConnectionStatus(false);
        
        // Reconnect with exponential backoff
        setTimeout(connectWebSocket, wsReconnectDelay);
        wsReconnectDelay = Math.min(wsReconnectDelay * 2, WS_RECONNECT_MAX);
    };
    
    ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        updateConnectionStatus(false);
    };
}

// ============ UI Updates ============
/**
 * Render viewport stats into the info panel.
 * Called on every WebSocket stats message or HTTP fallback response.
 * Builds the landcover breakdown list (top classes + "Other").
 */
function updateUI(stats) {
    // Fixed-structure elements — use cached refs (no getElementById per call)
    _els.gridCount.textContent = stats.gridCount || 0;

    if (_els.oscMode) {
        if (stats.mode === 'per-grid') {
            _els.oscMode.textContent = `Per-Grid (${stats.gridCount || 0} cells)`;
            _els.oscMode.style.color = '#4fc3f7';
        } else {
            _els.oscMode.textContent = 'Aggregated';
            _els.oscMode.style.color = '';
        }
    }

    if (_els.landType) {
        const name = getLandcoverName(stats.dominantLandcover);
        _els.landType.textContent = name ? `${name} (${stats.dominantLandcover})` : '—';
    }

    // Dynamic landcover breakdown list — single innerHTML write (no per-item createElement/appendChild)
    if (stats.landcoverBreakdown && stats.landcoverBreakdown.length > 0) {
        // Validate percentage sum (should be ~100%)
        const totalPercent = stats.landcoverBreakdown.reduce((sum, item) => sum + item.percentage, 0);
        if (Math.abs(totalPercent - 100) > 1) {
            console.warn('Landcover percentages do not sum to 100:', totalPercent.toFixed(1));
        }

        _els.landcoverList.innerHTML = stats.landcoverBreakdown.map(item => {
            const isOther = item.class === null;
            const displayName = isOther ? 'Other' : (getLandcoverName(item.class) || 'Unknown');
            const swatchColor = isOther ? null : getLandcoverColor(item.class);
            const formattedPercent = (item.percentage ?? 0).toFixed(1);
            const otherClass = isOther ? ' landcover-other' : '';

            return `<div class="landcover-item${otherClass}">
                <span class="landcover-name">
                    ${swatchColor ? `<span class="landcover-swatch" style="background:${swatchColor}"></span>` : ''}
                    ${displayName}
                </span>
                <span class="landcover-percent">${formattedPercent}%</span>
            </div>`;
        }).join('');
    } else {
        _els.landcoverList.innerHTML = `
            <div class="landcover-item empty">
                <span class="landcover-name">No data</span>
            </div>
        `;
    }
}

/** Update the status dot + text at the bottom of the info panel. */
function updateConnectionStatus(connected) {
    if (connected) {
        _els.wsStatus.classList.remove('disconnected');
        _els.wsStatus.classList.add('connected');
        // Honest status display: WebSocket to server, OSC ready state (approximate, UDP has no handshake)
        if (OSC_READY) {
            _els.wsText.textContent = 'Connected to server / OSC: ready(approx)';
        } else {
            _els.wsText.textContent = 'Connected to server / OSC: not ready';
        }
    } else {
        _els.wsStatus.classList.remove('connected');
        _els.wsStatus.classList.add('disconnected');
        _els.wsText.textContent = 'Reconnecting...';
    }
}

/** Show a temporary notification bar at the bottom of the screen. */
let _toastTimerId = null;
function showToast(message, duration = 3000) {
    _els.toast.textContent = message;
    _els.toast.classList.remove('hidden');

    if (_toastTimerId !== null) {
        clearTimeout(_toastTimerId);
    }
    _toastTimerId = setTimeout(() => {
        _els.toast.classList.add('hidden');
        _toastTimerId = null;
    }, duration);
}

// ============ Startup ============
document.addEventListener('DOMContentLoaded', async () => {
    // Cache fixed DOM element references once — avoids getElementById on every update
    _els = {
        gridCount: document.getElementById('grid-count'),
        oscMode: document.getElementById('osc-mode'),
        landType: document.getElementById('land-type'),
        landcoverList: document.getElementById('landcover-list'),
        wsStatus: document.getElementById('ws-status'),
        wsText: document.getElementById('ws-text'),
        toast: document.getElementById('toast')
    };

    getClientId();

    // Check for Mapbox token
    if (!MAPBOX_TOKEN) {
        showToast('Mapbox token not configured. Create config.local.js with your token', 10000);
        console.error('Mapbox token not configured.');
        console.error('Create frontend/config.local.js with: window.MAPBOX_TOKEN = "your-token-here";');
        console.error('Get a token at: https://account.mapbox.com/access-tokens/');
        return;
    }
    
    // Load server config first to get correct WebSocket port
    await loadServerConfig();
    
    initMap();
    connectWebSocket();
});
