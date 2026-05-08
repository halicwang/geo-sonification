// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * GLSL ES 3.00 shaders for the limb-vignette custom WebGL layer.
 *
 * Approach: per-fragment ray-sphere silhouette test in ECEF.
 *
 * The vertex shader emits a fullscreen triangle from gl_VertexID alone.
 * The fragment shader reconstructs each fragment's world-space camera
 * ray (via the inverse view-projection matrix from clip to ECEF), then
 * computes the perpendicular distance from the globe center (ECEF
 * origin) to that ray. Normalized by the ECEF globe radius this gives
 * `dNorm`: <1 inside the silhouette, =1 on it, >1 outside. The same
 * smoothstep band used by the previous screen-space approximation
 * applies unchanged.
 *
 * Why ray-sphere instead of a JS-side screen radius: the previous
 * implementation projected a meridian point 90 degrees from the map
 * center and used that pixel distance as the radius. That's correct
 * only for orthographic projection of a sphere centered on screen.
 * Mapbox uses perspective projection, so the visible silhouette
 * projects to a larger pixel distance than the 90-degree sample
 * (factor 1/sqrt(1-r^2) where r = R/D_camera) — and any future bearing,
 * pitch, padding, or animation offset would skew the meridian sample
 * geometrically. The ray-sphere test is geometrically exact under any
 * camera state because the sphere's silhouette test does not depend on
 * a screen-space center or radius.
 *
 * Coordinates: `uClipToEcef` maps NDC (`gl_FragCoord` -> NDC via
 * `uViewportPx`) back to ECEF. ECEF here uses Mapbox's GLOBE_RADIUS
 * scaling: globe centered at origin with radius `EXTENT/(2π) ≈ 1303.8`.
 *
 * @module frontend/limb-vignette-shaders
 */

/**
 * Fullscreen triangle. Emits NDC (-1, -1), (3, -1), (-1, 3) — a single
 * oversized triangle that exactly covers the [-1, 1]^2 viewport with no
 * diagonal seam. Cheaper than a quad and standard for screen-space
 * passes.
 */
export const VERTEX_SHADER_SRC = `#version 300 es
precision highp float;

void main() {
    vec2 pos = vec2(
        (gl_VertexID == 1) ? 3.0 : -1.0,
        (gl_VertexID == 2) ? 3.0 : -1.0
    );
    gl_Position = vec4(pos, 0.0, 1.0);
}
`;

/**
 * Per-fragment ray-sphere silhouette test.
 *
 * For each fragment:
 *   1. Convert `gl_FragCoord.xy` to NDC via `uViewportPx`.
 *   2. Reproject NDC near (z=-1) and far (z=+1) through `uClipToEcef`
 *      and homogeneous-divide to get two ECEF points along the
 *      camera ray.
 *   3. `rayOrigin` is the near point; `rayDir` is the normalized
 *      direction from near to far.
 *   4. The perpendicular from the globe center (origin) to the ray
 *      has length `|O - (O·D)D|`. Normalized by the ECEF globe
 *      radius this is `dNorm`.
 *
 * Mask band shape:
 *   inner edge (uBand.x → uBand.y): smoothstep 0 → 1.
 *   outer edge (uBand.y → uBand.y + uOuterFade): smoothstep 1 → 0.
 *
 * `uBand.y` should be `1.0` so peak alpha lands on the silhouette,
 * where grid-dot density compresses hardest. `uOuterFade` is the
 * width of the silhouette-outside falloff. The default (~0.02) gives
 * ~3–6× margin over the dot-sprite overshoot at globe-mode zoom levels
 * (each viewport-aligned circle extends ~`circle-radius` px past the
 * silhouette in screen space; at z<5 with the on-screen globe radius
 * in the hundreds-to-thousands of px, the overshoot in normalized
 * globe-radius units stays well under 0.005). Wider pads blur the
 * silhouette boundary into the canvas background without absorbing
 * any additional sprite area; live-tunable via
 * `__lv.tune({ outerFade: x })`.
 *
 * `(1.0 − uTransition)` fades the mask out over the globe→mercator
 * transition (z ∈ [5, 6]) where the geometry stops being a sphere.
 * Pure mercator (z ≥ 6) skips this layer entirely from the JS side.
 *
 * Output is premultiplied (`vec4(uBgColor * a, a)`) to pair with
 * Mapbox's standard custom-layer blendFunc (ONE, ONE_MINUS_SRC_ALPHA).
 */
export const FRAGMENT_SHADER_SRC = `#version 300 es
precision highp float;

uniform mat4 uClipToEcef;
uniform vec2 uViewportPx;
uniform float uGlobeRadiusEcef;
uniform float uTransition;
uniform vec2 uBand;
uniform float uOuterFade;
uniform vec3 uBgColor;

out vec4 fragColor;

void main() {
    vec2 ndc = (gl_FragCoord.xy / uViewportPx) * 2.0 - 1.0;
    vec4 nearH = uClipToEcef * vec4(ndc, -1.0, 1.0);
    vec4 farH = uClipToEcef * vec4(ndc, 1.0, 1.0);
    vec3 rayOrigin = nearH.xyz / nearH.w;
    vec3 rayDir = normalize(farH.xyz / farH.w - rayOrigin);

    vec3 perp = rayOrigin - dot(rayOrigin, rayDir) * rayDir;
    float dNorm = length(perp) / uGlobeRadiusEcef;

    float aIn = smoothstep(uBand.x, uBand.y, dNorm);
    float aOut = 1.0 - smoothstep(uBand.y, uBand.y + uOuterFade, dNorm);
    float a = aIn * aOut * (1.0 - uTransition);
    if (a < 0.001) discard;
    fragColor = vec4(uBgColor * a, a);
}
`;
