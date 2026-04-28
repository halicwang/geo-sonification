// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Audio subsystem constants — timing taus, per-bus preamp gain table,
 * limiter coefficients. The remaining engine-resident constants
 * (filter Q, curve params, ducking, makeup gain) live inline in
 * `frontend/audio/engine.js`.
 *
 * @module frontend/audio/constants
 */

// ─── Timing constants ────────────────────────────────────────────────

/** EMA time constant in ms (bus gains and coverage). */
export const SMOOTHING_TIME_MS = 500;

/** Faster EMA time constant for the low-pass filter proximity signal. */
export const PROXIMITY_SMOOTHING_MS = 120;

/** If dt exceeds this, snap to target instead of smoothing. */
export const SNAP_THRESHOLD_MS = 2000;

/** Velocity EMA attack (fast rise when dragging starts). */
export const VELOCITY_ATTACK_MS = 50;

/** Velocity EMA decay (slow fade when dragging stops). */
export const VELOCITY_DECAY_MS = 600;

/** Crossfade overlap between outgoing and incoming loop voices. */
export const LOOP_OVERLAP_SECONDS = 1.875;

/** Initial source scheduling lookahead. */
export const LOOP_START_LOOKAHEAD_SECONDS = 0.05;

/** How early to wake JS before the next swap boundary. */
export const LOOP_TIMER_LOOKAHEAD_SECONDS = 0.1;

/** Small buffer to avoid stop()/ramp edge clicks at swap boundary. */
export const VOICE_STOP_GRACE_SECONDS = 0.01;

/** Tiny lookahead used only when a swap callback wakes up late. */
export const LATE_SWAP_LOOKAHEAD_SECONDS = 0.005;

/** Fade duration used by the recovery path when overlap window was missed. */
export const RECOVERY_FADE_SECONDS = 0.02;

/** Warn when swap callback lateness exceeds this threshold. */
export const SWAP_LATE_WARN_SECONDS = 0.025;

// ─── Per-bus preamp gain ─────────────────────────────────────────────

/**
 * Per-bus preamp (linear gain), multiplied into the rafLoop's per-bus
 * gain assignment before it reaches the corresponding GainNode. Used
 * to correct source-level loudness imbalance without re-authoring the
 * WAVs. Values come from scripts/measure-loudness.js — most files
 * cluster around -31 to -33 LUFS integrated, but urban.wav runs ~6 LU
 * hotter and peaks ~15 dB above the others (-6.6 dBTP vs -21 dBTP).
 * At MAKEUP_GAIN_DB = 12, an un-attenuated urban would peak at
 * ~+5.4 dBTP and pin the limiter. Scaling urban by ~-10 dB keeps
 * its post-makeup peak below the limiter threshold. Bus order
 * matches BUS_NAMES.
 */
export const BUS_PREAMP_GAIN = Object.freeze([
    1.0, // 0 forest
    1.0, // 1 shrub
    1.0, // 2 grass
    1.0, // 3 crop
    0.316, // 4 urban — -10 dB to avoid limiter at MAKEUP_GAIN_DB = 12
    1.0, // 5 bare
    1.0, // 6 water
]);

// ─── Limiter knobs ───────────────────────────────────────────────────

/**
 * Soft peak limiter settings. -3 dB threshold + 20:1 ratio catches
 * transient peaks from the summed bus mix, keeping true peak below
 * -1 dBTP on ambient content. Web Audio's DynamicsCompressorNode has
 * ~6 ms lookahead — sufficient for non-percussive sources.
 */
export const LIMITER_THRESHOLD_DB = -3;
export const LIMITER_RATIO = 20;
export const LIMITER_ATTACK_SEC = 0.003;
export const LIMITER_RELEASE_SEC = 0.25;
export const LIMITER_KNEE_DB = 0;
