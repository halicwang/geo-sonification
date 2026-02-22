/**
 * Geo-Sonification — UI rendering.
 *
 * All DOM manipulation: stats panel, connection status indicator,
 * and toast notifications.
 *
 * @module frontend/ui
 */

import { state } from './config.js';
import { escapeHtml, getLandcoverName, getLandcoverColor } from './landcover.js';

let _toastTimerId = null;

/**
 * Render viewport stats into the info panel.
 * Called on every WebSocket stats message or HTTP fallback response.
 */
export function updateUI(stats) {
    const els = state.els;

    // Grid count display
    const gc = stats.gridCount || 0;
    const tgc = stats.theoreticalGridCount;
    if (tgc != null && tgc > 0) {
        const pct = ((stats.landCoverageRatio || 0) * 100).toFixed(0);
        els.gridCount.textContent = `${gc} / ${tgc} (${pct}%)`;
    } else {
        els.gridCount.textContent = gc;
    }

    // Mode indicator (aggregated vs per-grid)
    if (els.oscMode) {
        if (stats.mode === 'per-grid') {
            els.oscMode.textContent = `Per-Grid (${stats.gridCount || 0} cells)`;
            els.oscMode.style.color = 'var(--color-accent-info)';
        } else {
            els.oscMode.textContent = 'Aggregated';
            els.oscMode.style.color = '';
        }
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

                return `<div class="landcover-item${otherClass}">
                <span class="landcover-name">
                    ${swatchColor ? `<span class="landcover-swatch" style="background:${escapeHtml(swatchColor)}"></span>` : ''}
                    ${escapeHtml(displayName)}
                </span>
                <span class="landcover-percent">${formattedPercent}%</span>
            </div>`;
            })
            .join('');
    } else {
        els.landcoverList.innerHTML = `
            <div class="landcover-item empty">
                <span class="landcover-name">No data</span>
            </div>
        `;
    }
}

/** Update the status dot + text at the bottom of the info panel. */
export function updateConnectionStatus(connected) {
    const els = state.els;

    if (connected) {
        els.wsStatus.classList.remove('disconnected');
        els.wsStatus.classList.add('connected');
        els.landcoverList.closest('#info-panel')?.classList.remove('stale');
        els.wsText.textContent = 'Connected to server';
    } else {
        els.wsStatus.classList.remove('connected');
        els.wsStatus.classList.add('disconnected');
        els.wsText.textContent = 'Reconnecting...';
        // After 2+ failed reconnects, mark panel data as potentially stale
        if (state.runtime.wsReconnectDelay >= 4000) {
            els.landcoverList.closest('#info-panel')?.classList.add('stale');
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
