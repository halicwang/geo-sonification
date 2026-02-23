// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Geo-Sonification — Web Audio engine.
 *
 * Five-bus ambient crossfade with three-level ocean detection.
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

// ════════════════════════════════════════════════════════════════════
//  Constants
// ════════════════════════════════════════════════════════════════════

const NUM_BUSES = 5;
const BUS_NAMES = Object.freeze(['tree', 'crop', 'urban', 'bare', 'water']);
const WATER_BUS_INDEX = 4;

/** EMA time constant in ms. */
const SMOOTHING_TIME_MS = 500;

/** If dt exceeds this, snap to target instead of smoothing. */
const SNAP_THRESHOLD_MS = 2000;

/** Crossfade overlap between outgoing and incoming loop voices. */
const LOOP_OVERLAP_SECONDS = 1.875;

/** Initial source scheduling lookahead. */
const LOOP_START_LOOKAHEAD_SECONDS = 0.05;

/** How early to wake JS before the next swap boundary. */
const LOOP_TIMER_LOOKAHEAD_SECONDS = 0.1;

/** Small buffer to avoid stop()/ramp edge clicks at swap boundary. */
const VOICE_STOP_GRACE_SECONDS = 0.01;

/** Resolution of equal-power fade curves. */
const XF_CURVE_POINTS = 128;

/**
 * Loading priority order (indices into BUS_NAMES).
 * Tree and water first (most common), then crop, urban, bare.
 */
const PRIORITY_FIRST = [0, 4]; // tree, water
const PRIORITY_SECOND = [1, 2, 3]; // crop, urban, bare

// ════════════════════════════════════════════════════════════════════
//  State
// ════════════════════════════════════════════════════════════════════

/** @type {AudioContext|null} */
let audioCtx = null;

/** @type {GainNode[]} */
const gains = new Array(NUM_BUSES).fill(null);

/** @type {GainNode|null} */
let masterGain = null;

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

/** @type {number|null} */
let globalSwapTimerId = null;

// ── EMA state ──
const busTargets = new Float64Array(NUM_BUSES);
const busSmoothed = new Float64Array(NUM_BUSES);
let oceanTarget = 0;
let oceanSmoothed = 0;

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
 * @returns {LoopSlot|null}
 */
function createVoice(busIndex, startTime) {
    if (!audioCtx || !buffers[busIndex] || !gains[busIndex]) return null;

    const source = audioCtx.createBufferSource();
    const gain = audioCtx.createGain();

    source.buffer = buffers[busIndex];
    source.connect(gain);
    gain.connect(gains[busIndex]);

    source.start(startTime, 0);

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
 */
function swapBusVoice(busIndex, swapTime) {
    const state = busLoops[busIndex];
    const outgoingIndex = state.activeSlot;
    const incomingIndex = outgoingIndex === 0 ? 1 : 0;
    const outgoing = state.slots[outgoingIndex];

    // Defensive cleanup in case an old incoming slot wasn't released yet.
    stopSlotImmediately(state.slots[incomingIndex]);

    const incoming = createVoice(busIndex, swapTime);
    if (!incoming || !incoming.gain) return;

    incoming.gain.gain.cancelScheduledValues(swapTime);
    incoming.gain.gain.setValueAtTime(0, swapTime);
    incoming.gain.gain.setValueCurveAtTime(FADE_IN_CURVE, swapTime, LOOP_OVERLAP_SECONDS);
    incoming.gain.gain.setValueAtTime(1, swapTime + LOOP_OVERLAP_SECONDS);

    if (outgoing.source && outgoing.gain) {
        outgoing.gain.gain.cancelScheduledValues(swapTime);
        outgoing.gain.gain.setValueAtTime(1, swapTime);
        outgoing.gain.gain.setValueCurveAtTime(FADE_OUT_CURVE, swapTime, LOOP_OVERLAP_SECONDS);
        outgoing.gain.gain.setValueAtTime(0, swapTime + LOOP_OVERLAP_SECONDS);

        scheduleVoiceStop(
            outgoing.source,
            outgoing.gain,
            swapTime + LOOP_OVERLAP_SECONDS + VOICE_STOP_GRACE_SECONDS
        );
    } else {
        // First-cycle recovery path if outgoing voice was unexpectedly missing.
        incoming.gain.gain.cancelScheduledValues(swapTime);
        incoming.gain.gain.setValueAtTime(1, swapTime);
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

    const swapTime = Math.max(
        nextGlobalSwapTime,
        audioCtx.currentTime + LOOP_START_LOOKAHEAD_SECONDS
    );

    for (let i = 0; i < NUM_BUSES; i++) {
        if (buffers[i] && gains[i]) {
            swapBusVoice(i, swapTime);
        }
    }

    nextGlobalSwapTime = swapTime + loopCycleSeconds;
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
        const response = await fetch(`/audio/ambience/${name}.wav`);
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

    await Promise.all(PRIORITY_FIRST.map((i) => loadSample(i, generation)));
    if (generation !== loadGeneration) return;
    await Promise.all(PRIORITY_SECOND.map((i) => loadSample(i, generation)));
    if (generation !== loadGeneration) return;

    startAllSources();
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
 * @param {number[]} audioParams.busTargets - 5 floats [tree, crop, urban, bare, water]
 * @param {number} audioParams.oceanLevel - 0.0, 0.7, or 1.0
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
    if (typeof audioParams.oceanLevel === 'number') {
        oceanTarget = clamp01(audioParams.oceanLevel);
    }
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
    oceanSmoothed += alpha * (oceanTarget - oceanSmoothed);

    // Apply smoothed values to GainNodes
    for (let i = 0; i < NUM_BUSES; i++) {
        if (gains[i] && buffers[i]) {
            // Water bus: max(LC-fraction water, ocean detector)
            const value =
                i === WATER_BUS_INDEX ? Math.max(busSmoothed[i], oceanSmoothed) : busSmoothed[i];
            gains[i].gain.value = value;
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
            oceanSmoothed = oceanTarget;
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
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: 48000,
        });

        masterGain = audioCtx.createGain();
        masterGain.gain.value = 1.0;
        masterGain.connect(audioCtx.destination);

        for (let i = 0; i < NUM_BUSES; i++) {
            gains[i] = audioCtx.createGain();
            gains[i].gain.value = 0;
            gains[i].connect(masterGain);
        }

        document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
    }

    suspended = false;

    // Zero EMA state so stale values from a previous session don't cause
    // an audible pop (e.g. water bus loud → stop → navigate to desert → start)
    busTargets.fill(0);
    busSmoothed.fill(0);
    oceanTarget = 0;
    oceanSmoothed = 0;

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
    loadingStarted = false; // allow retry of failed samples on next start()
    let loadingStateChanged = false;
    for (let i = 0; i < NUM_BUSES; i++) {
        if (loadingStates[i].status === 'loading') {
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

export const engine = {
    start,
    stop,
    update,
    getLoadingStates,
    setOnLoadingUpdate,
    isRunning,
};
