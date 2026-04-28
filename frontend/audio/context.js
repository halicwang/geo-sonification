// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Master signal chain factory for the geo-sonification audio engine.
 *
 * Builds the per-AudioContext routing graph:
 *
 *   busGains[i]  ──►  masterGain  ──►  duckGain  ──►  [makeupGain ──►  limiter ──►]?  lpFilter1  ──►  lpFilter2  ──►  lpFilter3  ──►  destination
 *
 * The `makeupGain → limiter` link is inserted only when loudness
 * normalization is enabled (proposal §7 / M3 -16 LUFS work). Filter Q
 * values implement a 6th-order Butterworth low-pass at 20 kHz cutoff.
 *
 * Stateless: the factory does not retain references after returning.
 * Caller owns the returned nodes and is responsible for downstream
 * mutation (gain ramps, frequency cutoff sweeps, etc.).
 *
 * @module frontend/audio/context
 */

import { dbToLinear } from './utils.js';

/**
 * @typedef {Object} MasterChainOptions
 * @property {number} masterVolume - initial master gain (linear, 0..1)
 * @property {boolean} loudnessNormEnabled - insert makeup + limiter when true
 * @property {number} numBuses - count of per-bus GainNodes summing into masterGain
 * @property {number} makeupGainDb - makeup gain in dB applied post-masterGain
 * @property {number} limiterThresholdDb
 * @property {number} limiterRatio
 * @property {number} limiterAttackSec
 * @property {number} limiterReleaseSec
 * @property {number} limiterKneeDb
 */

/**
 * @typedef {Object} MasterChain
 * @property {GainNode} masterGain
 * @property {GainNode} duckGain - modulated by duck() / unduck() during city-announcer speech
 * @property {BiquadFilterNode} lpFilter1 - cutoff driven by proximity in rafLoop
 * @property {BiquadFilterNode} lpFilter2
 * @property {BiquadFilterNode} lpFilter3
 * @property {GainNode[]} busGains - length === opts.numBuses, all start at gain 0
 */

/**
 * Build the master signal chain on the given AudioContext.
 *
 * @param {AudioContext} audioCtx
 * @param {MasterChainOptions} opts
 * @returns {MasterChain}
 */
export function createMasterChain(audioCtx, opts) {
    const masterGain = audioCtx.createGain();
    masterGain.gain.value = opts.masterVolume;

    // 36 dB/oct low-pass: three cascaded 12 dB/oct biquads.
    // Q values for 6th-order Butterworth (maximally flat, no resonance).
    // Cutoff driven by proximity in rafLoop().
    const lpFilter1 = audioCtx.createBiquadFilter();
    lpFilter1.type = 'lowpass';
    lpFilter1.frequency.value = 20000;
    lpFilter1.Q.value = 0.5176;

    const lpFilter2 = audioCtx.createBiquadFilter();
    lpFilter2.type = 'lowpass';
    lpFilter2.frequency.value = 20000;
    lpFilter2.Q.value = 0.7071;

    const lpFilter3 = audioCtx.createBiquadFilter();
    lpFilter3.type = 'lowpass';
    lpFilter3.frequency.value = 20000;
    lpFilter3.Q.value = 1.9319;

    // duckGain is driven by duck() / unduck(); unity while idle, pulls
    // down to DUCK_DEPTH during city-announcer speech.
    const duckGain = audioCtx.createGain();
    duckGain.gain.value = 1.0;

    if (opts.loudnessNormEnabled) {
        // makeupGain offsets the summed-bus output toward the
        // -16 LUFS target; limiter catches transients so the
        // true peak stays below -1 dBTP. Both are created once
        // per AudioContext lifetime and never revisited, so
        // neither needs a caller-side handle.
        const makeupGain = audioCtx.createGain();
        makeupGain.gain.value = dbToLinear(opts.makeupGainDb);

        const limiter = audioCtx.createDynamicsCompressor();
        limiter.threshold.value = opts.limiterThresholdDb;
        limiter.ratio.value = opts.limiterRatio;
        limiter.attack.value = opts.limiterAttackSec;
        limiter.release.value = opts.limiterReleaseSec;
        limiter.knee.value = opts.limiterKneeDb;

        masterGain.connect(duckGain);
        duckGain.connect(makeupGain);
        makeupGain.connect(limiter);
        limiter.connect(lpFilter1);
        console.info(
            `[audio] Loudness norm ON — makeup ${opts.makeupGainDb.toFixed(1)} dB, limiter threshold ${opts.limiterThresholdDb} dB`
        );
    } else {
        masterGain.connect(duckGain);
        duckGain.connect(lpFilter1);
        console.info('[audio] Loudness norm OFF — legacy chain');
    }
    lpFilter1.connect(lpFilter2);
    lpFilter2.connect(lpFilter3);
    lpFilter3.connect(audioCtx.destination);

    const busGains = new Array(opts.numBuses);
    for (let i = 0; i < opts.numBuses; i++) {
        busGains[i] = audioCtx.createGain();
        busGains[i].gain.value = 0;
        busGains[i].connect(masterGain);
    }

    return { masterGain, duckGain, lpFilter1, lpFilter2, lpFilter3, busGains };
}
