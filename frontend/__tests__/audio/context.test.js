// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMasterChain } from '../../audio/context.js';
import { createMockAudioContext } from '../_helpers/audio-context-mock.js';
import { dbToLinear } from '../../audio/utils.js';

const NUM_BUSES = 7;

const baseOpts = Object.freeze({
    masterVolume: 0.8,
    numBuses: NUM_BUSES,
    makeupGainDb: 12,
    limiterThresholdDb: -3,
    limiterRatio: 20,
    limiterAttackSec: 0.003,
    limiterReleaseSec: 0.25,
    limiterKneeDb: 6,
});

/**
 * Resolve a mock connect-call list into the destinations actually targeted,
 * ignoring chainable return-value plumbing.
 */
function destsOf(node) {
    return node.connect.mock.calls.map((args) => args[0]);
}

describe('createMasterChain — loudness-on path', () => {
    /** @type {ReturnType<typeof createMockAudioContext>} */
    let ctx;
    /** @type {ReturnType<typeof createMasterChain>} */
    let chain;
    let infoSpy;

    beforeEach(() => {
        ctx = createMockAudioContext();
        infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
        chain = createMasterChain(ctx, { ...baseOpts, loudnessNormEnabled: true });
    });

    it('returns the named-node bag with all references populated', () => {
        expect(chain.masterGain).toBeDefined();
        expect(chain.duckGain).toBeDefined();
        expect(chain.lpFilter1).toBeDefined();
        expect(chain.lpFilter2).toBeDefined();
        expect(chain.lpFilter3).toBeDefined();
        expect(chain.busGains).toHaveLength(NUM_BUSES);
    });

    it('routes masterGain → duckGain → makeupGain → limiter → lpFilter1', () => {
        // masterGain is the first node downstream of buses.
        expect(destsOf(chain.masterGain)).toEqual([chain.duckGain]);

        // duckGain bridges into the makeup/limiter pair.
        const [makeupGain] = destsOf(chain.duckGain);
        expect(makeupGain).toBeDefined();
        expect(makeupGain).not.toBe(chain.lpFilter1);

        const [limiter] = destsOf(makeupGain);
        expect(limiter).toBeDefined();
        // limiter is the only DynamicsCompressor created in this branch.
        expect(ctx.createDynamicsCompressor).toHaveBeenCalledTimes(1);

        expect(destsOf(limiter)).toEqual([chain.lpFilter1]);
    });

    it('cascades lpFilter1 → lpFilter2 → lpFilter3 → destination', () => {
        expect(destsOf(chain.lpFilter1)).toEqual([chain.lpFilter2]);
        expect(destsOf(chain.lpFilter2)).toEqual([chain.lpFilter3]);
        expect(destsOf(chain.lpFilter3)).toEqual([ctx.destination]);
    });

    it('connects every bus gain into masterGain', () => {
        for (let i = 0; i < NUM_BUSES; i++) {
            expect(destsOf(chain.busGains[i])).toEqual([chain.masterGain]);
            expect(chain.busGains[i].gain.value).toBe(0);
        }
    });

    it('traverses 14 connect edges total (7 chain links + 7 buses → master)', () => {
        const [makeupGain] = destsOf(chain.duckGain);
        const [limiter] = destsOf(makeupGain);
        let total = 0;
        for (const node of [
            chain.masterGain,
            chain.duckGain,
            makeupGain,
            limiter,
            chain.lpFilter1,
            chain.lpFilter2,
            chain.lpFilter3,
            ...chain.busGains,
        ]) {
            total += node.connect.mock.calls.length;
        }
        expect(total).toBe(14);
    });

    it('writes filter parameters: 20 kHz cutoff with 6th-order Butterworth Q', () => {
        for (const f of [chain.lpFilter1, chain.lpFilter2, chain.lpFilter3]) {
            expect(f.type).toBe('lowpass');
            expect(f.frequency.value).toBe(20000);
        }
        expect(chain.lpFilter1.Q.value).toBeCloseTo(0.5176, 4);
        expect(chain.lpFilter2.Q.value).toBeCloseTo(0.7071, 4);
        expect(chain.lpFilter3.Q.value).toBeCloseTo(1.9319, 4);
    });

    it('writes master volume + duck unity gain', () => {
        expect(chain.masterGain.gain.value).toBe(0.8);
        expect(chain.duckGain.gain.value).toBe(1.0);
    });

    it('writes makeup gain via dbToLinear and limiter parameters from opts', () => {
        const [makeupGain] = destsOf(chain.duckGain);
        expect(makeupGain.gain.value).toBeCloseTo(dbToLinear(12), 6);

        const [limiter] = destsOf(makeupGain);
        expect(limiter.threshold.value).toBe(-3);
        expect(limiter.ratio.value).toBe(20);
        expect(limiter.attack.value).toBeCloseTo(0.003, 6);
        expect(limiter.release.value).toBeCloseTo(0.25, 6);
        expect(limiter.knee.value).toBe(6);
    });

    it('logs the loudness-on info banner with makeup and threshold values', () => {
        expect(infoSpy).toHaveBeenCalledTimes(1);
        const msg = infoSpy.mock.calls[0][0];
        expect(msg).toContain('Loudness norm ON');
        expect(msg).toContain('makeup 12.0 dB');
        expect(msg).toContain('threshold -3 dB');
    });
});

describe('createMasterChain — loudness-off path', () => {
    /** @type {ReturnType<typeof createMockAudioContext>} */
    let ctx;
    /** @type {ReturnType<typeof createMasterChain>} */
    let chain;
    let infoSpy;

    beforeEach(() => {
        ctx = createMockAudioContext();
        infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
        chain = createMasterChain(ctx, { ...baseOpts, loudnessNormEnabled: false });
    });

    it('skips makeup + limiter; routes masterGain → duckGain → lpFilter1 directly', () => {
        expect(ctx.createDynamicsCompressor).not.toHaveBeenCalled();
        expect(destsOf(chain.masterGain)).toEqual([chain.duckGain]);
        expect(destsOf(chain.duckGain)).toEqual([chain.lpFilter1]);
    });

    it('still cascades lpFilter1 → lpFilter2 → lpFilter3 → destination', () => {
        expect(destsOf(chain.lpFilter1)).toEqual([chain.lpFilter2]);
        expect(destsOf(chain.lpFilter2)).toEqual([chain.lpFilter3]);
        expect(destsOf(chain.lpFilter3)).toEqual([ctx.destination]);
    });

    it('logs the loudness-off banner', () => {
        expect(infoSpy).toHaveBeenCalledWith('[audio] Loudness norm OFF — legacy chain');
    });
});
