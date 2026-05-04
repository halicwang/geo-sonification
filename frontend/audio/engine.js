// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Geo-Sonification — Web Audio engine.
 *
 * Seven-bus ambient crossfade with coverage-linear ocean detection.
 * Receives server-computed bus targets via engine.update(audioParams).
 * Applies EMA smoothing and writes to GainNodes via requestAnimationFrame.
 *
 * Voice scheduling (per-bus double-buffered playback, global swap clock,
 * loop progress / seek) lives in `audio/voice-scheduler.js` and is bound
 * to this engine's AudioContext + bus gains inside `ensureCtx()`.
 *
 * AudioContext lifecycle:
 *   - start() creates context + starts loop graph (if buffers ready)
 *   - stop() suspends context and clears loop graph
 *   - visibilitychange: suspend on hidden, resume+snap on visible
 *
 * @module frontend/audio/engine
 */

import { ASSET_BASE, getLoudnessNormEnabled } from '../config.js';
import { clamp01 } from './utils.js';
import { createMasterChain } from './context.js';
import { createBufferCache } from './buffer-cache.js';
import { createEmaState, tickEma, snapEmaToTargets, resetEma, isEmaIdle } from './raf-loop.js';
import { createVoiceScheduler } from './voice-scheduler.js';
import {
    SMOOTHING_TIME_MS,
    PROXIMITY_SMOOTHING_MS,
    SNAP_THRESHOLD_MS,
    VELOCITY_ATTACK_MS,
    VELOCITY_DECAY_MS,
    BUS_PREAMP_GAIN,
    LIMITER_THRESHOLD_DB,
    LIMITER_RATIO,
    LIMITER_ATTACK_SEC,
    LIMITER_RELEASE_SEC,
    LIMITER_KNEE_DB,
} from './constants.js';

// ════════════════════════════════════════════════════════════════════
//  Constants
// ════════════════════════════════════════════════════════════════════

const NUM_BUSES = 7;
const WATER_BUS_INDEX = 6;

/**
 * Compresses the coverage → landMix curve so land textures fully express
 * on inland / urban viewports. Real land-dominant viewports rarely exceed
 * ~40% land-cell ratio — coastlines, lakes and grid-edge cells always
 * trim the count — so a linear cov → landMix map would leave ocean
 * dominant everywhere outside the open continents. Used by the rAF loop
 * as `landMix = clamp01(cov / threshold)` (see the use site below).
 */
const LAND_FULL_COVERAGE_THRESHOLD = 0.4;

/**
 * lpFilter1 Q range, modulated by velocity (`Q = BASE + vel*(MAX-BASE)`).
 * BASE_Q1 = 1/√2 ≈ 0.5176 is the Butterworth Q for a flat passband when
 * the user is still. MAX_Q1 = 4.0 reaches ~+12 dB resonance at the
 * cutoff during fast drags, giving an audible filter-sweep "whoosh"
 * without entering the self-oscillating / clipping regime that
 * BiquadFilterNode starts to exhibit past Q ≈ 6.
 */
const BASE_Q1 = 0.5176;
const MAX_Q1 = 4.0;

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
 * Voice scheduler bound to this engine's audioCtx + bus gains. Built
 * once inside ensureCtx() and never replaced; null only between module
 * load and the first start() / ensureCtx() call.
 * @type {import('./voice-scheduler.js').VoiceScheduler|null}
 */
let scheduler = null;

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
 * channel is under this threshold. Wakes via `update()`, `updateMotion()`,
 * `handleVisibilityChange()`, and the post-`bufferCache.loadAll()` arm
 * in `start()` — the latter is the path whose absence caused an earlier
 * idle-detection attempt to drop out silently; see devlog
 * 2026-04-27-M4-raf-idle-detection-redo.md.
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
// the two grasslands as a parallel second wave.
const bufferCache = createBufferCache({
    busNames: ['forest', 'shrub', 'grass', 'crop', 'urban', 'bare', 'water'],
    assetBase: ASSET_BASE,
    priorityFirst: [0, 6],
    prioritySecond: [1, 2, 3, 4, 5],
    onAllLoaded: () => scheduler.startAllSources(),
});

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
        scheduler.scheduleGlobalSwap();
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
    // Note: audioParams.proximity is intentionally ignored. proximity is
    // driven locally from map.getZoom() via updateProximity() so the
    // filter cutoff tracks the live zoom animation instead of waiting
    // for a debounced WS round-trip (which would also cause a one-step
    // backslide mid-animation when a stale-zoom server frame arrives
    // after a fresher local update).

    // Wake rAF if it suspended itself after the last convergence.
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

// Mirror of server/audio-metrics.js computeProximityFromZoom defaults.
// The actual values come from /api/config via setProximityThresholds()
// — set in main.js after loadServerConfig() / refreshServerConfig().
let proximityZoomLow = 4;
let proximityZoomHigh = 6;

/**
 * Configure the zoom thresholds that map onto proximity 0..1.
 * Mirrors server/config.js PROXIMITY_ZOOM_{LOW,HIGH}; values can be
 * overridden via env on the server, so the frontend reads them from
 * /api/config rather than hardcoding.
 *
 * @param {number} low  - zoom at/below which proximity = 0
 * @param {number} high - zoom at/above which proximity = 1
 */
function setProximityThresholds(low, high) {
    if (Number.isFinite(low)) proximityZoomLow = low;
    if (Number.isFinite(high)) proximityZoomHigh = high;
}

/**
 * Update the low-pass filter proximity from the live map zoom.
 * Called directly from map.js on every `move` event — bypasses the
 * WebSocket round-trip and viewport debounce so the filter cutoff
 * tracks the zoom animation in real time. EMA smoothing in rafLoop
 * still shapes the cutoff transition (PROXIMITY_SMOOTHING_MS).
 *
 * @param {number} zoom - Mapbox zoom level
 */
function updateProximity(zoom) {
    const z = Number.isFinite(zoom) ? zoom : 0;
    const low = proximityZoomLow;
    const high = proximityZoomHigh;
    let target;
    if (low >= high) {
        target = z >= high ? 1 : 0;
    } else if (z >= high) {
        target = 1;
    } else if (z <= low) {
        target = 0;
    } else {
        target = clamp01((z - low) / (high - low));
    }
    ema.proximityTarget = target;
    // Wake rAF — see updateMotion() comment. Required so a zoom that
    // happens before audio start (or after idle suspend) actually
    // advances the EMA.
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
    lpFilter1.frequency.value = cutoff;
    lpFilter2.frequency.value = cutoff;
    lpFilter3.frequency.value = cutoff;

    // Q modulation on lpFilter1 only: velocity drives resonance peak
    lpFilter1.Q.value = BASE_Q1 + ema.velocitySmoothed * (MAX_Q1 - BASE_Q1);
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
        if (bufferCache.has(i)) {
            const landValue = (shaped[i] / norm) * landMix;
            const value = i === WATER_BUS_INDEX ? Math.max(landValue, oceanMix) : landValue;
            gains[i].gain.value = value * BUS_PREAMP_GAIN[i];
        }
    }

    // Idle suspend: every EMA has converged within IDLE_THRESHOLD of its
    // target, so a continued rAF tick would re-write identical AudioParam
    // values — pure waste. Suspend `requestAnimationFrame` until update()
    // / updateMotion() / handleVisibilityChange() / scheduler.startAllSources()
    // wakes us. The startAllSources wake (re-armed via start()'s
    // post-loadAll startRaf) is essential: without it, a fresh-load
    // convergence-before-buffers race leaves the gain.value writes
    // gated out forever.
    if (isEmaIdle(ema, IDLE_THRESHOLD)) {
        rafId = null;
        return;
    }

    rafId = requestAnimationFrame(rafLoop);
}

function startRaf() {
    // Skip wake when the engine has no work to do. Without this guard,
    // updateMotion() called before start() (e.g. user drags map before
    // clicking Start audio) would schedule a rafLoop that early-returns
    // on `!audioCtx`, leaving rafId pointing to a stale handle — then
    // start()'s own startRaf() would no-op on `rafId !== null` and the
    // engine would never tick. Same hazard for calls after stop().
    if (!audioCtx || suspended) return;
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
        scheduler.clearGlobalSwapTimer();
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
            scheduler.scheduleGlobalSwap();
        }
    }
}

// ════════════════════════════════════════════════════════════════════
//  Context Initialization
// ════════════════════════════════════════════════════════════════════

/**
 * Idempotently create the AudioContext + master chain + voice scheduler.
 * Safe to call multiple times — second and later calls return the
 * existing context without rebuilding the graph. Must be invoked from a
 * user gesture on first call (browser autoplay policy).
 *
 * Sibling modules under `frontend/audio/` call this helper to obtain
 * the singleton AudioContext, which is what makes the graph-build a
 * single point of truth across the package.
 *
 * Lifetime invariant: once this function returns, `audioCtx`,
 * `masterGain`, `duckGain`, `lpFilter1/2/3`, every `gains[i]`, and
 * `scheduler` are non-null for the rest of the page lifetime. `stop()`
 * only suspends the context; node references are never reset to null.
 * Hot-path functions rely on this — once their `if (!audioCtx) return;`
 * entry guard clears, downstream chain nodes need no further null
 * checks.
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

    scheduler = createVoiceScheduler({
        audioCtx,
        busGains: gains,
        bufferCache,
        isSuspended: () => suspended,
    });

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
    // By the time scheduler.startAllSources() fires, gains will already be
    // at (or near) the target levels — audio is audible immediately, no
    // silent gap.
    if (pendingParams) {
        update(pendingParams);
        pendingParams = null;
    }

    lastEmaTime = performance.now();
    startRaf();

    await bufferCache.loadAll(audioCtx);

    // Wake rAF after buffers finish loading. While loadAll() was awaiting,
    // EMAs may have converged within IDLE_THRESHOLD and the rAF callback
    // suspended itself — but bufferCache.has(i) was still false, so the
    // per-bus gain.value writes never happened. By the time we reach this
    // line, onAllLoaded → scheduler.startAllSources() has already
    // connected sources to busGains, so a single wake tick will write the
    // converged gain.value through and audio becomes audible. Without
    // this line, gain.value stays at the initial 0 forever and the seven
    // ambience buses are silent until the user moves the map.
    startRaf();
}

/**
 * Stop the audio engine. Suspends AudioContext and clears loop graph.
 */
async function stop() {
    suspended = true;
    cancelRaf();
    if (scheduler) scheduler.stopAllSources();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    bufferCache.cancelAndReset();

    if (audioCtx && audioCtx.state === 'running') {
        await audioCtx.suspend();
    }
}

/**
 * Get current loading state for all buses.
 * @returns {import('./buffer-cache.js').BusLoadingState[]}
 */
function getLoadingStates() {
    return bufferCache.getStates();
}

/**
 * Register a callback for loading progress updates.
 * @param {((states: import('./buffer-cache.js').BusLoadingState[]) => void) | null} callback
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
    return scheduler ? scheduler.getLoopProgress() : null;
}

/**
 * Seek all buses to a position within the current loop cycle.
 * @param {number} progress - 0.0 to 1.0 position within the cycle
 */
function seekLoop(progress) {
    if (scheduler) scheduler.seekLoop(progress);
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
    updateProximity,
    setProximityThresholds,
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
