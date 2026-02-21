/**
 * Geo-Sonification — WebSocket connection manager.
 *
 * Manages the WebSocket lifecycle with exponential-backoff reconnect.
 * Does NOT depend on map.js or ui.js — all behaviour is injected via
 * the callbacks parameter so main.js can wire the concrete actions.
 *
 * @module frontend/websocket
 */

import { state, getWebSocketURL, WS_RECONNECT_MAX } from './config.js';

/**
 * Connect to the server WebSocket and auto-reconnect on close.
 *
 * @param {Object} callbacks
 * @param {function(): Promise<void>} callbacks.onOpen    — called after WS opens
 * @param {function(Object): void}    callbacks.onStats   — called with parsed stats data
 * @param {function(string): void}    callbacks.onError   — called with error message string
 * @param {function(): void}          callbacks.onDisconnect — called on close or error
 */
export function connectWebSocket(callbacks) {
    const wsUrl = getWebSocketURL();
    state.runtime.ws = new WebSocket(wsUrl);

    state.runtime.ws.onopen = async () => {
        console.log('WebSocket connected');
        state.runtime.wsReconnectDelay = 1000; // reset backoff on successful connection

        if (callbacks.onOpen) {
            await callbacks.onOpen();
        }
    };

    state.runtime.ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'stats') {
                if (callbacks.onStats) callbacks.onStats(data);
            } else if (data.type === 'error') {
                console.error('Server error:', data.error);
                if (callbacks.onError) callbacks.onError(data.error);
            }
        } catch (err) {
            console.error('WebSocket message parse error:', err);
        }
    };

    state.runtime.ws.onclose = () => {
        // Bump delay before status check so stale indicator triggers sooner
        state.runtime.wsReconnectDelay = Math.min(
            state.runtime.wsReconnectDelay * 2,
            WS_RECONNECT_MAX
        );
        console.log(
            `WebSocket disconnected, reconnecting in ${state.runtime.wsReconnectDelay / 1000}s...`
        );

        if (callbacks.onDisconnect) callbacks.onDisconnect();

        // Reconnect with exponential backoff
        setTimeout(() => connectWebSocket(callbacks), state.runtime.wsReconnectDelay);
    };

    state.runtime.ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        if (callbacks.onDisconnect) callbacks.onDisconnect();
    };
}
