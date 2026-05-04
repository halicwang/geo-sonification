// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockAudioContext } from '../_helpers/audio-context-mock.js';
import { createVoiceScheduler } from '../../audio/voice-scheduler.js';

/**
 * Build a minimal `bufferCache` shape that only exposes `has(i)` and
 * `get(i)`. Buffers are mock objects with a `duration` field — the
 * scheduler uses that for `computeLoopCycleSeconds`.
 *
 * @param {Array<{ duration: number } | null>} buffers
 */
function makeBufferCache(buffers) {
    return {
        has: (i) => Boolean(buffers[i]),
        get: (i) => buffers[i] ?? null,
    };
}

function makeBuffer(duration = 30) {
    return { duration };
}

const NUM_BUSES = 7;

function buildDeps({ allBuffersReady = true, suspended = false } = {}) {
    const audioCtx = createMockAudioContext({ currentTime: 100 });
    const busGains = Array.from({ length: NUM_BUSES }, () =>
        audioCtx.createGain.getMockImplementation()()
    );
    const buffers = Array.from({ length: NUM_BUSES }, () =>
        allBuffersReady ? makeBuffer() : null
    );
    const bufferCache = makeBufferCache(buffers);
    let isSuspendedFlag = suspended;
    return {
        audioCtx,
        busGains,
        bufferCache,
        deps: {
            audioCtx,
            busGains,
            bufferCache,
            isSuspended: () => isSuspendedFlag,
        },
        setSuspended(v) {
            isSuspendedFlag = v;
        },
    };
}

describe('voice-scheduler — public surface', () => {
    it('createVoiceScheduler returns the documented methods', () => {
        const { deps } = buildDeps();
        const scheduler = createVoiceScheduler(deps);
        for (const fn of [
            'startAllSources',
            'stopAllSources',
            'scheduleGlobalSwap',
            'clearGlobalSwapTimer',
            'getLoopProgress',
            'seekLoop',
        ]) {
            expect(typeof scheduler[fn]).toBe('function');
        }
    });
});

describe('voice-scheduler — startAllSources', () => {
    let env;
    let scheduler;

    beforeEach(() => {
        env = buildDeps({ allBuffersReady: true });
        scheduler = createVoiceScheduler(env.deps);
    });

    it('creates one buffer source per bus when all buffers are cached', () => {
        scheduler.startAllSources();
        // 7 buses → 7 buffer sources + 7 voice gains created during startAllSources.
        expect(env.audioCtx.createBufferSource).toHaveBeenCalledTimes(NUM_BUSES);
    });

    it('skips buses whose buffers are not cached', () => {
        const { deps, audioCtx } = buildDeps({ allBuffersReady: false });
        const sched = createVoiceScheduler(deps);
        sched.startAllSources();
        expect(audioCtx.createBufferSource).not.toHaveBeenCalled();
    });

    it('arms a swap timer scheduled before the loop boundary', () => {
        const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
        scheduler.startAllSources();
        // Exactly one timer is armed: scheduleGlobalSwap fires at end of startAllSources.
        const newTimers = setTimeoutSpy.mock.calls.filter(
            // setTimeout(cb, ms) — ignore zero-arg / cleanup calls used elsewhere
            ([, ms]) => typeof ms === 'number'
        );
        expect(newTimers.length).toBeGreaterThanOrEqual(1);
        setTimeoutSpy.mockRestore();
    });
});

describe('voice-scheduler — stopAllSources', () => {
    it('makes getLoopProgress return null after stop', () => {
        const env = buildDeps();
        const scheduler = createVoiceScheduler(env.deps);
        scheduler.startAllSources();
        // After startAllSources, getLoopProgress should be non-null.
        expect(scheduler.getLoopProgress()).not.toBeNull();
        scheduler.stopAllSources();
        expect(scheduler.getLoopProgress()).toBeNull();
    });

    it('clears the global swap timer', () => {
        const env = buildDeps();
        const scheduler = createVoiceScheduler(env.deps);
        const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
        scheduler.startAllSources();
        const callsBefore = clearTimeoutSpy.mock.calls.length;
        scheduler.stopAllSources();
        // stopAllSources → clearLoopClockState → clearGlobalSwapTimer must have run.
        expect(clearTimeoutSpy.mock.calls.length).toBeGreaterThan(callsBefore);
        clearTimeoutSpy.mockRestore();
    });
});

describe('voice-scheduler — getLoopProgress', () => {
    it('returns null before any loop is started', () => {
        const env = buildDeps();
        const scheduler = createVoiceScheduler(env.deps);
        expect(scheduler.getLoopProgress()).toBeNull();
    });

    it('reports a progress value between 0 and 1 once running', () => {
        const env = buildDeps();
        const scheduler = createVoiceScheduler(env.deps);
        scheduler.startAllSources();
        const result = scheduler.getLoopProgress();
        expect(result).not.toBeNull();
        expect(result.progress).toBeGreaterThanOrEqual(0);
        expect(result.progress).toBeLessThanOrEqual(1);
        expect(result.cycleSeconds).toBeGreaterThan(0);
    });

    it('returns null while suspended', () => {
        const env = buildDeps();
        const scheduler = createVoiceScheduler(env.deps);
        scheduler.startAllSources();
        env.setSuspended(true);
        expect(scheduler.getLoopProgress()).toBeNull();
    });
});

describe('voice-scheduler — scheduleGlobalSwap', () => {
    it('does not arm a timer while suspended', () => {
        const env = buildDeps({ suspended: true });
        const scheduler = createVoiceScheduler(env.deps);
        const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
        scheduler.startAllSources();
        // startAllSources internally calls scheduleGlobalSwap. With isSuspended()
        // true, the early-return guard inside scheduleGlobalSwap should prevent
        // setTimeout from being scheduled by the swap path. (Voice-creation
        // setTimeouts are not used — `source.start` schedules at AudioContext
        // time, not via setTimeout.)
        const swapTimers = setTimeoutSpy.mock.calls.filter(([, ms]) => typeof ms === 'number');
        expect(swapTimers.length).toBe(0);
        setTimeoutSpy.mockRestore();
    });
});

describe('voice-scheduler — seekLoop', () => {
    it('is a no-op when no loop has been started', () => {
        const env = buildDeps();
        const scheduler = createVoiceScheduler(env.deps);
        scheduler.seekLoop(0.5); // should not throw
        expect(env.audioCtx.createBufferSource).not.toHaveBeenCalled();
    });

    it('restarts voices at the seek offset when a loop is running', () => {
        const env = buildDeps();
        const scheduler = createVoiceScheduler(env.deps);
        scheduler.startAllSources();
        const firstStartCount = env.audioCtx.createBufferSource.mock.calls.length;
        scheduler.seekLoop(0.5);
        // seekLoop creates a fresh voice per bus → 7 new buffer sources.
        expect(env.audioCtx.createBufferSource.mock.calls.length).toBe(firstStartCount + NUM_BUSES);
    });
});
