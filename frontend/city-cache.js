// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Geo-Sonification — City database + decoded-audio cache.
 *
 * Holds the in-memory `cities[]` array (loaded from `data/cities.json`
 * once on module init, with a backoff retry if the first attempt
 * failed) and a FIFO cache of decoded TTS AudioBuffers. Extracted from
 * `city-announcer.js` so the trigger / playback orchestrator only
 * concerns itself with dwell, cooldown, and Web Audio routing.
 *
 * @module frontend/city-cache
 */

import { BASE_PATH } from './config.js';
import { engine } from './audio/engine.js';

/** Backoff between cities.json retry attempts while still unloaded (ms). */
const CITIES_RETRY_MS = 30000;

/** Max cached AudioBuffers for city clips. */
const BUFFER_CACHE_SIZE = 50;

// ============ Module State ============

/** @type {import('./city-spatial.js').CityRecord[]} */
let cities = [];
let citiesLoaded = false;
let lastLoadAttempt = 0;

/** @type {Map<string, AudioBuffer>} slug → decoded AudioBuffer */
const audioBufferCache = new Map();

// ============ Cities database ============

async function loadCities() {
    if (citiesLoaded) return;
    lastLoadAttempt = performance.now();
    try {
        const res = await fetch(`${BASE_PATH}/data/cities.json`);
        if (!res.ok) {
            console.warn('[CityCache] Failed to load cities.json:', res.status);
            return;
        }
        cities = await res.json();
        citiesLoaded = true;
    } catch (err) {
        console.warn('[CityCache] Error loading cities.json:', err);
    }
}

// Start loading immediately on module init — same eager pattern the
// city-announcer module used before the split.
loadCities();

/** Re-issue a cities.json fetch if the previous attempt failed and the backoff elapsed. */
export function maybeRetryLoadCities() {
    if (citiesLoaded) return;
    if (performance.now() - lastLoadAttempt < CITIES_RETRY_MS) return;
    loadCities();
}

/** @returns {import('./city-spatial.js').CityRecord[]} */
export function getCities() {
    return cities;
}

/** @returns {boolean} */
export function isCitiesLoaded() {
    return citiesLoaded;
}

// ============ Audio buffer cache ============

/**
 * Load and decode a city's M4A audio file, FIFO-evicting the oldest entry
 * when the cache is full. Returns the decoded buffer; returns the cached
 * buffer immediately on a hit.
 *
 * @param {string} slug
 * @returns {Promise<AudioBuffer|null>}
 */
export async function loadCityAudio(slug) {
    if (audioBufferCache.has(slug)) return audioBufferCache.get(slug);

    const ctx = engine.getContext();
    if (!ctx) return null;

    try {
        const res = await fetch(`${BASE_PATH}/audio/cities/${slug}.m4a`);
        if (!res.ok) return null;
        const arrayBuf = await res.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuf);

        // FIFO eviction — buffers are write-once, so insertion-order works.
        if (audioBufferCache.size >= BUFFER_CACHE_SIZE) {
            const oldest = audioBufferCache.keys().next().value;
            audioBufferCache.delete(oldest);
        }
        audioBufferCache.set(slug, audioBuffer);
        return audioBuffer;
    } catch {
        return null;
    }
}

/**
 * Synchronous cache hit — returns the buffer if it has already been
 * loaded and decoded, `null` otherwise. Used by the flyby (drag) path
 * which must not await during a drag.
 *
 * @param {string} slug
 * @returns {AudioBuffer|null}
 */
export function getCachedCityAudio(slug) {
    return audioBufferCache.get(slug) ?? null;
}
