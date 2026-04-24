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

import { ASSET_BASE, getLoudnessNormEnabled } from './config.js';

// ════════════════════════════════════════════════════════════════════
//  Constants
// ════════════════════════════════════════════════════════════════════

const NUM_BUSES = 7;
const BUS_NAMES = Object.freeze(['forest', 'shrub', 'grass', 'crop', 'urban', 'bare', 'water']);
const WATER_BUS_INDEX = 6;
const LAND_FULL_COVERAGE_THRESHOLD = 0.4;

/** EMA time constant in ms (bus gains and coverage). */
const SMOOTHING_TIME_MS = 500;

/** Faster EMA time constant for the low-pass filter proximity signal. */
const PROXIMITY_SMOOTHING_MS = 120;

/** If dt exceeds this, snap to target instead of smoothing. */
const SNAP_THRESHOLD_MS = 2000;

/** Velocity EMA attack (fast rise when dragging starts). */
const VELOCITY_ATTACK_MS = 50;

/** Velocity EMA decay (slow fade when dragging stops). */
const VELOCITY_DECAY_MS = 600;

/** lpFilter1 Q range: Butterworth base → resonant peak at max velocity. */
const BASE_Q1 = 0.5176;
const MAX_Q1 = 4.0;

/** Crossfade overlap between outgoing and incoming loop voices. */
const LOOP_OVERLAP_SECONDS = 1.875;

/** Initial source scheduling lookahead. */
const LOOP_START_LOOKAHEAD_SECONDS = 0.05;

/** How early to wake JS before the next swap boundary. */
const LOOP_TIMER_LOOKAHEAD_SECONDS = 0.1;

/** Small buffer to avoid stop()/ramp edge clicks at swap boundary. */
const VOICE_STOP_GRACE_SECONDS = 0.01;

/** Tiny lookahead used only when a swap callback wakes up late. */
const LATE_SWAP_LOOKAHEAD_SECONDS = 0.005;

/** Fade duration used by the recovery path when overlap window was missed. */
const RECOVERY_FADE_SECONDS = 0.02;

/** Warn when swap callback lateness exceeds this threshold. */
const SWAP_LATE_WARN_SECONDS = 0.025;

/** Resolution of equal-power fade curves. */
const XF_CURVE_POINTS = 128;

/** Exponent for gain power-curve shaping. Values < 1.0 stretch mid-high range differences. */
const GAIN_CURVE_EXPONENT = 0.6;

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
const BUS_PREAMP_GAIN = [
    1.0, // 0 forest
    1.0, // 1 shrub
    1.0, // 2 grass
    1.0, // 3 crop
    0.316, // 4 urban — -10 dB to avoid limiter at MAKEUP_GAIN_DB = 12
    1.0, // 5 bare
    1.0, // 6 water
];

/**
 * Loading priority order (indices into BUS_NAMES).
 * Tree and water first (most common), then crop, urban, bare.
 */
const PRIORITY_FIRST = [0, 6]; // forest, water
const PRIORITY_SECOND = [1, 2, 3, 4, 5]; // shrub, grass, crop, urban, bare

/**
 * Master makeup gain in dB, calibrated by scripts/measure-loudness.js
 * against a -16 LUFS target. Applied post-masterGain (i.e. after the
 * user's volume slider) and pre-limiter, so per-bus mix math stays
 * untouched while the average summed output is pulled toward target.
 */
const MAKEUP_GAIN_DB = 12;

/**
 * Soft peak limiter settings. -3 dB threshold + 20:1 ratio catches
 * transient peaks from the summed bus mix, keeping true peak below
 * -1 dBTP on ambient content. Web Audio's DynamicsCompressorNode has
 * ~6 ms lookahead — sufficient for non-percussive sources.
 */
const LIMITER_THRESHOLD_DB = -3;
const LIMITER_RATIO = 20;
const LIMITER_ATTACK_SEC = 0.003;
const LIMITER_RELEASE_SEC = 0.25;
const LIMITER_KNEE_DB = 0;

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

/** @type {AudioBuffer[]} */
const buffers = new Array(NUM_BUSES).fill(null);

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
const busTargets = new Float64Array(NUM_BUSES);
const busSmoothed = new Float64Array(NUM_BUSES);
let coverageTarget = 1;
let coverageSmoothed = 1;
let proximityTarget = 0;
let proximitySmoothed = 0;

// ── Motion state (client-side drag velocity) ──
let velocityTarget = 0;
let velocitySmoothed = 0;

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

// ── Loading ──

/**
 * @typedef {Object} BusLoadingState
 * @property {'pending'|'loading'|'ready'|'error'} status
 * @property {number} progress - 0.0 to 1.0
 * @property {string|null} error
 */

/** @type {BusLoadingState[]} */
const loadingStates = BUS_NAMES.map(() => ({ status: 'pending', progress: 0, error: null }));

/** Tracks which generation currently owns each bus loading state. */
const loadingGenerations = new Array(NUM_BUSES).fill(0);

let loadingStarted = false;

/**
 * Monotonically increasing generation counter.
 * Incremented on every start(); in-flight loadSample() calls check this
 * to abort gracefully when stop() has been called since their start.
 */
let loadGeneration = 0;

/** @type {function(BusLoadingState[]): void} */
let onLoadingUpdate = null;

// Equal-power crossfade curves reduce perceived loudness dip at midpoint.
const FADE_IN_CURVE = new Float32Array(XF_CURVE_POINTS);
const FADE_OUT_CURVE = new Float32Array(XF_CURVE_POINTS);
for (let i = 0; i < XF_CURVE_POINTS; i++) {
    const t = i / (XF_CURVE_POINTS - 1);
    const theta = t * (Math.PI / 2);
    FADE_IN_CURVE[i] = Math.sin(theta);
    FADE_OUT_CURVE[i] = Math.cos(theta);
}

// ════════════════════════════════════════════════════════════════════
//  Helpers
// ════════════════════════════════════════════════════════════════════

/** @param {number} v @returns {number} */
function clamp01(v) {
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(1, v));
}

function notifyLoadingUpdate() {
    if (typeof onLoadingUpdate === 'function') {
        onLoadingUpdate(loadingStates.map((s) => ({ ...s })));
    }
}

/**
 * Reset a loading bus back to pending only if this generation owns it.
 * Prevents stale async loads from clobbering a newer generation.
 * @param {number} busIndex
 * @param {number} generation
 */
function resetLoadingIfOwned(busIndex, generation) {
    if (
        loadingStates[busIndex].status === 'loading' &&
        loadingGenerations[busIndex] === generation
    ) {
        loadingStates[busIndex] = { status: 'pending', progress: 0, error: null };
        loadingGenerations[busIndex] = 0;
        notifyLoadingUpdate();
    }
}

/**
 * Returns true when the async load belongs to a stale generation.
 * @param {number} busIndex
 * @param {number} generation
 * @returns {boolean}
 */
function isStaleGeneration(busIndex, generation) {
    if (generation !== loadGeneration) {
        resetLoadingIfOwned(busIndex, generation);
        return true;
    }
    return false;
}

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
    if (!audioCtx || !buffers[busIndex] || !gains[busIndex]) return null;

    const source = audioCtx.createBufferSource();
    const gain = audioCtx.createGain();

    source.buffer = buffers[busIndex];
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
        if (buffers[i]) durations.push(buffers[i].duration);
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
        if (buffers[i] && gains[i]) {
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

// ════════════════════════════════════════════════════════════════════
//  WAV Loading
// ════════════════════════════════════════════════════════════════════

/**
 * Load and decode a single ambience WAV file with progress tracking.
 * On error, sets status to 'error' — other buses continue normally.
 * Checks loadGeneration to abort if stop() was called mid-load.
 *
 * Note: this only fetches and decodes; voices are NOT created here.
 * All bus voices are started together in startAllSources() after every
 * buffer is ready, so buses never "pop in" one by one.
 * @param {number} busIndex
 * @param {number} generation - loadGeneration at call time
 * @returns {Promise<void>}
 */
async function loadSample(busIndex, generation) {
    // Skip buses that already loaded or are currently loading (prevents
    // duplicate parallel fetches when stop/start is called mid-load)
    if (loadingStates[busIndex].status === 'loading') {
        if (loadingGenerations[busIndex] === generation) return;
        loadingStates[busIndex] = { status: 'pending', progress: 0, error: null };
        loadingGenerations[busIndex] = 0;
        notifyLoadingUpdate();
    }
    if (loadingStates[busIndex].status === 'ready' && buffers[busIndex]) return;

    const name = BUS_NAMES[busIndex];
    loadingStates[busIndex] = { status: 'loading', progress: 0, error: null };
    loadingGenerations[busIndex] = generation;
    notifyLoadingUpdate();

    try {
        const response = await fetch(`${ASSET_BASE}/audio/ambience/${name}.wav`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} for ${name}.wav`);
        }

        // Abort if stop() was called while fetching
        if (isStaleGeneration(busIndex, generation)) return;

        const contentLength = response.headers.get('Content-Length');
        const total = contentLength ? parseInt(contentLength, 10) : 0;
        const reader = response.body.getReader();
        const chunks = [];
        let loaded = 0;

        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            loaded += value.length;
            if (total > 0) {
                loadingStates[busIndex].progress = loaded / total;
                notifyLoadingUpdate();
            }
        }

        // Abort if stop() was called while reading
        if (isStaleGeneration(busIndex, generation)) return;

        const combined = new Uint8Array(loaded);
        let offset = 0;
        for (const chunk of chunks) {
            combined.set(chunk, offset);
            offset += chunk.length;
        }

        // Guard against AudioContext being closed or suspended after stop()
        if (isStaleGeneration(busIndex, generation)) return;
        if (!audioCtx || audioCtx.state === 'closed') return;

        buffers[busIndex] = await audioCtx.decodeAudioData(combined.buffer);

        // Final generation check after async decode
        if (isStaleGeneration(busIndex, generation)) return;

        loadingStates[busIndex] = { status: 'ready', progress: 1, error: null };
        loadingGenerations[busIndex] = 0;
        notifyLoadingUpdate();
    } catch (err) {
        // Silently ignore errors from stale generations
        if (isStaleGeneration(busIndex, generation)) return;
        console.error(`[audio-engine] Failed to load ${name}.wav:`, err);
        loadingStates[busIndex] = {
            status: 'error',
            progress: 0,
            error: err.message || 'Load failed',
        };
        loadingGenerations[busIndex] = 0;
        notifyLoadingUpdate();
    }
}

/**
 * Load all samples with priority ordering, then start all sources together.
 * Tree + water first (parallel), then crop + urban + bare (parallel).
 * Voices are created only after ALL buffers are decoded so every bus begins
 * playback at the exact same AudioContext time — no staggered entry.
 * @param {number} generation - loadGeneration at call time
 */
async function loadAllSamples(generation) {
    if (loadingStarted) return;
    loadingStarted = true;

    try {
        await Promise.all(PRIORITY_FIRST.map((i) => loadSample(i, generation)));
        if (generation !== loadGeneration) return;
        await Promise.all(PRIORITY_SECOND.map((i) => loadSample(i, generation)));
        if (generation !== loadGeneration) return;

        startAllSources();
    } finally {
        loadingStarted = false;
    }
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
        if (!buffers[i] || !gains[i]) continue;

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
            busTargets[i] = clamp01(audioParams.busTargets[i] ?? 0);
        }
    }
    if (typeof audioParams.coverage === 'number') {
        coverageTarget = clamp01(audioParams.coverage);
    }
    if (typeof audioParams.proximity === 'number') {
        proximityTarget = clamp01(audioParams.proximity);
    }
}

/**
 * Update client-side motion signals.
 * Called directly from map.js — bypasses server for zero latency.
 *
 * @param {number} velocity - normalized drag speed 0–1
 * @param {number} [_latitude] - reserved for future motion mapping
 */
function updateMotion(velocity, _latitude) {
    velocityTarget = clamp01(velocity);
}

// ════════════════════════════════════════════════════════════════════
//  rAF Loop (applies smoothed values to GainNodes)
// ════════════════════════════════════════════════════════════════════

function rafLoop() {
    if (!audioCtx || suspended) return;

    // Advance EMA every frame for smooth gain transitions
    const now = performance.now();
    const dt = lastEmaTime > 0 ? now - lastEmaTime : 0;
    lastEmaTime = now;

    let alpha;
    if (dt <= 0 || dt > SNAP_THRESHOLD_MS) {
        alpha = 1.0;
    } else {
        alpha = 1 - Math.exp(-dt / SMOOTHING_TIME_MS);
    }

    for (let i = 0; i < NUM_BUSES; i++) {
        busSmoothed[i] += alpha * (busTargets[i] - busSmoothed[i]);
    }
    coverageSmoothed += alpha * (coverageTarget - coverageSmoothed);

    // Proximity uses a faster EMA for snappier filter response
    const proxAlpha =
        dt <= 0 || dt > SNAP_THRESHOLD_MS ? 1.0 : 1 - Math.exp(-dt / PROXIMITY_SMOOTHING_MS);
    proximitySmoothed += proxAlpha * (proximityTarget - proximitySmoothed);

    // Velocity: asymmetric EMA (fast attack, slow decay)
    const velTau = velocityTarget > velocitySmoothed ? VELOCITY_ATTACK_MS : VELOCITY_DECAY_MS;
    const velAlpha = dt <= 0 || dt > SNAP_THRESHOLD_MS ? 1.0 : 1 - Math.exp(-dt / velTau);
    velocitySmoothed += velAlpha * (velocityTarget - velocitySmoothed);

    // Low-pass cutoff: exponential map proximity 0→500 Hz, 1→20 kHz
    // Logarithmic spacing matches human pitch perception, so zoom-in and
    // zoom-out feel equally gradual.
    const cutoff = 500 * Math.pow(40, proximitySmoothed);
    if (lpFilter1) lpFilter1.frequency.value = cutoff;
    if (lpFilter2) lpFilter2.frequency.value = cutoff;
    if (lpFilter3) lpFilter3.frequency.value = cutoff;

    // Q modulation on lpFilter1 only: velocity drives resonance peak
    if (lpFilter1) lpFilter1.Q.value = BASE_Q1 + velocitySmoothed * (MAX_Q1 - BASE_Q1);
    // Keep playbackRate fixed at 1.0. Rate-shifting voices changes the
    // real loop boundary and makes scheduled retriggers sound late.

    // Coverage-controlled linear land/ocean split:
    // - coverage 0%  => land:ocean = 0:100
    // - coverage 40% => land:ocean = 100:0
    // - linear interpolation between, clamped outside [0, 40%]
    const cov = clamp01(coverageSmoothed);
    const landMix = clamp01(cov / LAND_FULL_COVERAGE_THRESHOLD);
    const oceanMix = 1.0 - landMix;

    // Power-curve shaping + soft-limiter normalization
    const shaped = new Float64Array(NUM_BUSES);
    let shapedSum = 0;
    for (let i = 0; i < NUM_BUSES; i++) {
        shaped[i] = Math.pow(busSmoothed[i], GAIN_CURVE_EXPONENT);
        shapedSum += shaped[i];
    }
    const norm = Math.max(shapedSum, 1.0);

    for (let i = 0; i < NUM_BUSES; i++) {
        if (gains[i] && buffers[i]) {
            const landValue = (shaped[i] / norm) * landMix;
            const value = i === WATER_BUS_INDEX ? Math.max(landValue, oceanMix) : landValue;
            gains[i].gain.value = value * BUS_PREAMP_GAIN[i];
        }
    }

    rafId = requestAnimationFrame(rafLoop);
}

function startRaf() {
    if (rafId !== null) return;
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
            for (let i = 0; i < NUM_BUSES; i++) {
                busSmoothed[i] = busTargets[i];
            }
            coverageSmoothed = coverageTarget;
            proximitySmoothed = proximityTarget;
            velocitySmoothed = 0;
            lastEmaTime = performance.now();
            startRaf();
            scheduleGlobalSwap();
        }
    }
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

    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: 48000,
        });

        masterGain = audioCtx.createGain();
        masterGain.gain.value = masterVolume;

        // 36 dB/oct low-pass: three cascaded 12 dB/oct biquads.
        // Q values for 6th-order Butterworth (maximally flat, no resonance).
        // Cutoff driven by proximity in rafLoop().
        lpFilter1 = audioCtx.createBiquadFilter();
        lpFilter1.type = 'lowpass';
        lpFilter1.frequency.value = 20000;
        lpFilter1.Q.value = 0.5176;

        lpFilter2 = audioCtx.createBiquadFilter();
        lpFilter2.type = 'lowpass';
        lpFilter2.frequency.value = 20000;
        lpFilter2.Q.value = 0.7071;

        lpFilter3 = audioCtx.createBiquadFilter();
        lpFilter3.type = 'lowpass';
        lpFilter3.frequency.value = 20000;
        lpFilter3.Q.value = 1.9319;

        // duckGain is driven by duck() / unduck(); unity while idle, pulls
        // down to DUCK_DEPTH during city-announcer speech.
        duckGain = audioCtx.createGain();
        duckGain.gain.value = 1.0;

        if (getLoudnessNormEnabled()) {
            // makeupGain offsets the summed-bus output toward the
            // -16 LUFS target; limiter catches transients so the
            // true peak stays below -1 dBTP. Both are created once
            // per AudioContext lifetime and never revisited, so
            // neither needs a module-level handle.
            const makeupGain = audioCtx.createGain();
            makeupGain.gain.value = Math.pow(10, MAKEUP_GAIN_DB / 20);

            const limiter = audioCtx.createDynamicsCompressor();
            limiter.threshold.value = LIMITER_THRESHOLD_DB;
            limiter.ratio.value = LIMITER_RATIO;
            limiter.attack.value = LIMITER_ATTACK_SEC;
            limiter.release.value = LIMITER_RELEASE_SEC;
            limiter.knee.value = LIMITER_KNEE_DB;

            masterGain.connect(duckGain);
            duckGain.connect(makeupGain);
            makeupGain.connect(limiter);
            limiter.connect(lpFilter1);
            console.info(
                `[audio] Loudness norm ON — makeup ${MAKEUP_GAIN_DB.toFixed(1)} dB, limiter threshold ${LIMITER_THRESHOLD_DB} dB`
            );
        } else {
            masterGain.connect(duckGain);
            duckGain.connect(lpFilter1);
            console.info('[audio] Loudness norm OFF — legacy chain');
        }
        lpFilter1.connect(lpFilter2);
        lpFilter2.connect(lpFilter3);
        lpFilter3.connect(audioCtx.destination);

        for (let i = 0; i < NUM_BUSES; i++) {
            gains[i] = audioCtx.createGain();
            gains[i].gain.value = 0;
            gains[i].connect(masterGain);
        }
    }

    // Re-attach on every explicit start(). stop() removes the listener so
    // hidden-tab suspend/resume keeps working across multiple sessions.
    document.addEventListener('visibilitychange', handleVisibilityChange);

    if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
    }

    suspended = false;

    // Zero EMA state so stale values from a previous session don't cause
    // an audible pop (e.g. water bus loud → stop → navigate to desert → start)
    busTargets.fill(0);
    busSmoothed.fill(0);
    coverageTarget = 1;
    coverageSmoothed = 1;
    proximityTarget = 0;
    proximitySmoothed = 0;
    velocityTarget = 0;
    velocitySmoothed = 0;

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

    loadGeneration++;
    await loadAllSamples(loadGeneration);
}

/**
 * Stop the audio engine. Suspends AudioContext and clears loop graph.
 */
async function stop() {
    suspended = true;
    cancelRaf();
    stopAllSources();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    loadingStarted = false; // allow retry of failed samples on next start()
    let loadingStateChanged = false;
    for (let i = 0; i < NUM_BUSES; i++) {
        if (loadingStates[i].status === 'loading' || loadingStates[i].status === 'error') {
            loadingStates[i] = { status: 'pending', progress: 0, error: null };
            loadingGenerations[i] = 0;
            loadingStateChanged = true;
        }
    }
    if (loadingStateChanged) {
        notifyLoadingUpdate();
    }
    loadGeneration++; // invalidate any in-flight loadSample() calls

    if (audioCtx && audioCtx.state === 'running') {
        await audioCtx.suspend();
    }
}

/**
 * Get current loading state for all buses.
 * @returns {BusLoadingState[]}
 */
function getLoadingStates() {
    return loadingStates.map((s) => ({ ...s }));
}

/**
 * Register a callback for loading progress updates.
 * @param {function(BusLoadingState[]): void} callback
 */
function setOnLoadingUpdate(callback) {
    onLoadingUpdate = callback;
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
        if (!buffers[i] || !gains[i]) continue;

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
