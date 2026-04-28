// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Hand-rolled Web Audio API mock for vitest + happy-dom.
 *
 * happy-dom does not implement Web Audio. This helper provides the
 * minimum surface that frontend/audio/* + city-announcer.js exercise.
 *
 * Every node factory returns a chainable object so `a.connect(b).connect(c)`
 * compiles. Each node carries vi spies on `connect` / `disconnect` so tests
 * can assert routing topology. AudioParam-like properties (gain, frequency,
 * pan, Q, threshold, knee, ratio, attack, release) expose `setValueAtTime` /
 * `linearRampToValueAtTime` / `exponentialRampToValueAtTime` /
 * `cancelScheduledValues` / `setTargetAtTime`.
 *
 * `currentTime` is a getter on a settable internal `_now` so tests can
 * inject a fake clock without monkey-patching globals.
 */

import { vi } from 'vitest';

function makeAudioParam(initialValue = 0) {
    return {
        value: initialValue,
        defaultValue: initialValue,
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
        setTargetAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
        cancelAndHoldAtTime: vi.fn(),
    };
}

function makeNode(extra = {}) {
    const node = {
        connect: vi.fn(),
        disconnect: vi.fn(),
        ...extra,
    };
    // `connect` returns the destination so `a.connect(b).connect(c)` works.
    node.connect.mockImplementation((dest) => dest);
    return node;
}

function makeBuffer({ numberOfChannels = 2, length = 44100, sampleRate = 48000 } = {}) {
    return {
        numberOfChannels,
        length,
        sampleRate,
        duration: length / sampleRate,
        getChannelData: vi.fn(() => new Float32Array(length)),
        copyFromChannel: vi.fn(),
        copyToChannel: vi.fn(),
    };
}

/**
 * Create a fresh mock AudioContext.
 * @param {{ sampleRate?: number, currentTime?: number }} [opts]
 */
export function createMockAudioContext(opts = {}) {
    const ctx = {
        _now: opts.currentTime ?? 0,
        sampleRate: opts.sampleRate ?? 48000,
        state: 'running',
    };

    Object.defineProperty(ctx, 'currentTime', {
        get() {
            return ctx._now;
        },
        configurable: true,
    });

    ctx.destination = makeNode({ channelCount: 2, maxChannelCount: 2 });
    ctx.listener = makeNode({
        positionX: makeAudioParam(),
        positionY: makeAudioParam(),
        positionZ: makeAudioParam(),
    });

    ctx.createGain = vi.fn(() => makeNode({ gain: makeAudioParam(1) }));

    ctx.createBufferSource = vi.fn(() =>
        makeNode({
            buffer: null,
            loop: false,
            loopStart: 0,
            loopEnd: 0,
            playbackRate: makeAudioParam(1),
            detune: makeAudioParam(0),
            start: vi.fn(),
            stop: vi.fn(),
            onended: null,
        })
    );

    ctx.createPanner = vi.fn(() =>
        makeNode({
            panningModel: 'HRTF',
            distanceModel: 'inverse',
            refDistance: 1,
            maxDistance: 10000,
            rolloffFactor: 1,
            coneInnerAngle: 360,
            coneOuterAngle: 0,
            coneOuterGain: 0,
            positionX: makeAudioParam(),
            positionY: makeAudioParam(),
            positionZ: makeAudioParam(),
            orientationX: makeAudioParam(),
            orientationY: makeAudioParam(),
            orientationZ: makeAudioParam(),
            setPosition: vi.fn(),
            setOrientation: vi.fn(),
        })
    );

    ctx.createBiquadFilter = vi.fn(() =>
        makeNode({
            type: 'lowpass',
            frequency: makeAudioParam(350),
            detune: makeAudioParam(0),
            Q: makeAudioParam(1),
            gain: makeAudioParam(0),
            getFrequencyResponse: vi.fn(),
        })
    );

    ctx.createDynamicsCompressor = vi.fn(() =>
        makeNode({
            threshold: makeAudioParam(-24),
            knee: makeAudioParam(30),
            ratio: makeAudioParam(12),
            attack: makeAudioParam(0.003),
            release: makeAudioParam(0.25),
            reduction: 0,
        })
    );

    ctx.createBuffer = vi.fn((numberOfChannels, length, sampleRate) =>
        makeBuffer({ numberOfChannels, length, sampleRate })
    );

    ctx.decodeAudioData = vi.fn(async (_arrayBuffer) => makeBuffer());

    ctx.suspend = vi.fn(async () => {
        ctx.state = 'suspended';
    });
    ctx.resume = vi.fn(async () => {
        ctx.state = 'running';
    });
    ctx.close = vi.fn(async () => {
        ctx.state = 'closed';
    });

    return ctx;
}

/**
 * Advance the mock clock by `dt` seconds. Tests use this in place of
 * monkey-patching `Date.now` or `performance.now`.
 * @param {ReturnType<typeof createMockAudioContext>} ctx
 * @param {number} dt
 */
export function advanceMockClock(ctx, dt) {
    ctx._now += dt;
}
