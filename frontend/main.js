// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Geo-Sonification Frontend — Entry point.
 *
 * Mapbox GL map that tracks the user's viewport and streams bounds
 * to the Node server. The server aggregates grid stats and sends
 * them back (via WebSocket or HTTP fallback) for the info panel
 * and the Web Audio engine.
 *
 * Data flow:
 *   User pans/zooms map
 *     --> onViewportChange() debounces, sends bounds via WebSocket
 *     --> server calculates stats (spatial.js) + audioParams (audio-metrics.js)
 *     --> server responds with stats JSON
 *     --> updateUI() renders landcover breakdown in the side panel
 *     --> audio-engine receives audioParams for sonification
 *
 * @module frontend/main
 */

import { state, getMapboxToken, loadServerConfig, getClientId } from './config.js';
import { showToast, updateUI, updateConnectionStatus } from './ui.js';
import { initMap, onViewportChange, refreshServerConfig } from './map.js';
import { connectWebSocket } from './websocket.js';
import { engine } from './audio-engine.js';
import { announcer } from './city-announcer.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Cache fixed DOM element references once
    state.els = {
        zoomLevel: document.getElementById('zoom-level'),
        gridCount: document.getElementById('grid-count'),
        audioMode: document.getElementById('audio-mode'),
        landType: document.getElementById('land-type'),
        proximity: document.getElementById('proximity'),
        landcoverList: document.getElementById('landcover-list'),
        wsStatus: document.getElementById('ws-status'),
        wsText: document.getElementById('ws-text'),
        toast: document.getElementById('toast'),
        audioToggle: document.getElementById('audio-toggle'),
        audioIcon: document.getElementById('audio-icon'),
        audioStatus: document.getElementById('audio-status'),
        audioLoading: document.getElementById('audio-loading'),
        volumeSlider: document.getElementById('volume-slider'),
        volumeValue: document.getElementById('volume-value'),
        loopProgress: document.getElementById('loop-progress'),
        loopProgressFill: document.getElementById('loop-progress-fill'),
        loopProgressHandle: document.getElementById('loop-progress-handle'),
        infoPanel: document.getElementById('info-panel'),
        panelToggle: document.getElementById('panel-toggle'),
    };

    getClientId();

    // Check for Mapbox token
    state.config.mapboxToken = getMapboxToken();
    if (!state.config.mapboxToken) {
        showToast('Mapbox token not configured. Create config.local.js with your token', 10000);
        console.error('Mapbox token not configured.');
        console.error(
            'Create frontend/config.local.js with: window.MAPBOX_TOKEN = "your-token-here";'
        );
        console.error('Get a token at: https://account.mapbox.com/access-tokens/');
        return;
    }

    // Load server config first to get correct WebSocket port
    await loadServerConfig();

    initMap();

    // City name announcement — dwell trigger on settle, flyby trigger on drag
    function getAnnouncerArgs() {
        const { lng, lat } = state.runtime.map.getCenter();
        const zoom = state.runtime.map.getZoom();
        const b = state.runtime.map.getBounds();
        return [
            lat,
            lng,
            zoom,
            { west: b.getWest(), east: b.getEast(), north: b.getNorth(), south: b.getSouth() },
        ];
    }
    state.runtime.map.on('moveend', () => announcer.onViewportSettle(...getAnnouncerArgs()));
    state.runtime.map.on('move', () => announcer.onViewportMove(...getAnnouncerArgs()));

    // Connect WebSocket — wire callbacks to map/ui modules
    connectWebSocket({
        onOpen: async () => {
            await refreshServerConfig();
            updateConnectionStatus(true);
            if (state.runtime.map) {
                onViewportChange();
            }
        },
        onStats: (data) => {
            updateUI(data);
            if (data.audioParams) {
                engine.update(data.audioParams);
            }
        },
        onError: (msg) => showToast(`Error: ${msg}`, 5000),
        onDisconnect: () => updateConnectionStatus(false),
    });

    // ── Info panel toggle ──
    state.els.panelToggle.addEventListener('click', () => {
        const hidden = state.els.infoPanel.classList.toggle('hidden');
        state.els.panelToggle.classList.toggle('open', !hidden);
    });

    // ── Audio toggle button ──
    const BUS_LABELS = ['Forest', 'Shrub', 'Grass', 'Crop', 'Urban', 'Bare', 'Water'];

    let audioAllFailedToastShown = false;

    function setAudioToggleState(enabled) {
        state.els.audioIcon.textContent = enabled ? '\u25A0' : '\u25B6';
        state.els.audioToggle.classList.toggle('active', enabled);
        state.els.audioToggle.setAttribute('aria-pressed', String(enabled));
        state.els.audioToggle.setAttribute('aria-label', enabled ? 'Stop audio' : 'Start audio');
    }

    state.els.audioToggle.addEventListener('click', async () => {
        if (!state.runtime.audioEnabled) {
            state.runtime.audioEnabled = true;
            setAudioToggleState(true);
            state.els.audioStatus.textContent = 'Loading\u2026';
            state.els.audioLoading.classList.remove('hidden');
            audioAllFailedToastShown = false;

            engine.setOnLoadingUpdate(renderLoadingUI);
            await engine.start();
            announcer.setEnabled(true);
            startProgressLoop();

            // Re-send current viewport so the server returns fresh
            // audioParams.  Previous params arrived before AudioContext
            // existed — pendingParams covers the cached copy, but a fresh
            // request ensures the targets match the *current* map view
            // (the user may have panned while audio was off).
            onViewportChange();
        } else {
            state.runtime.audioEnabled = false;
            setAudioToggleState(false);
            state.els.audioStatus.textContent = 'Audio off';
            state.els.audioLoading.classList.add('hidden');
            await engine.stop();
            announcer.setEnabled(false);
            announcer.reset();
            stopProgressLoop();
        }
    });

    // ── Volume slider ──
    state.els.volumeSlider.addEventListener('input', () => {
        const raw = parseInt(state.els.volumeSlider.value, 10);
        const volume = raw / 100;
        engine.setVolume(volume);
        state.els.volumeValue.textContent = raw + '%';
    });

    /**
     * Render per-bus loading progress bars.
     * @param {Array<{status: string, progress: number, error: string|null}>} states
     */
    function renderLoadingUI(states) {
        const el = state.els.audioLoading;
        el.innerHTML = states
            .map((s, i) => {
                const statusClass =
                    s.status === 'error' ? ' error' : s.status === 'ready' ? ' ready' : '';
                const pct = Math.round(s.progress * 100);
                let statusText;
                if (s.status === 'ready') statusText = '\u2713';
                else if (s.status === 'error') statusText = '\u2717';
                else if (s.status === 'pending') statusText = '\u2014';
                else statusText = pct + '%';

                return (
                    '<div class="audio-load-item' +
                    statusClass +
                    '">' +
                    '<span class="audio-load-name">' +
                    BUS_LABELS[i] +
                    '</span>' +
                    '<div class="audio-load-bar">' +
                    '<div class="audio-load-fill" style="width:' +
                    pct +
                    '%"></div>' +
                    '</div>' +
                    '<span class="audio-load-status">' +
                    statusText +
                    '</span>' +
                    '</div>'
                );
            })
            .join('');

        const readyCount = states.filter((s) => s.status === 'ready').length;
        const errorCount = states.filter((s) => s.status === 'error').length;
        const allFailed = errorCount === states.length && states.length > 0;

        if (allFailed) {
            state.els.audioStatus.textContent =
                'Audio init failed \u2014 check frontend/audio/ambience/';
            if (!audioAllFailedToastShown) {
                showToast(
                    'All ambience samples failed to load. Verify frontend/audio/ambience/.',
                    8000
                );
                audioAllFailedToastShown = true;
            }
        } else if (readyCount + errorCount === states.length) {
            state.els.audioStatus.textContent =
                errorCount > 0 ? 'Playing (' + errorCount + ' failed)' : 'Playing';
        } else if (states.some((s) => s.status === 'loading')) {
            state.els.audioStatus.textContent =
                'Loading (' + readyCount + '/' + states.length + ')';
        }
    }

    // ── Loop progress bar ──
    let progressRafId = null;
    let isDragging = false;

    function updateProgressBar() {
        const info = engine.getLoopProgress();
        if (!info) {
            if (!state.els.loopProgress.classList.contains('hidden')) {
                state.els.loopProgress.classList.add('hidden');
            }
            // Keep polling — samples may still be loading; the loop will
            // yield a valid progress once startAllSources() has fired.
            progressRafId = requestAnimationFrame(updateProgressBar);
            return;
        }

        state.els.loopProgress.classList.remove('hidden');

        if (!isDragging) {
            const pct = (info.progress * 100).toFixed(2) + '%';
            state.els.loopProgressFill.style.width = pct;
            state.els.loopProgressHandle.style.left = pct;
        }

        progressRafId = requestAnimationFrame(updateProgressBar);
    }

    function startProgressLoop() {
        if (progressRafId !== null) return;
        progressRafId = requestAnimationFrame(updateProgressBar);
    }

    function stopProgressLoop() {
        if (progressRafId !== null) {
            cancelAnimationFrame(progressRafId);
            progressRafId = null;
        }
        state.els.loopProgress.classList.add('hidden');
    }

    /** @param {PointerEvent} e */
    function progressFromPointerEvent(e) {
        const rect = state.els.loopProgress.getBoundingClientRect();
        const x = e.clientX - rect.left;
        return Math.max(0, Math.min(1, x / rect.width));
    }

    /** @param {number} progress */
    function setVisualProgress(progress) {
        const pct = (progress * 100).toFixed(2) + '%';
        state.els.loopProgressFill.style.width = pct;
        state.els.loopProgressHandle.style.left = pct;
    }

    state.els.loopProgress.addEventListener('pointerdown', (e) => {
        if (!engine.isRunning()) return;
        isDragging = true;
        state.els.loopProgress.classList.add('dragging');
        state.els.loopProgress.setPointerCapture(e.pointerId);
        setVisualProgress(progressFromPointerEvent(e));
    });

    state.els.loopProgress.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        setVisualProgress(progressFromPointerEvent(e));
    });

    state.els.loopProgress.addEventListener('pointerup', (e) => {
        if (!isDragging) return;
        isDragging = false;
        state.els.loopProgress.classList.remove('dragging');
        engine.seekLoop(progressFromPointerEvent(e));
    });

    state.els.loopProgress.addEventListener('pointercancel', () => {
        if (!isDragging) return;
        isDragging = false;
        state.els.loopProgress.classList.remove('dragging');
    });
});
