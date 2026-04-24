// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Geo-Sonification — City name voice announcement with stereo panning.
 *
 * After the user dwells at a location for 500 ms, finds the nearest
 * major city (from a pre-built database) and plays a pre-generated TTS
 * audio clip through Web Audio with a StereoPannerNode.  The pan value
 * is derived from the city's horizontal position in the viewport.
 *
 * Audio routing bypasses the LP filter chain so announcements stay crisp
 * regardless of the proximity-driven cutoff.
 *
 * @module frontend/city-announcer
 */

import { BASE_PATH } from './config.js';
import { engine } from './audio-engine.js';

// ============ Constants ============

/** Dwell time: how long the viewport must stay still before triggering (ms). */
const DWELL_MS = 500;

/** Minimum zoom level to trigger city detection (proximity > 0.5 → zoom > 5). */
const MIN_ZOOM = 5;

/** Minimum gap between announcements (ms). */
const COOLDOWN_MS = 4000;

/** Minimum zoom for the flyby trigger (proximity = 1.0 → zoom >= 6). */
const FLYBY_MIN_ZOOM = 6;

/** Center circle radius as a fraction of viewport width (0–1). */
const CENTER_RADIUS_FRACTION = 0.15;

/** Throttle interval for move events during drag (ms). */
const MOVE_THROTTLE_MS = 200;

/** Max cached AudioBuffers for city clips. */
const BUFFER_CACHE_SIZE = 50;

/** Population priority exponent. Higher = more weight to big cities. */
const POP_PRIORITY_EXPONENT = 0.15;

/**
 * TTS gain relative to master volume. Announcer output is a parallel
 * path that bypasses audio-engine's ambience chain (masterGain →
 * duckGain → makeupGain(+12 dB) → limiter → lpFilters), so the TTS
 * does NOT receive the master loudness-normalization makeup. Running
 * near unity keeps the voice clearly audible above the ducked
 * ambience (0.3 × makeup ≈ 1.2× at the DAC); staying below 1.0
 * leaves headroom since this path has no limiter of its own.
 */
const TTS_GAIN_RATIO = 0.8;

/** Fade-in duration for the announcement (seconds). */
const FADE_IN_S = 0.05;

/** Backoff between cities.json retry attempts while still unloaded (ms). */
const CITIES_RETRY_MS = 30000;

// ============ Module State ============

let lastAnnouncedCity = null;
let lastAnnounceTime = 0;
let dwellTimer = null;
let enabled = false;
let currentSource = null;
let lastMoveCheck = 0;

/** @type {Array<{name: string, lat: number, lng: number, pop: number, slug: string}>} */
let cities = [];
let citiesLoaded = false;
let lastLoadAttempt = 0;

/** @type {Map<string, AudioBuffer>} slug → decoded AudioBuffer */
const bufferCache = new Map();

// ============ City Database ============

async function loadCities() {
    if (citiesLoaded) return;
    lastLoadAttempt = performance.now();
    try {
        const res = await fetch(`${BASE_PATH}/data/cities.json`);
        if (!res.ok) {
            console.warn('[CityAnnouncer] Failed to load cities.json:', res.status);
            return;
        }
        cities = await res.json();
        citiesLoaded = true;
    } catch (err) {
        console.warn('[CityAnnouncer] Error loading cities.json:', err);
    }
}

// Start loading immediately on module init
loadCities();

/** Re-issue a cities.json fetch if the previous attempt failed and the backoff elapsed. */
function maybeRetryLoadCities() {
    if (citiesLoaded) return;
    if (performance.now() - lastLoadAttempt < CITIES_RETRY_MS) return;
    loadCities();
}

// ============ Spatial Lookup ============

/**
 * Normalize viewport longitude bounds into a continuous range so antimeridian
 * crossings (for example 170 -> -170) become 170 -> 190.
 *
 * @param {{west: number, east: number, north: number, south: number}} bounds
 * @returns {{west: number, east: number, north: number, south: number, span: number, centerLng: number}}
 */
function normalizeViewportBounds(bounds) {
    const west = Number.isFinite(bounds?.west) ? bounds.west : 0;
    let east = Number.isFinite(bounds?.east) ? bounds.east : west;
    if (east < west) {
        east += 360;
    }
    if (east - west >= 360) {
        east = west + 360;
    }

    return {
        west,
        east,
        south: Number.isFinite(bounds?.south) ? bounds.south : -90,
        north: Number.isFinite(bounds?.north) ? bounds.north : 90,
        span: east - west,
        centerLng: west + (east - west) / 2,
    };
}

/**
 * Project a longitude into the viewport's continuous longitude range.
 *
 * @param {number} lng
 * @param {{west: number, east: number, centerLng: number, span: number}} viewport
 * @returns {number}
 */
function projectLngToViewport(lng, viewport) {
    const candidates = [lng - 360, lng, lng + 360];
    let best = lng;
    let bestDist = Infinity;

    for (const candidate of candidates) {
        const dist = Math.abs(candidate - viewport.centerLng);
        if (dist < bestDist) {
            best = candidate;
            bestDist = dist;
        }
        if (viewport.span >= 360 || (candidate >= viewport.west && candidate <= viewport.east)) {
            return candidate;
        }
    }

    return best;
}

/**
 * Find the nearest major city within the current viewport bounds.
 * @param {number} centerLat
 * @param {number} centerLng
 * @param {{west: number, east: number, north: number, south: number}} bounds
 * @returns {{name: string, slug: string, lat: number, lng: number, pop: number}|null}
 */
function findNearestCity(centerLat, centerLng, bounds) {
    const viewport = normalizeViewportBounds(bounds);
    const projectedCenterLng = projectLngToViewport(centerLng, viewport);
    let best = null;
    let bestScore = Infinity;

    for (const city of cities) {
        const projectedCityLng = projectLngToViewport(city.lng, viewport);

        // Skip cities outside viewport
        if (
            city.lat < viewport.south ||
            city.lat > viewport.north ||
            (viewport.span < 360 &&
                (projectedCityLng < viewport.west || projectedCityLng > viewport.east))
        ) {
            continue;
        }

        const dlat = city.lat - centerLat;
        const dlng = projectedCityLng - projectedCenterLng;
        const dist = dlat * dlat + dlng * dlng;
        const score = dist / Math.pow(Math.max(city.pop, 1), POP_PRIORITY_EXPONENT);

        if (score < bestScore) {
            bestScore = score;
            best = city;
        }
    }

    return best;
}

/**
 * Compute stereo pan value from a city's horizontal position in the viewport.
 * @param {number} cityLng
 * @param {number} west   viewport west bound
 * @param {number} east   viewport east bound
 * @returns {number}  -1 (left) to +1 (right)
 */
function computePan(cityLng, west, east) {
    const viewport = normalizeViewportBounds({ west, east, south: -90, north: 90 });
    if (viewport.span <= 0) return 0;
    const projectedCityLng = projectLngToViewport(cityLng, viewport);
    const viewportX = (projectedCityLng - viewport.west) / viewport.span; // 0..1
    return Math.max(-1, Math.min(1, viewportX * 2 - 1));
}

// ============ Audio Playback ============

/**
 * Load and decode a city's M4A audio file.
 * @param {string} slug
 * @returns {Promise<AudioBuffer|null>}
 */
async function loadCityAudio(slug) {
    if (bufferCache.has(slug)) return bufferCache.get(slug);

    const ctx = engine.getContext();
    if (!ctx) return null;

    try {
        const res = await fetch(`${BASE_PATH}/audio/cities/${slug}.m4a`);
        if (!res.ok) return null;
        const arrayBuf = await res.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuf);

        // FIFO eviction — buffers are write-once, so insertion-order works.
        if (bufferCache.size >= BUFFER_CACHE_SIZE) {
            const oldest = bufferCache.keys().next().value;
            bufferCache.delete(oldest);
        }
        bufferCache.set(slug, audioBuffer);
        return audioBuffer;
    } catch {
        return null;
    }
}

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
 * @param {number} centerLat
 * @param {number} centerLng
 * @param {{west: number, east: number, north: number, south: number}} bounds
 */
async function checkAndAnnounce(centerLat, centerLng, bounds) {
    if (!enabled || !engine.isRunning()) return;
    maybeRetryLoadCities();
    if (!citiesLoaded || cities.length === 0) return;

    const now = performance.now();
    if (now - lastAnnounceTime < COOLDOWN_MS) return;

    const city = findNearestCity(centerLat, centerLng, bounds);
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

// ============ Flyby (drag) Trigger ============

/**
 * Find a city within a small circle around the viewport center.
 * @param {number} centerLat
 * @param {number} centerLng
 * @param {{west: number, east: number, north: number, south: number}} bounds
 * @returns {{name: string, slug: string, lat: number, lng: number, pop: number}|null}
 */
function findCityInCenter(centerLat, centerLng, bounds) {
    const viewport = normalizeViewportBounds(bounds);
    const projectedCenterLng = projectLngToViewport(centerLng, viewport);
    const radiusLng = viewport.span * CENTER_RADIUS_FRACTION;
    const radiusLat = (viewport.north - viewport.south) * CENTER_RADIUS_FRACTION;
    const r2 = radiusLng * radiusLng + radiusLat * radiusLat;

    let best = null;
    let bestScore = Infinity;

    for (const city of cities) {
        if (city.lat < viewport.south || city.lat > viewport.north) continue;

        const projectedCityLng = projectLngToViewport(city.lng, viewport);
        if (
            viewport.span < 360 &&
            (projectedCityLng < viewport.west || projectedCityLng > viewport.east)
        ) {
            continue;
        }

        const dlat = city.lat - centerLat;
        const dlng = projectedCityLng - projectedCenterLng;
        const dist = dlat * dlat + dlng * dlng;
        if (dist < r2) {
            const score = dist / Math.pow(Math.max(city.pop, 1), POP_PRIORITY_EXPONENT);
            if (score < bestScore) {
                bestScore = score;
                best = city;
            }
        }
    }

    return best;
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
    if (!citiesLoaded || cities.length === 0) return;

    const now = performance.now();
    if (now - lastMoveCheck < MOVE_THROTTLE_MS) return;
    lastMoveCheck = now;

    if (now - lastAnnounceTime < COOLDOWN_MS) return;

    const city = findCityInCenter(centerLat, centerLng, bounds);
    if (!city || city.name === lastAnnouncedCity) return;

    // For flyby, only play if buffer is already cached (no async fetch during drag)
    const buffer = bufferCache.get(city.slug);
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
