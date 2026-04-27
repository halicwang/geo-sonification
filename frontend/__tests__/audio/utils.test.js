// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

import { describe, it, expect } from 'vitest';
import { clamp01, dbToLinear, equalPowerCurves } from '../../audio/utils.js';

describe('clamp01', () => {
    it('passes through values inside [0, 1]', () => {
        expect(clamp01(0)).toBe(0);
        expect(clamp01(0.25)).toBe(0.25);
        expect(clamp01(1)).toBe(1);
    });

    it('clamps below 0 and above 1', () => {
        expect(clamp01(-0.5)).toBe(0);
        expect(clamp01(-Infinity)).toBe(0);
        expect(clamp01(1.5)).toBe(1);
        expect(clamp01(Infinity)).toBe(0);
    });

    it('returns 0 for NaN and non-finite values', () => {
        expect(clamp01(NaN)).toBe(0);
        expect(clamp01(undefined)).toBe(0);
    });
});

describe('dbToLinear', () => {
    it('returns 1 for 0 dB (unity gain)', () => {
        expect(dbToLinear(0)).toBe(1);
    });

    it('returns ~0.501 for -6 dB and ~0.708 for -3 dB', () => {
        expect(dbToLinear(-6)).toBeCloseTo(0.5012, 4);
        expect(dbToLinear(-3)).toBeCloseTo(0.7079, 4);
    });

    it('returns ~3.981 for +12 dB (matches MAKEUP_GAIN_DB)', () => {
        expect(dbToLinear(12)).toBeCloseTo(3.9811, 4);
    });

    it('is monotonic and inverse-symmetric', () => {
        expect(dbToLinear(20)).toBeGreaterThan(dbToLinear(10));
        expect(dbToLinear(-20) * dbToLinear(20)).toBeCloseTo(1, 6);
    });
});

describe('equalPowerCurves', () => {
    it('returns Float32Array pairs of the requested length', () => {
        const { fadeIn, fadeOut } = equalPowerCurves(128);
        expect(fadeIn).toBeInstanceOf(Float32Array);
        expect(fadeOut).toBeInstanceOf(Float32Array);
        expect(fadeIn.length).toBe(128);
        expect(fadeOut.length).toBe(128);
    });

    it('starts at (0, 1) and ends at (1, 0)', () => {
        const { fadeIn, fadeOut } = equalPowerCurves(64);
        expect(fadeIn[0]).toBeCloseTo(0, 6);
        expect(fadeOut[0]).toBeCloseTo(1, 6);
        expect(fadeIn[63]).toBeCloseTo(1, 6);
        expect(fadeOut[63]).toBeCloseTo(0, 6);
    });

    it('preserves equal power: sin^2(t) + cos^2(t) === 1 across the curve', () => {
        const { fadeIn, fadeOut } = equalPowerCurves(33);
        for (let i = 0; i < fadeIn.length; i++) {
            const power = fadeIn[i] * fadeIn[i] + fadeOut[i] * fadeOut[i];
            expect(power).toBeCloseTo(1, 5);
        }
    });
});
