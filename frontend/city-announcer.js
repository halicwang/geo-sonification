// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Geo-Sonification — City name voice announcement with stereo panning.
 *
 * After the user dwells at a location for 500 ms, finds the nearest
 * major city (spatial logic in `frontend/city-spatial.js`) and plays a
 * pre-generated TTS audio clip (loaded + cached by
 * `frontend/city-cache.js`) through Web Audio with a StereoPannerNode.
 * The pan value is derived from the city's horizontal position in the
 * viewport.
 *
 * Audio routing bypasses the LP filter chain so announcements stay crisp
 * regardless of the proximity-driven cutoff.
 *
 * @module frontend/city-announcer
 */

import { engine } from './audio/engine.js';
import { findNearestCity, findCityInCenter, computePan } from './city-spatial.js';
import {
    getCities,
    isCitiesLoaded,
    maybeRetryLoadCities,
    loadCityAudio,
    getCachedCityAudio,
} from './city-cache.js';

// ============ Constants ============

/** Dwell time: how long the viewport must stay still before triggering (ms). */
const DWELL_MS = 500;

/** Minimum zoom level to trigger city detection (proximity > 0.5 → zoom > 5). */
const MIN_ZOOM = 5;

/** Minimum gap between announcements (ms). */
const COOLDOWN_MS = 4000;

/** Minimum zoom for the flyby trigger (proximity = 1.0 → zoom >= 6). */
const FLYBY_MIN_ZOOM = 6;

/** Throttle interval for move events during drag (ms). */
const MOVE_THROTTLE_MS = 200;

/**
 * TTS gain relative to master volume. Announcer output is a parallel
 * path that bypasses the ambience chain (masterGain →
 * duckGain → makeupGain(+12 dB) → limiter → lpFilters), so the TTS
 * does NOT receive the master loudness-normalization makeup. Running
 * near unity keeps the voice clearly audible above the ducked
 * ambience (0.3 × makeup ≈ 1.2× at the DAC); staying below 1.0
 * leaves headroom since this path has no limiter of its own.
 */
const TTS_GAIN_RATIO = 0.8;

/** Fade-in duration for the announcement (seconds). */
const FADE_IN_S = 0.05;

// ============ Module State ============

let lastAnnouncedCity = null;
let lastAnnounceTime = 0;
let dwellTimer = null;
let enabled = false;
let currentSource = null;
let lastMoveCheck = 0;

// ============ Audio Playback ============

/**
 * Play a city announcement through Web Audio with stereo panning.
 * Routing: AudioBufferSource → GainNode → StereoPannerNode → destination
 * (bypasses the LP filter chain)
 *
 * @param {AudioBuffer} buffer
 * @param {number} pan  -1 to +1
 */
function playAnnouncement(buffer, pan) {
    const ctx = engine.getContext();
    if (!ctx || ctx.state !== 'running') return;

    // Stop any in-progress announcement
    if (currentSource) {
        try {
            currentSource.stop();
        } catch {
            /* already stopped */
        }
        currentSource = null;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(
        engine.getVolume() * TTS_GAIN_RATIO,
        ctx.currentTime + FADE_IN_S
    );

    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;

    source.connect(gain);
    gain.connect(panner);
    panner.connect(ctx.destination);

    source.onended = () => {
        source.disconnect();
        gain.disconnect();
        panner.disconnect();
        if (currentSource === source) currentSource = null;
        engine.unduck();
    };

    engine.duck();
    source.start();
    currentSource = source;
}

// ============ Trigger Logic ============

/**
 * Core check: verify all conditions and announce if appropriate.
 *
 * @param {number} centerLat
 * @param {number} centerLng
 * @param {{west: number, east: number, north: number, south: number}} bounds
 */
async function checkAndAnnounce(centerLat, centerLng, bounds) {
    if (!enabled || !engine.isRunning()) return;
    maybeRetryLoadCities();
    const cities = getCities();
    if (!isCitiesLoaded() || cities.length === 0) return;

    const now = performance.now();
    if (now - lastAnnounceTime < COOLDOWN_MS) return;

    const city = findNearestCity(centerLat, centerLng, bounds, cities);
    if (!city) return;
    if (city.name === lastAnnouncedCity) return;

    const buffer = await loadCityAudio(city.slug);
    if (!buffer) return;

    // Re-check conditions after async load
    if (!enabled || !engine.isRunning()) return;

    const pan = computePan(city.lng, bounds.west, bounds.east);
    playAnnouncement(buffer, pan);

    lastAnnouncedCity = city.name;
    lastAnnounceTime = performance.now();
}

// ============ Exported API ============

/**
 * Called on map moveend.  Resets the dwell timer — if no further movement
 * occurs within DWELL_MS, triggers city detection.
 *
 * @param {number} centerLat
 * @param {number} centerLng
 * @param {number} zoom       current map zoom level
 * @param {{west: number, east: number, north: number, south: number}} bounds
 */
function onViewportSettle(centerLat, centerLng, zoom, bounds) {
    if (dwellTimer !== null) clearTimeout(dwellTimer);

    if (!enabled || zoom < MIN_ZOOM) return;

    dwellTimer = setTimeout(() => {
        dwellTimer = null;
        checkAndAnnounce(centerLat, centerLng, bounds);
    }, DWELL_MS);
}

/**
 * Called on map move (during drag).  At max proximity (zoom >= 6),
 * checks if a city has entered the center circle and announces it.
 * Throttled to avoid excessive computation.
 *
 * @param {number} centerLat
 * @param {number} centerLng
 * @param {number} zoom
 * @param {{west: number, east: number, north: number, south: number}} bounds
 */
function onViewportMove(centerLat, centerLng, zoom, bounds) {
    if (!enabled || zoom < FLYBY_MIN_ZOOM) return;
    maybeRetryLoadCities();
    const cities = getCities();
    if (!isCitiesLoaded() || cities.length === 0) return;

    const now = performance.now();
    if (now - lastMoveCheck < MOVE_THROTTLE_MS) return;
    lastMoveCheck = now;

    if (now - lastAnnounceTime < COOLDOWN_MS) return;

    const city = findCityInCenter(centerLat, centerLng, bounds, cities);
    if (!city || city.name === lastAnnouncedCity) return;

    // For flyby, only play if buffer is already cached (no async fetch during drag)
    const buffer = getCachedCityAudio(city.slug);
    if (!buffer) {
        // Start loading for next time, but don't block
        loadCityAudio(city.slug);
        return;
    }

    if (!engine.isRunning()) return;

    const pan = computePan(city.lng, bounds.west, bounds.east);
    playAnnouncement(buffer, pan);
    lastAnnouncedCity = city.name;
    lastAnnounceTime = performance.now();
}

/**
 * Enable or disable announcements.  Disabling internally calls reset() so
 * pending dwell timers and in-flight audio do not leak past the toggle.
 *
 * @param {boolean} value
 */
function setEnabled(value) {
    const wasEnabled = enabled;
    enabled = value;
    if (wasEnabled && !value) reset();
}

/** Clear state (on audio stop). */
function reset() {
    lastAnnouncedCity = null;
    lastAnnounceTime = 0;
    if (dwellTimer !== null) {
        clearTimeout(dwellTimer);
        dwellTimer = null;
    }
    if (currentSource) {
        try {
            currentSource.stop();
        } catch {
            /* already stopped */
        }
        currentSource = null;
    }
}

export const announcer = {
    onViewportSettle,
    onViewportMove,
    setEnabled,
    reset,
};
