// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Geo-Sonification — UI rendering.
 *
 * All DOM manipulation: stats panel, connection status indicator,
 * and toast notifications.
 *
 * @module frontend/ui
 */

import { state, STALE_GRACE_MS } from './config.js';
import { escapeHtml, getLandcoverName, getLandcoverColor } from './landcover.js';

let _toastTimerId = null;
let _staleTimerId = null;

/**
 * Render viewport stats into the info panel.
 * Called on every WebSocket stats message or HTTP fallback response.
 */
export function updateUI(stats) {
    const els = state.els;

    // Grid count display (with thousands separators for readability)
    const gc = stats.gridCount || 0;
    const tgc = stats.theoreticalGridCount;
    if (tgc != null && tgc > 0) {
        const pct = ((stats.landCoverageRatio || 0) * 100).toFixed(0);
        els.gridCount.textContent = `${gc.toLocaleString('en-US')} / ${tgc.toLocaleString('en-US')} (${pct}%)`;
    } else {
        els.gridCount.textContent = gc.toLocaleString('en-US');
    }

    // Mode indicator (aggregated vs per-grid)
    if (els.audioMode) {
        if (stats.mode === 'per-grid') {
            els.audioMode.textContent = `Per-Grid (${stats.gridCount || 0} cells)`;
            els.audioMode.style.color = 'var(--color-accent-info)';
        } else {
            els.audioMode.textContent = 'Aggregated';
            els.audioMode.style.color = '';
        }
    }

    // Proximity (from audioParams)
    if (els.proximity && stats.audioParams) {
        const p = stats.audioParams.proximity;
        els.proximity.textContent = p != null ? p.toFixed(2) : '—';
    }

    // Dominant landcover
    if (els.landType) {
        const name = getLandcoverName(stats.dominantLandcover);
        els.landType.textContent = name ? `${name} (${stats.dominantLandcover})` : '—';
    }

    // Dynamic landcover breakdown list — single innerHTML write
    if (stats.landcoverBreakdown && stats.landcoverBreakdown.length > 0) {
        const totalPercent = stats.landcoverBreakdown.reduce(
            (sum, item) => sum + item.percentage,
            0
        );
        if (Math.abs(totalPercent - 100) > 1) {
            console.warn('Landcover percentages do not sum to 100:', totalPercent.toFixed(1));
        }

        els.landcoverList.innerHTML = stats.landcoverBreakdown
            .map((item) => {
                const isOther = item.class === null;
                const displayName = isOther ? 'Other' : getLandcoverName(item.class) || 'Unknown';
                const swatchColor = isOther ? null : getLandcoverColor(item.class);
                const formattedPercent = (item.percentage ?? 0).toFixed(1);
                const otherClass = isOther ? ' landcover-other' : '';
                // --pct drives the inline micro-bar width; --bar-color tints it.
                const itemStyle = `--pct: ${formattedPercent}; --bar-color: ${
                    isOther ? 'transparent' : escapeHtml(swatchColor)
                };`;

                return `<div class="landcover-item${otherClass}" style="${itemStyle}">
                <span class="landcover-swatch"${swatchColor ? ` style="background:${escapeHtml(swatchColor)}"` : ''}></span>
                <span class="landcover-name">${escapeHtml(displayName)}</span>
                <span class="landcover-percent">${formattedPercent}%</span>
            </div>`;
            })
            .join('');
    } else {
        els.landcoverList.innerHTML = `
            <div class="landcover-item empty">
                <span class="landcover-swatch"></span>
                <span class="landcover-name">No data</span>
                <span class="landcover-percent"></span>
            </div>
        `;
    }
}

/** Update the status dot + text at the bottom of the info panel. */
export function updateConnectionStatus(connected) {
    const els = state.els;
    const panel = els.landcoverList.closest('#info-panel');

    if (connected) {
        els.wsStatus.classList.remove('disconnected');
        els.wsStatus.classList.add('connected');
        panel?.classList.remove('stale');
        els.wsText.textContent = 'Connected to server';
        if (_staleTimerId !== null) {
            clearTimeout(_staleTimerId);
            _staleTimerId = null;
        }
    } else {
        els.wsStatus.classList.remove('connected');
        els.wsStatus.classList.add('disconnected');
        els.wsText.textContent = 'Reconnecting...';
        // Mark stale only if the disconnect persists past the grace window;
        // transient reconnect flaps (sub-grace) stay quiet.
        if (_staleTimerId === null) {
            _staleTimerId = setTimeout(() => {
                _staleTimerId = null;
                if (state.runtime.ws?.readyState !== WebSocket.OPEN) {
                    panel?.classList.add('stale');
                }
            }, STALE_GRACE_MS);
        }
    }
}

/** Show a temporary notification bar at the bottom of the screen. */
export function showToast(message, duration = 3000) {
    state.els.toast.textContent = message;
    state.els.toast.classList.remove('hidden');

    if (_toastTimerId !== null) {
        clearTimeout(_toastTimerId);
    }
    _toastTimerId = setTimeout(() => {
        state.els.toast.classList.add('hidden');
        _toastTimerId = null;
    }, duration);
}
