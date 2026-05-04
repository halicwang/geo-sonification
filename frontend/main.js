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
 *     --> audio engine receives audioParams for sonification
 *
 * @module frontend/main
 */

import {
    state,
    getMapboxToken,
    loadServerConfig,
    getClientId,
    getThemeMode,
    setThemeMode,
    applyTheme,
} from './config.js';
import { showToast, updateUI, updateConnectionStatus } from './ui.js';
import { initMap, onViewportChange, refreshServerConfig } from './map.js';
import { connectWebSocket } from './websocket.js';
import { engine } from './audio/engine.js';
import { announcer } from './city-announcer.js';
import { attachProgressBar } from './progress.js';
import { triggerInitialViewportPush } from './initial-viewport-push.js';
import { attachSheetDrag } from './sheet-drag.js';

// Build-tag banner: identifies which commit served the current page so
// an open DevTools session attributes regressions to a specific deploy.
// Build identity is injected by scripts/build-pages.js into
// config.runtime.js at deploy time; in local development the fields
// are empty and the banner is suppressed.
{
    const cfg = window.GEO_SONIFICATION_CONFIG || {};
    if (cfg.buildHash) {
        console.info(`[PlaceEcho] build ${cfg.buildHash} deployed ${cfg.buildTime || 'unknown'}`);
    }
}

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
        volumeSlider: document.getElementById('volume-slider'),
        volumeValue: document.getElementById('volume-value'),
        loopProgress: document.getElementById('loop-progress'),
        loopProgressFill: document.getElementById('loop-progress-fill'),
        loopProgressHandle: document.getElementById('loop-progress-handle'),
        infoPanel: document.getElementById('info-panel'),
        panelToggle: document.getElementById('panel-toggle'),
        themeToggle: document.getElementById('theme-toggle'),
        themeIcon: document.getElementById('theme-icon'),
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
    // Push canonical proximity thresholds to the audio engine before
    // initMap() wires up the move handler — otherwise the very first
    // move events would drive proximity from the (correct) defaults
    // but couldn't pick up an env-overridden server value until the
    // first refreshServerConfig() round-trip.
    engine.setProximityThresholds(state.config.proximityZoomLow, state.config.proximityZoomHigh);

    // Shared stats handler — fan-out to UI and audio engine. Used by both
    // the WebSocket path (`connectWebSocket.onStats`) and the HTTP fallback
    // path (`map.js sendViewportHTTP` via `initMap`'s onStats callback).
    // Sharing one handler keeps the two transports byte-equivalent on the
    // client side.
    const handleStats = (data) => {
        updateUI(data);
        if (data.audioParams) {
            engine.update(data.audioParams);
        }
    };

    initMap({ onStats: handleStats, onToast: showToast });

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
            triggerInitialViewportPush(state.runtime.map, onViewportChange);
        },
        onStats: handleStats,
        onError: (msg) => showToast(`Error: ${msg}`, 5000),
        onDisconnect: () => updateConnectionStatus(false),
    });

    // ── Info panel toggle ──
    // On mobile (≤ 600 px) the panel renders as a bottom sheet. Default
    // state on first load is collapsed so the user gets a full-globe view
    // before opting in to the stats. The hamburger ≡ at top-right and the
    // in-sheet drag handle both call the same toggle.
    // Transitions are gated by `.animating` so they only fire on explicit
    // user toggles — not on viewport resize. Otherwise dragging the window
    // across the 600 px breakpoint would interpolate between the desktop
    // hidden state (opacity 0 + translateX 20px) and the mobile hidden
    // state (opacity 1 + translateY 100% + 24px), producing a visible
    // panel-slides-away flicker.
    let panelAnimatingTimer;
    function togglePanel() {
        state.els.infoPanel.classList.add('animating');
        clearTimeout(panelAnimatingTimer);
        panelAnimatingTimer = setTimeout(() => {
            state.els.infoPanel.classList.remove('animating');
        }, 400);

        const hidden = state.els.infoPanel.classList.toggle('hidden');
        state.els.panelToggle.classList.toggle('open', !hidden);
        state.els.panelToggle.setAttribute('aria-expanded', String(!hidden));
    }
    state.els.panelToggle.addEventListener('click', togglePanel);

    const sheetHandle = document.getElementById('sheet-handle');
    if (sheetHandle) {
        sheetHandle.addEventListener('click', togglePanel);
        // Pull the handle down past ~80 px to dismiss the sheet.
        // Drag-up is rubber-banded to zero (no further-expanded state).
        attachSheetDrag({
            handle: sheetHandle,
            panel: state.els.infoPanel,
            onDismiss: togglePanel,
        });
    }

    if (window.matchMedia('(max-width: 600px)').matches) {
        state.els.infoPanel.classList.add('hidden');
        state.els.panelToggle.classList.remove('open');
        state.els.panelToggle.setAttribute('aria-expanded', 'false');
    }

    // ── Theme toggle button ──
    // Cycles auto → light → dark → auto. The inline script in index.html
    // already set `data-theme` and `data-theme-mode` on <html> before first
    // paint; applyTheme() is called once here as a safety net so the
    // module-scope cache (lastResolvedTheme) stays consistent with the dataset.
    const THEME_NEXT = { auto: 'light', light: 'dark', dark: 'auto' };
    const THEME_ICON = { auto: '◐', light: '☀', dark: '☾' };
    const THEME_LABEL = { auto: 'Auto', light: 'Light', dark: 'Dark' };

    function refreshThemeButton(mode) {
        if (!state.els.themeToggle) return;
        state.els.themeIcon.textContent = THEME_ICON[mode];
        const next = THEME_LABEL[THEME_NEXT[mode]];
        state.els.themeToggle.title = `Theme: ${THEME_LABEL[mode]}`;
        state.els.themeToggle.setAttribute(
            'aria-label',
            `Theme: ${THEME_LABEL[mode]} (click for ${next})`
        );
    }

    applyTheme();
    refreshThemeButton(getThemeMode());

    if (state.els.themeToggle) {
        state.els.themeToggle.addEventListener('click', () => {
            setThemeMode(THEME_NEXT[getThemeMode()]);
            applyTheme();
            // Read mode back from storage rather than trusting the optimistic
            // `nextMode` — if setThemeMode silently failed (private mode,
            // quota), the page still shows the old theme; the button must
            // reflect that, not the intended-but-unwritten value.
            refreshThemeButton(getThemeMode());
        });
    }

    // ── Audio toggle button ──
    let audioAllFailedToastShown = false;

    function setAudioToggleState(enabled) {
        state.els.audioIcon.textContent = enabled ? '\u25A0' : '\u25B6';
        state.els.audioToggle.classList.toggle('active', enabled);
        state.els.audioToggle.setAttribute('aria-pressed', String(enabled));
        state.els.audioToggle.setAttribute('aria-label', enabled ? 'Stop audio' : 'Start audio');
    }

    const progressBar = attachProgressBar({
        progressEl: state.els.loopProgress,
        fillEl: state.els.loopProgressFill,
        handleEl: state.els.loopProgressHandle,
        engine,
    });

    state.els.audioToggle.addEventListener('click', async () => {
        if (!state.runtime.audioEnabled) {
            state.runtime.audioEnabled = true;
            setAudioToggleState(true);
            state.els.audioStatus.textContent = 'Loading\u2026';
            state.els.audioStatus.dataset.state = 'loading';
            audioAllFailedToastShown = false;

            engine.setOnLoadingUpdate(renderLoadingUI);
            // setOnLoadingUpdate only stores the callback reference; on a
            // second start the buffers are already cached and no load
            // event will ever fire, which would leave the "Loading…"
            // text from above stuck forever. Render once against the
            // current states so an all-ready engine flips to "Playing"
            // immediately and a pending engine stays on "Loading…".
            renderLoadingUI(engine.getLoadingStates());
            await engine.start();
            announcer.setEnabled(true);
            progressBar.start();

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
            state.els.audioStatus.dataset.state = 'off';
            await engine.stop();
            announcer.setEnabled(false);
            announcer.reset();
            progressBar.stop();
        }
    });

    // ── Volume slider ──
    // --fill-pct drives the gradient fill on the Webkit track so the
    // active (left) portion tracks the thumb in real time. Firefox
    // uses ::-moz-range-progress natively and ignores this var.
    let lastFillPct = '';
    let lastVolumeText = '';
    function updateVolumeFillPct() {
        const el = state.els.volumeSlider;
        const raw = parseFloat(el.value) || 0;
        const min = parseFloat(el.min) || 0;
        const max = parseFloat(el.max) || 100;
        const span = max - min;
        const pct = span > 0 ? ((raw - min) / span) * 100 : 0;
        const pctStr = pct + '%';
        if (pctStr === lastFillPct) return;
        lastFillPct = pctStr;
        el.style.setProperty('--fill-pct', pctStr);
    }

    state.els.volumeSlider.addEventListener('input', () => {
        const raw = parseInt(state.els.volumeSlider.value, 10);
        const volume = raw / 100;
        engine.setVolume(volume);
        const text = raw + '%';
        if (text !== lastVolumeText) {
            lastVolumeText = text;
            state.els.volumeValue.textContent = text;
        }
        updateVolumeFillPct();
    });

    updateVolumeFillPct();

    /**
     * Update the audio status text and surface an all-failed toast based on
     * per-bus loading progress reported by the engine. No per-bus list is
     * rendered into the info panel.
     * @param {Array<{status: string, progress: number, error: string|null}>} states
     */
    function renderLoadingUI(states) {
        const readyCount = states.filter((s) => s.status === 'ready').length;
        const errorCount = states.filter((s) => s.status === 'error').length;
        const allFailed = errorCount === states.length && states.length > 0;

        if (allFailed) {
            state.els.audioStatus.textContent =
                'Audio init failed \u2014 check frontend/audio/ambience/';
            state.els.audioStatus.dataset.state = 'error';
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
            state.els.audioStatus.dataset.state = 'playing';
        } else if (states.some((s) => s.status === 'loading')) {
            state.els.audioStatus.textContent =
                'Loading (' + readyCount + '/' + states.length + ')';
            state.els.audioStatus.dataset.state = 'loading';
        }
    }
});
