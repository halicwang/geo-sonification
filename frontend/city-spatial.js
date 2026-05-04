// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Geo-Sonification — Pure spatial helpers for the city-announcer.
 *
 * Antimeridian-safe viewport normalization, longitude projection into a
 * continuous range, nearest-city + center-circle search, and stereo-pan
 * derivation. Extracted from `city-announcer.js` so the trigger /
 * playback orchestrator stays focused on dwell + cooldown + Web Audio
 * routing, and so the math can be unit-tested in isolation (the
 * announcer module itself depends on `engine` + Web Audio).
 *
 * @module frontend/city-spatial
 */

/** Center circle radius as a fraction of viewport width (0–1). */
export const CENTER_RADIUS_FRACTION = 0.15;

/**
 * Population priority exponent. Higher values weight large cities more
 * heavily when ranking candidates by `dist² / pop^EXPONENT`.
 */
export const POP_PRIORITY_EXPONENT = 0.15;

/**
 * @typedef {Object} ViewportBounds
 * @property {number} west
 * @property {number} east
 * @property {number} north
 * @property {number} south
 */

/**
 * @typedef {Object} NormalizedViewport
 * @property {number} west
 * @property {number} east
 * @property {number} north
 * @property {number} south
 * @property {number} span
 * @property {number} centerLng
 */

/**
 * @typedef {Object} CityRecord
 * @property {string} name
 * @property {string} slug
 * @property {number} lat
 * @property {number} lng
 * @property {number} pop
 */

/**
 * Normalize viewport longitude bounds into a continuous range so antimeridian
 * crossings (for example 170 → -170) become 170 → 190.
 *
 * @param {Partial<ViewportBounds>} bounds
 * @returns {NormalizedViewport}
 */
export function normalizeViewportBounds(bounds) {
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
 * @param {Pick<NormalizedViewport, 'west'|'east'|'centerLng'|'span'>} viewport
 * @returns {number}
 */
export function projectLngToViewport(lng, viewport) {
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
 * Find the nearest major city within the current viewport bounds. Score is
 * `dist² / pop^POP_PRIORITY_EXPONENT` — large cities pull rank toward
 * themselves so the announcer prefers Tokyo over a 40 km-closer suburb.
 *
 * @param {number} centerLat
 * @param {number} centerLng
 * @param {ViewportBounds} bounds
 * @param {CityRecord[]} cities
 * @returns {CityRecord|null}
 */
export function findNearestCity(centerLat, centerLng, bounds, cities) {
    const viewport = normalizeViewportBounds(bounds);
    const projectedCenterLng = projectLngToViewport(centerLng, viewport);
    let best = null;
    let bestScore = Infinity;

    for (const city of cities) {
        const projectedCityLng = projectLngToViewport(city.lng, viewport);

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
 * Find a city within a small circle around the viewport center.
 *
 * @param {number} centerLat
 * @param {number} centerLng
 * @param {ViewportBounds} bounds
 * @param {CityRecord[]} cities
 * @returns {CityRecord|null}
 */
export function findCityInCenter(centerLat, centerLng, bounds, cities) {
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

/**
 * Compute stereo pan value from a city's horizontal position in the viewport.
 *
 * @param {number} cityLng
 * @param {number} west - viewport west bound
 * @param {number} east - viewport east bound
 * @returns {number} -1 (left) to +1 (right)
 */
export function computePan(cityLng, west, east) {
    const viewport = normalizeViewportBounds({ west, east, south: -90, north: 90 });
    if (viewport.span <= 0) return 0;
    const projectedCityLng = projectLngToViewport(cityLng, viewport);
    const viewportX = (projectedCityLng - viewport.west) / viewport.span; // 0..1
    return Math.max(-1, Math.min(1, viewportX * 2 - 1));
}
