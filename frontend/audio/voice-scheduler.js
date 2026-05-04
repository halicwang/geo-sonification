// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Geo-Sonification — Voice scheduler for the ambient loop graph.
 *
 * Owns per-bus double-buffered voices (A/B), the global crossfade swap
 * timer, and the loop-cycle clock. Extracted from `audio/engine.js` so
 * the engine module can focus on EMA smoothing, lifecycle, and the
 * Web Audio master chain.
 *
 * The scheduler is bound to a specific AudioContext + bus-gain array +
 * buffer cache via {@link createVoiceScheduler}. It keeps its own
 * private state per instance and exposes only the entry points the
 * engine needs to wire it into start / stop / visibility change /
 * progress / seek.
 *
 * Loop playback model:
 *   - Each bus uses double-buffered voices (A/B) instead of loop=true.
 *   - At cycle boundary (buffer duration - overlap), next voice starts at 0s.
 *   - Outgoing voice fades out while incoming fades in over the overlap.
 *
 * @module frontend/audio/voice-scheduler
 */

import {
    LOOP_OVERLAP_SECONDS,
    LOOP_START_LOOKAHEAD_SECONDS,
    LOOP_TIMER_LOOKAHEAD_SECONDS,
    VOICE_STOP_GRACE_SECONDS,
    LATE_SWAP_LOOKAHEAD_SECONDS,
    RECOVERY_FADE_SECONDS,
    SWAP_LATE_WARN_SECONDS,
} from './constants.js';
import { clamp01, equalPowerCurves } from './utils.js';

/** Resolution of equal-power fade curves. */
const XF_CURVE_POINTS = 128;

// Equal-power crossfade curves reduce perceived loudness dip at midpoint.
// Computed once at module load — the curves are deps-free, so sharing
// them across scheduler instances is fine.
const { fadeIn: FADE_IN_CURVE, fadeOut: FADE_OUT_CURVE } = equalPowerCurves(XF_CURVE_POINTS);

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

/**
 * Schedule cleanup of a voice after its fade-out window.
 *
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
 * @typedef {Object} VoiceSchedulerDeps
 * @property {AudioContext} audioCtx - Already-created context (non-null).
 * @property {GainNode[]} busGains - Per-bus gain node array; entries are
 *   the destinations the scheduler connects voices into.
 * @property {{ has(i:number):boolean, get(i:number): AudioBuffer|null }} bufferCache
 *   - Buffer-cache surface (only `has` and `get` are used).
 * @property {() => boolean} isSuspended - Returns the engine's current
 *   suspend flag. Read on every scheduling / swap entry so engine.stop()
 *   is observed without push notifications.
 */

/**
 * @typedef {Object} VoiceScheduler
 * @property {() => void} startAllSources
 * @property {() => void} stopAllSources
 * @property {() => void} scheduleGlobalSwap
 * @property {() => void} clearGlobalSwapTimer
 * @property {() => ({progress:number,cycleSeconds:number}|null)} getLoopProgress
 * @property {(progress:number) => void} seekLoop
 */

/**
 * Create a voice scheduler bound to the engine's audio resources.
 *
 * @param {VoiceSchedulerDeps} deps
 * @returns {VoiceScheduler}
 */
export function createVoiceScheduler(deps) {
    const { audioCtx, busGains, bufferCache, isSuspended } = deps;
    const NUM_BUSES = busGains.length;

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
     *
     * @param {number} busIndex
     * @param {number} startTime
     * @param {number} [offsetSeconds=0]
     * @returns {LoopSlot|null}
     */
    function createVoice(busIndex, startTime, offsetSeconds = 0) {
        const buffer = bufferCache.get(busIndex);
        if (!buffer || !busGains[busIndex]) return null;

        const source = audioCtx.createBufferSource();
        const gain = audioCtx.createGain();

        source.buffer = buffer;
        source.connect(gain);
        gain.connect(busGains[busIndex]);

        const maxOffset = Math.max(0, source.buffer.duration - 1e-3);
        const safeOffset = Number.isFinite(offsetSeconds)
            ? Math.max(0, Math.min(offsetSeconds, maxOffset))
            : 0;
        source.start(startTime, safeOffset);

        return { source, gain };
    }

    /**
     * Compute global cycle length from decoded buffers. Uses min(duration)
     * for safety if files differ by a few samples.
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
            console.error('[audio/voice-scheduler] Invalid loop cycle:', {
                minDuration,
                overlap: LOOP_OVERLAP_SECONDS,
            });
            return 0;
        }
        return cycle;
    }

    /**
     * Perform one bus-local crossfade at a shared global swap time.
     *
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

        if (isSuspended()) return;
        if (!(loopCycleSeconds > 0) || !(nextGlobalSwapTime > 0)) return;

        const delaySec = nextGlobalSwapTime - audioCtx.currentTime - LOOP_TIMER_LOOKAHEAD_SECONDS;
        const delayMs = Math.max(0, delaySec * 1000);

        globalSwapTimerId = setTimeout(() => {
            globalSwapTimerId = null;
            performGlobalSwap();
        }, delayMs);
    }

    function performGlobalSwap() {
        if (isSuspended()) return;
        if (!(loopCycleSeconds > 0) || !(nextGlobalSwapTime > 0)) return;

        const plannedSwapTime = nextGlobalSwapTime;
        const now = audioCtx.currentTime;
        const swapTime =
            plannedSwapTime >= now ? plannedSwapTime : now + LATE_SWAP_LOOKAHEAD_SECONDS;
        const phaseDelaySeconds = Math.max(0, swapTime - plannedSwapTime);
        const incomingOffsetSeconds = phaseDelaySeconds % loopCycleSeconds;

        if (phaseDelaySeconds > SWAP_LATE_WARN_SECONDS) {
            console.warn(
                `[audio/voice-scheduler] Late loop swap: ${(phaseDelaySeconds * 1000).toFixed(1)}ms behind`
            );
        }

        for (let i = 0; i < NUM_BUSES; i++) {
            if (bufferCache.has(i)) {
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
     * Start one voice per decoded bus in lockstep, then run a global swap
     * clock that performs LOOP_OVERLAP_SECONDS-wide overlap crossfades at
     * each cycle boundary.
     */
    function startAllSources() {
        stopAllSources();

        const cycleSeconds = computeLoopCycleSeconds();
        if (!(cycleSeconds > 0)) return;

        const when = audioCtx.currentTime + LOOP_START_LOOKAHEAD_SECONDS;
        let startedCount = 0;

        for (let i = 0; i < NUM_BUSES; i++) {
            if (!bufferCache.has(i)) continue;

            const first = createVoice(i, when);
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

    /** Get current playback position within the loop cycle. */
    function getLoopProgress() {
        if (isSuspended() || !(loopCycleSeconds > 0) || !(nextGlobalSwapTime > 0)) {
            return null;
        }
        const elapsed = loopCycleSeconds - (nextGlobalSwapTime - audioCtx.currentTime);
        return {
            progress: clamp01(elapsed / loopCycleSeconds),
            cycleSeconds: loopCycleSeconds,
        };
    }

    /**
     * Seek all buses to a position within the current loop cycle. Stops all
     * current voices and restarts them at the target buffer offset.
     *
     * @param {number} progress - 0.0 to 1.0 position within the cycle
     */
    function seekLoop(progress) {
        if (isSuspended() || !(loopCycleSeconds > 0)) return;

        const normalizedProgress = clamp01(progress);
        const targetOffset = normalizedProgress === 1 ? 0 : normalizedProgress * loopCycleSeconds;
        const now = audioCtx.currentTime;
        const startTime = now + LATE_SWAP_LOOKAHEAD_SECONDS;

        clearGlobalSwapTimer();
        resetAllBusLoops();

        let startedCount = 0;
        for (let i = 0; i < NUM_BUSES; i++) {
            if (!bufferCache.has(i)) continue;

            const voice = createVoice(i, startTime, targetOffset);
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

    return {
        startAllSources,
        stopAllSources,
        scheduleGlobalSwap,
        clearGlobalSwapTimer,
        getLoopProgress,
        seekLoop,
    };
}
