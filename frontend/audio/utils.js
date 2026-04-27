// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Pure utility functions used inside the audio subsystem.
 *
 * `clamp01` is the [0, 1] specialization used everywhere in the audio
 * path (gain values, normalized parameters). The generic `clamp(min,
 * max, x)` lives in frontend/utils.js (P2-1) for non-audio code.
 *
 * `equalPowerCurves` builds the sin/cos crossfade curves used by
 * Web Audio's setValueCurveAtTime. Equal-power curves keep the
 * perceived loudness flat across the swap window — a pair of linear
 * curves would dip ~3 dB at the midpoint.
 *
 * `dbToLinear` is the standard 20·log10 inverse used to convert
 * decibels (the unit humans reason about) into the linear gain
 * multiplier that GainNodes consume.
 *
 * `lerp` is a plain linear interpolation, used by the EMA driver
 * landing in P3-3.
 *
 * @module frontend/audio/utils
 */

/**
 * Clamp a value to [0, 1]. NaN / non-finite → 0.
 * @param {number} v
 * @returns {number}
 */
export function clamp01(v) {
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(1, v));
}

/**
 * Linear interpolation between `a` and `b` by fraction `t`.
 * `t` is not clamped — the caller is responsible.
 * @param {number} a
 * @param {number} b
 * @param {number} t
 * @returns {number}
 */
export function lerp(a, b, t) {
    return a + (b - a) * t;
}

/**
 * Convert a decibel value to a linear gain multiplier.
 * `dbToLinear(0) === 1`, `dbToLinear(-6) ≈ 0.501`, `dbToLinear(12) ≈ 3.981`.
 * @param {number} db
 * @returns {number}
 */
export function dbToLinear(db) {
    return Math.pow(10, db / 20);
}

/**
 * Build a pair of equal-power crossfade curves (sin / cos quarter-wave)
 * with `points` samples each. Used by the loop-swap path to feed
 * `gain.setValueCurveAtTime(curve, t, duration)` so two voices
 * crossfade with constant total power.
 *
 * @param {number} points - Number of samples in each curve (>= 2).
 * @returns {{ fadeIn: Float32Array, fadeOut: Float32Array }}
 */
export function equalPowerCurves(points) {
    const fadeIn = new Float32Array(points);
    const fadeOut = new Float32Array(points);
    for (let i = 0; i < points; i++) {
        const t = i / (points - 1);
        const theta = t * (Math.PI / 2);
        fadeIn[i] = Math.sin(theta);
        fadeOut[i] = Math.cos(theta);
    }
    return { fadeIn, fadeOut };
}
