// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Geo-Sonification — Web Audio engine.
 *
 * Seven-bus ambient crossfade with coverage-linear ocean detection.
 * Receives server-computed bus targets via engine.update(audioParams).
 * Applies EMA smoothing and writes to GainNodes via requestAnimationFrame.
 *
 * Loop playback model:
 *   - Each bus uses double-buffered voices (A/B) instead of loop=true
 *   - At cycle boundary (buffer duration - overlap), next voice starts at 0s
 *   - Outgoing voice fades out while incoming fades in over overlap window
 *
 * AudioContext lifecycle:
 *   - start() creates context + starts loop graph (if buffers ready)
 *   - stop() suspends context and clears loop graph
 *   - visibilitychange: suspend on hidden, resume+snap on visible
 *
 * No icon triggers — sample folders are empty (YAGNI).
 *
 * @module frontend/audio-engine
 */

import { ASSET_BASE, getLoudnessNormEnabled } from '../config.js';
import { clamp01, equalPowerCurves } from './utils.js';
import { createMasterChain } from './context.js';
import { createBufferCache } from './buffer-cache.js';
import { createEmaState, tickEma, snapEmaToTargets, resetEma, isEmaIdle } from './raf-loop.js';
import {
    SMOOTHING_TIME_MS,
    PROXIMITY_SMOOTHING_MS,
    SNAP_THRESHOLD_MS,
    VELOCITY_ATTACK_MS,
    VELOCITY_DECAY_MS,
    LOOP_OVERLAP_SECONDS,
    LOOP_START_LOOKAHEAD_SECONDS,
    LOOP_TIMER_LOOKAHEAD_SECONDS,
    VOICE_STOP_GRACE_SECONDS,
    LATE_SWAP_LOOKAHEAD_SECONDS,
    RECOVERY_FADE_SECONDS,
    SWAP_LATE_WARN_SECONDS,
    BUS_PREAMP_GAIN,
    LIMITER_THRESHOLD_DB,
    LIMITER_RATIO,
    LIMITER_ATTACK_SEC,
    LIMITER_RELEASE_SEC,
    LIMITER_KNEE_DB,
} from './constants.js';

// ════════════════════════════════════════════════════════════════════
//  Constants (remaining; the rest moved to ./audio/constants.js)
// ════════════════════════════════════════════════════════════════════

const NUM_BUSES = 7;
const WATER_BUS_INDEX = 6;
const LAND_FULL_COVERAGE_THRESHOLD = 0.4;

/** lpFilter1 Q range: Butterworth base → resonant peak at max velocity. */
const BASE_Q1 = 0.5176;
const MAX_Q1 = 4.0;

/** Resolution of equal-power fade curves. */
const XF_CURVE_POINTS = 128;

/** Exponent for gain power-curve shaping. Values < 1.0 stretch mid-high range differences. */
const GAIN_CURVE_EXPONENT = 0.6;

/**
 * Master makeup gain in dB, calibrated by scripts/measure-loudness.js
 * against a -16 LUFS target. Applied post-masterGain (i.e. after the
 * user's volume slider) and pre-limiter, so per-bus mix math stays
 * untouched while the average summed output is pulled toward target.
 */
const MAKEUP_GAIN_DB = 12;

/**
 * Sidechain-style ducking applied to the ambience chain while the
 * city-announcer speaks. Linear gain (0.3 ≈ -10.5 dB); announcer TTS
 * plays at masterVolume * TTS_GAIN_RATIO (0.3), so a ~-10 dB duck on
 * ambience leaves the TTS clearly audible above the environment.
 * Attack / release time constants chosen for broadcast voice-over
 * feel: fast enough to get out of the way on the first syllable,
 * gentle enough on the release that ambience doesn't snap back.
 */
const DUCK_DEPTH = 0.3;
const DUCK_ATTACK_TC = 0.05;
const DUCK_RELEASE_TC = 0.15;

// ════════════════════════════════════════════════════════════════════
//  State
// ════════════════════════════════════════════════════════════════════

/** @type {AudioContext|null} */
let audioCtx = null;

/** @type {GainNode[]} */
const gains = new Array(NUM_BUSES).fill(null);

/** @type {GainNode|null} */
let masterGain = null;

/** User-controlled master volume multiplier (0.0–1.0). */
let masterVolume = 1.0;

/**
 * Three cascaded lowpass BiquadFilterNodes → 36 dB/oct slope.
 * Inserted between masterGain and audioCtx.destination.
 * @type {BiquadFilterNode|null}
 */
let lpFilter1 = null;
let lpFilter2 = null;
let lpFilter3 = null;

/**
 * Static gain node inserted between masterGain and the rest of the
 * ambience chain; modulated by duck() / unduck() while the
 * city-announcer speaks so TTS sits clearly above ambience.
 * @type {GainNode|null}
 */
let duckGain = null;

/**
 * @typedef {Object} LoopSlot
 * @property {AudioBufferSourceNode|null} source
 * @property {GainNode|null} gain
 */

/**
 * @typedef {Object} BusLoopState
 * @property {LoopSlot[]} slots
 * @property {0|1} activeSlot
 */

/** @returns {LoopSlot} */
function createEmptyLoopSlot() {
    return { source: null, gain: null };
}

/** @type {BusLoopState[]} */
const busLoops = Array.from({ length: NUM_BUSES }, () => ({
    slots: [createEmptyLoopSlot(), createEmptyLoopSlot()],
    activeSlot: 0,
}));

/** Global loop cycle = min(buffer duration) - overlap. */
let loopCycleSeconds = 0;

/** Absolute AudioContext time for next global swap event. */
let nextGlobalSwapTime = 0;

/** AudioContext time anchor for the first voice start (used for drift-free scheduling). */
let loopClockOrigin = 0;

/** Number of completed swap cycles since loopClockOrigin. */
let loopCycleCount = 0;

/** @type {number|null} */
let globalSwapTimerId = null;

// ── EMA state ──
// Targets / smoothed values for buses, coverage, proximity, velocity.
// Mutated directly by update() / updateMotion() (target writes) and by
// tickEma() inside rafLoop() (smoothed advances).
const ema = createEmaState({ numBuses: NUM_BUSES });
const EMA_TICK_OPTS = Object.freeze({
    smoothingTimeMs: SMOOTHING_TIME_MS,
    proximitySmoothingMs: PROXIMITY_SMOOTHING_MS,
    snapThresholdMs: SNAP_THRESHOLD_MS,
    velocityAttackMs: VELOCITY_ATTACK_MS,
    velocityDecayMs: VELOCITY_DECAY_MS,
});

/**
 * Per-channel `|smoothed - target|` tolerance below which a tick is treated
 * as fully converged. The rAF callback suspends itself when every EMA
 * channel is under this threshold (M4 P5-1; M3 audit B.6 fix). Wakes via
 * `update()` / `updateMotion()` re-arm `requestAnimationFrame`.
 */
const IDLE_THRESHOLD = 0.001;

// ── Timing ──
let lastEmaTime = 0;
let rafId = null;
let suspended = false;

// ── Pending params (received before AudioContext exists) ──

/**
 * Stashed audioParams from the last engine.update() call that arrived
 * before AudioContext was created. Replayed once inside start() so that
 * gains are already at the correct level when voices begin playback.
 * @type {Object|null}
 */
let pendingParams = null;

// ── Buffer cache ──
//
// Tree and water first (most common biomes), then crop / urban / bare /
// the two grasslands as a parallel second wave. Same priority order as
// the pre-P3-2 PRIORITY_FIRST / PRIORITY_SECOND constants.
const bufferCache = createBufferCache({
    busNames: ['forest', 'shrub', 'grass', 'crop', 'urban', 'bare', 'water'],
    assetBase: ASSET_BASE,
    priorityFirst: [0, 6],
    prioritySecond: [1, 2, 3, 4, 5],
    onAllLoaded: () => startAllSources(),
});

// Equal-power crossfade curves reduce perceived loudness dip at midpoint.
const { fadeIn: FADE_IN_CURVE, fadeOut: FADE_OUT_CURVE } = equalPowerCurves(XF_CURVE_POINTS);

// ════════════════════════════════════════════════════════════════════
//  Helpers
// ════════════════════════════════════════════════════════════════════

/** @param {AudioBufferSourceNode|null} source @param {GainNode|null} gain */
function disconnectVoice(source, gain) {
    if (source) {
        try {
            source.disconnect();
        } catch {
            // noop
        }
    }
    if (gain) {
        try {
            gain.disconnect();
        } catch {
            // noop
        }
    }
}

/** @param {LoopSlot} slot */
function stopSlotImmediately(slot) {
    const source = slot.source;
    const gain = slot.gain;

    slot.source = null;
    slot.gain = null;

    if (source) {
        source.onended = null;
        try {
            source.stop();
        } catch {
            // noop
        }
    }

    disconnectVoice(source, gain);
}

function clearGlobalSwapTimer() {
    if (globalSwapTimerId !== null) {
        clearTimeout(globalSwapTimerId);
        globalSwapTimerId = null;
    }
}

function clearLoopClockState() {
    loopCycleSeconds = 0;
    nextGlobalSwapTime = 0;
    loopClockOrigin = 0;
    loopCycleCount = 0;
    clearGlobalSwapTimer();
}

/** @param {number} busIndex */
function resetBusLoop(busIndex) {
    const state = busLoops[busIndex];
    stopSlotImmediately(state.slots[0]);
    stopSlotImmediately(state.slots[1]);
    state.slots[0] = createEmptyLoopSlot();
    state.slots[1] = createEmptyLoopSlot();
    state.activeSlot = 0;
}

function resetAllBusLoops() {
    for (let i = 0; i < NUM_BUSES; i++) {
        resetBusLoop(i);
    }
}

/**
 * Create one one-shot voice for the given bus at an absolute start time.
 * @param {number} busIndex
 * @param {number} startTime
 * @param {number} [offsetSeconds=0]
 * @returns {LoopSlot|null}
 */
function createVoice(busIndex, startTime, offsetSeconds = 0) {
    const buffer = bufferCache.get(busIndex);
    if (!audioCtx || !buffer || !gains[busIndex]) return null;

    const source = audioCtx.createBufferSource();
    const gain = audioCtx.createGain();

    source.buffer = buffer;
    source.connect(gain);
    gain.connect(gains[busIndex]);

    const maxOffset = Math.max(0, source.buffer.duration - 1e-3);
    const safeOffset = Number.isFinite(offsetSeconds)
        ? Math.max(0, Math.min(offsetSeconds, maxOffset))
        : 0;
    source.start(startTime, safeOffset);

    return { source, gain };
}

/**
 * Compute global cycle length from decoded buffers.
 * Uses min(duration) for safety if files differ by a few samples.
 * @returns {number}
 */
function computeLoopCycleSeconds() {
    const durations = [];
    for (let i = 0; i < NUM_BUSES; i++) {
        const buffer = bufferCache.get(i);
        if (buffer) durations.push(buffer.duration);
    }
    if (durations.length === 0) return 0;

    const minDuration = Math.min(...durations);
    const cycle = minDuration - LOOP_OVERLAP_SECONDS;
    if (!(cycle > 0)) {
        console.error('[audio-engine] Invalid loop cycle:', {
            minDuration,
            overlap: LOOP_OVERLAP_SECONDS,
        });
        return 0;
    }
    return cycle;
}

/**
 * Schedule cleanup of a voice after its fade-out window.
 * @param {AudioBufferSourceNode} source
 * @param {GainNode} gain
 * @param {number} stopTime
 */
function scheduleVoiceStop(source, gain, stopTime) {
    source.onended = () => {
        disconnectVoice(source, gain);
    };

    try {
        source.stop(stopTime);
    } catch {
        disconnectVoice(source, gain);
    }
}

/**
 * Perform one bus-local crossfade at a shared global swap time.
 * @param {number} busIndex
 * @param {number} swapTime
 * @param {number} phaseDelaySeconds
 * @param {number} incomingOffsetSeconds
 */
function swapBusVoice(busIndex, swapTime, phaseDelaySeconds, incomingOffsetSeconds) {
    const state = busLoops[busIndex];
    const outgoingIndex = state.activeSlot;
    const incomingIndex = outgoingIndex === 0 ? 1 : 0;
    const outgoing = state.slots[outgoingIndex];

    // Defensive cleanup in case an old incoming slot wasn't released yet.
    stopSlotImmediately(state.slots[incomingIndex]);

    const incoming = createVoice(busIndex, swapTime, incomingOffsetSeconds);
    if (!incoming || !incoming.gain) return;

    const overlapRemaining = LOOP_OVERLAP_SECONDS - Math.max(0, phaseDelaySeconds);

    if (outgoing.source && outgoing.gain && overlapRemaining > 1e-3) {
        incoming.gain.gain.cancelScheduledValues(swapTime);
        incoming.gain.gain.setValueAtTime(0, swapTime);
        incoming.gain.gain.setValueCurveAtTime(FADE_IN_CURVE, swapTime, overlapRemaining);

        outgoing.gain.gain.cancelScheduledValues(swapTime);
        outgoing.gain.gain.setValueAtTime(1, swapTime);
        outgoing.gain.gain.setValueCurveAtTime(FADE_OUT_CURVE, swapTime, overlapRemaining);

        scheduleVoiceStop(
            outgoing.source,
            outgoing.gain,
            swapTime + overlapRemaining + VOICE_STOP_GRACE_SECONDS
        );
    } else {
        // Recovery path: overlap window missed (or outgoing unavailable).
        incoming.gain.gain.cancelScheduledValues(swapTime);
        incoming.gain.gain.setValueAtTime(1, swapTime);
        if (outgoing.source && outgoing.gain) {
            outgoing.gain.gain.cancelScheduledValues(swapTime);
            outgoing.gain.gain.setValueAtTime(1, swapTime);
            outgoing.gain.gain.linearRampToValueAtTime(0, swapTime + RECOVERY_FADE_SECONDS);
            scheduleVoiceStop(
                outgoing.source,
                outgoing.gain,
                swapTime + RECOVERY_FADE_SECONDS + VOICE_STOP_GRACE_SECONDS
            );
        }
    }

    state.slots[incomingIndex] = incoming;
    state.slots[outgoingIndex] = createEmptyLoopSlot();
    state.activeSlot = incomingIndex;
}

function scheduleGlobalSwap() {
    clearGlobalSwapTimer();

    if (!audioCtx || suspended) return;
    if (!(loopCycleSeconds > 0) || !(nextGlobalSwapTime > 0)) return;

    const delaySec = nextGlobalSwapTime - audioCtx.currentTime - LOOP_TIMER_LOOKAHEAD_SECONDS;
    const delayMs = Math.max(0, delaySec * 1000);

    globalSwapTimerId = setTimeout(() => {
        globalSwapTimerId = null;
        performGlobalSwap();
    }, delayMs);
}

function performGlobalSwap() {
    if (!audioCtx || suspended) return;
    if (!(loopCycleSeconds > 0) || !(nextGlobalSwapTime > 0)) return;

    const plannedSwapTime = nextGlobalSwapTime;
    const now = audioCtx.currentTime;
    const swapTime = plannedSwapTime >= now ? plannedSwapTime : now + LATE_SWAP_LOOKAHEAD_SECONDS;
    const phaseDelaySeconds = Math.max(0, swapTime - plannedSwapTime);
    const incomingOffsetSeconds = phaseDelaySeconds % loopCycleSeconds;

    if (phaseDelaySeconds > SWAP_LATE_WARN_SECONDS) {
        console.warn(
            `[audio-engine] Late loop swap: ${(phaseDelaySeconds * 1000).toFixed(1)}ms behind`
        );
    }

    for (let i = 0; i < NUM_BUSES; i++) {
        if (bufferCache.has(i) && gains[i]) {
            swapBusVoice(i, swapTime, phaseDelaySeconds, incomingOffsetSeconds);
        }
    }

    // Use multiplication from a fixed origin instead of repeated addition
    // to prevent floating-point drift over long sessions.
    loopCycleCount++;
    let nextPlannedSwapTime = loopClockOrigin + loopCycleCount * loopCycleSeconds;
    const minFutureTime = audioCtx.currentTime + LOOP_TIMER_LOOKAHEAD_SECONDS;
    while (nextPlannedSwapTime <= minFutureTime) {
        loopCycleCount++;
        nextPlannedSwapTime = loopClockOrigin + loopCycleCount * loopCycleSeconds;
    }
    nextGlobalSwapTime = nextPlannedSwapTime;
    scheduleGlobalSwap();
}

function stopAllSources() {
    clearLoopClockState();
    resetAllBusLoops();
}

/**
 * Start one voice per decoded bus in lockstep, then run a global swap clock
 * that performs 1.875s overlap crossfades at each cycle boundary.
 */
function startAllSources() {
    if (!audioCtx) return;

    stopAllSources();

    const cycleSeconds = computeLoopCycleSeconds();
    if (!(cycleSeconds > 0)) return;

    const when = audioCtx.currentTime + LOOP_START_LOOKAHEAD_SECONDS;
    let startedCount = 0;

    for (let i = 0; i < NUM_BUSES; i++) {
        if (!bufferCache.has(i) || !gains[i]) continue;

        const first = createVoice(i, when);
        if (!first || !first.gain) continue;

        first.gain.gain.setValueAtTime(1, when);

        const state = busLoops[i];
        state.slots[0] = first;
        state.slots[1] = createEmptyLoopSlot();
        state.activeSlot = 0;
        startedCount++;
    }

    if (startedCount === 0) return;

    loopCycleSeconds = cycleSeconds;
    loopClockOrigin = when;
    loopCycleCount = 1;
    nextGlobalSwapTime = when + cycleSeconds;
    scheduleGlobalSwap();
}

// ════════════════════════════════════════════════════════════════════
//  EMA Update (called from WS message handler)
// ════════════════════════════════════════════════════════════════════

/**
 * Receive new audio parameters from the server and store as targets.
 *
 * EMA smoothing is performed in rafLoop() every animation frame, ensuring
 * smooth gain transitions regardless of server message rate.
 *
 * @param {Object} audioParams
 * @param {number[]} audioParams.busTargets - 7 floats [forest, shrub, grass, crop, urban, bare, water]
 * @param {number} audioParams.coverage - 0-1 land/grid coverage ratio
 */
function update(audioParams) {
    if (!audioParams) return;

    // AudioContext not yet created — stash for replay inside start().
    // Do NOT stash when merely suspended (user intentionally stopped).
    if (!audioCtx) {
        pendingParams = audioParams;
        return;
    }
    if (suspended) return;

    // Resume if the context is suspended while audio remains enabled.
    if (audioCtx.state === 'suspended' && !document.hidden) {
        audioCtx.resume();
        scheduleGlobalSwap();
        startRaf();
    }

    if (Array.isArray(audioParams.busTargets)) {
        for (let i = 0; i < NUM_BUSES; i++) {
            ema.busTargets[i] = clamp01(audioParams.busTargets[i] ?? 0);
        }
    }
    if (typeof audioParams.coverage === 'number') {
        ema.coverageTarget = clamp01(audioParams.coverage);
    }
    if (typeof audioParams.proximity === 'number') {
        ema.proximityTarget = clamp01(audioParams.proximity);
    }

    // Wake rAF if it suspended itself after the last convergence (P5-1).
    // No-op when already running. One frame of overhead at most if the new
    // targets equal the smoothed values — the next idle check re-suspends.
    startRaf();
}

/**
 * Update client-side motion signals.
 * Called directly from map.js — bypasses server for zero latency.
 *
 * @param {number} velocity - normalized drag speed 0–1
 * @param {number} [_latitude] - reserved for future motion mapping
 */
function updateMotion(velocity, _latitude) {
    ema.velocityTarget = clamp01(velocity);
    // Wake rAF — see update() comment. Required when a drag starts after
    // the loop suspended itself; otherwise the EMA wouldn't advance.
    startRaf();
}

// ════════════════════════════════════════════════════════════════════
//  rAF Loop (applies smoothed values to GainNodes)
// ════════════════════════════════════════════════════════════════════

function rafLoop() {
    if (!audioCtx || suspended) return;

    const now = performance.now();
    const dt = lastEmaTime > 0 ? now - lastEmaTime : 0;
    lastEmaTime = now;

    tickEma(ema, dt, EMA_TICK_OPTS);

    // Low-pass cutoff: exponential map proximity 0→500 Hz, 1→20 kHz
    // Logarithmic spacing matches human pitch perception, so zoom-in and
    // zoom-out feel equally gradual.
    const cutoff = 500 * Math.pow(40, ema.proximitySmoothed);
    if (lpFilter1) lpFilter1.frequency.value = cutoff;
    if (lpFilter2) lpFilter2.frequency.value = cutoff;
    if (lpFilter3) lpFilter3.frequency.value = cutoff;

    // Q modulation on lpFilter1 only: velocity drives resonance peak
    if (lpFilter1) lpFilter1.Q.value = BASE_Q1 + ema.velocitySmoothed * (MAX_Q1 - BASE_Q1);
    // Keep playbackRate fixed at 1.0. Rate-shifting voices changes the
    // real loop boundary and makes scheduled retriggers sound late.

    // Coverage-controlled linear land/ocean split:
    // - coverage 0%  => land:ocean = 0:100
    // - coverage 40% => land:ocean = 100:0
    // - linear interpolation between, clamped outside [0, 40%]
    const cov = clamp01(ema.coverageSmoothed);
    const landMix = clamp01(cov / LAND_FULL_COVERAGE_THRESHOLD);
    const oceanMix = 1.0 - landMix;

    // Power-curve shaping + soft-limiter normalization
    const shaped = new Float64Array(NUM_BUSES);
    let shapedSum = 0;
    for (let i = 0; i < NUM_BUSES; i++) {
        shaped[i] = Math.pow(ema.busSmoothed[i], GAIN_CURVE_EXPONENT);
        shapedSum += shaped[i];
    }
    const norm = Math.max(shapedSum, 1.0);

    for (let i = 0; i < NUM_BUSES; i++) {
        if (gains[i] && bufferCache.has(i)) {
            const landValue = (shaped[i] / norm) * landMix;
            const value = i === WATER_BUS_INDEX ? Math.max(landValue, oceanMix) : landValue;
            gains[i].gain.value = value * BUS_PREAMP_GAIN[i];
        }
    }

    // Idle suspend: every EMA has converged within IDLE_THRESHOLD of its
    // target, so a continued rAF tick would re-write identical AudioParam
    // values — pure waste. Suspend `requestAnimationFrame` until update()
    // / updateMotion() / handleVisibilityChange() wakes us.
    if (isEmaIdle(ema, IDLE_THRESHOLD)) {
        rafId = null;
        return;
    }

    rafId = requestAnimationFrame(rafLoop);
}

function startRaf() {
    if (rafId !== null) return;
    // First tick after wake should compute a normal-sized dt — without this
    // reset, a long-suspended loop would cross snapThresholdMs on the first
    // post-wake tick and snap busSmoothed to busTargets, bypassing the
    // gradual convergence the user expects after a viewport change.
    lastEmaTime = performance.now();
    rafId = requestAnimationFrame(rafLoop);
}

function cancelRaf() {
    if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }
}

// ════════════════════════════════════════════════════════════════════
//  Visibility Change Handler
// ════════════════════════════════════════════════════════════════════

function handleVisibilityChange() {
    if (!audioCtx) return;

    if (document.hidden) {
        clearGlobalSwapTimer();
        if (audioCtx.state === 'running') {
            audioCtx.suspend();
        }
        cancelRaf();
    } else {
        if (!suspended) {
            audioCtx.resume();
            // Snap to current targets — avoid jarring transition from stale values
            snapEmaToTargets(ema);
            lastEmaTime = performance.now();
            startRaf();
            scheduleGlobalSwap();
        }
    }
}

// ════════════════════════════════════════════════════════════════════
//  Context Initialization
// ════════════════════════════════════════════════════════════════════

/**
 * Idempotently create the AudioContext + master chain. Safe to call
 * multiple times — second and later calls return the existing context
 * without rebuilding the graph. Must be invoked from a user gesture
 * on first call (browser autoplay policy).
 *
 * Sibling modules under `frontend/audio/` (added in P3-1..P3-4) call
 * this helper to obtain the singleton AudioContext, which is what makes
 * the graph-build a single point of truth across the package.
 *
 * @returns {AudioContext}
 */
function ensureCtx() {
    if (audioCtx) return audioCtx;

    audioCtx = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 48000,
    });

    const chain = createMasterChain(audioCtx, {
        masterVolume,
        loudnessNormEnabled: getLoudnessNormEnabled(),
        numBuses: NUM_BUSES,
        makeupGainDb: MAKEUP_GAIN_DB,
        limiterThresholdDb: LIMITER_THRESHOLD_DB,
        limiterRatio: LIMITER_RATIO,
        limiterAttackSec: LIMITER_ATTACK_SEC,
        limiterReleaseSec: LIMITER_RELEASE_SEC,
        limiterKneeDb: LIMITER_KNEE_DB,
    });
    masterGain = chain.masterGain;
    duckGain = chain.duckGain;
    lpFilter1 = chain.lpFilter1;
    lpFilter2 = chain.lpFilter2;
    lpFilter3 = chain.lpFilter3;
    for (let i = 0; i < NUM_BUSES; i++) {
        gains[i] = chain.busGains[i];
    }

    return audioCtx;
}

// ════════════════════════════════════════════════════════════════════
//  Public API
// ════════════════════════════════════════════════════════════════════

/**
 * Start the audio engine. Creates AudioContext on first call,
 * resumes if suspended, begins loading samples.
 * Must be called from a user gesture (browser autoplay policy).
 */
async function start() {
    if (audioCtx && !suspended) return;

    ensureCtx();

    // Re-attach on every explicit start(). stop() removes the listener so
    // hidden-tab suspend/resume keeps working across multiple sessions.
    document.addEventListener('visibilitychange', handleVisibilityChange);

    if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
    }

    suspended = false;

    // Zero EMA state so stale values from a previous session don't cause
    // an audible pop (e.g. water bus loud → stop → navigate to desert → start)
    resetEma(ema);

    // Replay the last audioParams that arrived before AudioContext existed.
    // This sets busTargets to the correct values for the current viewport so
    // the EMA smoothing can advance the gains while samples are still loading.
    // By the time startAllSources() fires, gains will already be at (or near)
    // the target levels — audio is audible immediately, no silent gap.
    if (pendingParams) {
        update(pendingParams);
        pendingParams = null;
    }

    lastEmaTime = performance.now();
    startRaf();

    await bufferCache.loadAll(audioCtx);
}

/**
 * Stop the audio engine. Suspends AudioContext and clears loop graph.
 */
async function stop() {
    suspended = true;
    cancelRaf();
    stopAllSources();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    bufferCache.cancelAndReset();

    if (audioCtx && audioCtx.state === 'running') {
        await audioCtx.suspend();
    }
}

/**
 * Get current loading state for all buses.
 * @returns {import('./audio/buffer-cache.js').BusLoadingState[]}
 */
function getLoadingStates() {
    return bufferCache.getStates();
}

/**
 * Register a callback for loading progress updates.
 * @param {((states: import('./audio/buffer-cache.js').BusLoadingState[]) => void) | null} callback
 */
function setOnLoadingUpdate(callback) {
    bufferCache.setOnUpdate(callback);
}

/** @returns {boolean} Whether the audio context is currently running. */
function isRunning() {
    return audioCtx !== null && audioCtx.state === 'running' && !suspended;
}

/**
 * Get current playback position within the loop cycle.
 * @returns {{ progress: number, cycleSeconds: number } | null}
 */
function getLoopProgress() {
    if (!audioCtx || suspended || !(loopCycleSeconds > 0) || !(nextGlobalSwapTime > 0)) {
        return null;
    }
    const elapsed = loopCycleSeconds - (nextGlobalSwapTime - audioCtx.currentTime);
    const progress = clamp01(elapsed / loopCycleSeconds);
    return { progress, cycleSeconds: loopCycleSeconds };
}

/**
 * Seek all buses to a position within the current loop cycle.
 * Stops all current voices and restarts them at the target buffer offset.
 * @param {number} progress - 0.0 to 1.0 position within the cycle
 */
function seekLoop(progress) {
    if (!audioCtx || suspended || !(loopCycleSeconds > 0)) return;

    const normalizedProgress = clamp01(progress);
    const targetOffset = normalizedProgress === 1 ? 0 : normalizedProgress * loopCycleSeconds;
    const now = audioCtx.currentTime;
    const startTime = now + LATE_SWAP_LOOKAHEAD_SECONDS;

    clearGlobalSwapTimer();
    resetAllBusLoops();

    let startedCount = 0;
    for (let i = 0; i < NUM_BUSES; i++) {
        if (!bufferCache.has(i) || !gains[i]) continue;

        const voice = createVoice(i, startTime, targetOffset);
        if (!voice || !voice.gain) continue;

        voice.gain.gain.setValueAtTime(1, startTime);

        const state = busLoops[i];
        state.slots[0] = voice;
        state.slots[1] = createEmptyLoopSlot();
        state.activeSlot = 0;
        startedCount++;
    }

    if (startedCount === 0) return;

    loopClockOrigin = startTime - targetOffset;
    loopCycleCount = 1;
    nextGlobalSwapTime = loopClockOrigin + loopCycleSeconds;
    scheduleGlobalSwap();
}

/**
 * Set master volume. Uses setTargetAtTime for click-free transitions.
 * @param {number} value - 0.0 (mute) to 1.0 (max, unity)
 */
function setVolume(value) {
    masterVolume = Math.max(0, Math.min(1.0, value));
    if (masterGain && audioCtx) {
        masterGain.gain.setTargetAtTime(masterVolume, audioCtx.currentTime, 0.015);
    }
}

/** @returns {number} Current master volume setting (0.0–1.0). */
function getVolume() {
    return masterVolume;
}

/** @returns {AudioContext|null} The shared AudioContext (null if not started). */
function getContext() {
    return audioCtx;
}

/**
 * Apply the announcer-triggered sidechain duck. Called by
 * city-announcer.js immediately before starting a TTS source. Safe
 * to call before the AudioContext exists (no-op guard).
 */
function duck() {
    if (!duckGain || !audioCtx) return;
    duckGain.gain.setTargetAtTime(DUCK_DEPTH, audioCtx.currentTime, DUCK_ATTACK_TC);
}

/**
 * Release the duck. Called by city-announcer.js in source.onended,
 * which fires both on natural end and on explicit source.stop().
 * Consecutive duck()/unduck() calls are safe: setTargetAtTime
 * cancels any pending automation on the same AudioParam, so
 * overlapping announcements don't pump.
 */
function unduck() {
    if (!duckGain || !audioCtx) return;
    duckGain.gain.setTargetAtTime(1.0, audioCtx.currentTime, DUCK_RELEASE_TC);
}

export const engine = {
    start,
    stop,
    update,
    updateMotion,
    getLoadingStates,
    setOnLoadingUpdate,
    isRunning,
    getLoopProgress,
    seekLoop,
    setVolume,
    getVolume,
    getContext,
    duck,
    unduck,
};
