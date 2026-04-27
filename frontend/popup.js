// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Mapbox grid-dot popup.
 *
 * On click: shows the cell's grid id, primary landcover class, and a
 * top-5 land-only `lc_pct_*` breakdown rendered from the feature
 * properties baked into the PMTiles vector layer.
 * On hover: switches the cursor to a pointer over the dot layer.
 *
 * Pure code-move from `frontend/map.js:340-394` (M4 P2-1). No
 * behavior change.
 *
 * @module frontend/popup
 */

import { escapeHtml, getLandcoverName } from './landcover.js';

/**
 * Build the inner HTML of a grid-cell popup from raw feature properties.
 * Exported separately so the rendering is unit-testable without Mapbox.
 *
 * @param {Object<string, *>} props - Feature properties from the PMTiles layer.
 * @returns {string} HTML safe to pass to `Popup.setHTML`.
 */
export function renderPopupHtml(props) {
    const landcoverDisplay =
        props.landcover_class != null
            ? getLandcoverName(props.landcover_class) || 'Unknown'
            : 'No data';

    // Per-cell land-only lc_pct_* breakdown (Water class 80 excluded).
    const lcClasses = [10, 20, 30, 40, 50, 60, 70, 90, 95, 100];
    const lcEntries = lcClasses
        .map((cls) => ({ cls, pct: Number(props[`lc_pct_${cls}`]) || 0 }))
        .filter((e) => e.pct > 0);
    const landTotal = lcEntries.reduce((sum, e) => sum + e.pct, 0);

    let lcBreakdownHtml = '';
    if (lcEntries.length > 0 && landTotal > 0) {
        const top5 = lcEntries
            .map((e) => ({ ...e, pct: (e.pct / landTotal) * 100 }))
            .filter((e) => e.pct >= 0.5)
            .sort((a, b) => b.pct - a.pct)
            .slice(0, 5);
        if (top5.length > 0) {
            lcBreakdownHtml =
                '<br><small>' +
                top5
                    .map(
                        (e) =>
                            `${escapeHtml(getLandcoverName(e.cls) || e.cls)}: ${e.pct.toFixed(1)}%`
                    )
                    .join('<br>') +
                '</small>';
        }
    }

    return `
                    <strong>Grid: ${escapeHtml(props.grid_id)}</strong><br>
                    Land Cover: ${escapeHtml(landcoverDisplay)}${lcBreakdownHtml}
                `;
}

/**
 * Attach click + cursor handlers to a Mapbox layer so dots show a
 * popup on click and switch the cursor on hover.
 *
 * Must be called once per map after the layer is added.
 *
 * @param {mapboxgl.Map} map - The Mapbox map instance.
 * @param {string} layerId - The layer ID to attach the handlers to.
 * @returns {void}
 */
export function attachPopup(map, layerId) {
    map.on('click', layerId, (e) => {
        if (e.features.length === 0) return;
        new mapboxgl.Popup()
            .setLngLat(e.lngLat)
            .setHTML(renderPopupHtml(e.features[0].properties))
            .addTo(map);
    });

    map.on('mouseenter', layerId, () => {
        map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', layerId, () => {
        map.getCanvas().style.cursor = '';
    });
}
