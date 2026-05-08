// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

import { describe, it, expect, vi } from 'vitest';
import { parseGridIndex } from '../hover-glow.js';
import { packBorderFalloff, MAX_FALLOFF_STOPS } from '../hover-glow-shaders.js';
import { HoverGlowLayer } from '../hover-glow-layer.js';

// The glow curves (cursorFactor, borderFactor, glowFor, rByZoom) live
// only in the GLSL fragment shader now — the JS reference helpers and
// their unit tests were removed. They duplicated the GPU code without
// any cross-check, so they "locked" only themselves. A puppeteer
// screenshot test is the right place to lock the curve shape end-to-
// end; until that lands, the tunables tables in frontend/config.js
// are the spec.

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

    it('throws on tables longer than MAX_FALLOFF_STOPS', () => {
        const tooMany = [
            [0, 1.0],
            [10, 0.8],
            [20, 0.6],
            [30, 0.4],
            [40, 0.2],
            [50, 0],
        ];
        expect(() => packBorderFalloff(tooMany)).toThrow(/exceed cap/);
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

    function makeLayer() {
        return new HoverGlowLayer({
            gridIndex: fakeGridIndex(),
            tunables: fakeTunables(),
            dotRadiusStops: [
                [2, 1.1],
                [10, 8],
            ],
        });
    }

    it('exposes the CustomLayerInterface shape', () => {
        const layer = makeLayer();
        expect(layer.id).toBe('hover-glow');
        expect(layer.type).toBe('custom');
        expect(layer.renderingMode).toBe('2d');
        expect(typeof layer.onAdd).toBe('function');
        expect(typeof layer.render).toBe('function');
        expect(typeof layer.onRemove).toBe('function');
    });

    it('initial cursor sits at the off-screen sentinel so no halo paints before mousemove', () => {
        const layer = makeLayer();
        expect(layer._cursorLng).toBe(999);
        expect(layer._cursorLat).toBe(999);
    });

    it('setCursorLngLat stashes coords and triggers repaint when map is attached', () => {
        const layer = makeLayer();
        const triggerRepaint = vi.fn();
        layer._map = { triggerRepaint };
        layer.setCursorLngLat(-55, -10);
        expect(layer._cursorLng).toBe(-55);
        expect(layer._cursorLat).toBe(-10);
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

    it('halo color defaults to white so dark theme behaves as before', () => {
        const layer = makeLayer();
        expect(Array.from(layer._haloColor)).toEqual([1, 1, 1]);
    });

    it('setHaloColor mutates the existing Float32Array and triggers a repaint', () => {
        const layer = makeLayer();
        const triggerRepaint = vi.fn();
        layer._map = { triggerRepaint };
        const before = layer._haloColor;
        layer.setHaloColor([0, 0, 0]);
        expect(layer._haloColor).toBe(before); // identity preserved for uniform3fv
        expect(Array.from(layer._haloColor)).toEqual([0, 0, 0]);
        expect(triggerRepaint).toHaveBeenCalledOnce();
    });

    it('setHaloColor ignores nullish or short inputs', () => {
        const layer = makeLayer();
        layer._map = { triggerRepaint: vi.fn() };
        layer.setHaloColor(null);
        layer.setHaloColor([0.5]);
        expect(Array.from(layer._haloColor)).toEqual([1, 1, 1]);
    });
});
