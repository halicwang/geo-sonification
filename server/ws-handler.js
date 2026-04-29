// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * WebSocket viewport-message handler for the geo-sonification server.
 *
 * One factory entry-point: `attachWsHandler(wss, deps)`. The factory
 * registers a single `'connection'` listener on the WebSocketServer and
 * is idempotent — a guard property prevents double-attachment.
 *
 * Each connection gets:
 *
 *   - per-client mode + delta state (so multiple viewports don't interfere)
 *   - 30-second ping/pong keepalive (clients with missed pong → terminate)
 *   - viewport-message routing through `processViewport` and broadcast
 *     of the resulting stats payload (unicast by default; full broadcast
 *     when `BROADCAST_STATS` is on, with the per-client `mode` field
 *     stripped from the broadcast copy since it is sender-derived).
 *
 * Boot-side state (the `dataLoaded` flag, the rolling `_statsCounter`)
 * is passed in as closures so this module never has to require
 * `./index`.
 *
 * @module server/ws-handler
 */

const WebSocket = require('ws');

const { BROADCAST_STATS } = require('./config');
const { createClientState } = require('./client-state');
const { processViewport } = require('./viewport-processor');

/** Interval between WebSocket ping probes; clients that don't respond are terminated. */
const WS_PING_INTERVAL_MS = 30000; // 30 seconds

/** Max buffered bytes per WS client before skipping sends (backpressure). */
const WS_MAX_BUFFERED = 64 * 1024; // 64KB

/**
 * @typedef {Object} WsHandlerDeps
 * @property {() => boolean} getDataLoaded - read at message time, gates viewport responses
 * @property {(elapsedMs: number) => void} incrementStats - bumps the 30s rolling counter
 */

/**
 * Attach the viewport message handler to a WebSocketServer.
 * Mutates `wss` (registers a 'connection' listener) and returns nothing.
 * Throws if called twice on the same wss instance.
 *
 * @param {import('ws').WebSocketServer} wss
 * @param {WsHandlerDeps} deps
 */
function attachWsHandler(wss, deps) {
    if (wss._handlerAttached) {
        throw new Error('attachWsHandler called twice on the same wss instance');
    }
    wss._handlerAttached = true;

    const { getDataLoaded, incrementStats } = deps;

    wss.on('connection', (ws) => {
        console.log('WebSocket client connected');

        // Per-client merged state — hysteresis mode + delta snapshot.
        // Each WS connection tracks its own state so multiple viewports
        // don't interfere with each other.
        const clientState = createClientState();

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

        ws.on('error', (err) => {
            console.error('WebSocket client error:', err.message || err);
        });

        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);

                if (data.type === 'viewport') {
                    if (!Array.isArray(data.bounds) || data.bounds.length !== 4) {
                        ws.send(
                            JSON.stringify({
                                type: 'error',
                                error: 'WebSocket bounds must be an array: [west, south, east, north]',
                            })
                        );
                        return;
                    }

                    if (!getDataLoaded()) {
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
                    const result = processViewport(data.bounds, clientState, zoom);
                    if (result.error) {
                        ws.send(JSON.stringify({ type: 'error', error: result.error }));
                        return;
                    }
                    incrementStats(result.elapsedMs);

                    const payload = JSON.stringify({ type: 'stats', ...result.stats });

                    // Default: unicast (only sender). BROADCAST_STATS=1: all clients.
                    // Note: broadcast strips per-client field (mode) since
                    // it is computed from the sender's viewport, not the receiver's.
                    if (BROADCAST_STATS) {
                        // eslint-disable-next-line no-unused-vars
                        const { mode, ...sharedStats } = result.stats;
                        const broadcastPayload = JSON.stringify({
                            type: 'stats',
                            ...sharedStats,
                            broadcast: true,
                        });
                        wss.clients.forEach((client) => {
                            if (
                                client.readyState === WebSocket.OPEN &&
                                client.bufferedAmount < WS_MAX_BUFFERED
                            ) {
                                try {
                                    // Sender gets full payload; others get shared-only
                                    client.send(client === ws ? payload : broadcastPayload);
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

module.exports = { attachWsHandler };
