// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

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
const compression = require('compression');
const { WebSocketServer } = require('ws');
const fs = require('fs');
const path = require('path');

const { HTTP_PORT, ALLOWED_ORIGINS } = require('./config');
const { loadGridData } = require('./data-loader');
const spatial = require('./spatial');
const { attachRoutes } = require('./routes');
const { attachWsHandler } = require('./ws-handler');

// ============ Constants ============

const EXPECTED_AMBIENCE_FILES = [
    'forest.opus',
    'shrub.opus',
    'grass.opus',
    'crop.opus',
    'urban.opus',
    'bare.opus',
    'water.opus',
];

const AMBIENCE_DIR = path.join(__dirname, '../frontend/audio/ambience');
const PMTILES_PATH = path.join(__dirname, '../data/tiles/grids.pmtiles');

// ============ State ============
let dataLoaded = false;

let httpServer = null;
let wssServer = null;

// ============ Runtime Monitoring ============
let _statsCounter = { viewports: 0, totalMs: 0 };
const STATS_LOG_INTERVAL_MS = 30000;
const _statsTimer = setInterval(() => {
    // Skip while CSV ingestion is still running. The inner counter
    // guard already produces no log under this condition (no viewports
    // get processed before dataLoaded flips), but stating it explicitly
    // protects against any future caller that might bump _statsCounter
    // prematurely.
    if (!dataLoaded) return;
    if (_statsCounter.viewports > 0) {
        const avgMs = (_statsCounter.totalMs / _statsCounter.viewports).toFixed(1);
        console.log(`[Stats] ${_statsCounter.viewports} viewport updates in 30s, avg ${avgMs}ms`);
        _statsCounter = { viewports: 0, totalMs: 0 };
    }
}, STATS_LOG_INTERVAL_MS);
_statsTimer.unref();

// ============ Shared Helpers ============

/** Warn when local-only static assets are missing from a checkout. */
function warnIfStaticAssetsMissing() {
    const missingAmbience = EXPECTED_AMBIENCE_FILES.filter(
        (filename) => !fs.existsSync(path.join(AMBIENCE_DIR, filename))
    );

    if (missingAmbience.length > 0) {
        console.warn(
            `[Static Assets] Missing ambience WAVs (${missingAmbience.join(', ')}). ` +
                'Copy all required files into frontend/audio/ambience/ before using audio.'
        );
    }

    if (!fs.existsSync(PMTILES_PATH)) {
        console.warn(
            '[Static Assets] Missing data/tiles/grids.pmtiles. ' +
                'Run npm --prefix server run build:tiles to restore the grid overlay.'
        );
    }
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
 * Attach a WebSocket server to an existing HTTP server so both share a
 * single port (required by Fly.io and simpler in general — WebSocket
 * upgrades ride the HTTP server's upgrade channel).
 *
 * `perMessageDeflate` is enabled with conservative defaults: zlib level 1
 * (CPU-cheap), 256-byte threshold (skip the per-frame allocation for tiny
 * pings), and `noContextTakeover` on both directions to keep memory bounded
 * under many concurrent clients. Stats payloads (~1.5 KB JSON) compress to
 * ~0.5 KB on the wire.
 * @param {import('http').Server} server
 * @returns {WebSocketServer}
 */
function attachWsServer(server) {
    return new WebSocketServer({
        server,
        perMessageDeflate: {
            zlibDeflateOptions: { level: 1 },
            threshold: 256,
            serverNoContextTakeover: true,
            clientNoContextTakeover: true,
        },
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

// gzip everything > 1 KB. PMTiles archives are octet-stream and already
// gzip-compressed internally (Tippecanoe's per-tile gzip), so the
// middleware's default filter skips them; verify with
// `curl -I --compressed /tiles/grids.pmtiles` after any upgrade.
app.use(compression({ threshold: 1024 }));

app.use(express.json());

// Mount cache-friendly routes BEFORE the catch-all `frontend` static so
// the Cache-Control headers actually apply (the frontend dir contains
// `audio/ambience/` too, so the catch-all would otherwise win the route
// match first and serve those files with the default max-age=0).

// Serve pre-built vector tiles (PMTiles). The 7-day maxAge tells browsers
// to skip the network entirely on cache hits; we deliberately omit
// `immutable` so `npm run build:tiles` (which overwrites in-place) is
// still picked up by ETag/If-Modified-Since on hard reload. In production
// the file is served from R2 + Cloudflare which has its own cache layer;
// this header only takes effect on local-dev or non-CDN deployments.
app.use('/tiles', express.static(path.join(__dirname, '../data/tiles'), { maxAge: '7d' }));

// Serve ambience audio samples for Web Audio frontend. 30-day maxAge —
// the Opus-encoded WAVs are content-addressed effectively (no in-place
// re-encoding workflow), so browsers can cache them aggressively.
app.use(
    '/audio/ambience',
    express.static(path.join(__dirname, '../frontend/audio/ambience'), { maxAge: '30d' })
);

// Serve static frontend files (index.html, JS, CSS). Default maxAge=0
// keeps the dev iteration loop tight; production puts these behind
// Cloudflare Pages which has its own cache strategy.
app.use(express.static(path.join(__dirname, '../frontend')));

// Serve city data (JSON database for city announcer)
app.use('/data', express.static(path.join(__dirname, '../data'), { extensions: ['json'] }));

// Application routes (/health, /api/config, /api/viewport).
// Implementation is in `./routes`; deps that depend on this file's mutable
// state (dataLoaded flag, stats counter) are passed in as closures so the
// routes module never has to require './index'.
attachRoutes(app, {
    getDataLoaded: () => dataLoaded,
    incrementStats: (elapsedMs) => {
        _statsCounter.viewports++;
        _statsCounter.totalMs += elapsedMs;
    },
});

// ============ Startup ============

/** Load data, build spatial index, start HTTP + WebSocket servers. @returns {Promise<void>} */
async function startServer() {
    try {
        // Load data and initialize spatial index
        const { gridData, normalizeParams } = await loadGridData();
        spatial.init(gridData, normalizeParams);

        // Bind HTTP and attach WebSocket to its upgrade channel — single port.
        httpServer = await startHttpServer(app, HTTP_PORT);
        wssServer = attachWsServer(httpServer);
        const wss = wssServer;

        dataLoaded = true;

        console.log(`Server listening on port ${HTTP_PORT} (HTTP + WebSocket)`);
        warnIfStaticAssetsMissing();

        // Runtime HTTP errors should be logged to avoid unhandled 'error' events.
        httpServer.on('error', (err) => {
            console.error('HTTP server error:', err);
        });

        // Runtime WS errors should be logged, but startup readiness is already complete.
        wss.on('error', (err) => {
            console.error('WebSocket server error:', err);
        });

        attachWsHandler(wss, {
            getDataLoaded: () => dataLoaded,
            incrementStats: (elapsedMs) => {
                _statsCounter.viewports++;
                _statsCounter.totalMs += elapsedMs;
            },
        });

        console.log(`
======================================
  Geo-Sonification Server Running
======================================
  HTTP API:    http://localhost:${HTTP_PORT}
  WebSocket:   ws://localhost:${HTTP_PORT}  (same port)
  Audio:       Web Audio (browser)
======================================
`);
    } catch (err) {
        dataLoaded = false;
        if (wssServer) {
            wssServer.close();
            wssServer = null;
        }
        if (httpServer) {
            httpServer.close();
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
    clearInterval(_statsTimer);
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
    startHttpServer,
    attachWsServer,
    startServer,
    gracefulShutdown,
};
