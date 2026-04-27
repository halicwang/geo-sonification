// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

import { describe, it, expect } from 'vitest';
import { createEmaState, tickEma, snapEmaToTargets, resetEma } from '../../audio/raf-loop.js';

const NUM_BUSES = 7;

// Mirrors the engine's import block — the values that live alongside in
// frontend/audio/constants.js. Hard-coded here so the test stays
// self-contained (a constant change would intentionally trip these).
const OPTS = Object.freeze({
    smoothingTimeMs: 500,
    proximitySmoothingMs: 120,
    snapThresholdMs: 2000,
    velocityAttackMs: 50,
    velocityDecayMs: 600,
});

describe('createEmaState', () => {
    it('zeros every field except coverage which defaults to 1', () => {
        const s = createEmaState({ numBuses: NUM_BUSES });
        expect(s.busTargets).toBeInstanceOf(Float64Array);
        expect(s.busTargets).toHaveLength(NUM_BUSES);
        expect(s.busSmoothed).toHaveLength(NUM_BUSES);
        for (let i = 0; i < NUM_BUSES; i++) {
            expect(s.busTargets[i]).toBe(0);
            expect(s.busSmoothed[i]).toBe(0);
        }
        expect(s.coverageTarget).toBe(1);
        expect(s.coverageSmoothed).toBe(1);
        expect(s.proximityTarget).toBe(0);
        expect(s.proximitySmoothed).toBe(0);
        expect(s.velocityTarget).toBe(0);
        expect(s.velocitySmoothed).toBe(0);
    });
});

describe('tickEma', () => {
    it('returns the same state object so callers can chain', () => {
        const s = createEmaState({ numBuses: NUM_BUSES });
        const ret = tickEma(s, 16, OPTS);
        expect(ret).toBe(s);
    });

    it('applies the EMA blend `1 - exp(-dt/τ)` per call', () => {
        const s = createEmaState({ numBuses: NUM_BUSES });
        s.busTargets[0] = 1;
        s.busSmoothed[0] = 0;
        s.coverageTarget = 0.5;
        s.coverageSmoothed = 0;
        // Use 16 ms with the bus/coverage time constant of 500 ms.
        tickEma(s, 16, OPTS);
        const expected = 1 - Math.exp(-16 / 500);
        expect(s.busSmoothed[0]).toBeCloseTo(expected, 9);
        // coverage shares the same alpha:
        expect(s.coverageSmoothed).toBeCloseTo(0.5 * expected, 9);
    });

    it('uses the proximity time constant for proximity (faster than buses)', () => {
        const s = createEmaState({ numBuses: NUM_BUSES });
        s.proximityTarget = 1;
        s.proximitySmoothed = 0;
        tickEma(s, 16, OPTS);
        const expected = 1 - Math.exp(-16 / 120);
        expect(s.proximitySmoothed).toBeCloseTo(expected, 9);
    });

    it('snaps to target when dt = 0 (first-frame case after start)', () => {
        const s = createEmaState({ numBuses: NUM_BUSES });
        s.busTargets[3] = 0.42;
        s.proximityTarget = 0.7;
        s.coverageTarget = 0.3;
        s.velocityTarget = 0.9;
        tickEma(s, 0, OPTS);
        expect(s.busSmoothed[3]).toBeCloseTo(0.42, 12);
        expect(s.proximitySmoothed).toBeCloseTo(0.7, 12);
        expect(s.coverageSmoothed).toBeCloseTo(0.3, 12);
        expect(s.velocitySmoothed).toBeCloseTo(0.9, 12);
    });

    it('snaps to target when dt > snapThresholdMs (resume-from-hidden case)', () => {
        const s = createEmaState({ numBuses: NUM_BUSES });
        s.busTargets[2] = 0.6;
        s.proximityTarget = 0.4;
        // 5000ms is well over the 2000ms snap threshold.
        tickEma(s, 5000, OPTS);
        expect(s.busSmoothed[2]).toBeCloseTo(0.6, 12);
        expect(s.proximitySmoothed).toBeCloseTo(0.4, 12);
    });

    it('uses the fast attack time constant when velocityTarget > velocitySmoothed', () => {
        const s = createEmaState({ numBuses: NUM_BUSES });
        s.velocityTarget = 1;
        s.velocitySmoothed = 0;
        tickEma(s, 16, OPTS);
        const expectedAttack = 1 - Math.exp(-16 / 50);
        expect(s.velocitySmoothed).toBeCloseTo(expectedAttack, 9);
    });

    it('uses the slow decay time constant when velocityTarget ≤ velocitySmoothed', () => {
        const s = createEmaState({ numBuses: NUM_BUSES });
        s.velocityTarget = 0;
        s.velocitySmoothed = 1;
        tickEma(s, 16, OPTS);
        const expectedDecay = 1 - Math.exp(-16 / 600);
        // smoothed += decayAlpha * (0 - 1) → smoothed = 1 - decayAlpha
        expect(s.velocitySmoothed).toBeCloseTo(1 - expectedDecay, 9);
    });

    it('1000 ticks of 16 ms dt converges within ±0.1% of target (proposal §11 DoD)', () => {
        const s = createEmaState({ numBuses: NUM_BUSES });
        s.busTargets[0] = 0.7;
        s.busTargets[6] = 0.3;
        for (let k = 0; k < 1000; k++) {
            tickEma(s, 16, OPTS);
        }
        expect(Math.abs(s.busSmoothed[0] - 0.7)).toBeLessThan(0.0007);
        expect(Math.abs(s.busSmoothed[6] - 0.3)).toBeLessThan(0.0003);
    });
});

describe('snapEmaToTargets', () => {
    it('equalizes smoothed = target for buses, coverage, proximity', () => {
        const s = createEmaState({ numBuses: NUM_BUSES });
        s.busTargets[0] = 0.5;
        s.busTargets[3] = 0.9;
        s.coverageTarget = 0.4;
        s.proximityTarget = 0.6;
        snapEmaToTargets(s);
        expect(s.busSmoothed[0]).toBe(0.5);
        expect(s.busSmoothed[3]).toBe(0.9);
        expect(s.coverageSmoothed).toBe(0.4);
        expect(s.proximitySmoothed).toBe(0.6);
    });

    it('special-cases velocitySmoothed to 0 (does not snap to velocityTarget)', () => {
        const s = createEmaState({ numBuses: NUM_BUSES });
        s.velocityTarget = 0.8;
        s.velocitySmoothed = 0.5;
        snapEmaToTargets(s);
        expect(s.velocityTarget).toBe(0.8); // target untouched
        expect(s.velocitySmoothed).toBe(0); // smoothed reset
    });
});

describe('resetEma', () => {
    it('zeros every field except coverage which goes back to 1', () => {
        const s = createEmaState({ numBuses: NUM_BUSES });
        // Mutate everything to non-default values.
        for (let i = 0; i < NUM_BUSES; i++) {
            s.busTargets[i] = 0.5;
            s.busSmoothed[i] = 0.4;
        }
        s.coverageTarget = 0.2;
        s.coverageSmoothed = 0.3;
        s.proximityTarget = 0.7;
        s.proximitySmoothed = 0.8;
        s.velocityTarget = 0.9;
        s.velocitySmoothed = 0.6;

        resetEma(s);

        for (let i = 0; i < NUM_BUSES; i++) {
            expect(s.busTargets[i]).toBe(0);
            expect(s.busSmoothed[i]).toBe(0);
        }
        expect(s.coverageTarget).toBe(1);
        expect(s.coverageSmoothed).toBe(1);
        expect(s.proximityTarget).toBe(0);
        expect(s.proximitySmoothed).toBe(0);
        expect(s.velocityTarget).toBe(0);
        expect(s.velocitySmoothed).toBe(0);
    });
});
