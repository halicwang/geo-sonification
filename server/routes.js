// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * HTTP route handlers for the geo-sonification server.
 *
 * Hosts the three application routes:
 *
 *   GET  /health         — liveness probe (used by start.command readiness)
 *   GET  /api/config     — frontend bootstrap (gridSize + landcoverMeta)
 *   POST /api/viewport   — single-shot viewport stats
 *
 * Static-file middleware (/tiles, /data, the frontend dir) and the
 * express plumbing (CORS, compression, JSON body parser) stay in
 * `server/index.js`. Routes attach via the factory below; deps are
 * passed in explicitly so this module never reaches back into index.js.
 *
 * @module server/routes
 */

const { GRID_SIZE } = require('./config');
const { LANDCOVER_META } = require('./landcover');
const { getHttpClientState, saveHttpClientState, getHttpClientKey } = require('./client-state');
const { processViewport } = require('./viewport-processor');
const { parseViewportBounds } = require('./parse-bounds');

/**
 * @typedef {Object} RouteDeps
 * @property {() => boolean} getDataLoaded - read at request time, gates /api/viewport
 * @property {(elapsedMs: number) => void} incrementStats - bumps the 30s rolling counter
 */

/**
 * Register the three application routes onto an express app.
 * Mutates `app` (calls `app.get` / `app.post`) and returns nothing.
 *
 * @param {import('express').Express} app
 * @param {RouteDeps} deps
 */
function attachRoutes(app, deps) {
    const { getDataLoaded, incrementStats } = deps;

    // Health check (used by start.command readiness probe)
    app.get('/health', (req, res) => {
        res.status(200).json({
            ok: true,
            dataLoaded: getDataLoaded(),
        });
    });

    // API: Get server configuration (for frontend)
    app.get('/api/config', (req, res) => {
        res.json({
            gridSize: GRID_SIZE,
            landcoverMeta: LANDCOVER_META,
        });
    });

    // API: Calculate viewport stats. Per-client hysteresis mode + delta
    // snapshot share a single Map entry keyed by getHttpClientKey() (M4 P4-3
    // merger; M3 audit D.5 fix).
    app.post('/api/viewport', (req, res) => {
        if (!getDataLoaded()) {
            return res.status(503).json({ error: 'Data not loaded yet', dataLoaded: false });
        }
        const clientKey = getHttpClientKey(req);
        const { state, previousMode } = getHttpClientState(clientKey);
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const parsedBounds = parseViewportBounds(body.bounds, 'HTTP');
        if (parsedBounds.error) {
            return res.status(400).json({ error: parsedBounds.error });
        }

        const zoom = Number.isFinite(body.zoom) ? body.zoom : undefined;
        const result = processViewport(parsedBounds.bounds, state, zoom);
        if (result.error) {
            return res.status(400).json({ error: result.error });
        }
        incrementStats(result.elapsedMs);
        saveHttpClientState(clientKey, state);
        if (state.currentMode !== previousMode) {
            console.log(`[HTTP mode] ${clientKey}: ${previousMode} -> ${state.currentMode}`);
        }
        res.json(result.stats);
    });
}

module.exports = { attachRoutes };
