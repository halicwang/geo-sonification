// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Mapbox custom WebGL layer that renders the hover-glow as an additive
 * white point-sprite overlay above the grey grid-dots circle layer.
 *
 * Per `mapboxgl.CustomLayerInterface`:
 *   - `onAdd(map, gl)`  — compile program, build + upload VBO, look up
 *                         attribute and uniform locations.
 *   - `render(gl, ...)` — set uniforms, bind VBO, draw `gl.POINTS`.
 *   - `onRemove(gl)`    — delete program and VBO.
 *
 * The vertex buffer is built once on init from the parsed
 * `grid_index.bin` payload (already loaded by hover-glow.js). Per
 * frame, only a vec2 cursor uniform plus zoom-derived scalars are
 * touched — no per-cell GPU upload.
 *
 * Globe vs mercator: mapbox-gl v3.11 invokes `render()` with extra
 * positional args in globe mode (verified against
 * src/render/draw_custom.ts):
 *   globe:    render(gl, customLayerMatrix, projection,
 *                    globeToMercatorMatrix,
 *                    globeToMercatorTransition,
 *                    [centerX, centerY], pixelsPerMeterRatio)
 *   mercator: render(gl, customLayerMatrix)
 *
 * The vertex shader handles both via `mix(mercatorPos, ecefViaG2M,
 * uTransition)`. Mercator mode → uTransition=1 + uGlobeToMercator=I
 * collapses the globe branch to identity-mapped ECEF coords that the
 * mix() then weights at zero.
 *
 * @module frontend/hover-glow-layer
 */

import { VERTEX_SHADER_SRC, FRAGMENT_SHADER_SRC, packBorderFalloff } from './hover-glow-shaders.js';

const DEG_TO_RAD = Math.PI / 180;

/**
 * Mapbox's ECEF coordinate space is scaled to GLOBE_RADIUS (not a
 * unit sphere). `globeToMercatorMatrix()` is built as
 * `(1 / worldSize) × globeMatrix`, where `globeMatrix` expects ECEF
 * inputs at this radius — so our `aEcef` attribute must match or the
 * mix() in the vertex shader maps points to (near-zero) mercator
 * coords and the halo floats off-globe near the world origin.
 *
 * Mirror of `GLOBE_RADIUS = EXTENT / (2π)` from
 * src/geo/projection/globe_constants.ts (EXTENT = 8192).
 */
const MAPBOX_GLOBE_RADIUS = 8192 / (2 * Math.PI);

/** 8 floats per vertex: [lng, lat, mercX, mercY, ecefX, ecefY, ecefZ, borderDistKm]. */
const FLOATS_PER_VERTEX = 8;
const STRIDE_BYTES = FLOATS_PER_VERTEX * 4;

const IDENTITY4 = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/**
 * Build the interleaved vertex buffer for all grid cells.
 * Mercator world coords are computed via Mapbox's
 * `MercatorCoordinate.fromLngLat`. ECEF coords use a unit sphere
 * (Mapbox's `globeToMercatorMatrix` applies the appropriate scale).
 *
 * @param {{ count: number, f32: Float32Array }} gridIndex
 * @returns {Float32Array} length = count × FLOATS_PER_VERTEX
 */
export function buildVertexBuffer(gridIndex) {
    const n = gridIndex.count;
    const out = new Float32Array(n * FLOATS_PER_VERTEX);
    for (let i = 0; i < n; i++) {
        const inOff = i * 4;
        const lon = gridIndex.f32[inOff + 1];
        const lat = gridIndex.f32[inOff + 2];
        const dist = gridIndex.f32[inOff + 3];
        const merc = mapboxgl.MercatorCoordinate.fromLngLat({ lng: lon, lat });
        const cosLat = Math.cos(lat * DEG_TO_RAD);
        const sinLat = Math.sin(lat * DEG_TO_RAD);
        const cosLon = Math.cos(lon * DEG_TO_RAD);
        const sinLon = Math.sin(lon * DEG_TO_RAD);
        const off = i * FLOATS_PER_VERTEX;
        out[off + 0] = lon;
        out[off + 1] = lat;
        out[off + 2] = merc.x;
        out[off + 3] = merc.y;
        // ECEF in Mapbox's GLOBE_RADIUS-scaled space (not unit sphere).
        // Axis convention matches src/geo/lng_lat.ts csLatLngToECEF:
        // (cosLat·sinLng, -sinLat, cosLat·cosLng), all × GLOBE_RADIUS.
        out[off + 4] = cosLat * sinLon * MAPBOX_GLOBE_RADIUS;
        out[off + 5] = -sinLat * MAPBOX_GLOBE_RADIUS;
        out[off + 6] = cosLat * cosLon * MAPBOX_GLOBE_RADIUS;
        out[off + 7] = dist;
    }
    return out;
}

function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`hover-glow shader compile failed: ${info}`);
    }
    return shader;
}

function linkProgram(gl, vert, frag) {
    const program = gl.createProgram();
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error(`hover-glow program link failed: ${info}`);
    }
    return program;
}

/**
 * Linear-interpolate a (zoom, value) stops table at `x`. Used for `R`
 * (km), the dot-radius footprint, and the halo-scale curve. Stops
 * must be sorted strictly increasing in x; the two endpoint clamps
 * plus the loop cover every input.
 */
function lerpStops(x, stops) {
    if (x <= stops[0][0]) return stops[0][1];
    if (x >= stops[stops.length - 1][0]) return stops[stops.length - 1][1];
    for (let i = 0; i < stops.length - 1; i++) {
        const a = stops[i];
        const b = stops[i + 1];
        if (x >= a[0] && x < b[0]) {
            const t = (x - a[0]) / (b[0] - a[0]);
            return a[1] + (b[1] - a[1]) * t;
        }
    }
}

/**
 * @typedef {object} HoverGlowTunables
 * @property {Array<[number, number]>} rByZoom        zoom → R (km) stops
 * @property {Array<[number, number]>} borderFalloff  border distance (km) → factor stops
 * @property {number} cursorFloor   [0, 1]
 * @property {number} eps           [0, 1]
 * @property {number} haloScale     point-sprite multiplier; default 3.0
 */

export class HoverGlowLayer {
    /**
     * @param {object} opts
     * @param {{ count: number, f32: Float32Array }} opts.gridIndex
     * @param {HoverGlowTunables} opts.tunables - shared with caller; mutated in place by setTunables
     * @param {Array<[number, number]>} opts.dotRadiusStops - circle-radius zoom stops (CSS pixels)
     */
    constructor({ gridIndex, tunables, dotRadiusStops }) {
        this.id = 'hover-glow';
        this.type = 'custom';
        this.renderingMode = '2d';

        this._gridIndex = gridIndex;
        this._tunables = tunables;
        this._dotRadiusStops = dotRadiusStops;

        // Initial cursor position is the off-screen sentinel used by
        // hover-glow.js on mouseleave / window blur. Keeps the halo
        // hidden between layer registration and the first mousemove.
        this._cursorLng = 999;
        this._cursorLat = 999;

        this._gl = null;
        this._map = null;
        this._program = null;
        this._vbo = null;
        this._attribLocs = null;
        this._uniformLocs = null;
    }

    onAdd(map, gl) {
        this._map = map;
        this._gl = gl;

        const vert = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
        const frag = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SRC);
        this._program = linkProgram(gl, vert, frag);
        gl.deleteShader(vert);
        gl.deleteShader(frag);

        this._attribLocs = {
            aLngLat: gl.getAttribLocation(this._program, 'aLngLat'),
            aMerc: gl.getAttribLocation(this._program, 'aMerc'),
            aEcef: gl.getAttribLocation(this._program, 'aEcef'),
            aBorderDist: gl.getAttribLocation(this._program, 'aBorderDist'),
        };

        // Some uniforms are referenced only by the stage-2 fragment
        // shader; their lookup returns null on the skeleton fragment,
        // which is fine — `gl.uniform*` on a null location is a
        // documented no-op.
        this._uniformLocs = {
            uMatrix: gl.getUniformLocation(this._program, 'uMatrix'),
            uGlobeToMercator: gl.getUniformLocation(this._program, 'uGlobeToMercator'),
            uTransition: gl.getUniformLocation(this._program, 'uTransition'),
            uPointSize: gl.getUniformLocation(this._program, 'uPointSize'),
            uCursorLngLat: gl.getUniformLocation(this._program, 'uCursorLngLat'),
            uR: gl.getUniformLocation(this._program, 'uR'),
            uCursorFloor: gl.getUniformLocation(this._program, 'uCursorFloor'),
            uEps: gl.getUniformLocation(this._program, 'uEps'),
            uFalloff: gl.getUniformLocation(this._program, 'uFalloff'),
        };

        const vertexData = buildVertexBuffer(this._gridIndex);
        this._vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);
        gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.STATIC_DRAW);
    }

    onRemove(gl) {
        if (this._program) gl.deleteProgram(this._program);
        if (this._vbo) gl.deleteBuffer(this._vbo);
        this._program = null;
        this._vbo = null;
    }

    /**
     * Mapbox passes (gl, customLayerMatrix) in mercator mode and
     * (gl, customLayerMatrix, projection, globeToMercatorMatrix,
     *  transition, [centerX, centerY], pixelsPerMeterRatio) in globe
     * mode. We only need matrix + globeToMercator + transition.
     *
     * `transition` is Mapbox's `globeToMercatorTransition(zoom)`:
     * 0 in pure globe (z<5), 1 in pure mercator (z>6), smooth in
     * between. In mercator mode mapbox passes neither g2m nor
     * transition, but the shader still needs uTransition=1 so the
     * mix() picks the mercator branch — defaulting to 0 there would
     * route through the (now-identity) g2m and render off-globe.
     */
    render(gl, matrix, _projection, globeToMercator, transition) {
        if (!this._program || !this._vbo) return;
        const inGlobeMode = !!globeToMercator;
        const t = inGlobeMode ? transition || 0 : 1;

        gl.useProgram(this._program);
        gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);

        const a = this._attribLocs;
        if (a.aLngLat >= 0) {
            gl.enableVertexAttribArray(a.aLngLat);
            gl.vertexAttribPointer(a.aLngLat, 2, gl.FLOAT, false, STRIDE_BYTES, 0);
        }
        if (a.aMerc >= 0) {
            gl.enableVertexAttribArray(a.aMerc);
            gl.vertexAttribPointer(a.aMerc, 2, gl.FLOAT, false, STRIDE_BYTES, 8);
        }
        if (a.aEcef >= 0) {
            gl.enableVertexAttribArray(a.aEcef);
            gl.vertexAttribPointer(a.aEcef, 3, gl.FLOAT, false, STRIDE_BYTES, 16);
        }
        if (a.aBorderDist >= 0) {
            gl.enableVertexAttribArray(a.aBorderDist);
            gl.vertexAttribPointer(a.aBorderDist, 1, gl.FLOAT, false, STRIDE_BYTES, 28);
        }

        const u = this._uniformLocs;
        gl.uniformMatrix4fv(u.uMatrix, false, matrix);
        gl.uniformMatrix4fv(u.uGlobeToMercator, false, globeToMercator || IDENTITY4);
        gl.uniform1f(u.uTransition, t);
        gl.uniform1f(u.uPointSize, this._computePointSize());

        gl.uniform2f(u.uCursorLngLat, this._cursorLng, this._cursorLat);
        gl.uniform1f(u.uR, lerpStops(this._map.getZoom(), this._tunables.rByZoom));
        gl.uniform1f(u.uCursorFloor, this._tunables.cursorFloor);
        gl.uniform1f(u.uEps, this._tunables.eps);
        gl.uniform2fv(u.uFalloff, packBorderFalloff(this._tunables.borderFalloff));

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        gl.drawArrays(gl.POINTS, 0, this._gridIndex.count);
    }

    setCursorLngLat(lng, lat) {
        this._cursorLng = lng;
        this._cursorLat = lat;
        if (this._map) this._map.triggerRepaint();
    }

    setTunables(patch) {
        if (!patch) return;
        if (Array.isArray(patch.rByZoom)) this._tunables.rByZoom = patch.rByZoom;
        if (Array.isArray(patch.borderFalloff)) this._tunables.borderFalloff = patch.borderFalloff;
        if (typeof patch.cursorFloor === 'number') this._tunables.cursorFloor = patch.cursorFloor;
        if (typeof patch.eps === 'number') this._tunables.eps = patch.eps;
        // haloScale accepts a number (constant multiplier) OR a
        // [[zoom, multiplier], ...] table for a zoom-aware curve.
        if (typeof patch.haloScale === 'number' || Array.isArray(patch.haloScale))
            this._tunables.haloScale = patch.haloScale;
        if (this._map) this._map.triggerRepaint();
    }

    _computePointSize() {
        const zoom = this._map.getZoom();
        const dotRadius = lerpStops(zoom, this._dotRadiusStops);
        const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
        const haloScale = Array.isArray(this._tunables.haloScale)
            ? lerpStops(zoom, this._tunables.haloScale)
            : this._tunables.haloScale;
        return dotRadius * 2 * haloScale * dpr;
    }
}
