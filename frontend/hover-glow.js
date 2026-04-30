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
 * Runtime constants live in `frontend/config.js` (HOVER_GLOW_*).
 * `window.__hg.tune({ rByZoom, borderFalloff, maxGlowing, eps })`
 * patches them live in DevTools — change takes effect on the next
 * render tick, no reload.
 *
 * @module frontend/hover-glow
 */

import {
    ASSET_BASE,
    HOVER_GLOW_R_KM_BY_ZOOM,
    HOVER_GLOW_BORDER_FALLOFF,
    HOVER_GLOW_MAX_GLOWING,
    HOVER_GLOW_EPS,
} from './config.js';

// ============ Tunable runtime constants ============
//
// Defaults pull from `frontend/config.js`. The runtime overlays them
// onto a mutable `tunables` object, which `window.__hg.tune({...})`
// patches in place. Tick reads from `tunables` every frame, so live
// DevTools edits take effect on the next render — no reload needed.

const tunables = {
    rByZoom: HOVER_GLOW_R_KM_BY_ZOOM,
    borderFalloff: HOVER_GLOW_BORDER_FALLOFF,
    maxGlowing: HOVER_GLOW_MAX_GLOWING,
    eps: HOVER_GLOW_EPS,
};

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
 * `tunables.borderFalloff` table (overridable via `__hg.tune`).
 *
 * @param {number} dKm
 * @param {Array<[number, number]>} [table=tunables.borderFalloff]
 * @returns {number} [0, 1]
 */
export function borderFactor(dKm, table = tunables.borderFalloff) {
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
    const R = rByZoom(mapRef.getZoom(), tunables.rByZoom);
    const eps = tunables.eps;
    const maxGlowing = tunables.maxGlowing;
    const borderTable = tunables.borderFalloff;
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
        const bf = borderFactor(borderDist, borderTable);
        if (bf <= 0) continue;

        const g = cf * bf;
        if (g < eps) continue;

        candidates.push({ fid: u32[off], glow: g });
    }

    // Cap to maxGlowing by sorting on glow descending. Truncated cells
    // are the dimmest, so the visual loss is minimal.
    if (candidates.length > maxGlowing) {
        candidates.sort((a, b) => b.glow - a.glow);
        candidates.length = maxGlowing;
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

// ============ RAF-coalesced scheduler ============
//
// Tick is event-driven, not render-driven: the previous (render-driven)
// version ran the 67k-cell scan on every frame Mapbox composited,
// burning ~4M iterations/sec even when nothing changed and producing
// a "flicker" feel as cells near EPS bounced in and out of the active
// set. Now tick runs at most once per RAF, only when state has changed
// (mousemove → cursor moved, or `map.on('move')` → transform changed).
//
// During drag/zoom, `map.on('move')` fires every frame, so we still
// get full-FPS updates for the drag-lag fix. During idle hover we
// only run when the cursor itself moves. During total idle (no
// movement at all) we run zero ticks.

let rafId = null;
let dirty = false;

function scheduleTick() {
    dirty = true;
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!dirty) return;
        dirty = false;
        tick();
    });
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
        scheduleTick();
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

    // Map-transform-driven tick. `move` fires once per frame during
    // drag, zoom, and rotate animations — covers the drag-lag fix
    // (re-`unproject` cursor via current transform) without needing
    // `render`'s per-paint firing rate when nothing has changed.
    map.on('move', scheduleTick);

    // Debug surface for DevTools introspection + live tuning. Patch
    // `__hg.tune({ rByZoom, borderFalloff, maxGlowing, eps })` to
    // override defaults from frontend/config.js. The change takes
    // effect on the very next render tick — no reload, no rebuild.
    if (typeof window !== 'undefined') {
        window.__hg = {
            map,
            getGridIndex: () => gridIndex,
            getCursor: () => cursor,
            getGlowingFids: () => new Set(prevGlowingFids),
            forceTick: tick,
            getTunables: () => ({ ...tunables }),
            tune: (patch) => {
                if (!patch || typeof patch !== 'object') return tunables;
                if (Array.isArray(patch.rByZoom)) tunables.rByZoom = patch.rByZoom;
                if (Array.isArray(patch.borderFalloff))
                    tunables.borderFalloff = patch.borderFalloff;
                if (typeof patch.maxGlowing === 'number') tunables.maxGlowing = patch.maxGlowing;
                if (typeof patch.eps === 'number') tunables.eps = patch.eps;
                if (mapRef) mapRef.triggerRepaint();
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
