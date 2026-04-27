// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

import { describe, it, expect } from 'vitest';
import { createMockAudioContext, advanceMockClock } from '../_helpers/audio-context-mock.js';

describe('mock AudioContext', () => {
    it('builds a chainable graph and records connect calls', () => {
        const ctx = createMockAudioContext();
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();

        source.connect(gain).connect(ctx.destination);

        expect(source.connect).toHaveBeenCalledWith(gain);
        expect(gain.connect).toHaveBeenCalledWith(ctx.destination);
        expect(ctx.createBufferSource).toHaveBeenCalledTimes(1);
        expect(ctx.createGain).toHaveBeenCalledTimes(1);
    });

    it('exposes a settable currentTime via the fake clock', () => {
        const ctx = createMockAudioContext({ currentTime: 0 });
        expect(ctx.currentTime).toBe(0);
        advanceMockClock(ctx, 1.5);
        expect(ctx.currentTime).toBe(1.5);
    });
});
