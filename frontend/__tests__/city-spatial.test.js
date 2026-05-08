// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

import { describe, it, expect } from 'vitest';
import {
    normalizeViewportBounds,
    projectLngToViewport,
    findNearestCity,
    findCityInCenter,
    computePan,
} from '../city-spatial.js';

const TOKYO = { name: 'Tokyo', slug: 'tokyo', lat: 35.6895, lng: 139.6917, pop: 13_960_000 };
const HONOLULU = {
    name: 'Honolulu',
    slug: 'honolulu',
    lat: 21.3069,
    lng: -157.8583,
    pop: 350_000,
};
const NEW_YORK = {
    name: 'New York',
    slug: 'new-york',
    lat: 40.7128,
    lng: -74.006,
    pop: 8_336_000,
};
const SUVA = { name: 'Suva', slug: 'suva', lat: -18.1416, lng: 178.4419, pop: 90_000 };
const BORDER_CITY = {
    // 1° west of antimeridian (lng = -179)
    name: 'Border',
    slug: 'border',
    lat: 0,
    lng: -179,
    pop: 1000,
};

describe('city-spatial — normalizeViewportBounds', () => {
    it('returns the bounds unchanged when east > west', () => {
        const v = normalizeViewportBounds({ west: -10, east: 30, south: -45, north: 45 });
        expect(v.west).toBe(-10);
        expect(v.east).toBe(30);
        expect(v.south).toBe(-45);
        expect(v.north).toBe(45);
        expect(v.span).toBe(40);
        expect(v.centerLng).toBe(10);
    });

    it('shifts east by +360 to span the antimeridian (west=170, east=-170 → 170..190)', () => {
        const v = normalizeViewportBounds({ west: 170, east: -170, south: -10, north: 10 });
        expect(v.east).toBe(190);
        expect(v.span).toBe(20);
        expect(v.centerLng).toBe(180);
    });

    it('caps spans larger than 360° at exactly 360°', () => {
        const v = normalizeViewportBounds({ west: 0, east: 720, south: -90, north: 90 });
        expect(v.east).toBe(360);
        expect(v.span).toBe(360);
    });

    it('falls back to safe defaults for missing fields', () => {
        const v = normalizeViewportBounds({});
        expect(v.west).toBe(0);
        expect(v.east).toBe(0);
        expect(v.south).toBe(-90);
        expect(v.north).toBe(90);
        expect(v.span).toBe(0);
    });

    it('treats null bounds the same as empty', () => {
        const v = normalizeViewportBounds(null);
        expect(v.west).toBe(0);
        expect(v.east).toBe(0);
    });
});

describe('city-spatial — projectLngToViewport', () => {
    it('returns the longitude unchanged when it falls inside the viewport span', () => {
        const v = normalizeViewportBounds({ west: -20, east: 20, south: -45, north: 45 });
        expect(projectLngToViewport(5, v)).toBe(5);
    });

    it('shifts a -179 longitude into a 170..190 viewport (antimeridian)', () => {
        const v = normalizeViewportBounds({ west: 170, east: -170, south: -10, north: 10 });
        expect(projectLngToViewport(-179, v)).toBe(181);
    });

    it('returns the closest candidate when no candidate is inside the span', () => {
        // viewport is centered around 0, span 20°; lng 350 is far outside but
        // 350 - 360 = -10 is inside; we should get the in-range candidate.
        const v = normalizeViewportBounds({ west: -10, east: 10 });
        expect(projectLngToViewport(350, v)).toBe(-10);
    });
});

describe('city-spatial — findNearestCity', () => {
    const allCities = [TOKYO, NEW_YORK, HONOLULU];

    it('returns the city geometrically closest to the center', () => {
        const bounds = { west: 130, east: 150, south: 30, north: 45 };
        const found = findNearestCity(35, 140, bounds, allCities);
        expect(found?.name).toBe('Tokyo');
    });

    it('ignores cities outside the viewport latitude band', () => {
        // viewport over Africa — none of the test cities sit here
        const bounds = { west: 0, east: 30, south: -10, north: 20 };
        expect(findNearestCity(0, 15, bounds, allCities)).toBeNull();
    });

    it('finds antimeridian-crossing cities by projecting longitude', () => {
        const bounds = { west: 170, east: -170, south: -25, north: -10 };
        const found = findNearestCity(-18, 179, bounds, [SUVA, BORDER_CITY]);
        expect(found?.name).toBe('Suva');
    });

    it('returns null on an empty city list', () => {
        const bounds = { west: -180, east: 180, south: -90, north: 90 };
        expect(findNearestCity(0, 0, bounds, [])).toBeNull();
    });

    it('weights large populations higher when distances are similar', () => {
        // place two cities equidistant; the more-populous one should win.
        const big = { name: 'Big', slug: 'big', lat: 0, lng: 1, pop: 10_000_000 };
        const small = { name: 'Small', slug: 'small', lat: 0, lng: -1, pop: 1000 };
        const bounds = { west: -10, east: 10, south: -10, north: 10 };
        expect(findNearestCity(0, 0, bounds, [big, small])?.name).toBe('Big');
    });
});

describe('city-spatial — findCityInCenter', () => {
    it('returns null when no city sits inside the center circle', () => {
        // Viewport over Pacific, only Honolulu inside but far from center
        const bounds = { west: -180, east: -100, south: 0, north: 50 };
        expect(findCityInCenter(0, 0, bounds, [HONOLULU])).toBeNull();
    });

    it('finds a city positioned inside the center circle', () => {
        // Tight viewport around Tokyo, center exactly at Tokyo
        const bounds = { west: 138, east: 142, south: 34, north: 37 };
        const found = findCityInCenter(35.6895, 139.6917, bounds, [TOKYO]);
        expect(found?.name).toBe('Tokyo');
    });

    it('rejects cities outside the viewport latitude band', () => {
        const bounds = { west: -10, east: 10, south: 50, north: 60 };
        expect(findCityInCenter(55, 0, bounds, [TOKYO])).toBeNull();
    });
});

describe('city-spatial — computePan', () => {
    it('returns 0 for a city at viewport center', () => {
        expect(computePan(10, -10, 30)).toBeCloseTo(0, 6);
    });

    it('returns -1 at the western edge', () => {
        expect(computePan(-10, -10, 30)).toBe(-1);
    });

    it('returns +1 at the eastern edge', () => {
        expect(computePan(30, -10, 30)).toBe(1);
    });

    it('clamps to [-1, 1] when the city is outside the viewport', () => {
        // city well east of viewport — pan should saturate at +1
        expect(computePan(50, -10, 30)).toBe(1);
        // city well west of viewport — saturates at -1
        expect(computePan(-50, -10, 30)).toBe(-1);
    });

    it('handles antimeridian-crossing viewports', () => {
        // viewport 170..-170 (span 20°), city at -179 should be roughly center-right
        const pan = computePan(-179, 170, -170);
        // -179 → projected to 181, viewportX = (181 - 170) / 20 = 0.55, pan = 0.10
        expect(pan).toBeCloseTo(0.1, 6);
    });

    it('returns 0 for a degenerate viewport span <= 0', () => {
        expect(computePan(10, 0, 0)).toBe(0);
    });
});
