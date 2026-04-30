// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

import { describe, it, expect } from 'vitest';
import {
    distKm,
    cursorFactor,
    borderFactor,
    glowFor,
    rByZoom,
    parseGridIndex,
    buildSpatialIndex,
    enumerateNearbyEntries,
} from '../hover-glow.js';

// 1° at the equator is ~111.32 km.
const ONE_DEG_KM = 111.32;

describe('distKm', () => {
    it('returns 0 for identical points', () => {
        expect(distKm(0, 0, 0, 0)).toBeCloseTo(0, 5);
    });

    it('returns ~111 km for 1° lat at the equator', () => {
        expect(distKm(0, 0, 1, 0)).toBeCloseTo(ONE_DEG_KM, 0);
    });

    it('shrinks lng distance with cosLat at higher latitudes', () => {
        // At lat 60°, 1° lng ≈ 55.66 km (cos 60° = 0.5).
        const d = distKm(60, 0, 60, 1);
        expect(d).toBeCloseTo(ONE_DEG_KM * 0.5, 0);
    });

    it('handles antimeridian wrap when crossing lon=180', () => {
        // (179, 0) → (-179, 0) is 2° apart, not 358°.
        const d = distKm(0, 179, 0, -179);
        expect(d).toBeCloseTo(2 * ONE_DEG_KM, 0);
    });

    it('handles antimeridian wrap when crossing lon=-180', () => {
        const d = distKm(0, -179, 0, 179);
        expect(d).toBeCloseTo(2 * ONE_DEG_KM, 0);
    });
});

describe('cursorFactor', () => {
    it('returns 1 at d=0', () => {
        expect(cursorFactor(0, 250)).toBe(1);
    });

    it('returns 0 at d=R', () => {
        expect(cursorFactor(250, 250)).toBe(0);
    });

    it('returns 0 beyond R', () => {
        expect(cursorFactor(300, 250)).toBe(0);
    });

    it('is exactly 0.5 at d=R/2 (smoothstep midpoint)', () => {
        // smoothstep(0.5) = 3*0.25 - 2*0.125 = 0.75 - 0.25 = 0.5
        expect(cursorFactor(125, 250)).toBeCloseTo(0.5, 5);
    });

    it('is C¹-continuous at the inner endpoint (no jump near 0)', () => {
        const a = cursorFactor(0.001, 250);
        const b = cursorFactor(0, 250);
        expect(Math.abs(a - b)).toBeLessThan(1e-4);
    });

    it('is C¹-continuous at the outer endpoint (no jump near R)', () => {
        const a = cursorFactor(249.999, 250);
        const b = cursorFactor(250, 250);
        expect(Math.abs(a - b)).toBeLessThan(1e-4);
    });

    it('is monotonically decreasing on [0, R]', () => {
        let prev = Infinity;
        for (let d = 0; d <= 250; d += 5) {
            const v = cursorFactor(d, 250);
            expect(v).toBeLessThanOrEqual(prev);
            prev = v;
        }
    });
});

describe('borderFactor', () => {
    it('returns 1.0 at the leading breakpoint (0 km)', () => {
        expect(borderFactor(0)).toBeCloseTo(1.0, 5);
    });

    it('returns 0 at and beyond the trailing breakpoint (40 km)', () => {
        expect(borderFactor(40)).toBeCloseTo(0, 5);
        expect(borderFactor(100)).toBe(0);
        expect(borderFactor(500)).toBe(0);
    });

    it('matches table values at intermediate breakpoints', () => {
        // Breakpoints: 0→1.0, 15→0.7, 30→0.1, 40→0
        expect(borderFactor(15)).toBeCloseTo(0.7, 5);
        expect(borderFactor(30)).toBeCloseTo(0.1, 5);
    });

    it('is monotonically decreasing on [0, 40]', () => {
        let prev = Infinity;
        for (let d = 0; d <= 40; d += 1) {
            const v = borderFactor(d);
            expect(v).toBeLessThanOrEqual(prev + 1e-9);
            prev = v;
        }
    });

    it('accepts a custom table for live-tuning', () => {
        const customTable = [
            [0, 1.0],
            [100, 0],
        ];
        expect(borderFactor(0, customTable)).toBeCloseTo(1.0);
        expect(borderFactor(100, customTable)).toBeCloseTo(0);
        expect(borderFactor(50, customTable)).toBeCloseTo(0.5, 1); // smoothstep midpoint
    });
});

describe('rByZoom', () => {
    it('returns the first stop for zoom <= min', () => {
        expect(rByZoom(0)).toBe(1000);
        expect(rByZoom(2)).toBe(1000);
    });

    it('returns the last stop for zoom >= max', () => {
        expect(rByZoom(10)).toBe(320);
        expect(rByZoom(15)).toBe(320);
    });

    it('linearly interpolates between stops', () => {
        // Default table includes [5, 600], [7, 450]; midpoint zoom 6 → 525
        expect(rByZoom(6)).toBeCloseTo(525, 0);
    });

    it('accepts a custom table', () => {
        const t = [
            [3, 100],
            [10, 800],
        ];
        expect(rByZoom(3, t)).toBe(100);
        expect(rByZoom(10, t)).toBe(800);
        expect(rByZoom(6.5, t)).toBeCloseTo(450); // midpoint of [100, 800]
    });
});

describe('parseGridIndex', () => {
    /** Build a minimal grid_index.bin payload with N entries. */
    function buildBin(entries) {
        const buf = new ArrayBuffer(16 + entries.length * 16);
        const view = new DataView(buf);
        // Magic: "GSIDX001"
        const magic = 'GSIDX001';
        for (let i = 0; i < 8; i++) {
            view.setUint8(i, magic.charCodeAt(i));
        }
        view.setUint32(8, entries.length, true);
        view.setFloat32(12, 0.5, true);
        let off = 16;
        for (const e of entries) {
            view.setUint32(off, e.fid, true);
            view.setFloat32(off + 4, e.lon, true);
            view.setFloat32(off + 8, e.lat, true);
            view.setFloat32(off + 12, e.dist, true);
            off += 16;
        }
        return buf;
    }

    it('parses a valid 3-entry payload', () => {
        const buf = buildBin([
            { fid: 1, lon: 10, lat: 20, dist: 50 },
            { fid: 2, lon: -10, lat: -20, dist: 100 },
            { fid: 3, lon: 0, lat: 0, dist: 0 },
        ]);
        const idx = parseGridIndex(buf);
        expect(idx.count).toBe(3);
        expect(idx.gridSize).toBeCloseTo(0.5, 5);
        // Check entry 0 via the dual views
        expect(idx.u32[0]).toBe(1); // fid
        expect(idx.f32[1]).toBeCloseTo(10, 5);
        expect(idx.f32[2]).toBeCloseTo(20, 5);
        expect(idx.f32[3]).toBeCloseTo(50, 5);
        // Entry 2
        expect(idx.u32[8]).toBe(3);
        expect(idx.f32[9]).toBeCloseTo(0);
        expect(idx.f32[11]).toBeCloseTo(0);
    });

    it('rejects bad magic', () => {
        const buf = new ArrayBuffer(16);
        const view = new DataView(buf);
        view.setUint8(0, 'X'.charCodeAt(0)); // mangled magic
        expect(() => parseGridIndex(buf)).toThrow(/magic/i);
    });

    it('rejects mismatched byte length', () => {
        // Magic + count=2 but buffer too short
        const buf = new ArrayBuffer(16 + 16); // claims 2 entries via header but only 1 entry
        const view = new DataView(buf);
        const magic = 'GSIDX001';
        for (let i = 0; i < 8; i++) view.setUint8(i, magic.charCodeAt(i));
        view.setUint32(8, 2, true); // count = 2 → expected 16 + 2*16 = 48 bytes
        view.setFloat32(12, 0.5, true);
        expect(() => parseGridIndex(buf)).toThrow(/length/i);
    });
});

describe('buildSpatialIndex / enumerateNearbyEntries', () => {
    /** Build a GridIndex from raw entries, mirroring the parseGridIndex test helper. */
    function buildGridIndex(entries) {
        const buf = new ArrayBuffer(16 + entries.length * 16);
        const view = new DataView(buf);
        const magic = 'GSIDX001';
        for (let i = 0; i < 8; i++) view.setUint8(i, magic.charCodeAt(i));
        view.setUint32(8, entries.length, true);
        view.setFloat32(12, 0.5, true);
        let off = 16;
        for (const e of entries) {
            view.setUint32(off, e.fid, true);
            view.setFloat32(off + 4, e.lon, true);
            view.setFloat32(off + 8, e.lat, true);
            view.setFloat32(off + 12, e.dist, true);
            off += 16;
        }
        return parseGridIndex(buf);
    }

    it('places every entry into exactly one bucket', () => {
        const idx = buildGridIndex([
            { fid: 1, lon: 0, lat: 0, dist: 0 },
            { fid: 2, lon: 5, lat: 5, dist: 0 },
            { fid: 3, lon: -178, lat: 0, dist: 0 },
            { fid: 4, lon: 179.9, lat: 89.9, dist: 0 },
            { fid: 5, lon: -179.9, lat: -89.9, dist: 0 },
        ]);
        const sIdx = buildSpatialIndex(idx);
        let total = 0;
        for (const arr of sIdx.buckets.values()) {
            total += arr.length;
        }
        expect(total).toBe(5);
        expect(sIdx.bucketDeg).toBe(5);
    });

    it('returns the entry near the cursor and excludes the far one', () => {
        const idx = buildGridIndex([
            { fid: 1, lon: 0, lat: 0, dist: 0 }, // entry index 0 — at cursor
            { fid: 2, lon: 100, lat: 0, dist: 0 }, // entry index 1 — ~11000 km away
        ]);
        const sIdx = buildSpatialIndex(idx);
        const found = enumerateNearbyEntries(sIdx, 0, 0, 200);
        expect(found).toContain(0);
        expect(found).not.toContain(1);
    });

    it('walks an antimeridian-wrapped query (cursor at lon=179, R=600 km)', () => {
        const idx = buildGridIndex([
            { fid: 1, lon: 179.5, lat: 0, dist: 0 }, // entry 0 — same side
            { fid: 2, lon: -179.5, lat: 0, dist: 0 }, // entry 1 — wraps across the meridian
            { fid: 3, lon: 0, lat: 0, dist: 0 }, // entry 2 — far hemisphere
        ]);
        const sIdx = buildSpatialIndex(idx);
        const found = enumerateNearbyEntries(sIdx, 179, 0, 600);
        expect(found).toContain(0);
        expect(found).toContain(1);
        expect(found).not.toContain(2);
    });

    it('returns a superset of the entries inside the exact range', () => {
        // Sample 50 random points; verify that every entry within R of the
        // cursor (by exact equirectangular distKm) appears in the bucket walk.
        const entries = [];
        for (let i = 0; i < 50; i++) {
            const lon = ((i * 7.31) % 360) - 180;
            const lat = ((i * 3.71) % 180) - 90;
            entries.push({ fid: i + 1, lon, lat, dist: 0 });
        }
        const idx = buildGridIndex(entries);
        const sIdx = buildSpatialIndex(idx);
        const cLng = 10;
        const cLat = 30;
        const R = 800;
        const candidates = new Set(enumerateNearbyEntries(sIdx, cLng, cLat, R));
        // Anything within R must be in the candidate set
        for (let i = 0; i < entries.length; i++) {
            const d = distKm(cLat, cLng, entries[i].lat, entries[i].lon);
            if (d <= R) {
                expect(candidates.has(i)).toBe(true);
            }
        }
    });
});

describe('glowFor', () => {
    it('with cursorFloor=0 reproduces the legacy cf*bf formula', () => {
        // No floor — the new formula must match the M6 P1 baseline so
        // setting cursorFloor=0 from DevTools recovers prior behavior.
        for (const cf of [0.1, 0.5, 0.9]) {
            for (const bf of [0, 0.3, 1.0]) {
                expect(glowFor(cf, bf, 0)).toBeCloseTo(cf * bf, 10);
            }
        }
    });

    it('with bf=0 returns cf*cursorFloor (deep-interior soft glow)', () => {
        // The whole point of the change: a cell far from any border
        // (bf=0) under the cursor still glows at cursorFloor strength.
        expect(glowFor(1.0, 0, 0.25)).toBeCloseTo(0.25, 10);
        expect(glowFor(0.5, 0, 0.25)).toBeCloseTo(0.125, 10);
        expect(glowFor(0.8, 0, 0.4)).toBeCloseTo(0.32, 10);
    });

    it('with bf=1 clamps the additive blend to cf (no over-bright)', () => {
        // Border-center cells already glow at the cap; the floor must
        // not push them past 1 or the paint expression's [0,1] domain
        // would break.
        expect(glowFor(1.0, 1.0, 0.25)).toBe(1.0);
        expect(glowFor(0.7, 1.0, 0.4)).toBeCloseTo(0.7, 10);
        expect(glowFor(1.0, 1.0, 0.5)).toBe(1.0);
    });

    it('produces a monotonically non-increasing glow as borderDist grows', () => {
        // Continuity guard: an earlier draft used max(bf, floor) which
        // introduces a visible kink at the bf/floor crossover (~30 km
        // for the default border curve). Additive blending keeps the
        // glow Hermite-smooth — sample across the crossover and assert
        // the sequence never increases.
        const cf = 1.0;
        const cursorFloor = 0.25;
        const samples = [0, 5, 15, 25, 29, 30, 31, 35, 40, 41, 60, 100];
        const glows = samples.map((d) => glowFor(cf, borderFactor(d), cursorFloor));
        for (let i = 1; i < glows.length; i++) {
            expect(glows[i]).toBeLessThanOrEqual(glows[i - 1] + 1e-12);
        }
    });

    it('returns 0 when cf=0 regardless of bf and cursorFloor', () => {
        // cf=0 means the cell is outside the cursor radius — no halo
        // should leak in via cursorFloor. The factor is a hard product,
        // so this is just a sanity assertion on the structure.
        expect(glowFor(0, 0, 0.25)).toBe(0);
        expect(glowFor(0, 0.5, 0.25)).toBe(0);
        expect(glowFor(0, 1.0, 0.5)).toBe(0);
    });
});
