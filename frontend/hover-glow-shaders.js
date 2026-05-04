// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * GLSL ES 3.00 shaders for the hover-glow custom WebGL layer.
 *
 * Vertex shader projects (lng, lat) → mercator/globe → clip via
 * mix(mercatorPos, ecefViaG2M, uTransition). Both projections are
 * handled by a single program (mapbox-gl v3.11 dispatches the
 * globe-mode args via positional params 4-5 of render()). Fragment
 * shader paints the glow (cursorFactor × min(1, borderFactor +
 * cursorFloor)) as a `uHaloColor`-tinted disc — white in dark theme
 * (high contrast against the black canvas) and black in light theme
 * (high contrast against the near-white canvas).
 *
 * The shader source lives here, separate from the JS GL plumbing in
 * hover-glow-layer.js, so prettier doesn't have to chew on multi-line
 * GLSL strings inside class bodies.
 *
 * @module frontend/hover-glow-shaders
 */

/**
 * Number of stops the fragment shader's `borderFactor` lookup table
 * accommodates. To grow the cap you must touch three coupled spots
 * together — they are NOT cross-checked at runtime:
 *
 *   1. This constant
 *   2. `uniform vec2 uFalloff[N]` in FRAGMENT_SHADER_SRC
 *   3. The `for (int i = 0; i < N - 1; i++)` bound inside
 *      borderFactor() of FRAGMENT_SHADER_SRC
 *
 * `packBorderFalloff` throws if a caller passes more than
 * MAX_FALLOFF_STOPS stops, so silent curve mutation can't happen.
 */
export const MAX_FALLOFF_STOPS = 4;

/**
 * Vertex shader. Mercator-vs-globe handled by a single mix() between
 * an "always mercator world" path and a "globe ECEF transformed by
 * Mapbox's globeToMercatorMatrix" path. In pure mercator mode JS
 * passes uTransition=0 + uGlobeToMercator=identity, zeroing the globe
 * branch. In globe mode JS passes uTransition=globeToMercatorTransition,
 * uGlobeToMercator=Mapbox's matrix.
 */
export const VERTEX_SHADER_SRC = `#version 300 es
precision highp float;

in vec2 aLngLat;
in vec2 aMerc;
in vec3 aEcef;
in float aBorderDist;

uniform mat4 uMatrix;
uniform mat4 uGlobeToMercator;
uniform float uTransition;
uniform float uPointSize;

out vec2 vLngLat;
out float vBorderDist;

void main() {
    // uTransition follows Mapbox's globeToMercatorTransition(zoom):
    // 0 in pure globe mode (zoom < 5), 1 in pure mercator (zoom > 6),
    // smooth ramp in between. So at t=0 the vertex must be the
    // globe-via-G2M position; at t=1 it's the mercator world position.
    vec4 mercatorPos = vec4(aMerc, 0.0, 1.0);
    vec4 globeAsMerc = uGlobeToMercator * vec4(aEcef, 1.0);
    vec4 worldPos = mix(globeAsMerc, mercatorPos, uTransition);
    gl_Position = uMatrix * worldPos;
    gl_PointSize = uPointSize;
    vLngLat = aLngLat;
    vBorderDist = aBorderDist;
}
`;

/**
 * Fragment shader: paints a halo at every cell whose
 * (cursorFactor × min(1, borderFactor + cursorFloor)) glow exceeds
 * uEps, with a soft round disc shape via gl_PointCoord.
 *
 * Curve definitions:
 *   - distKmToCursor: equirectangular, antimeridian-safe (dLon ±360 wrap).
 *   - cursorFactor:   smoothstep falloff t² × (3 - 2t) over [0, R].
 *   - borderFactor:   piecewise Hermite over MAX_FALLOFF_STOPS stops.
 *   - glow:           cf × min(1, bf + cursorFloor).
 *
 * Output uses premultiplied alpha (vec4(uHaloColor * a, a)) so Mapbox's
 * default custom-layer blendFunc (ONE, ONE_MINUS_SRC_ALPHA) lays the
 * tinted halo over whatever the grid-dots circle layer painted
 * underneath. uHaloColor = (1, 1, 1) reproduces the original white-on-dark
 * additive look; (0, 0, 0) inverts it to a darkening halo for the light
 * theme. JS pushes the value via `gl.uniform3fv` per-frame.
 */
export const FRAGMENT_SHADER_SRC = `#version 300 es
precision highp float;

in vec2 vLngLat;
in float vBorderDist;

uniform vec2 uCursorLngLat;
uniform float uR;
uniform float uCursorFloor;
uniform float uEps;
uniform vec2 uFalloff[4];
uniform vec3 uHaloColor;

out vec4 fragColor;

const float DEG_TO_RAD = 0.01745329251994329;
const float EARTH_KM = 6371.0;

float distKmToCursor(vec2 cursor, vec2 cell) {
    float dLon = cell.x - cursor.x;
    if (dLon > 180.0) dLon -= 360.0;
    else if (dLon < -180.0) dLon += 360.0;
    float cosLat = cos((cursor.y + cell.y) * 0.5 * DEG_TO_RAD);
    float x = dLon * DEG_TO_RAD * cosLat;
    float y = (cell.y - cursor.y) * DEG_TO_RAD;
    return EARTH_KM * sqrt(x * x + y * y);
}

float cursorFactor(float d, float R) {
    float t = clamp(1.0 - d / R, 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
}

float borderFactor(float d) {
    if (d <= uFalloff[0].x) return uFalloff[0].y;
    for (int i = 0; i < 3; i++) {
        float xLo = uFalloff[i].x;
        float xHi = uFalloff[i + 1].x;
        if (d >= xLo && d < xHi) {
            float t = (d - xLo) / (xHi - xLo);
            float s = t * t * (3.0 - 2.0 * t);
            return mix(uFalloff[i].y, uFalloff[i + 1].y, s);
        }
    }
    return uFalloff[3].y;
}

void main() {
    float d = distKmToCursor(uCursorLngLat, vLngLat);
    float cf = cursorFactor(d, uR);
    if (cf < uEps) discard;

    float bf = borderFactor(vBorderDist);
    float g = cf * min(1.0, bf + uCursorFloor);
    if (g < uEps) discard;

    vec2 q = gl_PointCoord - vec2(0.5);
    float rad = length(q) * 2.0;
    float discMask = smoothstep(1.0, 0.6, rad);
    float a = g * discMask;

    fragColor = vec4(uHaloColor * a, a);
}
`;

/**
 * Pad a {distKm, factor}[] table out to exactly MAX_FALLOFF_STOPS
 * stops, packed as a Float32Array of length 2 × MAX_FALLOFF_STOPS for
 * `gl.uniform2fv`. Stops are interleaved: [x0, y0, x1, y1, …].
 * Padding repeats the last stop, which is safe because the shader's
 * borderFactor() returns the last stop's factor for any d ≥ last.x.
 *
 * Throws on tables longer than MAX_FALLOFF_STOPS — silently truncating
 * would change the curve shape with no signal. To grow the cap, bump
 * `MAX_FALLOFF_STOPS`, the `uniform vec2 uFalloff[N]` size in
 * FRAGMENT_SHADER_SRC, and the for-loop bound inside borderFactor().
 *
 * @param {Array<[number, number]>} stops  length 1..MAX_FALLOFF_STOPS
 * @returns {Float32Array} length = 2 × MAX_FALLOFF_STOPS
 */
export function packBorderFalloff(stops) {
    if (stops.length > MAX_FALLOFF_STOPS) {
        throw new Error(
            `packBorderFalloff: ${stops.length} stops exceed cap MAX_FALLOFF_STOPS=${MAX_FALLOFF_STOPS}; bump the cap, the uFalloff[] size in FRAGMENT_SHADER_SRC, and borderFactor()'s for-loop bound`
        );
    }
    const out = new Float32Array(MAX_FALLOFF_STOPS * 2);
    for (let i = 0; i < stops.length; i++) {
        out[i * 2] = stops[i][0];
        out[i * 2 + 1] = stops[i][1];
    }
    const lastX = stops[stops.length - 1][0];
    const lastY = stops[stops.length - 1][1];
    for (let i = stops.length; i < MAX_FALLOFF_STOPS; i++) {
        out[i * 2] = lastX;
        out[i * 2 + 1] = lastY;
    }
    return out;
}
