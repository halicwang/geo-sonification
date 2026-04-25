#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * P0 WorldCover smoke test — validates the full server stack (HTTP + WebSocket).
 *
 * Connects to a RUNNING server and exercises:
 *   1. GET /health       (ok=true, dataLoaded=true)
 *   2. GET /api/config   (wsPort, httpPort, gridSize, landcoverMeta)
 *   3. POST /api/viewport (land-heavy bounds: gridCount>0, audioParams, landcoverDistribution)
 *   4. WebSocket viewport exchange (type=stats, gridCount, audioParams)
 *
 * Usage:
 *   node scripts/smoke-worldcover.js
 *   npm run smoke
 *
 * Requires a running server (npm start). Does NOT start the server itself.
 *
 * Environment variables:
 *   SMOKE_TIMEOUT_MS - Global timeout in ms (default: 30000)
 *   HTTP_PORT        - HTTP + WebSocket port (default: 3000, single-port server)
 *
 * Evidence: EVID-P0-003 — Manual smoke walkthrough on WorldCover demo
 * Trace: REQ-COMPAT-001 + P0 + Implementation Guide §10.1 P0-B
 */

const path = require('node:path');
const WebSocket = require(path.resolve(__dirname, '..', 'server', 'node_modules', 'ws'));

const TIMEOUT_MS = parseInt(process.env.SMOKE_TIMEOUT_MS, 10) || 30000;
const HTTP_PORT = parseInt(process.env.HTTP_PORT, 10) || 3000;
const BASE_URL = `http://localhost:${HTTP_PORT}`;
const WS_URL = `ws://localhost:${HTTP_PORT}`;

const LAND_HEAVY_BOUNDS = [-65, -5, -62, -4.5];
const LAND_HEAVY_ZOOM = 8;

let passed = 0;
let failed = 0;

function check(label, condition) {
    if (condition) {
        process.stderr.write(`  PASS: ${label}\n`);
        passed++;
    } else {
        process.stderr.write(`  FAIL: ${label}\n`);
        failed++;
    }
}

async function fetchJson(url, options = {}) {
    const resp = await fetch(url, options);
    if (!resp.ok) throw new Error(`${url} returned ${resp.status}`);
    return resp.json();
}

async function main() {
    const timer = setTimeout(() => {
        process.stderr.write(`\nSmoke test timed out after ${TIMEOUT_MS}ms\n`);
        process.exit(1);
    }, TIMEOUT_MS);
    timer.unref();

    // [1] Health check
    process.stderr.write('\n[1] GET /health\n');
    const health = await fetchJson(`${BASE_URL}/health`);
    check('ok === true', health.ok === true);
    check('dataLoaded === true', health.dataLoaded === true);

    // [2] Config
    process.stderr.write('\n[2] GET /api/config\n');
    const config = await fetchJson(`${BASE_URL}/api/config`);
    check('wsPort is number', typeof config.wsPort === 'number');
    check('httpPort is number', typeof config.httpPort === 'number');
    check('gridSize is number', typeof config.gridSize === 'number');
    check('landcoverMeta exists', config.landcoverMeta != null);

    // [3] HTTP viewport
    process.stderr.write('\n[3] POST /api/viewport (land-heavy)\n');
    const viewport = await fetchJson(`${BASE_URL}/api/viewport`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bounds: LAND_HEAVY_BOUNDS, zoom: LAND_HEAVY_ZOOM }),
    });
    check('gridCount > 0', viewport.gridCount > 0);
    check('has audioParams', viewport.audioParams != null);
    check('has landcoverDistribution', viewport.landcoverDistribution != null);

    // [4] WebSocket viewport exchange
    process.stderr.write('\n[4] WebSocket viewport exchange\n');
    await new Promise((resolve, reject) => {
        const ws = new WebSocket(WS_URL);
        const wsTimeout = setTimeout(() => {
            ws.terminate();
            reject(new Error('WebSocket exchange timed out after 10s'));
        }, 10000);

        ws.on('open', () => {
            ws.on('message', (data) => {
                clearTimeout(wsTimeout);
                try {
                    const msg = JSON.parse(data);
                    check('type === stats', msg.type === 'stats');
                    check('has gridCount', typeof msg.gridCount === 'number');
                    check('has audioParams', msg.audioParams != null);
                    ws.close();
                    resolve();
                } catch (err) {
                    ws.close();
                    reject(err);
                }
            });

            ws.send(
                JSON.stringify({
                    type: 'viewport',
                    bounds: LAND_HEAVY_BOUNDS,
                    zoom: LAND_HEAVY_ZOOM,
                })
            );
        });

        ws.on('error', (err) => {
            clearTimeout(wsTimeout);
            reject(err);
        });
    });

    // Summary
    clearTimeout(timer);
    process.stderr.write(`\n${'='.repeat(40)}\n`);
    process.stderr.write(`Smoke test: ${passed} passed, ${failed} failed\n`);
    process.stderr.write(`${'='.repeat(40)}\n`);

    process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
    if (err.cause?.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
        process.stderr.write(`\nERROR: Cannot reach server at ${BASE_URL}\n`);
        process.stderr.write('       Start the server first: npm start\n');
    } else {
        process.stderr.write(`\nSmoke test failed: ${err.message}\n`);
    }
    process.exit(1);
});
