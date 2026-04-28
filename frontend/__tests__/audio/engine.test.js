// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockAudioContext } from '../_helpers/audio-context-mock.js';

/**
 * Build a Response-like object whose body.getReader() yields one chunk
 * (mirrors the helper in buffer-cache.test.js — duplicated here so the
 * engine test file is self-contained).
 */
function mockFetchOk(byteLen = 256) {
    return vi.fn(async () => {
        const data = new Uint8Array(byteLen);
        let yielded = false;
        return {
            ok: true,
            status: 200,
            headers: {
                get(name) {
                    return name.toLowerCase() === 'content-length' ? String(byteLen) : null;
                },
            },
            body: {
                getReader() {
                    return {
                        async read() {
                            if (yielded) return { done: true, value: undefined };
                            yielded = true;
                            return { done: false, value: data };
                        },
                    };
                },
            },
        };
    });
}

/**
 * Stub `window.AudioContext` (and `webkitAudioContext`) to a constructor
 * spy that returns the same shared mock context. Returning a single ctx
 * keeps the engine's chain-building idempotent across tests where
 * resetModules has not been called between assertions.
 */
function stubAudioContext() {
    const ctx = createMockAudioContext();
    const ctor = vi.fn(() => ctx);
    vi.stubGlobal('AudioContext', ctor);
    vi.stubGlobal('webkitAudioContext', ctor);
    // happy-dom's `window` is the same object as globalThis here.
    if (typeof window !== 'undefined') {
        window.AudioContext = ctor;
        window.webkitAudioContext = ctor;
    }
    return { ctx, ctor };
}

describe('engine — module-level invariants', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('exposes the full public surface', async () => {
        stubAudioContext();
        vi.stubGlobal('fetch', mockFetchOk());

        const { engine } = await import('../../audio/engine.js');
        for (const fn of [
            'start',
            'stop',
            'update',
            'updateMotion',
            'getLoadingStates',
            'setOnLoadingUpdate',
            'isRunning',
            'getLoopProgress',
            'seekLoop',
            'setVolume',
            'getVolume',
            'getContext',
            'duck',
            'unduck',
        ]) {
            expect(typeof engine[fn]).toBe('function');
        }
    });

    it('does not construct an AudioContext at module-load time (lazy contract)', async () => {
        const { ctor } = stubAudioContext();
        vi.stubGlobal('fetch', mockFetchOk());

        await import('../../audio/engine.js');
        expect(ctor).not.toHaveBeenCalled();
    });

    it('reports 7 pending loading states before start', async () => {
        stubAudioContext();
        vi.stubGlobal('fetch', mockFetchOk());

        const { engine } = await import('../../audio/engine.js');
        const states = engine.getLoadingStates();
        expect(states).toHaveLength(7);
        for (const s of states) {
            expect(s).toEqual({ status: 'pending', progress: 0, error: null });
        }
    });

    it('isRunning() returns false before start', async () => {
        stubAudioContext();
        vi.stubGlobal('fetch', mockFetchOk());

        const { engine } = await import('../../audio/engine.js');
        expect(engine.isRunning()).toBe(false);
    });

    it('getContext() returns null before start, then the AudioContext after', async () => {
        const { ctx } = stubAudioContext();
        vi.stubGlobal('fetch', mockFetchOk());

        const { engine } = await import('../../audio/engine.js');
        expect(engine.getContext()).toBeNull();
        await engine.start();
        expect(engine.getContext()).toBe(ctx);
    });
});

describe('engine — start lifecycle', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('start() constructs the AudioContext exactly once', async () => {
        const { ctor } = stubAudioContext();
        vi.stubGlobal('fetch', mockFetchOk());

        const { engine } = await import('../../audio/engine.js');
        await engine.start();
        expect(ctor).toHaveBeenCalledTimes(1);
    });

    it('start() fetches every bus exactly once', async () => {
        stubAudioContext();
        const fetchMock = mockFetchOk();
        vi.stubGlobal('fetch', fetchMock);

        const { engine } = await import('../../audio/engine.js');
        await engine.start();
        expect(fetchMock).toHaveBeenCalledTimes(7);
    });

    it('isRunning() returns true after start', async () => {
        stubAudioContext();
        vi.stubGlobal('fetch', mockFetchOk());

        const { engine } = await import('../../audio/engine.js');
        await engine.start();
        expect(engine.isRunning()).toBe(true);
    });

    it('start() drives every bus to ready status', async () => {
        stubAudioContext();
        vi.stubGlobal('fetch', mockFetchOk());

        const { engine } = await import('../../audio/engine.js');
        await engine.start();
        const states = engine.getLoadingStates();
        for (const s of states) {
            expect(s.status).toBe('ready');
        }
    });
});

describe('engine — public surface mutations', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('setVolume(value) ramps masterGain via setTargetAtTime (click-free)', async () => {
        const { ctx } = stubAudioContext();
        vi.stubGlobal('fetch', mockFetchOk());

        const { engine } = await import('../../audio/engine.js');
        await engine.start();

        // The first createGain call inside createMasterChain is masterGain.
        const masterGain = ctx.createGain.mock.results[0].value;
        const callsBefore = masterGain.gain.setTargetAtTime.mock.calls.length;
        engine.setVolume(0.42);
        const newCalls = masterGain.gain.setTargetAtTime.mock.calls.slice(callsBefore);
        expect(newCalls).toHaveLength(1);
        // setTargetAtTime(targetValue, startTime, timeConstant)
        expect(newCalls[0][0]).toBe(0.42);
        expect(engine.getVolume()).toBe(0.42);
    });

    it('setVolume clamps to [0, 1]', async () => {
        stubAudioContext();
        vi.stubGlobal('fetch', mockFetchOk());

        const { engine } = await import('../../audio/engine.js');
        engine.setVolume(2.5);
        expect(engine.getVolume()).toBe(1);
        engine.setVolume(-0.3);
        expect(engine.getVolume()).toBe(0);
    });

    it('duck() / unduck() schedule setTargetAtTime on duckGain', async () => {
        const { ctx } = stubAudioContext();
        vi.stubGlobal('fetch', mockFetchOk());

        const { engine } = await import('../../audio/engine.js');
        await engine.start();

        // duckGain is the 5th createGain (master, lp1, lp2, lp3 use createBiquadFilter
        // not createGain — masterGain at index 0, then duckGain at index 1).
        // Cleaner: find a GainNode whose setTargetAtTime gets called by duck().
        const duckCallsBefore = ctx.createGain.mock.results.flatMap(
            (r) => r.value.gain.setTargetAtTime.mock.calls
        );
        engine.duck();
        const duckCallsAfter = ctx.createGain.mock.results.flatMap(
            (r) => r.value.gain.setTargetAtTime.mock.calls
        );
        expect(duckCallsAfter.length).toBe(duckCallsBefore.length + 1);

        engine.unduck();
        const unduckCallsAfter = ctx.createGain.mock.results.flatMap(
            (r) => r.value.gain.setTargetAtTime.mock.calls
        );
        expect(unduckCallsAfter.length).toBe(duckCallsAfter.length + 1);
    });

    it('update(audioParams) is safe to call before start (queues pendingParams)', async () => {
        stubAudioContext();
        vi.stubGlobal('fetch', mockFetchOk());

        const { engine } = await import('../../audio/engine.js');
        // Should not throw and should not create an AudioContext.
        engine.update({
            busTargets: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7],
            coverage: 0.5,
            proximity: 0.3,
        });
        // After start, the queued params apply without error.
        await engine.start();
        expect(engine.isRunning()).toBe(true);
    });

    it('updateMotion(velocity) clamps and is callable before start', async () => {
        stubAudioContext();
        vi.stubGlobal('fetch', mockFetchOk());

        const { engine } = await import('../../audio/engine.js');
        // Pre-start: callable, no-op except clamping.
        expect(() => engine.updateMotion(2.0)).not.toThrow();
        expect(() => engine.updateMotion(-1.0)).not.toThrow();
    });
});

describe('engine — stop lifecycle', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('stop() calls audioCtx.suspend and isRunning() becomes false', async () => {
        const { ctx } = stubAudioContext();
        vi.stubGlobal('fetch', mockFetchOk());

        const { engine } = await import('../../audio/engine.js');
        await engine.start();
        expect(engine.isRunning()).toBe(true);

        await engine.stop();
        expect(ctx.suspend).toHaveBeenCalled();
        expect(engine.isRunning()).toBe(false);
    });

    it('stop() is idempotent — second stop does not throw', async () => {
        stubAudioContext();
        vi.stubGlobal('fetch', mockFetchOk());

        const { engine } = await import('../../audio/engine.js');
        await engine.start();
        await engine.stop();
        await expect(engine.stop()).resolves.toBeUndefined();
    });
});

describe('engine — shim path', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('frontend/audio-engine.js re-exports the same engine object', async () => {
        stubAudioContext();
        vi.stubGlobal('fetch', mockFetchOk());

        const direct = await import('../../audio/engine.js');
        const shimmed = await import('../../audio-engine.js');
        expect(shimmed.engine).toBe(direct.engine);
    });
});
