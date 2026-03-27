// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Geo-Sonification — Granulation layer.
 *
 * Adds a density-driven granulation overlay on top of the 7-bus ambience
 * engine. Two independent voices (wildlife and human) read short grains
 * from prepared audio files where activity naturally increases over time
 * (sparse → dense). Moving the read position further into the file
 * increases perceived density.
 *
 * Audio graph:
 *   wildlifeGain ─┐
 *   humanGain ────┤
 *                 └─ granMasterGain ─→ (connected to engine masterGain)
 *
 * The professor's "sliding window" technique:
 *   - Source files are recordings with gradually increasing activity
 *   - A short read window (~150-400ms grains) is positioned based on density
 *   - Higher density → read from later in the file (denser source material)
 *   - Grains are scattered around the playhead with random offsets
 *
 * @module frontend/granulator
 */

// ════════════════════════════════════════════════════════════════════
//  Constants
// ════════════════════════════════════════════════════════════════════

/** How often the lookahead scheduler fires (ms). */
const SCHEDULER_INTERVAL_MS = 25;

/** How far ahead the scheduler looks to pre-schedule grains (seconds). */
const SCHEDULER_LOOKAHEAD_S = 0.1;

/** Shortest grain duration (seconds). */
const GRAIN_DURATION_MIN_S = 0.15;

/** Longest grain duration (seconds). */
const GRAIN_DURATION_MAX_S = 0.4;

/** Random scatter range (seconds) around the playhead center. */
const GRAIN_SCATTER_S = 2.0;

/** Playback rate range for wildlife grains (narrow to preserve natural pitch). */
const WILDLIFE_PITCH_MIN = 0.98;
const WILDLIFE_PITCH_MAX = 1.02;

/** Playback rate range for human grains (wider variation is acceptable). */
const HUMAN_PITCH_MIN = 0.95;
const HUMAN_PITCH_MAX = 1.05;

/** Resolution of the Hann window envelope. */
const GRAIN_ENVELOPE_POINTS = 256;

/** Inter-onset interval at maximum density (seconds). */
const IOI_MIN_S = 0.08;

/** Inter-onset interval at minimum density (seconds). */
const IOI_MAX_S = 0.5;

/** Density below this threshold produces no grains. */
const DENSITY_THRESHOLD = 0.02;

/** Gain power-curve exponent (matches ambience engine). */
const GRAN_GAIN_CURVE_EXPONENT = 0.6;

/** Maximum gain for the granulation master output. */
const GRAN_MAX_GAIN = 0.4;

/** Maximum concurrent grains across both voices. */
const MAX_ACTIVE_GRAINS = 20;

/** Voice identifiers. */
const VOICE_WILDLIFE = 'wildlife';
const VOICE_HUMAN = 'human';

/** Audio file paths (served by Express static middleware). */
const GRAIN_FILES = Object.freeze({
    [VOICE_WILDLIFE]: '/audio/grains/wildlife.wav',
    [VOICE_HUMAN]: '/audio/grains/human.wav',
});

// ════════════════════════════════════════════════════════════════════
//  Pre-computed Hann window envelope
// ════════════════════════════════════════════════════════════════════

const HANN_ENVELOPE = new Float32Array(GRAIN_ENVELOPE_POINTS);
for (let i = 0; i < GRAIN_ENVELOPE_POINTS; i++) {
    HANN_ENVELOPE[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (GRAIN_ENVELOPE_POINTS - 1)));
}

// ════════════════════════════════════════════════════════════════════
//  State
// ════════════════════════════════════════════════════════════════════

/** @type {AudioContext|null} */
let audioCtx = null;

/** @type {GainNode|null} */
let granMasterGain = null;

/**
 * @typedef {Object} VoiceState
 * @property {string} name
 * @property {AudioBuffer|null} buffer
 * @property {GainNode|null} gainNode
 * @property {number} density - current density 0-1
 * @property {number} nextGrainTime - AudioContext time for next grain
 * @property {number} pitchMin
 * @property {number} pitchMax
 * @property {'pending'|'loading'|'ready'|'error'} loadStatus
 */

/** @type {Object<string, VoiceState>} */
const voices = {
    [VOICE_WILDLIFE]: {
        name: VOICE_WILDLIFE,
        buffer: null,
        gainNode: null,
        density: 0,
        nextGrainTime: 0,
        pitchMin: WILDLIFE_PITCH_MIN,
        pitchMax: WILDLIFE_PITCH_MAX,
        loadStatus: 'pending',
    },
    [VOICE_HUMAN]: {
        name: VOICE_HUMAN,
        buffer: null,
        gainNode: null,
        density: 0,
        nextGrainTime: 0,
        pitchMin: HUMAN_PITCH_MIN,
        pitchMax: HUMAN_PITCH_MAX,
        loadStatus: 'pending',
    },
};

/**
 * Active grain tracking for GC and cap enforcement.
 * @typedef {Object} ActiveGrain
 * @property {AudioBufferSourceNode} source
 * @property {GainNode} gain
 * @property {number} endTime - scheduled end time (AudioContext time)
 */

/** @type {ActiveGrain[]} */
let activeGrains = [];

/** @type {number|null} */
let schedulerTimerId = null;

/** Current landMix value (0 = ocean, 1 = land). */
let currentLandMix = 0;

/** Whether the granulator has been initialized. */
let initialized = false;

// ════════════════════════════════════════════════════════════════════
//  Helpers
// ════════════════════════════════════════════════════════════════════

/**
 * Clamp a value to [0, 1].
 * @param {number} v
 * @returns {number}
 */
function clamp01(v) {
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(1, v));
}

/**
 * Random float in [min, max].
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randRange(min, max) {
    return min + Math.random() * (max - min);
}

/**
 * Exponential mapping from density (0-1) to IOI (seconds).
 * Low density → long IOI (sparse), high density → short IOI (dense).
 * Exponential curve makes low-density region more sensitive.
 * @param {number} density - 0 to 1
 * @returns {number} inter-onset interval in seconds
 */
function densityToIOI(density) {
    // IOI = IOI_MAX * (IOI_MIN / IOI_MAX) ^ density
    // At density=0: IOI_MAX, at density=1: IOI_MIN
    return IOI_MAX_S * Math.pow(IOI_MIN_S / IOI_MAX_S, density);
}

// ════════════════════════════════════════════════════════════════════
//  Buffer Loading
// ════════════════════════════════════════════════════════════════════

/**
 * Load a grain source audio file for a voice.
 * Gracefully handles missing files (voice stays silent).
 * @param {VoiceState} voice
 */
async function loadGrainBuffer(voice) {
    const path = GRAIN_FILES[voice.name];
    voice.loadStatus = 'loading';

    try {
        const response = await fetch(path);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} for ${path}`);
        }

        if (!audioCtx || audioCtx.state === 'closed') return;

        const arrayBuffer = await response.arrayBuffer();

        if (!audioCtx || audioCtx.state === 'closed') return;

        voice.buffer = await audioCtx.decodeAudioData(arrayBuffer);
        voice.loadStatus = 'ready';
        console.info(
            `[granulator] Loaded ${voice.name} buffer (${voice.buffer.duration.toFixed(1)}s)`
        );
    } catch (err) {
        voice.loadStatus = 'error';
        console.warn(`[granulator] Failed to load ${path}: ${err.message}. Voice will be silent.`);
    }
}

/**
 * Load all grain buffers in parallel.
 */
async function loadAllBuffers() {
    await Promise.all(Object.values(voices).map((v) => loadGrainBuffer(v)));
}

// ════════════════════════════════════════════════════════════════════
//  Grain Creation
// ════════════════════════════════════════════════════════════════════

/**
 * Schedule a single grain for a voice.
 * @param {VoiceState} voice
 * @param {number} startTime - AudioContext time to start the grain
 */
function scheduleGrain(voice, startTime) {
    if (!voice.buffer || !voice.gainNode || !audioCtx) return;
    if (activeGrains.length >= MAX_ACTIVE_GRAINS) return;

    const bufDur = voice.buffer.duration;
    const grainDur = randRange(GRAIN_DURATION_MIN_S, GRAIN_DURATION_MAX_S);

    // Sliding window: density controls playhead position in buffer
    const windowCenter = voice.density * (bufDur - grainDur);
    const scatter = (Math.random() - 0.5) * GRAIN_SCATTER_S;
    const grainOffset = Math.max(0, Math.min(windowCenter + scatter, bufDur - grainDur));

    // Per-grain gain node with Hann envelope
    const grainGain = audioCtx.createGain();
    grainGain.gain.setValueAtTime(0, startTime);
    grainGain.gain.setValueCurveAtTime(HANN_ENVELOPE, startTime, grainDur);
    grainGain.connect(voice.gainNode);

    // Source node
    const source = audioCtx.createBufferSource();
    source.buffer = voice.buffer;
    source.playbackRate.value = randRange(voice.pitchMin, voice.pitchMax);
    source.connect(grainGain);
    source.start(startTime, grainOffset, grainDur);

    const endTime = startTime + grainDur;

    /** @type {ActiveGrain} */
    const grain = { source, gain: grainGain, endTime };
    activeGrains.push(grain);

    // GC via onended (primary path)
    source.onended = () => {
        try {
            source.disconnect();
            grainGain.disconnect();
        } catch {
            // Already disconnected
        }
        const idx = activeGrains.indexOf(grain);
        if (idx !== -1) activeGrains.splice(idx, 1);
    };
}

// ════════════════════════════════════════════════════════════════════
//  Scheduler
// ════════════════════════════════════════════════════════════════════

/**
 * Sweep active grains array and remove expired entries.
 * Safety net for cases where onended doesn't fire (suspended context).
 */
function sweepExpiredGrains() {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    for (let i = activeGrains.length - 1; i >= 0; i--) {
        if (activeGrains[i].endTime < now) {
            const g = activeGrains[i];
            try {
                g.source.disconnect();
                g.gain.disconnect();
            } catch {
                // Already disconnected
            }
            activeGrains.splice(i, 1);
        }
    }
}

/**
 * Main scheduler tick. Looks ahead and schedules grains for each voice.
 */
function schedulerTick() {
    if (!audioCtx) return;

    const now = audioCtx.currentTime;
    const horizon = now + SCHEDULER_LOOKAHEAD_S;

    // Periodic expired grain sweep
    sweepExpiredGrains();

    for (const voice of Object.values(voices)) {
        if (voice.loadStatus !== 'ready' || !voice.buffer) continue;

        // Effective density after landMix scaling
        const effectiveDensity = voice.density * currentLandMix;
        if (effectiveDensity < DENSITY_THRESHOLD) {
            // Reset next grain time so grains start promptly when density rises
            voice.nextGrainTime = 0;
            continue;
        }

        // Voice-level gain: power-curved density × max gain
        if (voice.gainNode) {
            const targetGain = Math.pow(effectiveDensity, GRAN_GAIN_CURVE_EXPONENT) * GRAN_MAX_GAIN;
            voice.gainNode.gain.value = targetGain;
        }

        // Initialize next grain time if not set
        if (voice.nextGrainTime <= now) {
            voice.nextGrainTime = now;
        }

        // Schedule grains within the lookahead window
        const ioi = densityToIOI(effectiveDensity);
        while (voice.nextGrainTime < horizon) {
            if (activeGrains.length >= MAX_ACTIVE_GRAINS) break;
            scheduleGrain(voice, voice.nextGrainTime);
            voice.nextGrainTime += ioi;
        }
    }
}

/**
 * Start the scheduler interval.
 */
function startScheduler() {
    if (schedulerTimerId !== null) return;

    // Only start if at least one buffer is loaded
    const anyReady = Object.values(voices).some((v) => v.loadStatus === 'ready');
    if (!anyReady) return;

    schedulerTimerId = setInterval(schedulerTick, SCHEDULER_INTERVAL_MS);
}

/**
 * Stop the scheduler and clean up all active grains.
 */
function stopScheduler() {
    if (schedulerTimerId !== null) {
        clearInterval(schedulerTimerId);
        schedulerTimerId = null;
    }

    // Stop and disconnect all active grains
    for (const grain of activeGrains) {
        try {
            grain.source.stop();
            grain.source.disconnect();
            grain.gain.disconnect();
        } catch {
            // Already stopped/disconnected
        }
    }
    activeGrains = [];

    // Reset next grain times
    for (const voice of Object.values(voices)) {
        voice.nextGrainTime = 0;
    }
}

// ════════════════════════════════════════════════════════════════════
//  Public API
// ════════════════════════════════════════════════════════════════════

/**
 * Initialize the granulator. Creates gain nodes and begins loading buffers.
 * Must be called after AudioContext is created (from engine.start()).
 *
 * @param {AudioContext} ctx - The shared AudioContext
 * @param {AudioNode} destination - Node to connect output to (engine masterGain)
 */
function init(ctx, destination) {
    if (initialized) return;

    audioCtx = ctx;

    // Create gain structure: voice gains → granMasterGain → destination
    granMasterGain = audioCtx.createGain();
    granMasterGain.gain.value = 1.0;
    granMasterGain.connect(destination);

    for (const voice of Object.values(voices)) {
        voice.gainNode = audioCtx.createGain();
        voice.gainNode.gain.value = 0;
        voice.gainNode.connect(granMasterGain);
    }

    initialized = true;

    // Begin loading buffers (non-blocking)
    loadAllBuffers().then(() => {
        // Auto-start scheduler if start() was already called
        if (schedulerTimerId === null) {
            startScheduler();
        }
    });
}

/**
 * Start the grain scheduler.
 * Safe to call before buffers are loaded — scheduler starts once ready.
 */
function start() {
    if (!initialized) return;
    startScheduler();
}

/**
 * Stop the grain scheduler and clean up active grains.
 * Called on engine stop or tab hidden.
 */
function stop() {
    stopScheduler();
}

/**
 * Update granulation parameters from the audio engine's rAF loop.
 *
 * @param {Object} params
 * @param {number} params.wildlifeDensity - 0-1, max of forest/shrub/grass smoothed values
 * @param {number} params.humanDensity - 0-1, urban smoothed value
 * @param {number} params.landMix - 0-1, coverage-derived land fraction
 */
function update(params) {
    if (!initialized) return;

    voices[VOICE_WILDLIFE].density = clamp01(params.wildlifeDensity);
    voices[VOICE_HUMAN].density = clamp01(params.humanDensity);
    currentLandMix = clamp01(params.landMix);
}

/**
 * Tear down all nodes and reset state.
 * Called if the engine is fully destroyed (rare).
 */
function dispose() {
    stopScheduler();

    for (const voice of Object.values(voices)) {
        if (voice.gainNode) {
            try {
                voice.gainNode.disconnect();
            } catch {
                // Already disconnected
            }
            voice.gainNode = null;
        }
        voice.buffer = null;
        voice.density = 0;
        voice.nextGrainTime = 0;
        voice.loadStatus = 'pending';
    }

    if (granMasterGain) {
        try {
            granMasterGain.disconnect();
        } catch {
            // Already disconnected
        }
        granMasterGain = null;
    }

    audioCtx = null;
    currentLandMix = 0;
    initialized = false;
}

export const granulator = {
    init,
    start,
    stop,
    update,
    dispose,
};
