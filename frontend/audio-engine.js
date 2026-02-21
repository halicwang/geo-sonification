/**
 * Geo-Sonification — Web Audio engine.
 *
 * Five-bus ambient crossfade with three-level ocean detection.
 * Receives server-computed bus targets via engine.update(audioParams).
 * Applies EMA smoothing and writes to GainNodes via requestAnimationFrame.
 *
 * AudioContext lifecycle:
 *   - start() creates context + source nodes, resumes if suspended
 *   - stop() suspends context (sources stay connected, loop forever)
 *   - visibilitychange: suspend on hidden, resume+snap on visible
 *   - No-data timeout: fade to silence after 3s, suspend after 10s
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

/** EMA time constant in ms (matches crossfade_controller.js default). */
const SMOOTHING_TIME_MS = 500;

/** If dt exceeds this, snap to target instead of smoothing. */
const SNAP_THRESHOLD_MS = 2000;

/** Milliseconds of no update() calls before starting fade to silence. */
const NO_DATA_FADE_START_MS = 3000;

/** Total no-data time before suspending AudioContext. */
const NO_DATA_SUSPEND_MS = 10000;

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

/** @type {AudioBufferSourceNode[]} */
const sourceNodes = new Array(NUM_BUSES).fill(null);

/** @type {AudioBuffer[]} */
const buffers = new Array(NUM_BUSES).fill(null);

// ── EMA state ──
const busTargets = new Float64Array(NUM_BUSES);
const busSmoothed = new Float64Array(NUM_BUSES);
let oceanTarget = 0;
let oceanSmoothed = 0;

// ── Timing ──
let lastEmaTime = 0;
let lastUpdateTime = 0;
let rafId = null;
let suspended = false;

// ── No-data timeout ──
let noDataTimerId = null;
let noDataSuspendTimerId = null;

// ── Loading ──

/**
 * @typedef {Object} BusLoadingState
 * @property {'pending'|'loading'|'ready'|'error'} status
 * @property {number} progress - 0.0 to 1.0
 * @property {string|null} error
 */

/** @type {BusLoadingState[]} */
const loadingStates = BUS_NAMES.map(() => ({ status: 'pending', progress: 0, error: null }));
let loadingStarted = false;

/** @type {function(BusLoadingState[]): void} */
let onLoadingUpdate = null;

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

// ════════════════════════════════════════════════════════════════════
//  WAV Loading
// ════════════════════════════════════════════════════════════════════

/**
 * Load and decode a single ambience WAV file with progress tracking.
 * On error, sets status to 'error' — other buses continue normally.
 * @param {number} busIndex
 * @returns {Promise<void>}
 */
async function loadSample(busIndex) {
    const name = BUS_NAMES[busIndex];
    loadingStates[busIndex] = { status: 'loading', progress: 0, error: null };
    notifyLoadingUpdate();

    try {
        const response = await fetch(`/audio/ambience/${name}.wav`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} for ${name}.wav`);
        }

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

        const combined = new Uint8Array(loaded);
        let offset = 0;
        for (const chunk of chunks) {
            combined.set(chunk, offset);
            offset += chunk.length;
        }

        buffers[busIndex] = await audioCtx.decodeAudioData(combined.buffer);
        loadingStates[busIndex] = { status: 'ready', progress: 1, error: null };
        notifyLoadingUpdate();

        createSourceForBus(busIndex);
    } catch (err) {
        console.error(`[audio-engine] Failed to load ${name}.wav:`, err);
        loadingStates[busIndex] = {
            status: 'error',
            progress: 0,
            error: err.message || 'Load failed',
        };
        notifyLoadingUpdate();
    }
}

/**
 * Load all samples with priority ordering.
 * Tree + water first (parallel), then crop + urban + bare (parallel).
 */
async function loadAllSamples() {
    if (loadingStarted) return;
    loadingStarted = true;

    await Promise.all(PRIORITY_FIRST.map((i) => loadSample(i)));
    await Promise.all(PRIORITY_SECOND.map((i) => loadSample(i)));
}

/**
 * Create a looping AudioBufferSourceNode for a bus and connect to its gain.
 * Called once per bus after decoding succeeds. Never calls source.stop().
 * @param {number} busIndex
 */
function createSourceForBus(busIndex) {
    if (!audioCtx || !buffers[busIndex] || sourceNodes[busIndex]) return;

    const source = audioCtx.createBufferSource();
    source.buffer = buffers[busIndex];
    source.loop = true;
    source.connect(gains[busIndex]);
    source.start(0);
    sourceNodes[busIndex] = source;
}

// ════════════════════════════════════════════════════════════════════
//  EMA Update (called from WS message handler)
// ════════════════════════════════════════════════════════════════════

/**
 * Receive new audio parameters from the server and compute one EMA step.
 *
 * Uses performance.now() for timing, NOT requestAnimationFrame.
 * rAF only reads the smoothed values and applies them to GainNodes.
 *
 * @param {Object} audioParams
 * @param {number[]} audioParams.busTargets - 5 floats [tree, crop, urban, bare, water]
 * @param {number} audioParams.oceanLevel - 0.0, 0.7, or 1.0
 */
function update(audioParams) {
    if (!audioCtx || suspended) return;
    if (!audioParams) return;

    const now = performance.now();

    if (Array.isArray(audioParams.busTargets)) {
        for (let i = 0; i < NUM_BUSES; i++) {
            busTargets[i] = clamp01(audioParams.busTargets[i] ?? 0);
        }
    }
    if (typeof audioParams.oceanLevel === 'number') {
        oceanTarget = clamp01(audioParams.oceanLevel);
    }

    const dt = lastEmaTime > 0 ? now - lastEmaTime : 0;
    lastEmaTime = now;
    lastUpdateTime = now;

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

    resetNoDataTimeout();
}

// ════════════════════════════════════════════════════════════════════
//  rAF Loop (applies smoothed values to GainNodes)
// ════════════════════════════════════════════════════════════════════

function rafLoop() {
    if (!audioCtx || suspended) return;

    // When no data is flowing, continue smoothing toward zero targets
    const now = performance.now();
    if (lastUpdateTime > 0 && now - lastUpdateTime > NO_DATA_FADE_START_MS) {
        const dt = lastEmaTime > 0 ? now - lastEmaTime : 0;
        lastEmaTime = now;
        if (dt > 0 && dt <= SNAP_THRESHOLD_MS) {
            const alpha = 1 - Math.exp(-dt / SMOOTHING_TIME_MS);
            for (let i = 0; i < NUM_BUSES; i++) {
                busSmoothed[i] += alpha * (busTargets[i] - busSmoothed[i]);
            }
            oceanSmoothed += alpha * (oceanTarget - oceanSmoothed);
        }
    }

    for (let i = 0; i < NUM_BUSES; i++) {
        if (gains[i] && buffers[i]) {
            // Water bus: max(LC-fraction water, ocean detector)
            // Mirrors Max patch [maximum] wiring
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
//  No-Data Timeout
// ════════════════════════════════════════════════════════════════════

function resetNoDataTimeout() {
    clearTimeout(noDataTimerId);
    clearTimeout(noDataSuspendTimerId);

    noDataTimerId = setTimeout(() => {
        // No data for 3 seconds: fade targets to silence
        busTargets.fill(0);
        oceanTarget = 0;

        noDataSuspendTimerId = setTimeout(() => {
            if (audioCtx && audioCtx.state === 'running') {
                audioCtx.suspend();
            }
        }, NO_DATA_SUSPEND_MS - NO_DATA_FADE_START_MS);
    }, NO_DATA_FADE_START_MS);
}

function clearNoDataTimers() {
    clearTimeout(noDataTimerId);
    clearTimeout(noDataSuspendTimerId);
    noDataTimerId = null;
    noDataSuspendTimerId = null;
}

// ════════════════════════════════════════════════════════════════════
//  Visibility Change Handler
// ════════════════════════════════════════════════════════════════════

function handleVisibilityChange() {
    if (!audioCtx) return;

    if (document.hidden) {
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
    lastEmaTime = performance.now();
    startRaf();
    resetNoDataTimeout();

    loadAllSamples();
}

/**
 * Stop the audio engine. Suspends AudioContext but keeps source nodes
 * connected so they can resume without recreation.
 */
async function stop() {
    suspended = true;
    cancelRaf();
    clearNoDataTimers();

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
