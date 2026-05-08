// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Hover glow — entry point.
 *
 * Loads the `/tiles/grid_index.bin` sidecar once, registers a Mapbox
 * custom WebGL layer above `grid-dots`, and forwards the cursor's
 * lng/lat into the layer's `uCursorLngLat` uniform on every
 * `mousemove`. The visible glow (cursorFactor × min(1, borderFactor +
 * cursorFloor), additive premultiplied white) is painted entirely on
 * the GPU by `frontend/hover-glow-layer.js`; this module only
 * orchestrates loading, event plumbing, and the live-tune surface.
 *
 * On `mouseleave` / `window.blur` the cursor is pushed to a sentinel
 * lng/lat far outside any valid coordinate, so the fragment shader's
 * cursorFactor returns 0 everywhere and discards every fragment — no
 * separate "hidden" flag needed.
 *
 * Live tuning at `window.__hg.tune({ rByZoom, borderFalloff,
 * cursorFloor, eps, haloScale })` patches the runtime in place via
 * `HoverGlowLayer.setTunables`; the change takes effect on the next
 * render. `parseGridIndex` is also exported for unit tests.
 *
 * @module frontend/hover-glow
 */

import {
    ASSET_BASE,
    GRID_DOT_RADIUS_BY_ZOOM,
    HOVER_GLOW_R_KM_BY_ZOOM,
    HOVER_GLOW_BORDER_FALLOFF,
    HOVER_GLOW_EPS,
    HOVER_GLOW_CURSOR_FLOOR,
    HOVER_GLOW_HALO_SCALE_BY_ZOOM,
    getResolvedTheme,
    subscribeTheme,
} from './config.js';
import { HoverGlowLayer } from './hover-glow-layer.js';

/**
 * Halo tint per resolved theme. White over the dark canvas brightens
 * dots toward pure white (high contrast); black over the near-white
 * canvas darkens them toward pure black (also high contrast). The
 * blendFunc (ONE, ONE_MINUS_SRC_ALPHA) handles both directions
 * symmetrically because the shader emits premultiplied src.
 */
const HALO_COLOR_BY_THEME = {
    dark: [1, 1, 1],
    light: [0, 0, 0],
};

// ============ Sidecar format constants ============
//
// Must match scripts/build-grid-index.js exactly. The header is 16
// bytes; each entry is 16 bytes (fid:u32 + lon:f32 + lat:f32 + dist:f32).
// Total bytes = 16 + 16 × count. Magic is the ASCII string "GSIDX001".

const GRID_INDEX_MAGIC = 'GSIDX001';
const GRID_INDEX_HEADER_BYTES = 16;
const GRID_INDEX_ENTRY_BYTES = 16;
const GRID_INDEX_FIELDS_PER_ENTRY = 4;

// Sentinel cursor position used when the pointer leaves the canvas:
// far outside any valid lng/lat, so distKmToCursor in the shader
// produces a huge value and cursorFactor returns 0 everywhere.
const CURSOR_OFFSCREEN_LNG = 999;
const CURSOR_OFFSCREEN_LAT = 999;

/**
 * @typedef {object} GridIndex
 * @property {number} count
 * @property {number} gridSize
 * @property {Uint32Array} u32   length = 4 × count; entry i fid at u32[4i]
 * @property {Float32Array} f32  length = 4 × count; entry i lon at f32[4i+1],
 *                                                          lat at f32[4i+2],
 *                                                          dist at f32[4i+3]
 */

/**
 * Parse a `grid_index.bin` ArrayBuffer into typed-array views.
 * Throws on bad magic or mismatched length. Exposed for tests.
 *
 * @param {ArrayBuffer} buffer
 * @returns {GridIndex}
 */
export function parseGridIndex(buffer) {
    const view = new DataView(buffer);
    let magic = '';
    for (let i = 0; i < 8; i++) {
        magic += String.fromCharCode(view.getUint8(i));
    }
    if (magic !== GRID_INDEX_MAGIC) {
        throw new Error(
            `grid_index.bin: bad magic ${JSON.stringify(magic)} (expected ${GRID_INDEX_MAGIC})`
        );
    }
    const count = view.getUint32(8, /* littleEndian */ true);
    const gridSize = view.getFloat32(12, true);
    const expectedBytes = GRID_INDEX_HEADER_BYTES + count * GRID_INDEX_ENTRY_BYTES;
    if (buffer.byteLength !== expectedBytes) {
        throw new Error(
            `grid_index.bin: bad length ${buffer.byteLength}, expected ${expectedBytes} for count=${count}`
        );
    }
    const fieldCount = count * GRID_INDEX_FIELDS_PER_ENTRY;
    return {
        count,
        gridSize,
        u32: new Uint32Array(buffer, GRID_INDEX_HEADER_BYTES, fieldCount),
        f32: new Float32Array(buffer, GRID_INDEX_HEADER_BYTES, fieldCount),
    };
}

async function fetchGridIndex() {
    const url = ASSET_BASE
        ? `${ASSET_BASE}/tiles/grid_index.bin`
        : `${window.location.origin}/tiles/grid_index.bin`;
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`grid_index.bin fetch ${res.status}: ${url}`);
    }
    const buf = await res.arrayBuffer();
    return parseGridIndex(buf);
}

/**
 * Initialize the hover-glow runtime: load the sidecar, register the
 * GPU custom layer above `grid-dots`, and forward cursor mousemove
 * into its uniform. Failure to load the sidecar is non-fatal — the
 * dot layer keeps rendering at its rest grey, with no halo.
 *
 * @param {mapboxgl.Map} map
 * @returns {Promise<void>}
 */
export async function initHoverGlow(map) {
    let gridIndex;
    try {
        gridIndex = await fetchGridIndex();
        console.log(
            `[hover-glow] loaded grid_index.bin (${gridIndex.count} cells, gridSize=${gridIndex.gridSize})`
        );
    } catch (err) {
        console.warn(
            '[hover-glow] grid_index.bin failed to load — hover glow disabled. Run npm --prefix server run build:tiles to regenerate.',
            err
        );
        return;
    }

    const tunables = {
        rByZoom: HOVER_GLOW_R_KM_BY_ZOOM,
        borderFalloff: HOVER_GLOW_BORDER_FALLOFF,
        eps: HOVER_GLOW_EPS,
        cursorFloor: HOVER_GLOW_CURSOR_FLOOR,
        haloScale: HOVER_GLOW_HALO_SCALE_BY_ZOOM,
    };

    const glowLayer = new HoverGlowLayer({
        gridIndex,
        tunables,
        dotRadiusStops: GRID_DOT_RADIUS_BY_ZOOM,
    });
    map.addLayer(glowLayer);

    // Initial tint matches the resolved theme; subscribeTheme repaints the
    // halo whenever the user toggles or the OS prefers-color-scheme flips
    // while in auto. Without this, the halo stays white in light mode and
    // is invisible against the near-white canvas.
    glowLayer.setHaloColor(HALO_COLOR_BY_THEME[getResolvedTheme()] || HALO_COLOR_BY_THEME.dark);
    subscribeTheme((resolved) => {
        glowLayer.setHaloColor(HALO_COLOR_BY_THEME[resolved] || HALO_COLOR_BY_THEME.dark);
    });

    const canvas = map.getCanvas();
    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const lngLat = map.unproject([e.clientX - rect.left, e.clientY - rect.top]);
        glowLayer.setCursorLngLat(lngLat.lng, lngLat.lat);
    });
    const hideHalo = () => glowLayer.setCursorLngLat(CURSOR_OFFSCREEN_LNG, CURSOR_OFFSCREEN_LAT);
    canvas.addEventListener('mouseleave', hideHalo);
    window.addEventListener('blur', hideHalo);

    // Debug surface for DevTools introspection + live tuning. Patch
    // `__hg.tune({ rByZoom, borderFalloff, cursorFloor, eps,
    // haloScale })` to override defaults from frontend/config.js.
    // The change takes effect on the very next render — no reload.
    if (typeof window !== 'undefined') {
        window.__hg = {
            map,
            getGridIndex: () => gridIndex,
            getTunables: () => ({ ...tunables }),
            tune: (patch) => {
                glowLayer.setTunables(patch);
                return { ...tunables };
            },
        };
    }
}
