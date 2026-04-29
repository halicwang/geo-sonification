// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

import { describe, it, expect } from 'vitest';
import { distKm, cursorFactor, borderFactor, rByZoom, parseGridIndex } from '../hover-glow.js';

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

    it('returns 0 at and beyond the trailing breakpoint (250 km)', () => {
        expect(borderFactor(250)).toBeCloseTo(0, 5);
        expect(borderFactor(500)).toBe(0);
    });

    it('matches table values at intermediate breakpoints', () => {
        // Breakpoints: 0→1.0, 50→0.7, 150→0.1, 250→0
        expect(borderFactor(50)).toBeCloseTo(0.7, 5);
        expect(borderFactor(150)).toBeCloseTo(0.1, 5);
    });

    it('is monotonically decreasing on [0, 250]', () => {
        let prev = Infinity;
        for (let d = 0; d <= 250; d += 5) {
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
        expect(rByZoom(0)).toBe(600);
        expect(rByZoom(2)).toBe(600);
    });

    it('returns the last stop for zoom >= max', () => {
        expect(rByZoom(10)).toBe(180);
        expect(rByZoom(15)).toBe(180);
    });

    it('linearly interpolates between stops', () => {
        // Default table includes [5, 350], [7, 250]; midpoint zoom 6 → 300
        expect(rByZoom(6)).toBeCloseTo(300, 0);
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
