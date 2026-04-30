// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Hover glow — brightens existing grid dots near the cursor on a smooth
 * radial falloff. Cells that also lie near a country border or
 * coastline glow brighter (the bright "tube" along the coast); cells
 * far from any border still glow softly via a `cursorFloor` floor on
 * the border-distance penalty, so the cursor leaves a subtle white
 * trail anywhere it hovers.
 *
 * Architecture:
 *   1. Load `/tiles/grid_index.bin` once on init — a packed binary
 *      sidecar with `{fid:u32, lon:f32, lat:f32, distKm:f32}` × N.
 *      The encoding mirrors `scripts/build-grid-index.js` exactly.
 *   2. Build a 5° lon/lat bucket index over the entries so per-tick
 *      work is bounded by cursor radius, not total cell count.
 *   3. Track screen-space cursor via `mousemove` only — RAF-coalesced
 *      because mousemove can fire faster than RAF and we don't need
 *      same-frame freshness during pure hover.
 *   4. Pause tick entirely between `movestart` and `moveend`. Even
 *      though JS-side per-tick cost is sub-millisecond, the
 *      `setFeatureState` calls queue tile vertex-buffer GPU uploads
 *      that compound during a sustained drag and visibly stall on
 *      lower-tier hardware. Pausing freezes the glow geographically
 *      (cursor visually drifts from the lit cells during drag) but
 *      eliminates the GPU side-effect entirely; one catchup tick on
 *      `moveend` snaps the glow back to the cursor.
 *   5. On `map.on('move')` outside a drag bracket, tick synchronously
 *      so feature-state writes land in the same frame's render.
 *   6. Per tick: walk only buckets within the cursor's bbox, compute
 *      glow as `cursorFactor(d) × min(1, borderFactor(borderDistKm) +
 *      cursorFloor)`, batch `setFeatureState({glow})` for cells above
 *      EPS, and zero out any cell from the previous frame's set that
 *      didn't make this one's (the anti-progressive-degradation
 *      invariant). The two glowing Sets are double-buffered
 *      (swap+clear), no per-frame allocation.
 *
 * Runtime constants live in `frontend/config.js` (HOVER_GLOW_*).
 * `window.__hg.tune({ rByZoom, borderFalloff, maxGlowing, eps,
 * cursorFloor })` patches them live in DevTools — change takes effect
 * on the next render tick, no reload.
 *
 * @module frontend/hover-glow
 */

import {
    ASSET_BASE,
    GRID_DOT_RADIUS_BY_ZOOM,
    GRID_FEATURE_STATE_SOURCE,
    GRID_FEATURE_STATE_SOURCE_LAYER,
    HOVER_GLOW_R_KM_BY_ZOOM,
    HOVER_GLOW_BORDER_FALLOFF,
    HOVER_GLOW_MAX_GLOWING,
    HOVER_GLOW_EPS,
    HOVER_GLOW_CURSOR_FLOOR,
    HOVER_GLOW_HALO_SCALE,
} from './config.js';
import { HoverGlowLayer } from './hover-glow-layer.js';

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
    cursorFloor: HOVER_GLOW_CURSOR_FLOOR,
    haloScale: HOVER_GLOW_HALO_SCALE,
};

/** GPU custom layer instance, populated by initHoverGlow once the
 *  sidecar resolves. Stays null until then so the CPU tick has full
 *  responsibility for any cursor halo during init. */
let glowLayer = null;

/** Earth radius for the equirectangular distance approximation. */
const EARTH_RADIUS_KM = 6371;
const DEG_TO_RAD = Math.PI / 180;

/**
 * Kilometers per degree at the equator (≈ 111.195). Multiplied by
 * `cos(lat)` to scale longitudinal distance away from the equator. Used
 * by tick() and enumerateNearbyEntries() to convert km radii into the
 * lon/lat bbox the bucket walk consumes.
 */
const KM_PER_DEG = EARTH_RADIUS_KM * DEG_TO_RAD;

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
 * @property {{ bucketDeg: number, buckets: Map<number, Uint32Array> }} [spatialIndex]
 *   Built by initHoverGlow() after fetch and read by tick(); absent only
 *   in the brief window between sidecar parse and buildSpatialIndex().
 */

/** @type {GridIndex|null} */
let gridIndex = null;

/** Screen-space cursor (CSS pixels) or null when outside the canvas. */
let cursor = null;

/**
 * Set of fids currently glowing — diffed each tick to clean up stale
 * state. Double-buffered with `currentGlowingFids` so we never
 * allocate a new Set per frame; tick() swaps the two refs at the
 * end and clears the new "current" on the next entry.
 */
let prevGlowingFids = new Set();
let currentGlowingFids = new Set();

/**
 * Per-frame candidate buffer in struct-of-arrays form. Filled by the
 * tick()'s bucket-walk inner loop, then iterated to write
 * setFeatureState. Module-level + reused across frames so the hot path
 * allocates nothing — the prior AoS form (`candidates.push({fid,
 * glow})`) churned 200–1500 short-lived objects per tick, breaking the
 * "zero-allocation tick" invariant the rest of the module respects.
 *
 * `candIdx` is filled with `[0, 1, …, candLen-1]` and sorted indirectly
 * by `candGlows[idx]` only on the rare frames where `candLen >
 * maxGlowing`. `Uint32Array.subarray(0, candLen).sort(cb)` mutates the
 * underlying buffer without allocating a new array.
 *
 * Initial capacity 4096 covers all observed cases (zoom-2 worst case
 * ~1000 candidates inside a 1000 km cursor radius); ensureCandCapacity
 * doubles on overflow so a future radius bump degrades gracefully
 * without ever allocating mid-tick steady-state.
 */
const CANDIDATES_INITIAL_CAP = 4096;
let candFids = new Uint32Array(CANDIDATES_INITIAL_CAP);
let candGlows = new Float32Array(CANDIDATES_INITIAL_CAP);
let candIdx = new Uint32Array(CANDIDATES_INITIAL_CAP);
let candLen = 0;

function ensureCandCapacity(n) {
    if (n <= candFids.length) return;
    const newCap = Math.max(n, candFids.length * 2);
    const newFids = new Uint32Array(newCap);
    const newGlows = new Float32Array(newCap);
    const newIdx = new Uint32Array(newCap);
    newFids.set(candFids);
    newGlows.set(candGlows);
    newIdx.set(candIdx);
    candFids = newFids;
    candGlows = newGlows;
    candIdx = newIdx;
}

/** Cached map ref for tick(). */
let mapRef = null;

/**
 * True between `movestart` and `moveend`. tick() early-returns while
 * this is set so per-frame setFeatureState GPU upload churn doesn't
 * compound during a sustained drag.
 */
let dragging = false;

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

// ============ Spatial bucket index ============
//
// At sidecar load we bin entries into a 5° lon/lat grid so the
// per-frame scan only walks cells whose bucket intersects the
// cursor's km-radius bbox. With a 600 km radius (zoom 5 default)
// that's at most a 3×3 bucket region near the equator, and the inner
// loop sees a few hundred entries instead of all 67k.
//
// Buckets are keyed by a packed integer `lonIdx * 100 + latIdx`,
// stored on a Map → `Uint32Array` of entry indices. The bucket size
// is deliberately coarse (5°) so a single radius spans a small
// constant number of buckets across the realistic radius range
// (180–1000 km); finer bucketing would add Map.get overhead with no
// inner-loop savings.

/** Bucket size in degrees. 5° ≈ 555 km at the equator. */
const SPATIAL_BUCKET_DEG = 5;

/** Number of longitude buckets covering [-180, 180). */
const LON_BUCKET_COUNT = Math.ceil(360 / SPATIAL_BUCKET_DEG);

/** Number of latitude buckets covering [-90, 90]. */
const LAT_BUCKET_COUNT = Math.ceil(180 / SPATIAL_BUCKET_DEG);

/**
 * Lon → [0, LON_BUCKET_COUNT) bucket index, antimeridian-wrapping.
 * @param {number} lon
 * @returns {number}
 */
function lonBucketIdx(lon) {
    let b = Math.floor((lon + 180) / SPATIAL_BUCKET_DEG);
    while (b < 0) b += LON_BUCKET_COUNT;
    while (b >= LON_BUCKET_COUNT) b -= LON_BUCKET_COUNT;
    return b;
}

/**
 * Lat → [0, LAT_BUCKET_COUNT) bucket index, clamped at the poles.
 * @param {number} lat
 * @returns {number}
 */
function latBucketIdx(lat) {
    let b = Math.floor((lat + 90) / SPATIAL_BUCKET_DEG);
    if (b < 0) return 0;
    if (b >= LAT_BUCKET_COUNT) return LAT_BUCKET_COUNT - 1;
    return b;
}

/** Pack (lonIdx, latIdx) into a single Map key. latIdx < 100 so * 100 is safe. */
function bucketKey(lonIdx, latIdx) {
    return lonIdx * 100 + latIdx;
}

/**
 * Build a 5°-bucket spatial index over the grid_index entries.
 * Two passes: count → allocate exact-sized Uint32Arrays → fill. This
 * avoids Array.push grow-in-place in the hot init path.
 *
 * @param {GridIndex} gridIndex
 * @returns {{ bucketDeg: number, buckets: Map<number, Uint32Array> }}
 */
export function buildSpatialIndex(gridIndex) {
    const f32 = gridIndex.f32;
    const n = gridIndex.count;

    const counts = new Map();
    for (let i = 0; i < n; i++) {
        const off = i * 4;
        const k = bucketKey(lonBucketIdx(f32[off + 1]), latBucketIdx(f32[off + 2]));
        counts.set(k, (counts.get(k) || 0) + 1);
    }

    const buckets = new Map();
    const fillCursor = new Map();
    for (const [k, c] of counts) {
        buckets.set(k, new Uint32Array(c));
        fillCursor.set(k, 0);
    }

    for (let i = 0; i < n; i++) {
        const off = i * 4;
        const k = bucketKey(lonBucketIdx(f32[off + 1]), latBucketIdx(f32[off + 2]));
        const arr = buckets.get(k);
        const cur = fillCursor.get(k);
        arr[cur] = i;
        fillCursor.set(k, cur + 1);
    }

    return { bucketDeg: SPATIAL_BUCKET_DEG, buckets };
}

/**
 * Test-only helper: return entry indices in buckets that intersect
 * the cursor's km-radius bbox. The result is a *superset* of the
 * entries the per-tick math will actually accept; the bucket walk is
 * a coarse pre-filter, not an exact range query.
 *
 * @param {{ buckets: Map<number, Uint32Array> }} spatialIndex
 * @param {number} cLng
 * @param {number} cLat
 * @param {number} R   km
 * @returns {number[]} entry indices
 */
export function enumerateNearbyEntries(spatialIndex, cLng, cLat, R) {
    const buckets = spatialIndex.buckets;
    const latRange = R / KM_PER_DEG;
    const cosLatClamped = Math.max(0.05, Math.abs(Math.cos(cLat * DEG_TO_RAD)));
    const lonRange = R / (KM_PER_DEG * cosLatClamped);
    const latLoIdx = latBucketIdx(cLat - latRange);
    const latHiIdx = latBucketIdx(cLat + latRange);
    const lonLoFloat = Math.floor((cLng - lonRange + 180) / SPATIAL_BUCKET_DEG);
    const lonHiFloat = Math.floor((cLng + lonRange + 180) / SPATIAL_BUCKET_DEG);

    const out = [];
    for (let lonI = lonLoFloat; lonI <= lonHiFloat; lonI++) {
        const lonIdx = ((lonI % LON_BUCKET_COUNT) + LON_BUCKET_COUNT) % LON_BUCKET_COUNT;
        for (let latIdx = latLoIdx; latIdx <= latHiIdx; latIdx++) {
            const arr = buckets.get(bucketKey(lonIdx, latIdx));
            if (!arr) continue;
            for (let j = 0, m = arr.length; j < m; j++) out.push(arr[j]);
        }
    }
    return out;
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
        const a = table[i];
        const b = table[i + 1];
        if (dKm >= a[0] && dKm < b[0]) {
            return hermiteBlend(dKm, a[0], b[0], a[1], b[1]);
        }
    }
}

/**
 * Per-cell glow value: cursor-radial factor times a border-distance
 * factor lifted by `cursorFloor`. Additive blend with a `min(1, …)`
 * clamp keeps the Hermite border curve C¹-continuous (a `max(bf,
 * floor)` form would introduce a visible kink at the crossover).
 *
 * Setting `cursorFloor=0` recovers the legacy border-only behavior;
 * raising it lets cells far from any border still glow softly under
 * the cursor.
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
    // Pause during drag/zoom/rotate — the moveend handler will call
    // tick() once with dragging=false to resume. The check lives here
    // (not just in event handlers) so a mousemove-queued RAF tick that
    // happens to fire mid-drag also honors the pause.
    if (dragging) return;
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
    const cursorFloor = tunables.cursorFloor;
    const RSqGuess = R * R; // for early-skip (no sqrt) on cells obviously too far

    const u32 = gridIndex.u32;
    const f32 = gridIndex.f32;
    const buckets = gridIndex.spatialIndex.buckets;

    // Pre-compute scaling factors used per-iteration. We don't reuse
    // distKm() here because the inner loop wants to skip the sqrt for
    // cells whose distance² already exceeds R² — saves ~30% on the
    // hot path.
    const cosLatMid = Math.cos(cLat * DEG_TO_RAD); // approximate mid-lat factor
    const cosFactor = KM_PER_DEG * cosLatMid;

    // Cursor bbox in degrees → bucket range. Clamp cosLat near the
    // poles so the lon range stays finite (at lat ±90 the bbox spans
    // every longitude anyway).
    const latRange = R / KM_PER_DEG;
    const cosLatClamped = Math.max(0.05, Math.abs(cosLatMid));
    const lonRange = R / (KM_PER_DEG * cosLatClamped);
    const latLoIdx = latBucketIdx(cLat - latRange);
    const latHiIdx = latBucketIdx(cLat + latRange);
    const lonLoFloat = Math.floor((cLng - lonRange + 180) / SPATIAL_BUCKET_DEG);
    const lonHiFloat = Math.floor((cLng + lonRange + 180) / SPATIAL_BUCKET_DEG);

    candLen = 0;

    for (let lonI = lonLoFloat; lonI <= lonHiFloat; lonI++) {
        const lonIdx = ((lonI % LON_BUCKET_COUNT) + LON_BUCKET_COUNT) % LON_BUCKET_COUNT;
        for (let latIdx = latLoIdx; latIdx <= latHiIdx; latIdx++) {
            const arr = buckets.get(bucketKey(lonIdx, latIdx));
            if (!arr) continue;
            for (let j = 0, m = arr.length; j < m; j++) {
                const off = arr[j] * 4;
                const lon = f32[off + 1];
                const lat = f32[off + 2];

                let dLon = lon - cLng;
                if (dLon > 180) dLon -= 360;
                else if (dLon < -180) dLon += 360;
                const x = dLon * cosFactor;
                const y = (lat - cLat) * KM_PER_DEG;
                const dSq = x * x + y * y;
                if (dSq >= RSqGuess) continue;

                const dKm = Math.sqrt(dSq);
                const cf = cursorFactor(dKm, R);
                if (cf <= 0) continue;

                const borderDist = f32[off + 3];
                const bf = borderFactor(borderDist, borderTable);

                const g = glowFor(cf, bf, cursorFloor);
                if (g < eps) continue;

                if (candLen >= candFids.length) ensureCandCapacity(candLen + 1);
                candFids[candLen] = u32[off];
                candGlows[candLen] = g;
                candLen++;
            }
        }
    }

    // Apply this frame's set. `currentGlowingFids` is reused across
    // ticks via clear()+swap; the candidate buffers are reused via
    // candLen=0 reset above. Two paths:
    //
    //   * candLen ≤ maxGlowing — write candidates in arrival order.
    //   * candLen > maxGlowing — fill candIdx with [0..candLen) and
    //     sort it indirectly by candGlows[idx] desc, then apply the
    //     top maxGlowing. Truncated cells are the dimmest, so the
    //     visual loss is minimal. `Uint32Array.subarray.sort(cb)`
    //     mutates the underlying buffer without allocating.
    currentGlowingFids.clear();
    if (candLen > maxGlowing) {
        for (let i = 0; i < candLen; i++) candIdx[i] = i;
        candIdx.subarray(0, candLen).sort((a, b) => candGlows[b] - candGlows[a]);
        for (let k = 0; k < maxGlowing; k++) {
            const j = candIdx[k];
            const fid = candFids[j];
            currentGlowingFids.add(fid);
            mapRef.setFeatureState(
                {
                    source: GRID_FEATURE_STATE_SOURCE,
                    sourceLayer: GRID_FEATURE_STATE_SOURCE_LAYER,
                    id: fid,
                },
                { glow: candGlows[j] }
            );
        }
    } else {
        for (let i = 0; i < candLen; i++) {
            const fid = candFids[i];
            currentGlowingFids.add(fid);
            mapRef.setFeatureState(
                {
                    source: GRID_FEATURE_STATE_SOURCE,
                    sourceLayer: GRID_FEATURE_STATE_SOURCE_LAYER,
                    id: fid,
                },
                { glow: candGlows[i] }
            );
        }
    }

    // Clean up stale glow from cells that left this frame's set.
    if (prevGlowingFids.size > 0) {
        for (const fid of prevGlowingFids) {
            if (!currentGlowingFids.has(fid)) {
                mapRef.setFeatureState(
                    {
                        source: GRID_FEATURE_STATE_SOURCE,
                        sourceLayer: GRID_FEATURE_STATE_SOURCE_LAYER,
                        id: fid,
                    },
                    { glow: 0 }
                );
            }
        }
    }

    // Swap roles for next tick: today's `currentGlowingFids` becomes
    // tomorrow's `prev`. The other Set is now stale; tick will clear
    // it on entry next time round.
    const tmp = prevGlowingFids;
    prevGlowingFids = currentGlowingFids;
    currentGlowingFids = tmp;
}

// ============ Tick scheduling ============
//
// Three paths into tick():
//
//   * `mousemove` (idle hover) → `scheduleTick()`. Mousemove can fire
//     faster than RAF, and during pure hover there is no map
//     compositing to race against, so RAF coalescing is the right
//     trade. Multiple events within one frame collapse to a single
//     tick on the next animation frame.
//
//   * `map.on('move')` while NOT dragging → tick() *synchronously*.
//     Covers programmatic camera changes between dispatched
//     `movestart`/`moveend` events and small post-zoom settle moves.
//     Mapbox runs `move` listeners before compositing the frame, so
//     feature-state writes land in the same frame's render — no
//     one-frame lag.
//
//   * `map.on('moveend')` → one tick to resume the glow at the new
//     cursor position after a drag. The drag itself is paused
//     (see below).
//
// During drag (`movestart` → `moveend`), tick is fully suppressed.
// The previous frame's feature-state stays in place — visually the
// glow freezes geographically while the map slides under it (cursor
// drifts away from the lit cells), then snaps back to the cursor on
// release. This is a deliberate trade: the user reported sustained
// jank during drag, attributable to per-frame `setFeatureState` GPU
// upload churn that JS-side timing cannot see. Pausing eliminates
// that work entirely while preserving rest-state crispness.
//
// During total idle (no events firing) we run zero ticks.

let rafId = null;

function scheduleTick() {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
        rafId = null;
        tick();
    });
}

/** Cancel a pending RAF tick — called before a sync tick to avoid
 *  a redundant tick on the very next frame. */
function cancelScheduledTick() {
    if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }
}

/**
 * Force-clear all currently glowing cells. Called on mouseleave and
 * on tab blur to avoid leaving residual highlights.
 */
function clearAllGlow() {
    if (!mapRef || prevGlowingFids.size === 0) return;
    for (const fid of prevGlowingFids) {
        mapRef.setFeatureState(
            {
                source: GRID_FEATURE_STATE_SOURCE,
                sourceLayer: GRID_FEATURE_STATE_SOURCE_LAYER,
                id: fid,
            },
            { glow: 0 }
        );
    }
    prevGlowingFids.clear();
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
        gridIndex.spatialIndex = buildSpatialIndex(gridIndex);
        console.log(
            `[hover-glow] loaded grid_index.bin (${gridIndex.count} cells, gridSize=${gridIndex.gridSize}, ${gridIndex.spatialIndex.buckets.size} spatial buckets)`
        );
    } catch (err) {
        console.warn(
            '[hover-glow] grid_index.bin failed to load — hover glow disabled. Run npm --prefix server run build:tiles to regenerate.',
            err
        );
        gridIndex = null;
        return;
    }

    // Register the GPU custom layer above grid-dots. The fragment shader
    // is currently a `discard` placeholder — the layer compiles, runs
    // its vertex pass, then emits no fragments. Visible glow is still
    // produced exclusively by the CPU tick + setFeatureState path
    // below; the next commit lands the glow math in the shader and
    // makes this layer the visible source.
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
    // stale highlights at a position they're no longer hovering. Also
    // resets the drag flag in case a moveend never fired (the user
    // alt-tabbed mid-drag).
    window.addEventListener('blur', () => {
        cursor = null;
        dragging = false;
        clearAllGlow();
    });

    // Pause hover-glow during drag/zoom/rotate. The drag itself
    // dispatches `movestart` then a stream of `move` events then
    // `moveend`; we set a flag at start and skip every per-frame tick
    // until end. Programmatic camera changes (jumpTo, fitBounds, etc.)
    // also dispatch movestart/moveend, so they're paused too — the
    // catchup tick on moveend is enough.
    map.on('movestart', () => {
        dragging = true;
    });
    map.on('moveend', () => {
        dragging = false;
        cancelScheduledTick();
        tick();
    });

    // Map-transform-driven tick for the rare case where `move` fires
    // outside a movestart/moveend bracket (some Mapbox internal paths
    // do this for sub-pixel transform settles). We tick synchronously
    // so feature-state writes land in the same frame's render.
    map.on('move', () => {
        if (dragging) return;
        cancelScheduledTick();
        tick();
    });

    // Debug surface for DevTools introspection + live tuning. Patch
    // `__hg.tune({ rByZoom, borderFalloff, maxGlowing, eps,
    // cursorFloor })` to override defaults from frontend/config.js.
    // The change takes effect on the very next render tick — no reload,
    // no rebuild.
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
                if (typeof patch.cursorFloor === 'number') tunables.cursorFloor = patch.cursorFloor;
                if (typeof patch.haloScale === 'number') tunables.haloScale = patch.haloScale;
                if (glowLayer) glowLayer.setTunables(patch);
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
