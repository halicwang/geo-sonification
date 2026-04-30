// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * GLSL ES 3.00 shaders for the hover-glow custom WebGL layer.
 *
 * Skeleton stage (this commit):
 *   - Vertex shader projects (lng, lat) → mercator/globe → clip via
 *     mix(mercatorPos, ecefViaG2M, uTransition). Both projections are
 *     handled by a single program (mapbox-gl v3.11 dispatches the
 *     globe-mode args via positional params 4-5 of render()).
 *   - Fragment shader is a `discard` placeholder. The next commit
 *     replaces it with the full glow math (cursorFactor × min(1,
 *     borderFactor + cursorFloor)).
 *
 * The shader source lives here, separate from the JS GL plumbing in
 * hover-glow-layer.js, so prettier doesn't have to chew on multi-line
 * GLSL strings inside class bodies.
 *
 * @module frontend/hover-glow-shaders
 */

/**
 * Number of stops the fragment shader's `borderFactor` lookup table
 * accommodates. Bump this constant + the for-loop bound in the
 * fragment shader's borderFactor() if you want a finer Hermite curve.
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
    vec4 mercatorPos = vec4(aMerc, 0.0, 1.0);
    vec4 globeAsMerc = uGlobeToMercator * vec4(aEcef, 1.0);
    vec4 worldPos = mix(mercatorPos, globeAsMerc, uTransition);
    gl_Position = uMatrix * worldPos;
    gl_PointSize = uPointSize;
    vLngLat = aLngLat;
    vBorderDist = aBorderDist;
}
`;

/**
 * Skeleton fragment shader: discard every fragment. The layer is
 * registered and the GL pipeline runs end-to-end, but nothing is drawn.
 * Keeps the existing CPU hover-glow path solely responsible for the
 * visible glow until the next commit lands the math.
 */
export const FRAGMENT_SHADER_SRC = `#version 300 es
precision highp float;

in vec2 vLngLat;
in float vBorderDist;

out vec4 fragColor;

void main() {
    fragColor = vec4(0.0);
    discard;
}
`;

/**
 * Pad / truncate a {distKm, factor}[] table to exactly
 * MAX_FALLOFF_STOPS stops, packed as a Float32Array of length
 * 2 × MAX_FALLOFF_STOPS for `gl.uniform2fv`. Stops are interleaved:
 * [x0, y0, x1, y1, …]. Padding repeats the last stop, which is safe
 * because the shader's borderFactor() returns the last stop's factor
 * for any d ≥ last.x.
 *
 * Truncation drops trailing stops past MAX_FALLOFF_STOPS — caller is
 * expected to provide tables shaped for the runtime cap. (The default
 * `HOVER_GLOW_BORDER_FALLOFF` has exactly 4 stops.)
 *
 * @param {Array<[number, number]>} stops
 * @returns {Float32Array} length = 2 × MAX_FALLOFF_STOPS
 */
export function packBorderFalloff(stops) {
    const out = new Float32Array(MAX_FALLOFF_STOPS * 2);
    if (!Array.isArray(stops) || stops.length === 0) {
        // Degenerate input → "any d returns 0". Pack monotone-x, y=0.
        for (let i = 0; i < MAX_FALLOFF_STOPS; i++) {
            out[i * 2] = i;
            out[i * 2 + 1] = 0;
        }
        return out;
    }
    const n = Math.min(stops.length, MAX_FALLOFF_STOPS);
    for (let i = 0; i < n; i++) {
        out[i * 2] = stops[i][0];
        out[i * 2 + 1] = stops[i][1];
    }
    for (let i = n; i < MAX_FALLOFF_STOPS; i++) {
        out[i * 2] = stops[n - 1][0];
        out[i * 2 + 1] = stops[n - 1][1];
    }
    return out;
}
