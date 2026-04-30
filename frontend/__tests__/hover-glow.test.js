// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

import { describe, it, expect, vi } from 'vitest';
import { cursorFactor, borderFactor, glowFor, rByZoom, parseGridIndex } from '../hover-glow.js';
import { packBorderFalloff, MAX_FALLOFF_STOPS } from '../hover-glow-shaders.js';
import { HoverGlowLayer } from '../hover-glow-layer.js';

// Curve helpers (cursorFactor, borderFactor, glowFor, rByZoom) define
// the spec the GLSL fragment shader replicates. The `distKm`,
// `buildSpatialIndex`, and `enumerateNearbyEntries` tests that used to
// live here were removed alongside their JS implementations — distance
// math now lives only in the GLSL `distKmToCursor`, and the
// per-frame spatial walk is gone (the GPU draws all 67k vertices and
// fragment-shader-discards out-of-radius cells).

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
        expect(idx.u32[0]).toBe(1);
        expect(idx.f32[1]).toBeCloseTo(10, 5);
        expect(idx.f32[2]).toBeCloseTo(20, 5);
        expect(idx.f32[3]).toBeCloseTo(50, 5);
        expect(idx.u32[8]).toBe(3);
        expect(idx.f32[9]).toBeCloseTo(0);
        expect(idx.f32[11]).toBeCloseTo(0);
    });

    it('rejects bad magic', () => {
        const buf = new ArrayBuffer(16);
        const view = new DataView(buf);
        view.setUint8(0, 'X'.charCodeAt(0));
        expect(() => parseGridIndex(buf)).toThrow(/magic/i);
    });

    it('rejects mismatched byte length', () => {
        const buf = new ArrayBuffer(16 + 16); // claims 2 entries but only has 1
        const view = new DataView(buf);
        const magic = 'GSIDX001';
        for (let i = 0; i < 8; i++) view.setUint8(i, magic.charCodeAt(i));
        view.setUint32(8, 2, true);
        view.setFloat32(12, 0.5, true);
        expect(() => parseGridIndex(buf)).toThrow(/length/i);
    });
});

describe('glowFor', () => {
    it('with cursorFloor=0 reproduces the legacy cf*bf formula', () => {
        for (const cf of [0.1, 0.5, 0.9]) {
            for (const bf of [0, 0.3, 1.0]) {
                expect(glowFor(cf, bf, 0)).toBeCloseTo(cf * bf, 10);
            }
        }
    });

    it('with bf=0 returns cf*cursorFloor (deep-interior soft glow)', () => {
        expect(glowFor(1.0, 0, 0.25)).toBeCloseTo(0.25, 10);
        expect(glowFor(0.5, 0, 0.25)).toBeCloseTo(0.125, 10);
        expect(glowFor(0.8, 0, 0.4)).toBeCloseTo(0.32, 10);
    });

    it('with bf=1 clamps the additive blend to cf (no over-bright)', () => {
        expect(glowFor(1.0, 1.0, 0.25)).toBe(1.0);
        expect(glowFor(0.7, 1.0, 0.4)).toBeCloseTo(0.7, 10);
        expect(glowFor(1.0, 1.0, 0.5)).toBe(1.0);
    });

    it('produces a monotonically non-increasing glow as borderDist grows', () => {
        const cf = 1.0;
        const cursorFloor = 0.25;
        const samples = [0, 5, 15, 25, 29, 30, 31, 35, 40, 41, 60, 100];
        const glows = samples.map((d) => glowFor(cf, borderFactor(d), cursorFloor));
        for (let i = 1; i < glows.length; i++) {
            expect(glows[i]).toBeLessThanOrEqual(glows[i - 1] + 1e-12);
        }
    });

    it('returns 0 when cf=0 regardless of bf and cursorFloor', () => {
        expect(glowFor(0, 0, 0.25)).toBe(0);
        expect(glowFor(0, 0.5, 0.25)).toBe(0);
        expect(glowFor(0, 1.0, 0.5)).toBe(0);
    });
});

describe('packBorderFalloff', () => {
    it('returns a Float32Array of length 2 × MAX_FALLOFF_STOPS', () => {
        const out = packBorderFalloff([
            [0, 1],
            [40, 0],
        ]);
        expect(out).toBeInstanceOf(Float32Array);
        expect(out.length).toBe(2 * MAX_FALLOFF_STOPS);
    });

    it('packs a length-MAX_FALLOFF_STOPS table verbatim (interleaved x,y)', () => {
        const stops = [
            [0, 1.0],
            [15, 0.7],
            [30, 0.1],
            [40, 0],
        ];
        const out = packBorderFalloff(stops);
        const expected = [0, 1.0, 15, 0.7, 30, 0.1, 40, 0];
        for (let i = 0; i < expected.length; i++) {
            expect(out[i]).toBeCloseTo(expected[i], 5);
        }
    });

    it('pads short tables by repeating the last stop', () => {
        const out = packBorderFalloff([
            [0, 1],
            [50, 0],
        ]);
        // First two stops verbatim; remaining slots repeat (50, 0).
        const expected = [0, 1, 50, 0, 50, 0, 50, 0];
        for (let i = 0; i < expected.length; i++) {
            expect(out[i]).toBeCloseTo(expected[i], 5);
        }
    });

    it('truncates tables longer than MAX_FALLOFF_STOPS', () => {
        const out = packBorderFalloff([
            [0, 1.0],
            [10, 0.8],
            [20, 0.6],
            [30, 0.4],
            [40, 0.2],
            [50, 0],
        ]);
        // First MAX_FALLOFF_STOPS stops kept; last two dropped.
        const expected = [0, 1.0, 10, 0.8, 20, 0.6, 30, 0.4];
        for (let i = 0; i < expected.length; i++) {
            expect(out[i]).toBeCloseTo(expected[i], 5);
        }
    });

    it('handles empty input by emitting an all-zero falloff', () => {
        const out = packBorderFalloff([]);
        // y=0 at every stop → borderFactor returns 0 everywhere.
        for (let i = 0; i < MAX_FALLOFF_STOPS; i++) {
            expect(out[i * 2 + 1]).toBe(0);
        }
    });
});

describe('HoverGlowLayer', () => {
    /** Minimal `gridIndex` shape: 2 cells. f32 layout is [_,lng,lat,dist] × N. */
    function fakeGridIndex() {
        const f32 = new Float32Array([0, 10, 20, 5, 0, -10, -20, 15]);
        return { count: 2, gridSize: 0.5, u32: new Uint32Array(8), f32 };
    }

    function fakeTunables() {
        return {
            rByZoom: [
                [2, 1000],
                [10, 320],
            ],
            borderFalloff: [
                [0, 1],
                [40, 0],
            ],
            cursorFloor: 0.25,
            eps: 0.005,
            haloScale: 3,
        };
    }

    it('exposes the CustomLayerInterface shape', () => {
        const layer = new HoverGlowLayer({
            gridIndex: fakeGridIndex(),
            tunables: fakeTunables(),
            dotRadiusStops: [
                [2, 1.1],
                [10, 8],
            ],
        });
        expect(layer.id).toBe('hover-glow');
        expect(layer.type).toBe('custom');
        expect(layer.renderingMode).toBe('2d');
        expect(typeof layer.onAdd).toBe('function');
        expect(typeof layer.render).toBe('function');
        expect(typeof layer.onRemove).toBe('function');
    });

    it('setCursorLngLat stashes coords and triggers repaint when map is attached', () => {
        const layer = new HoverGlowLayer({
            gridIndex: fakeGridIndex(),
            tunables: fakeTunables(),
            dotRadiusStops: [
                [2, 1.1],
                [10, 8],
            ],
        });
        const triggerRepaint = vi.fn();
        layer._map = { triggerRepaint };
        layer.setCursorLngLat(-55, -10);
        expect(layer._cursorLng).toBe(-55);
        expect(layer._cursorLat).toBe(-10);
        expect(layer._visible).toBe(true);
        expect(triggerRepaint).toHaveBeenCalledOnce();
    });

    it('setVisible(false) flips the flag and triggers repaint', () => {
        const layer = new HoverGlowLayer({
            gridIndex: fakeGridIndex(),
            tunables: fakeTunables(),
            dotRadiusStops: [
                [2, 1.1],
                [10, 8],
            ],
        });
        layer._visible = true;
        const triggerRepaint = vi.fn();
        layer._map = { triggerRepaint };
        layer.setVisible(false);
        expect(layer._visible).toBe(false);
        expect(triggerRepaint).toHaveBeenCalledOnce();
    });

    it('setTunables patches in place and ignores unrecognized fields', () => {
        const tunables = fakeTunables();
        const layer = new HoverGlowLayer({
            gridIndex: fakeGridIndex(),
            tunables,
            dotRadiusStops: [
                [2, 1.1],
                [10, 8],
            ],
        });
        const triggerRepaint = vi.fn();
        layer._map = { triggerRepaint };
        layer.setTunables({
            cursorFloor: 0.5,
            haloScale: 4,
            unknown: 'noop',
        });
        expect(tunables.cursorFloor).toBe(0.5);
        expect(tunables.haloScale).toBe(4);
        expect(triggerRepaint).toHaveBeenCalledOnce();
    });

    it('setTunables({}) is a safe no-op (no throw, no patch)', () => {
        const tunables = fakeTunables();
        const layer = new HoverGlowLayer({
            gridIndex: fakeGridIndex(),
            tunables,
            dotRadiusStops: [
                [2, 1.1],
                [10, 8],
            ],
        });
        layer._map = { triggerRepaint: () => {} };
        expect(() => layer.setTunables({})).not.toThrow();
        expect(tunables.cursorFloor).toBe(0.25);
    });
});
