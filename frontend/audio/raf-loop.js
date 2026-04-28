// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Pure EMA driver for the geo-sonification rAF loop.
 *
 * Owns the four families of smoothed values that the audio engine
 * advances every frame:
 *
 *   - `busSmoothed[N]` — per-bus mix targets (linear gain pre-shaping)
 *   - `coverageSmoothed` — land vs ocean ramp control
 *   - `proximitySmoothed` — drives the master low-pass cutoff
 *   - `velocitySmoothed` — drives lpFilter1 Q (resonance peak)
 *
 * Stays free of `AudioContext`, `AudioParam`, and `requestAnimationFrame`
 * dependencies. The audio engine remains responsible for computing dt
 * each frame, calling `tickEma`, and writing the snapshot's smoothed
 * values to AudioParams. That separation is what makes this module
 * unit-testable against synthetic dt sequences.
 *
 * @module frontend/audio/raf-loop
 */

/**
 * @typedef {Object} EmaState
 * @property {Float64Array} busTargets       length === numBuses
 * @property {Float64Array} busSmoothed      length === numBuses
 * @property {number} coverageTarget         0..1, defaults to 1 (full land)
 * @property {number} coverageSmoothed
 * @property {number} proximityTarget        0..1
 * @property {number} proximitySmoothed
 * @property {number} velocityTarget         0..1
 * @property {number} velocitySmoothed
 */

/**
 * @typedef {Object} EmaTickOptions
 * @property {number} smoothingTimeMs       τ for buses + coverage
 * @property {number} proximitySmoothingMs  τ for proximity (faster — filter response)
 * @property {number} snapThresholdMs       dt outside [0, snapThresholdMs] → snap to target
 * @property {number} velocityAttackMs      τ when velocityTarget > velocitySmoothed
 * @property {number} velocityDecayMs       τ when velocityTarget ≤ velocitySmoothed
 */

/**
 * Initialize an EMA state. Defaults match the audio engine's pre-P3-3
 * module-level initial values: every field zeroed except `coverage*`
 * which starts at 1 (the engine's neutral "full land" default).
 *
 * @param {{ numBuses: number }} opts
 * @returns {EmaState}
 */
export function createEmaState({ numBuses }) {
    return {
        busTargets: new Float64Array(numBuses),
        busSmoothed: new Float64Array(numBuses),
        coverageTarget: 1,
        coverageSmoothed: 1,
        proximityTarget: 0,
        proximitySmoothed: 0,
        velocityTarget: 0,
        velocitySmoothed: 0,
    };
}

/**
 * Compute the EMA blend factor for the given dt and time constant.
 * `alpha = 1 - exp(-dt/τ)` for in-range dt, snap to 1.0 outside.
 */
function emaAlpha(dt, tauMs, snapThresholdMs) {
    if (dt <= 0 || dt > snapThresholdMs) return 1.0;
    return 1 - Math.exp(-dt / tauMs);
}

/**
 * Advance the EMA state by `dt` milliseconds. Mutates `state` in place
 * and returns the same object so callers can write
 * `const snap = tickEma(state, dt, opts);`.
 *
 * Branch behavior:
 * - `dt <= 0` or `dt > snapThresholdMs` → all alphas = 1.0 (smoothed snaps to target).
 *   Used both for the first frame after start (lastEmaTime = 0 → dt = 0) and
 *   the resume-from-hidden-tab case (dt is the page-hidden duration).
 * - Velocity uses asymmetric time constants: faster attack when target > smoothed,
 *   slower decay otherwise. Equal → decay (preserves prior engine behavior).
 *
 * @param {EmaState} state
 * @param {number} dt - milliseconds since previous tick
 * @param {EmaTickOptions} opts
 * @returns {EmaState}
 */
export function tickEma(state, dt, opts) {
    const {
        smoothingTimeMs,
        proximitySmoothingMs,
        snapThresholdMs,
        velocityAttackMs,
        velocityDecayMs,
    } = opts;

    const alpha = emaAlpha(dt, smoothingTimeMs, snapThresholdMs);
    const numBuses = state.busTargets.length;
    for (let i = 0; i < numBuses; i++) {
        state.busSmoothed[i] += alpha * (state.busTargets[i] - state.busSmoothed[i]);
    }
    state.coverageSmoothed += alpha * (state.coverageTarget - state.coverageSmoothed);

    const proxAlpha = emaAlpha(dt, proximitySmoothingMs, snapThresholdMs);
    state.proximitySmoothed += proxAlpha * (state.proximityTarget - state.proximitySmoothed);

    const velTau =
        state.velocityTarget > state.velocitySmoothed ? velocityAttackMs : velocityDecayMs;
    const velAlpha = emaAlpha(dt, velTau, snapThresholdMs);
    state.velocitySmoothed += velAlpha * (state.velocityTarget - state.velocitySmoothed);

    return state;
}

/**
 * Equalize smoothed values to their targets — used on visibilitychange
 * "visible" so the user doesn't hear a long ramp from stale values when
 * the tab returns. Velocity is special-cased to 0 (the engine treats
 * velocity as drag-derived; snapping to its current target on resume
 * would produce a fake drag spike).
 *
 * @param {EmaState} state
 */
export function snapEmaToTargets(state) {
    const numBuses = state.busTargets.length;
    for (let i = 0; i < numBuses; i++) {
        state.busSmoothed[i] = state.busTargets[i];
    }
    state.coverageSmoothed = state.coverageTarget;
    state.proximitySmoothed = state.proximityTarget;
    state.velocitySmoothed = 0;
}

/**
 * Test whether every smoothed value is within `threshold` of its target.
 * Used by the audio engine's rAF callback (M4 P5-1) to suspend the loop
 * after EMA convergence — a tick that produces no observable change is
 * pure overhead, so we skip it and re-arm rAF only when a target moves
 * (or when buffers finish loading and the gain writes finally have
 * something to flow into — see engine.js `start()`).
 *
 * Uniform threshold across all four EMAs (buses, coverage, proximity,
 * velocity). The proposal's "velocity = 0" wording maps to the same
 * `|smoothed - target| < threshold` check, since the engine sets
 * `velocityTarget = 0` whenever the user stops dragging.
 *
 * @param {EmaState} state
 * @param {number} threshold - max |smoothed - target| per channel
 * @returns {boolean}
 */
export function isEmaIdle(state, threshold) {
    const numBuses = state.busTargets.length;
    for (let i = 0; i < numBuses; i++) {
        if (Math.abs(state.busSmoothed[i] - state.busTargets[i]) > threshold) return false;
    }
    if (Math.abs(state.coverageSmoothed - state.coverageTarget) > threshold) return false;
    if (Math.abs(state.proximitySmoothed - state.proximityTarget) > threshold) return false;
    if (Math.abs(state.velocitySmoothed - state.velocityTarget) > threshold) return false;
    return true;
}

/**
 * Zero out targets and smoothed values, with coverage held at 1.
 * Called at engine start() before the pendingParams replay so an old
 * session's state can't bleed into the new one (e.g. water bus loud →
 * stop → navigate to desert → start would otherwise leave busSmoothed
 * stuck high until the next viewport push).
 *
 * @param {EmaState} state
 */
export function resetEma(state) {
    state.busTargets.fill(0);
    state.busSmoothed.fill(0);
    state.coverageTarget = 1;
    state.coverageSmoothed = 1;
    state.proximityTarget = 0;
    state.proximitySmoothed = 0;
    state.velocityTarget = 0;
    state.velocitySmoothed = 0;
}
