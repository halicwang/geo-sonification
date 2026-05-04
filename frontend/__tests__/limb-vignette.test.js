// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

import { describe, it, expect, vi } from 'vitest';
import { LimbVignetteLayer } from '../limb-vignette-layer.js';

// The mask geometry (band edges, smoothstep falloff, radius lerp)
// lives in the GLSL fragment shader and is calibrated empirically in
// the browser via `window.__lv.tune(...)`. A pixel-level lock would
// need a puppeteer screenshot test — until then, these tests verify
// only the JS-side custom-layer plumbing.

describe('LimbVignetteLayer', () => {
    it('exposes the CustomLayerInterface shape', () => {
        const layer = new LimbVignetteLayer();
        expect(layer.id).toBe('limb-vignette');
        expect(layer.type).toBe('custom');
        expect(layer.renderingMode).toBe('2d');
        expect(typeof layer.onAdd).toBe('function');
        expect(typeof layer.render).toBe('function');
        expect(typeof layer.onRemove).toBe('function');
    });

    it('initial bg color is the zero vector before setBgColor', () => {
        const layer = new LimbVignetteLayer();
        expect(Array.from(layer._bgColor)).toEqual([0, 0, 0]);
    });

    it('setBgColor mutates the existing Float32Array and triggers a repaint', () => {
        const layer = new LimbVignetteLayer();
        const triggerRepaint = vi.fn();
        layer._map = { triggerRepaint };
        const before = layer._bgColor;
        layer.setBgColor([0.97, 0.97, 0.97]);
        // identity preserved so `gl.uniform3fv` keeps the same buffer
        expect(layer._bgColor).toBe(before);
        expect(layer._bgColor[0]).toBeCloseTo(0.97, 5);
        expect(layer._bgColor[1]).toBeCloseTo(0.97, 5);
        expect(layer._bgColor[2]).toBeCloseTo(0.97, 5);
        expect(triggerRepaint).toHaveBeenCalledOnce();
    });

    it('setBgColor ignores nullish or short inputs', () => {
        const layer = new LimbVignetteLayer();
        layer._map = { triggerRepaint: vi.fn() };
        layer.setBgColor(null);
        layer.setBgColor([0.5, 0.5]);
        expect(Array.from(layer._bgColor)).toEqual([0, 0, 0]);
    });

    it('setTunables({ band }) overrides the band and triggers a repaint', () => {
        const layer = new LimbVignetteLayer();
        const triggerRepaint = vi.fn();
        layer._map = { triggerRepaint };
        layer.setTunables({ band: [0.85, 1.02] });
        expect(layer._band).toEqual([0.85, 1.02]);
        expect(triggerRepaint).toHaveBeenCalledOnce();
    });

    it('setTunables({}) is a safe no-op, leaves defaults intact', () => {
        const layer = new LimbVignetteLayer();
        layer._map = { triggerRepaint: vi.fn() };
        const bandBefore = layer._band.slice();
        expect(() => layer.setTunables({})).not.toThrow();
        expect(layer._band).toEqual(bandBefore);
    });

    it('setTunables ignores band patches that are not length-2 arrays', () => {
        const layer = new LimbVignetteLayer();
        layer._map = { triggerRepaint: vi.fn() };
        const before = layer._band.slice();
        layer.setTunables({ band: [0.9] });
        layer.setTunables({ band: 'nope' });
        expect(layer._band).toEqual(before);
    });

    it('render() short-circuits in mercator mode (no globeToMercator arg)', () => {
        const layer = new LimbVignetteLayer();
        layer._program = {}; // pretend onAdd ran
        // If render didn't early-return, the mat4 multiply / gl.useProgram
        // calls would throw against the empty stubs below.
        const gl = {};
        expect(() => layer.render(gl, null, null, undefined)).not.toThrow();
    });

    it('render() short-circuits before onAdd compiles the program', () => {
        const layer = new LimbVignetteLayer();
        // _program is null; even with a globeToMercator arg, the early-return
        // on !this._program protects against an uncompiled draw.
        const gl = {};
        expect(() =>
            layer.render(gl, null, null, /* globeToMercator */ new Float32Array(16))
        ).not.toThrow();
    });

    it('render() short-circuits when ecefToClip is singular', () => {
        const layer = new LimbVignetteLayer();
        layer._program = {};
        // onAdd normally allocates these; do it inline since we skip onAdd.
        layer._ecefToClip = new Float32Array(16);
        layer._clipToEcef = new Float32Array(16);
        // Both matrices have a zero last row/col so the product is singular
        // and mat4Invert returns null. render() must bail before touching gl.
        const singular = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0]);
        const gl = {};
        expect(() => layer.render(gl, singular, null, singular, 0)).not.toThrow();
    });
});
