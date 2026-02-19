/**
 * Geo-Sonification Server — entry point.
 *
 * Connects the Mapbox frontend to MaxMSP for real-time sonification.
 *
 * Data flow:
 *   Frontend (Mapbox)
 *     --WebSocket/HTTP--> this server (viewport bounds)
 *     --> spatial.js      (aggregate stats)
 *     --> osc.js           (send to MaxMSP via UDP)
 *     <-- response         (stats JSON back to frontend)
 *
 * This file only handles HTTP routes, WebSocket, and startup/shutdown.
 * All data loading, spatial queries, OSC, and mode switching are in separate modules.
 */

const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const { WebSocketServer } = WebSocket;
const path = require('path');

const { HTTP_PORT, WS_PORT, OSC_HOST, OSC_PORT, ALLOWED_ORIGINS, BROADCAST_STATS, GRID_SIZE } = require('./config');
const { LANDCOVER_META } = require('./landcover');
const { isOscReady, sendToMax, sendGridsToMax, sendModeToMax, sendCoverageToMax, closeOsc } = require('./osc');
const { loadGridData } = require('./data-loader');
const spatial = require('./spatial');
const { validateBounds } = spatial;
const {
    createModeState, getHttpModeState, saveHttpModeState,
    applyHysteresis, getHttpClientKey,
    PER_GRID_THRESHOLD_ENTER, PER_GRID_THRESHOLD_EXIT
} = require('./mode-manager');

// ============ Constants ============

/** Interval between WebSocket ping probes; clients that don't respond are terminated. */
const WS_PING_INTERVAL_MS = 30000; // 30 seconds

/** Max buffered bytes per WS client before skipping sends (backpressure). */
const WS_MAX_BUFFERED = 64 * 1024; // 64KB

// ============ State ============
let dataLoaded = false;
let httpServer = null;
let wssServer = null;

// ============ Runtime Monitoring ============
let _statsCounter = { viewports: 0, totalMs: 0 };
const STATS_LOG_INTERVAL_MS = 30000;
setInterval(() => {
    if (_statsCounter.viewports > 0) {
        const avgMs = (_statsCounter.totalMs / _statsCounter.viewports).toFixed(1);
        console.log(`[Stats] ${_statsCounter.viewports} viewport updates in 30s, avg ${avgMs}ms`);
        _statsCounter = { viewports: 0, totalMs: 0 };
    }
}, STATS_LOG_INTERVAL_MS).unref();

// ============ Shared Helpers ============

/**
 * Validate bounds, compute viewport stats, and send to Max.
 * @param {Array} bounds - [west, south, east, north]
 * @param {{ currentMode: string }} modeState - per-client hysteresis state object (mutated in place)
 * @returns {{ stats, gridsInView } | { error }}
 */
function processViewport(bounds, modeState) {
    const t0 = Date.now();

    const validation = validateBounds(bounds);
    if (!validation.valid) {
        return { error: validation.error };
    }
    const { gridsInView, ...stats } = spatial.calculateViewportStats(validation.bounds);

    applyHysteresis(modeState, gridsInView.length);

    // Notify MaxMSP of current mode — sent before data messages so Max
    // can prepare for the incoming format (e.g., crossfade on mode change).
    sendModeToMax(modeState.currentMode);

    // Always send aggregated stats so Max displays/synth never go silent
    sendToMax(stats.dominantLandcover, stats.nightlightNorm, stats.populationNorm, stats.forestNorm, stats.landcoverDistribution);
    sendCoverageToMax(stats.landCoverageRatio);

    // Additionally send per-grid data when zoomed in
    if (modeState.currentMode === 'per-grid') {
        sendGridsToMax(gridsInView, validation.bounds, spatial.getNormalizeParams());
    }

    stats.mode = modeState.currentMode;
    stats.perGridThresholdEnter = PER_GRID_THRESHOLD_ENTER;
    stats.perGridThresholdExit = PER_GRID_THRESHOLD_EXIT;

    _statsCounter.viewports++;
    _statsCounter.totalMs += Date.now() - t0;

    return { stats, gridsInView };
}

function parseViewportBounds(bounds, clientLabel = 'request') {
    if (!Array.isArray(bounds) || bounds.length !== 4) {
        return {
            error: `${clientLabel} bounds must be an array: [west, south, east, north]`
        };
    }
    return { bounds };
}

// ============ Express Server ============
const app = express();

// Per-request CORS check against the whitelist in config.js
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (e.g. curl, mobile apps)
        if (!origin) return callback(null, true);
        if (ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            console.warn(`CORS: Blocked request from origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: false
}));

app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

// Serve pre-built vector tiles (PMTiles)
app.use('/tiles', express.static(path.join(__dirname, '../data/tiles')));

// Health check (used by start.command readiness probe)
app.get('/health', (req, res) => {
    res.status(200).json({
        ok: true,
        dataLoaded,
        oscReady: isOscReady()
    });
});

// API: Get server configuration (for frontend)
app.get('/api/config', (req, res) => {
    res.json({
        wsPort: WS_PORT,
        httpPort: HTTP_PORT,
        oscReady: isOscReady(),
        gridSize: GRID_SIZE,
        landcoverMeta: LANDCOVER_META
    });
});

// API: Calculate viewport stats (HTTP fallback keeps per-client hysteresis state by IP)
app.post('/api/viewport', (req, res) => {
    if (!dataLoaded) {
        return res.status(503).json({ error: 'Data not loaded yet', dataLoaded: false });
    }
    const clientKey = getHttpClientKey(req);
    const { modeState, previousMode } = getHttpModeState(clientKey);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const parsedBounds = parseViewportBounds(body.bounds, 'HTTP');
    if (parsedBounds.error) {
        return res.status(400).json({ error: parsedBounds.error });
    }

    const result = processViewport(parsedBounds.bounds, modeState);
    if (result.error) {
        return res.status(400).json({ error: result.error });
    }
    saveHttpModeState(clientKey, modeState);
    if (modeState.currentMode !== previousMode) {
        console.log(`[HTTP mode] ${clientKey}: ${previousMode} -> ${modeState.currentMode}`);
    }
    res.json(result.stats);
});

// API: Manual control (for testing)
app.post('/api/manual', (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const lcRaw = Number(body.landcover);
    const nlRaw = Number(body.nightlight);
    const popRaw = Number(body.population);
    const frRaw = Number(body.forest);

    const lc = Number.isFinite(lcRaw) ? lcRaw : 10;
    const nl = Number.isFinite(nlRaw) ? nlRaw : 0;
    const pop = Number.isFinite(popRaw) ? popRaw : 0;
    const fr = Number.isFinite(frRaw) ? frRaw : 0;

    sendToMax(lc, nl, pop, fr, {});
    res.json({ success: true, landcover: lc, nightlight: nl, population: pop, forest: fr });
});

// ============ Startup ============
async function startServer() {
    try {
        // Load data and initialize spatial index
        const { gridData, normalizeParams } = await loadGridData();
        spatial.init(gridData, normalizeParams);

        dataLoaded = true;

        // Start HTTP server
        httpServer = app.listen(HTTP_PORT, () => {
            console.log(`HTTP server running at http://localhost:${HTTP_PORT}`);
        });

        // Start WebSocket server
        const wss = wssServer = new WebSocketServer({ port: WS_PORT });

        wss.on('connection', (ws) => {
            console.log('WebSocket client connected');

            // Per-client hysteresis state — each client tracks its own mode
            // so multiple viewports don't interfere with each other.
            const modeState = createModeState();

            // Mark alive; the ping timer will flip to false before each ping.
            // If pong comes back, it flips back to true.
            ws.isAlive = true;
            const pingTimer = setInterval(() => {
                if (!ws.isAlive) {
                    console.log('WebSocket client timeout, terminating connection');
                    clearInterval(pingTimer);
                    ws.terminate();
                    return;
                }
                ws.isAlive = false;
                try {
                    ws.ping();
                } catch (err) {
                    console.error('Failed to send ping:', err);
                }
            }, WS_PING_INTERVAL_MS);

            ws.on('pong', () => {
                ws.isAlive = true;
            });

            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message);

                    if (data.type === 'viewport') {
                        const parsedBounds = parseViewportBounds(data.bounds, 'WebSocket');
                        if (parsedBounds.error) {
                            ws.send(JSON.stringify({ type: 'error', error: parsedBounds.error }));
                            return;
                        }

                        if (!dataLoaded) {
                            ws.send(JSON.stringify({ type: 'stats', loading: true, message: 'Data loading...' }));
                            return;
                        }

                        const result = processViewport(parsedBounds.bounds, modeState);
                        if (result.error) {
                            ws.send(JSON.stringify({ type: 'error', error: result.error }));
                            return;
                        }

                        const payload = JSON.stringify({ type: 'stats', ...result.stats });

                        // Default: unicast (only sender). BROADCAST_STATS=1: all clients.
                        if (BROADCAST_STATS) {
                            wss.clients.forEach(client => {
                                if (client.readyState === WebSocket.OPEN && client.bufferedAmount < WS_MAX_BUFFERED) {
                                    try { client.send(payload); } catch (sendErr) {
                                        console.error('Failed to send to client:', sendErr);
                                    }
                                } else if (client.readyState === WebSocket.OPEN) {
                                    console.warn(`[WS] Skipping slow client (buffered=${client.bufferedAmount})`);
                                }
                            });
                        } else {
                            if (ws.readyState === WebSocket.OPEN) {
                                ws.send(payload);
                            }
                        }
                    }
                } catch (err) {
                    console.error('WebSocket message error:', err);
                    try {
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ type: 'error', error: 'Invalid message format' }));
                        }
                    } catch (sendErr) {
                        console.error('Failed to send error response:', sendErr);
                    }
                }
            });

            ws.on('close', () => {
                console.log('WebSocket client disconnected');
                clearInterval(pingTimer);
            });
        });

        console.log(`WebSocket server running at ws://localhost:${WS_PORT}`);

        console.log(`
======================================
  Geo-Sonification Server Running
======================================
  HTTP API:    http://localhost:${HTTP_PORT}
  WebSocket:   ws://localhost:${WS_PORT}
  OSC Target:  ${OSC_HOST}:${OSC_PORT}

  Make sure MaxMSP is listening on UDP port ${OSC_PORT}
======================================
`);
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
}

// Graceful shutdown
function gracefulShutdown(signal) {
    console.log(`${signal} received, shutting down...`);
    if (wssServer) {
        wssServer.clients.forEach(client => client.terminate());
        wssServer.close();
    }
    if (httpServer) httpServer.close();
    closeOsc();
    process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startServer();
