// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Mapbox custom WebGL layer that paints a feathered alpha mask in the
 * theme's background color over the band just inside the globe
 * silhouette. Neutralizes the dark/bright rim ring caused by
 * viewport-aligned `grid-dots` circles compressing into a narrow
 * screen-space band near the limb under spherical foreshortening.
 *
 * Geometry: per-fragment ray-sphere test in ECEF (see
 * `limb-vignette-shaders.js`). The JS side just composes the matrices
 * Mapbox hands to a custom layer (`customLayerMatrix * globeToMercator`
 * gives ECEF → clip) and uploads the inverse. The fragment shader does
 * the silhouette test in world space, so the mask is geometrically
 * exact under any combination of zoom, pan, bearing, pitch, padding,
 * or future custom offsets — no screen-space radius approximation.
 *
 * Per `mapboxgl.CustomLayerInterface`:
 *   - `onAdd(map, gl)`  — compile program, look up uniforms, allocate
 *                         scratch matrix buffers. No VBO: the
 *                         fullscreen triangle is emitted from
 *                         gl_VertexID alone in the vertex shader.
 *   - `render(gl, ...)` — early-return in mercator mode, otherwise
 *                         compose ecefToClip, invert, upload uniforms,
 *                         and draw 3 vertices.
 *   - `onRemove(gl)`    — delete the program.
 *
 * Globe vs mercator dispatch matches `hover-glow-layer.js`: mapbox-gl
 * v3.11 passes `globeToMercator` only in globe mode, so its presence
 * is the projection check. Mercator has no rim artifact (Mercator
 * tiles don't compress in a circular band), so we draw nothing there.
 *
 * @module frontend/limb-vignette-layer
 */

import { VERTEX_SHADER_SRC, FRAGMENT_SHADER_SRC } from './limb-vignette-shaders.js';
import { mat4Multiply, mat4Invert } from './mat4.js';

/**
 * Mask band in normalized globe-radius units. `[0.94, 1.0]` puts the
 * mask peak (alpha=1) exactly on the silhouette, where viewport-aligned
 * `grid-dots` circles compress hardest under spherical foreshortening.
 * Inner 0→1 ramp spans 0.94→1.0; outer 1→0 falloff spans 1.0→1.08
 * (width fixed at 0.08 in the fragment shader, sized to absorb the
 * dot-sprite radius that overshoots the silhouette in screen space).
 *
 * Why a 0.06-wide inner ramp (and not wider): the inner ramp also
 * thins out the dots inside the globe. Earlier `[0.85, 1.0]` fully
 * removed the rim ring but washed too far inward — the spherical
 * curvature of the globe became invisible against the light-theme
 * background. `[0.94, 1.0]` is the smallest inner span that still
 * peaks at α=1 on the silhouette while leaving a visible dot ring
 * just inside it that reads as the globe's outline.
 *
 * The original default `[0.92, 1.04]` placed the peak at `dNorm=1.04`
 * (outside the silhouette), leaving alpha ≈ 0.74 at `dNorm=1.0` — not
 * enough to fully erase the rim ring, visible as a darker arc on the
 * light theme at 1080p+.
 */
const DEFAULT_BAND = [0.94, 1.0];

/**
 * Mapbox's ECEF coordinate space is scaled to GLOBE_RADIUS (not a
 * unit sphere). Mirror of `GLOBE_RADIUS = EXTENT / (2π)` from
 * src/geo/projection/globe_constants.ts (EXTENT = 8192) and the
 * matching constant in `hover-glow-layer.js`.
 */
const MAPBOX_GLOBE_RADIUS = 8192 / (2 * Math.PI);

function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`limb-vignette shader compile failed: ${info}`);
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
        throw new Error(`limb-vignette program link failed: ${info}`);
    }
    return program;
}

export class LimbVignetteLayer {
    constructor() {
        this.id = 'limb-vignette';
        this.type = 'custom';
        this.renderingMode = '2d';

        this._bgColor = new Float32Array([0, 0, 0]);
        this._band = DEFAULT_BAND.slice();

        this._gl = null;
        this._map = null;
        this._program = null;
        this._uniformLocs = null;

        // Scratch matrix buffers reused every frame to avoid GC churn.
        // Allocated lazily in onAdd.
        this._ecefToClip = null;
        this._clipToEcef = null;
    }

    onAdd(map, gl) {
        this._map = map;
        this._gl = gl;

        const vert = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
        const frag = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SRC);
        this._program = linkProgram(gl, vert, frag);
        gl.deleteShader(vert);
        gl.deleteShader(frag);

        this._uniformLocs = {
            uClipToEcef: gl.getUniformLocation(this._program, 'uClipToEcef'),
            uViewportPx: gl.getUniformLocation(this._program, 'uViewportPx'),
            uGlobeRadiusEcef: gl.getUniformLocation(this._program, 'uGlobeRadiusEcef'),
            uTransition: gl.getUniformLocation(this._program, 'uTransition'),
            uBand: gl.getUniformLocation(this._program, 'uBand'),
            uBgColor: gl.getUniformLocation(this._program, 'uBgColor'),
        };

        this._ecefToClip = new Float32Array(16);
        this._clipToEcef = new Float32Array(16);
    }

    onRemove(gl) {
        if (this._program) gl.deleteProgram(this._program);
        this._program = null;
    }

    /**
     * Mapbox passes (gl, customLayerMatrix) in mercator mode and
     * (gl, customLayerMatrix, projection, globeToMercatorMatrix,
     *  transition, [centerX, centerY], pixelsPerMeterRatio) in globe
     * mode. The presence of `globeToMercator` is the projection check;
     * we paint only in globe mode. The fragment shader additionally
     * fades the mask out via `(1 − transition)` across the
     * globe→mercator transition zone.
     */
    render(gl, customLayerMatrix, _projection, globeToMercator, transition) {
        if (!this._program) return;
        if (!globeToMercator) return;

        // ECEF → clip = customLayerMatrix · globeToMercator.
        // hover-glow's vertex shader applies `customLayerMatrix * (g2m * ecef)`
        // for globe samples, which is the same composition.
        mat4Multiply(this._ecefToClip, customLayerMatrix, globeToMercator);
        if (!mat4Invert(this._clipToEcef, this._ecefToClip)) return;

        const canvas = gl.canvas;

        gl.useProgram(this._program);
        const u = this._uniformLocs;
        gl.uniformMatrix4fv(u.uClipToEcef, false, this._clipToEcef);
        gl.uniform2f(u.uViewportPx, canvas.width, canvas.height);
        gl.uniform1f(u.uGlobeRadiusEcef, MAPBOX_GLOBE_RADIUS);
        gl.uniform1f(u.uTransition, transition || 0);
        gl.uniform2f(u.uBand, this._band[0], this._band[1]);
        gl.uniform3fv(u.uBgColor, this._bgColor);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    /**
     * Set the mask color (RGB, 0..1). Mutates `_bgColor` in place so the
     * Float32Array passed to `gl.uniform3fv` keeps the same identity
     * across frames. Triggers a repaint when the map is attached so the
     * change shows up on the next frame.
     *
     * @param {[number, number, number] | Float32Array} rgb
     */
    setBgColor(rgb) {
        if (!rgb || rgb.length < 3) return;
        this._bgColor[0] = rgb[0];
        this._bgColor[1] = rgb[1];
        this._bgColor[2] = rgb[2];
        if (this._map) this._map.triggerRepaint();
    }

    /**
     * Live-tune the mask band. Used by the DevTools `window.__lv.tune(...)`
     * surface for fine-tuning the inner/outer edges. Unrecognized fields
     * and malformed bands are silently ignored.
     *
     * @param {{ band?: [number, number] }} patch
     */
    setTunables(patch) {
        if (!patch) return;
        if (Array.isArray(patch.band) && patch.band.length === 2) {
            this._band = patch.band.slice();
        }
        if (this._map) this._map.triggerRepaint();
    }
}
