// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Hover glow — brightens existing grid dots near both the cursor AND a
 * country border or coastline, on a smooth radial falloff.
 *
 * Architecture (the M6 plan, mirrored in code):
 *   1. Load `/tiles/grid_index.bin` once on init — a packed binary
 *      sidecar with `{fid:u32, lon:f32, lat:f32, distKm:f32}` × N.
 *      The encoding mirrors `scripts/build-grid-index.js` exactly.
 *   2. Track screen-space cursor via `mousemove` only.
 *   3. Drive every per-frame update from `map.on('render')`. This is
 *      the drag-lag fix from the previous attempt — `mousemove`
 *      does not fire during drag, but `render` does, and re-projecting
 *      the cached screen-space cursor via `map.unproject` uses the
 *      *current* transform.
 *   4. Per tick: linear scan all entries, compute glow as
 *      `cursorFactor(d) × borderFactor(borderDistKm)`, batch
 *      `setFeatureState({glow})` for cells above EPS, and zero out any
 *      cell from the previous frame's set that didn't make this one's
 *      (the anti-progressive-degradation invariant).
 *
 * Runtime constants currently live in `frontend/config.js`. P1-4 will
 * expose `window.__hg.tune({...})` for live tweaking in DevTools.
 *
 * @module frontend/hover-glow
 */

import { ASSET_BASE } from './config.js';

// ============ Tunable runtime constants ============
//
// Hardcoded for P1-2/P1-3. P1-4 lifts these into frontend/config.js
// and exposes window.__hg.tune({...}) for live DevTools tweaking.

/**
 * Cursor falloff radius in km, by zoom level. Linear-interpolated
 * between breakpoints. Visual size on screen stays roughly constant
 * across zooms — at zoom 2 we paint ~600 km which is small on screen,
 * at zoom 10 we paint ~180 km which is large. Tune in P1-4.
 */
const R_KM_BY_ZOOM = [
    [2, 600],
    [5, 350],
    [7, 250],
    [10, 180],
];

/**
 * Border-distance penalty curve: cells far from any border cap glow
 * to zero, regardless of how close the cursor is. Hermite-blended
 * on three intervals to avoid sharp breakpoints.
 *   1.0 @ 0 km, 0.7 @ 50 km, 0.1 @ 150 km, 0 @ 250 km+
 */
const BORDER_FALLOFF = [
    [0, 1.0],
    [50, 0.7],
    [150, 0.1],
    [250, 0.0],
];

/**
 * Hard cap on cells writing setFeatureState per frame. Defense in
 * depth — realistic counts are 200–800 even at maximum overlap.
 * Truncating affects only the dimmest cells (sorted by glow desc).
 */
const MAX_GLOWING = 1500;

/**
 * Minimum glow value to bother writing feature-state. Below this the
 * pixel difference is invisible.
 */
const EPS = 0.005;

/** Earth radius for the equirectangular distance approximation. */
const EARTH_RADIUS_KM = 6371;
const DEG_TO_RAD = Math.PI / 180;

// ============ Sidecar format constants ============
//
// Must match scripts/build-grid-index.js exactly. The header is 16
// bytes; each entry is 16 bytes (fid:u32 + lon:f32 + lat:f32 + dist:f32).
// Total bytes = 16 + 16 × count. Magic is the ASCII string "GSIDX001".

const GRID_INDEX_MAGIC = 'GSIDX001';
const GRID_INDEX_HEADER_BYTES = 16;
const GRID_INDEX_ENTRY_BYTES = 16;
const GRID_INDEX_FIELDS_PER_ENTRY = 4; // fid, lon, lat, dist (each 4 bytes)

// ============ Module state ============

/**
 * In-memory grid index. Populated once on init, then read-only.
 * Two typed-array views over the same body slice — the integer view
 * is correct only for the fid slot, and the float view is correct
 * only for the lon/lat/dist slots.
 *
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

/** Screen-space cursor (CSS pixels) or null when outside the canvas. */
let cursor = null;

/** Set of fids currently glowing — diffed each tick to clean up stale state. */
let prevGlowingFids = new Set();

/** Cached map ref for tick(). */
let mapRef = null;

/** Cached source-layer descriptor for setFeatureState. */
const FEATURE_STATE_SOURCE = 'grid-source';
const FEATURE_STATE_SOURCE_LAYER = 'grids';

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

// ============ Glow math ============

/**
 * Equirectangular point-to-point distance in km, antimeridian-safe.
 * Mirror of the build-time function in compute-border-distance.js but
 * point-to-point, not point-to-segment. Inside the < 600 km radius we
 * care about, equirectangular error vs full geodesic is < 0.1%.
 *
 * @param {number} lat0
 * @param {number} lon0
 * @param {number} lat1
 * @param {number} lon1
 * @returns {number} km
 */
export function distKm(lat0, lon0, lat1, lon1) {
    let dLon = lon1 - lon0;
    if (dLon > 180) dLon -= 360;
    else if (dLon < -180) dLon += 360;
    const cosLat = Math.cos((lat0 + lat1) * 0.5 * DEG_TO_RAD);
    const x = dLon * DEG_TO_RAD * cosLat;
    const y = (lat1 - lat0) * DEG_TO_RAD;
    return EARTH_RADIUS_KM * Math.sqrt(x * x + y * y);
}

/**
 * Smoothstep-based radial falloff. C¹-continuous at both endpoints.
 * No sharp 0/1 boundary — that prevents the "visible square" the
 * previous attempt's bbox-clamp produced.
 *
 * @param {number} dKm
 * @param {number} R    radius in km
 * @returns {number} [0, 1]
 */
export function cursorFactor(dKm, R) {
    if (dKm >= R) return 0;
    if (dKm <= 0) return 1;
    const t = 1 - dKm / R;
    return t * t * (3 - 2 * t); // 3t² - 2t³
}

/**
 * Hermite blend between two stops: smooth at both ends, monotonic.
 * Same shape as smoothstep but with explicit value range.
 */
function hermiteBlend(x, x0, x1, y0, y1) {
    const t = (x - x0) / (x1 - x0);
    const s = t * t * (3 - 2 * t);
    return y0 + (y1 - y0) * s;
}

/**
 * Border-distance penalty: cells far from any border return ~0,
 * cells right on a border return 1. Piecewise Hermite over the
 * `BORDER_FALLOFF` table.
 *
 * @param {number} dKm
 * @returns {number} [0, 1]
 */
export function borderFactor(dKm) {
    const table = BORDER_FALLOFF;
    if (dKm <= table[0][0]) return table[0][1];
    if (dKm >= table[table.length - 1][0]) return table[table.length - 1][1];
    for (let i = 0; i < table.length - 1; i++) {
        const [x0, y0] = table[i];
        const [x1, y1] = table[i + 1];
        if (dKm >= x0 && dKm < x1) {
            return hermiteBlend(dKm, x0, x1, y0, y1);
        }
    }
    return 0; // unreachable
}

/**
 * Linear interpolation over the zoom→radius table.
 *
 * @param {number} zoom
 * @returns {number} R in km
 */
function rByZoom(zoom) {
    const table = R_KM_BY_ZOOM;
    if (zoom <= table[0][0]) return table[0][1];
    if (zoom >= table[table.length - 1][0]) return table[table.length - 1][1];
    for (let i = 0; i < table.length - 1; i++) {
        const [z0, r0] = table[i];
        const [z1, r1] = table[i + 1];
        if (zoom >= z0 && zoom < z1) {
            const t = (zoom - z0) / (z1 - z0);
            return r0 + (r1 - r0) * t;
        }
    }
    return table[table.length - 1][1];
}

// ============ Sidecar fetch ============

/**
 * Fetch and parse the sidecar from `${ASSET_BASE}/tiles/grid_index.bin`.
 *
 * @returns {Promise<GridIndex>}
 */
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

// ============ Per-frame tick ============

/**
 * Compute glow values for the current cursor position and write them
 * to feature-state. Called once per `render` event when cursor is set
 * and the gridIndex is loaded.
 *
 * Three invariants the previous attempt broke (this one preserves them):
 *
 * 1. Drag-lag fix: cursor is unprojected via the *current* map
 *    transform on every render tick. mousemove only writes screen
 *    coords; it does not unproject (Mapbox doesn't even fire
 *    mousemove during drag).
 * 2. Anti-square-shape: glow is a pure radial scalar
 *    (cursorFactor × borderFactor). No bbox clamp leaks into the
 *    visible falloff.
 * 3. Anti-progressive-degradation: every cell glowing last frame but
 *    not this frame is explicitly zeroed. setFeatureState(glow:0) is
 *    used (not removeFeatureState) — Mapbox's coalesce path is
 *    faster on a present-zero entry than on a re-walked absent one.
 */
function tick() {
    if (!cursor || !gridIndex || !mapRef) return;
    if (!mapRef.isStyleLoaded()) return;
    if (!mapRef.getLayer('grid-dots')) return;

    const lngLat = mapRef.unproject([cursor.sx, cursor.sy]);
    const cLat = lngLat.lat;
    const cLng = lngLat.lng;
    const R = rByZoom(mapRef.getZoom());
    const RSqGuess = R * R; // for early-skip (no sqrt) on cells obviously too far

    const u32 = gridIndex.u32;
    const f32 = gridIndex.f32;
    const n = gridIndex.count;

    // Pre-compute scaling factors used per-iteration. We don't reuse
    // distKm() here because the inner loop wants to skip the sqrt for
    // cells whose distance² already exceeds R² — saves ~30% on the
    // hot path.
    const cosLatMid = Math.cos(cLat * DEG_TO_RAD); // approximate mid-lat factor
    const factor = DEG_TO_RAD * EARTH_RADIUS_KM;
    const cosFactor = factor * cosLatMid;

    /** @type {Array<{fid:number, glow:number}>} */
    const candidates = [];

    for (let i = 0; i < n; i++) {
        const off = i * 4;
        const lon = f32[off + 1];
        const lat = f32[off + 2];

        let dLon = lon - cLng;
        if (dLon > 180) dLon -= 360;
        else if (dLon < -180) dLon += 360;
        const x = dLon * cosFactor;
        const y = (lat - cLat) * factor;
        const dSq = x * x + y * y;
        if (dSq >= RSqGuess) continue; // ~95% of cells skip here without sqrt

        const dKm = Math.sqrt(dSq);
        const cf = cursorFactor(dKm, R);
        if (cf <= 0) continue;

        const borderDist = f32[off + 3];
        const bf = borderFactor(borderDist);
        if (bf <= 0) continue;

        const g = cf * bf;
        if (g < EPS) continue;

        candidates.push({ fid: u32[off], glow: g });
    }

    // Cap to MAX_GLOWING by sorting on glow descending. Truncated cells
    // are the dimmest, so the visual loss is minimal.
    if (candidates.length > MAX_GLOWING) {
        candidates.sort((a, b) => b.glow - a.glow);
        candidates.length = MAX_GLOWING;
    }

    // Apply this frame's set.
    const newGlowingFids = new Set();
    for (const c of candidates) {
        newGlowingFids.add(c.fid);
        mapRef.setFeatureState(
            { source: FEATURE_STATE_SOURCE, sourceLayer: FEATURE_STATE_SOURCE_LAYER, id: c.fid },
            { glow: c.glow }
        );
    }

    // Clean up stale glow from cells that left this frame's set.
    if (prevGlowingFids.size > 0) {
        for (const fid of prevGlowingFids) {
            if (!newGlowingFids.has(fid)) {
                mapRef.setFeatureState(
                    {
                        source: FEATURE_STATE_SOURCE,
                        sourceLayer: FEATURE_STATE_SOURCE_LAYER,
                        id: fid,
                    },
                    { glow: 0 }
                );
            }
        }
    }
    prevGlowingFids = newGlowingFids;
}

/**
 * Force-clear all currently glowing cells. Called on mouseleave and
 * on tab blur to avoid leaving residual highlights.
 */
function clearAllGlow() {
    if (!mapRef || prevGlowingFids.size === 0) return;
    for (const fid of prevGlowingFids) {
        mapRef.setFeatureState(
            { source: FEATURE_STATE_SOURCE, sourceLayer: FEATURE_STATE_SOURCE_LAYER, id: fid },
            { glow: 0 }
        );
    }
    prevGlowingFids = new Set();
}

// ============ Public API ============

/**
 * Initialize the hover-glow runtime: load the sidecar, attach
 * `mousemove` / `mouseleave` to the canvas, and register the
 * per-render tick on the map.
 *
 * Failure to load the sidecar is non-fatal: we log a warning and the
 * dot layer keeps rendering at its rest grey.
 *
 * @param {mapboxgl.Map} map
 * @returns {Promise<void>}
 */
export async function initHoverGlow(map) {
    mapRef = map;

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

    const canvas = map.getCanvas();
    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        cursor = { sx: e.clientX - rect.left, sy: e.clientY - rect.top };
    });
    canvas.addEventListener('mouseleave', () => {
        cursor = null;
        clearAllGlow();
    });

    // Tab blur — clear residual glow so a returning user doesn't see
    // stale highlights at a position they're no longer hovering.
    window.addEventListener('blur', () => {
        cursor = null;
        clearAllGlow();
    });

    // The render-tick handler. `render` fires every frame Mapbox
    // composites — during drag, zoom animation, and idle hover. The
    // per-render unproject uses the *current* transform, which is the
    // drag-lag fix.
    map.on('render', tick);

    // Debug surface for DevTools introspection. P1-4 will extend this
    // with live-tunable knobs (`__hg.tune({...})`).
    if (typeof window !== 'undefined') {
        window.__hg = {
            map,
            getGridIndex: () => gridIndex,
            getCursor: () => cursor,
            getGlowingFids: () => new Set(prevGlowingFids),
            forceTick: tick,
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
