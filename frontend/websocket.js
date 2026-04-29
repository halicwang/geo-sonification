// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Geo-Sonification — WebSocket connection manager.
 *
 * Manages the WebSocket lifecycle with exponential-backoff reconnect.
 * Does NOT depend on map.js or ui.js — all behaviour is injected via
 * the callbacks parameter so main.js can wire the concrete actions.
 *
 * @module frontend/websocket
 */

import { state, buildWsUrl, WS_RECONNECT_MAX } from './config.js';

/** @type {number|null} */
let reconnectTimerId = null;

/**
 * Connect to the server WebSocket and auto-reconnect on close.
 *
 * All four callbacks are required; callers should pass no-op functions
 * for events they want to ignore.
 *
 * @param {Object} callbacks
 * @param {function(): Promise<void>} callbacks.onOpen    — called after WS opens
 * @param {function(Object): void}    callbacks.onStats   — called with parsed stats data
 * @param {function(string): void}    callbacks.onError   — called with error message string
 * @param {function(): void}          callbacks.onDisconnect — called on close or error
 */
export function connectWebSocket(callbacks) {
    // Cancel any pending reconnect timer to prevent duplicate connections
    if (reconnectTimerId !== null) {
        clearTimeout(reconnectTimerId);
        reconnectTimerId = null;
    }

    // Close previous socket if still open (prevents connection leak).
    // Null both onclose and onmessage so the old socket cannot trigger a
    // recursive reconnect or deliver an in-flight stats frame to the new
    // engine state during the close handshake.
    if (state.runtime.ws) {
        try {
            state.runtime.ws.onclose = null;
            state.runtime.ws.onmessage = null;
            state.runtime.ws.close();
        } catch {
            // ignore — socket may already be closing
        }
    }

    const wsUrl = buildWsUrl();
    state.runtime.ws = new WebSocket(wsUrl);

    state.runtime.ws.onopen = async () => {
        console.log('WebSocket connected');
        state.runtime.wsReconnectDelay = 1000; // reset backoff on successful connection

        try {
            await callbacks.onOpen();
        } catch (err) {
            console.error('WebSocket onOpen callback failed:', err);
        }
    };

    state.runtime.ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'stats') {
                callbacks.onStats(data);
            } else if (data.type === 'error') {
                console.error('Server error:', data.error);
                callbacks.onError(data.error);
            }
        } catch (err) {
            console.error('WebSocket message parse error:', err);
        }
    };

    state.runtime.ws.onclose = () => {
        state.runtime.wsReconnectDelay = Math.min(
            state.runtime.wsReconnectDelay * 2,
            WS_RECONNECT_MAX
        );
        console.log(
            `WebSocket disconnected, reconnecting in ${state.runtime.wsReconnectDelay / 1000}s...`
        );

        callbacks.onDisconnect();

        // Reconnect with exponential backoff (store timer so it can be cancelled)
        reconnectTimerId = setTimeout(() => {
            reconnectTimerId = null;
            connectWebSocket(callbacks);
        }, state.runtime.wsReconnectDelay);
    };

    state.runtime.ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        // onclose always fires after onerror — onDisconnect is handled there
        // to avoid calling the callback twice per disconnect event.
    };
}
