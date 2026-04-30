// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Hover glow — entry point.
 *
 * Loads the `/tiles/grid_index.bin` sidecar once, registers a
 * Mapbox custom WebGL layer above `grid-dots`, and forwards the
 * cursor's lng/lat into the layer's `uCursorLngLat` uniform on every
 * `mousemove`. The visible glow (cursorFactor × min(1, borderFactor +
 * cursorFloor), additive premultiplied white) is painted entirely on
 * the GPU by `frontend/hover-glow-layer.js` — this module only
 * orchestrates loading, event plumbing, and the live-tune surface.
 *
 * Exports `cursorFactor`, `borderFactor`, `glowFor`, `rByZoom`, and
 * `parseGridIndex` as the JS-side specification of the curves the
 * fragment shader replicates. The unit tests against these functions
 * lock the curve shape; the GLSL replication is integration-tested
 * via screenshots.
 *
 * Live tuning at `window.__hg.tune({ rByZoom, borderFalloff,
 * cursorFloor, eps, haloScale })` patches the runtime in place; the
 * change takes effect on the next render.
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
} from './config.js';
import { HoverGlowLayer } from './hover-glow-layer.js';

// ============ Tunable runtime constants ============

const tunables = {
    rByZoom: HOVER_GLOW_R_KM_BY_ZOOM,
    borderFalloff: HOVER_GLOW_BORDER_FALLOFF,
    eps: HOVER_GLOW_EPS,
    cursorFloor: HOVER_GLOW_CURSOR_FLOOR,
    haloScale: HOVER_GLOW_HALO_SCALE_BY_ZOOM,
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

// ============ Module state ============

/**
 * @typedef {object} GridIndex
 * @property {number} count
 * @property {number} gridSize
 * @property {Uint32Array} u32   length = 4 × count; entry i fid at u32[4i]
 * @property {Float32Array} f32  length = 4 × count; entry i lon at f32[4i+1],
 *                                                          lat at f32[4i+2],
 *                                                          dist at f32[4i+3]
 */

/** @type {GridIndex|null} */
let gridIndex = null;

/** @type {HoverGlowLayer|null} */
let glowLayer = null;

// ============ Sidecar parsing ============

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

// ============ Curve helpers (JS reference; replicated in GLSL) ============

/**
 * Smoothstep-based radial falloff. C¹-continuous at both endpoints.
 * Mirrored in `cursorFactor()` of frontend/hover-glow-shaders.js.
 *
 * @param {number} dKm
 * @param {number} R    radius in km
 * @returns {number} [0, 1]
 */
export function cursorFactor(dKm, R) {
    if (dKm >= R) return 0;
    if (dKm <= 0) return 1;
    const t = 1 - dKm / R;
    return t * t * (3 - 2 * t);
}

/** Hermite blend between two stops; smooth at both ends, monotonic. */
function hermiteBlend(x, x0, x1, y0, y1) {
    const t = (x - x0) / (x1 - x0);
    const s = t * t * (3 - 2 * t);
    return y0 + (y1 - y0) * s;
}

/**
 * Border-distance penalty: cells far from any border return ~0,
 * cells right on a border return 1. Piecewise Hermite over the
 * `tunables.borderFalloff` table (overridable via `__hg.tune`).
 * Mirrored in `borderFactor()` of frontend/hover-glow-shaders.js.
 *
 * @param {number} dKm
 * @param {Array<[number, number]>} [table=tunables.borderFalloff]
 * @returns {number} [0, 1]
 */
export function borderFactor(dKm, table = tunables.borderFalloff) {
    if (dKm <= table[0][0]) return table[0][1];
    if (dKm >= table[table.length - 1][0]) return table[table.length - 1][1];
    for (let i = 0; i < table.length - 1; i++) {
        const a = table[i];
        const b = table[i + 1];
        if (dKm >= a[0] && dKm < b[0]) {
            return hermiteBlend(dKm, a[0], b[0], a[1], b[1]);
        }
    }
}

/**
 * Per-cell glow value: cursor-radial factor times a border-distance
 * factor lifted by `cursorFloor`. Additive blend with `min(1, …)`
 * keeps the Hermite border curve C¹-continuous.
 *
 * @param {number} cf            cursor radial factor in [0, 1]
 * @param {number} bf            border-distance factor in [0, 1]
 * @param {number} cursorFloor   in [0, 1]
 * @returns {number}             [0, 1]
 */
export function glowFor(cf, bf, cursorFloor) {
    return cf * Math.min(1, bf + cursorFloor);
}

/**
 * Linear interpolation over the zoom→radius table. Overridable via
 * `__hg.tune({ rByZoom: [...] })`.
 *
 * @param {number} zoom
 * @param {Array<[number, number]>} [table=tunables.rByZoom]
 * @returns {number} R in km
 */
export function rByZoom(zoom, table = tunables.rByZoom) {
    if (zoom <= table[0][0]) return table[0][1];
    if (zoom >= table[table.length - 1][0]) return table[table.length - 1][1];
    for (let i = 0; i < table.length - 1; i++) {
        const a = table[i];
        const b = table[i + 1];
        if (zoom >= a[0] && zoom < b[0]) {
            const t = (zoom - a[0]) / (b[0] - a[0]);
            return a[1] + (b[1] - a[1]) * t;
        }
    }
}

// ============ Sidecar fetch ============

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

// ============ Public API ============

/**
 * Initialize the hover-glow runtime: load the sidecar, register the
 * GPU custom layer above `grid-dots`, and forward cursor mousemove
 * into its uniform. Failure to load the sidecar is non-fatal: the
 * dot layer keeps rendering at its rest grey, with no halo.
 *
 * @param {mapboxgl.Map} map
 * @returns {Promise<void>}
 */
export async function initHoverGlow(map) {
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
        gridIndex = null;
        return;
    }

    try {
        glowLayer = new HoverGlowLayer({
            gridIndex,
            tunables,
            dotRadiusStops: GRID_DOT_RADIUS_BY_ZOOM,
        });
        map.addLayer(glowLayer);
    } catch (err) {
        console.warn('[hover-glow] custom layer registration failed:', err);
        glowLayer = null;
        return;
    }

    const canvas = map.getCanvas();
    canvas.addEventListener('mousemove', (e) => {
        if (!glowLayer) return;
        const rect = canvas.getBoundingClientRect();
        const lngLat = map.unproject([e.clientX - rect.left, e.clientY - rect.top]);
        glowLayer.setCursorLngLat(lngLat.lng, lngLat.lat);
    });
    canvas.addEventListener('mouseleave', () => {
        if (glowLayer) glowLayer.setVisible(false);
    });
    window.addEventListener('blur', () => {
        if (glowLayer) glowLayer.setVisible(false);
    });

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
                if (!patch || typeof patch !== 'object') return tunables;
                if (Array.isArray(patch.rByZoom)) tunables.rByZoom = patch.rByZoom;
                if (Array.isArray(patch.borderFalloff))
                    tunables.borderFalloff = patch.borderFalloff;
                if (typeof patch.eps === 'number') tunables.eps = patch.eps;
                if (typeof patch.cursorFloor === 'number') tunables.cursorFloor = patch.cursorFloor;
                if (typeof patch.haloScale === 'number' || Array.isArray(patch.haloScale))
                    tunables.haloScale = patch.haloScale;
                if (glowLayer) glowLayer.setTunables(patch);
                return { ...tunables };
            },
        };
    }
}

/**
 * Read-only accessor for tests and DevTools introspection.
 * @returns {GridIndex|null}
 */
export function getGridIndex() {
    return gridIndex;
}
