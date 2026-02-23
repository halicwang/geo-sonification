/**
 * Geo-Sonification Server — entry point.
 *
 * Data flow:
 *   Frontend (Mapbox)
 *     --WebSocket/HTTP--> this server (viewport bounds)
 *     --> spatial.js      (aggregate stats)
 *     --> audio-metrics.js (compute audio parameters)
 *     <-- response         (stats + audioParams JSON back to frontend)
 *
 * This file only handles HTTP routes, WebSocket, and startup/shutdown.
 * All data loading, spatial queries, and mode switching are in separate modules.
 */

const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const { WebSocketServer } = WebSocket;
const path = require('path');

const { HTTP_PORT, WS_PORT, ALLOWED_ORIGINS, BROADCAST_STATS, GRID_SIZE } = require('./config');
const { LANDCOVER_META } = require('./landcover');
const { loadGridData } = require('./data-loader');
const spatial = require('./spatial');
const {
    createDeltaState,
    getHttpDeltaState,
    saveHttpDeltaState,
    getHttpDeltaClientKey,
} = require('./delta-state');
const {
    createModeState,
    getHttpModeState,
    saveHttpModeState,
    getHttpClientKey,
} = require('./mode-manager');
const { processViewport } = require('./viewport-processor');

// ============ Constants ============

/** Interval between WebSocket ping probes; clients that don't respond are terminated. */
const WS_PING_INTERVAL_MS = 30000; // 30 seconds

/** Max buffered bytes per WS client before skipping sends (backpressure). */
const WS_MAX_BUFFERED = 64 * 1024; // 64KB

// ============ State ============
let dataLoaded = false;

/**
 * @internal @test-only
 * Allow tests to toggle the dataLoaded flag without calling startServer().
 * @param {boolean} value
 */
function _setDataLoaded(value) {
    dataLoaded = value;
}

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
 * Quick-check that bounds is a 4-element array before spatial validation.
 * @param {*} bounds
 * @param {string} [clientLabel='request'] - Label for error messages
 * @returns {{ bounds: number[] } | { error: string }}
 */
function parseViewportBounds(bounds, clientLabel = 'request') {
    if (!Array.isArray(bounds) || bounds.length !== 4) {
        return {
            error: `${clientLabel} bounds must be an array: [west, south, east, north]`,
        };
    }
    return { bounds };
}

/**
 * Start HTTP server and resolve only after the port is successfully bound.
 * @param {import('express').Express} expressApp
 * @param {number} port
 * @returns {Promise<import('http').Server>}
 */
function startHttpServer(expressApp, port) {
    return new Promise((resolve, reject) => {
        const server = expressApp.listen(port);
        const onError = (err) => {
            server.off('listening', onListening);
            reject(err);
        };
        const onListening = () => {
            server.off('error', onError);
            resolve(server);
        };
        server.once('error', onError);
        server.once('listening', onListening);
    });
}

/**
 * Start WebSocket server and resolve only after the port is successfully bound.
 * @param {number} port
 * @returns {Promise<WebSocketServer>}
 */
function startWsServer(port) {
    return new Promise((resolve, reject) => {
        const wss = new WebSocketServer({ port });
        const onError = (err) => {
            wss.off('listening', onListening);
            reject(err);
        };
        const onListening = () => {
            wss.off('error', onError);
            resolve(wss);
        };
        wss.once('error', onError);
        wss.once('listening', onListening);
    });
}

// ============ Express Server ============
const app = express();

// Per-request CORS check against the whitelist in config.js
app.use(
    cors({
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
        credentials: false,
    })
);

app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

// Serve pre-built vector tiles (PMTiles)
app.use('/tiles', express.static(path.join(__dirname, '../data/tiles')));

// Serve ambience audio samples for Web Audio frontend.
app.use('/audio/ambience', express.static(path.join(__dirname, '../frontend/audio/ambience')));

// Health check (used by start.command readiness probe)
app.get('/health', (req, res) => {
    res.status(200).json({
        ok: true,
        dataLoaded,
    });
});

// API: Get server configuration (for frontend)
app.get('/api/config', (req, res) => {
    res.json({
        wsPort: WS_PORT,
        httpPort: HTTP_PORT,
        gridSize: GRID_SIZE,
        landcoverMeta: LANDCOVER_META,
    });
});

// API: Calculate viewport stats
// - Hysteresis state keying: mode-manager rules (existing behavior)
// - Delta state keying: clientId-first, fallback to IP
app.post('/api/viewport', (req, res) => {
    if (!dataLoaded) {
        return res.status(503).json({ error: 'Data not loaded yet', dataLoaded: false });
    }
    const modeClientKey = getHttpClientKey(req);
    const deltaClientKey = getHttpDeltaClientKey(req);
    const { modeState, previousMode } = getHttpModeState(modeClientKey);
    const { deltaState } = getHttpDeltaState(deltaClientKey);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const parsedBounds = parseViewportBounds(body.bounds, 'HTTP');
    if (parsedBounds.error) {
        return res.status(400).json({ error: parsedBounds.error });
    }

    const zoom = Number.isFinite(body.zoom) ? body.zoom : undefined;
    const result = processViewport(parsedBounds.bounds, modeState, deltaState, zoom);
    if (result.error) {
        return res.status(400).json({ error: result.error });
    }
    _statsCounter.viewports++;
    _statsCounter.totalMs += result.elapsedMs;
    saveHttpModeState(modeClientKey, modeState);
    saveHttpDeltaState(deltaClientKey, deltaState);
    if (modeState.currentMode !== previousMode) {
        console.log(`[HTTP mode] ${modeClientKey}: ${previousMode} -> ${modeState.currentMode}`);
    }
    res.json(result.stats);
});

// ============ WebSocket Handler ============

/**
 * Attach viewport message handling to a WebSocket server.
 * Extracted from startServer() for testability — pure code motion.
 *
 * Must be called exactly once per wss instance.
 * @param {import('ws').WebSocketServer} wss
 */
function attachWsHandler(wss) {
    if (wss._handlerAttached) {
        throw new Error('attachWsHandler called twice on the same wss instance');
    }
    wss._handlerAttached = true;

    wss.on('connection', (ws) => {
        console.log('WebSocket client connected');

        // Per-client hysteresis state — each client tracks its own mode
        // so multiple viewports don't interfere with each other.
        const modeState = createModeState();
        const deltaState = createDeltaState();

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
                        ws.send(
                            JSON.stringify({
                                type: 'stats',
                                loading: true,
                                message: 'Data loading...',
                            })
                        );
                        return;
                    }

                    const zoom = Number.isFinite(data.zoom) ? data.zoom : undefined;
                    const result = processViewport(
                        parsedBounds.bounds,
                        modeState,
                        deltaState,
                        zoom
                    );
                    if (result.error) {
                        ws.send(JSON.stringify({ type: 'error', error: result.error }));
                        return;
                    }
                    _statsCounter.viewports++;
                    _statsCounter.totalMs += result.elapsedMs;

                    const payload = JSON.stringify({ type: 'stats', ...result.stats });

                    // Default: unicast (only sender). BROADCAST_STATS=1: all clients.
                    if (BROADCAST_STATS) {
                        wss.clients.forEach((client) => {
                            if (
                                client.readyState === WebSocket.OPEN &&
                                client.bufferedAmount < WS_MAX_BUFFERED
                            ) {
                                try {
                                    client.send(payload);
                                } catch (sendErr) {
                                    console.error('Failed to send to client:', sendErr);
                                }
                            } else if (client.readyState === WebSocket.OPEN) {
                                console.warn(
                                    `[WS] Skipping slow client (buffered=${client.bufferedAmount})`
                                );
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
}

// ============ Startup ============

/** Load data, build spatial index, start HTTP + WebSocket servers. @returns {Promise<void>} */
async function startServer() {
    try {
        // Load data and initialize spatial index
        const { gridData, normalizeParams } = await loadGridData();
        spatial.init(gridData, normalizeParams);

        // Start HTTP + WebSocket servers and only continue once both are bound.
        httpServer = await startHttpServer(app, HTTP_PORT);
        wssServer = await startWsServer(WS_PORT);
        const wss = wssServer;

        dataLoaded = true;

        console.log(`HTTP server running at http://localhost:${HTTP_PORT}`);
        console.log(`WebSocket server running at ws://localhost:${WS_PORT}`);

        // Runtime HTTP errors should be logged to avoid unhandled 'error' events.
        httpServer.on('error', (err) => {
            console.error('HTTP server error:', err);
        });

        // Runtime WS errors should be logged, but startup readiness is already complete.
        wss.on('error', (err) => {
            console.error('WebSocket server error:', err);
        });

        attachWsHandler(wss);

        console.log(`
======================================
  Geo-Sonification Server Running
======================================
  HTTP API:    http://localhost:${HTTP_PORT}
  WebSocket:   ws://localhost:${WS_PORT}
  Audio:       Web Audio (browser)
======================================
`);
    } catch (err) {
        dataLoaded = false;
        if (wssServer) {
            try {
                wssServer.close();
            } catch (closeErr) {
                console.error('Failed to close WebSocket server after startup error:', closeErr);
            }
            wssServer = null;
        }
        if (httpServer) {
            try {
                httpServer.close();
            } catch (closeErr) {
                console.error('Failed to close HTTP server after startup error:', closeErr);
            }
            httpServer = null;
        }
        console.error('Failed to start server:', err);
        process.exit(1);
    }
}

/**
 * Graceful shutdown: close WS clients and HTTP server.
 * @param {string} signal - POSIX signal name (e.g. 'SIGTERM')
 * @returns {void}
 */
function gracefulShutdown(signal) {
    console.log(`${signal} received, shutting down...`);
    if (wssServer) {
        wssServer.clients.forEach((client) => client.terminate());
        wssServer.close();
    }
    if (httpServer) httpServer.close();
    process.exit(0);
}

if (require.main === module) {
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    startServer();
}

module.exports = {
    app,
    parseViewportBounds,
    startHttpServer,
    startWsServer,
    startServer,
    gracefulShutdown,
    attachWsHandler,
    _setDataLoaded,
};
