// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

import { describe, it, expect } from 'vitest';
import { mat4Multiply, mat4Invert } from '../mat4.js';

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

// Column-major translation matrix: translate by (tx, ty, tz).
function translation(tx, ty, tz) {
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, tx, ty, tz, 1];
}

// Column-major rotation around Z by angle (radians).
function rotationZ(angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

// Column-major scale matrix.
function scale(sx, sy, sz) {
    return [sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, 0, 0, 0, 1];
}

function expectMat4Close(actual, expected, tol = 1e-5) {
    expect(actual.length).toBe(16);
    for (let i = 0; i < 16; i++) {
        expect(Math.abs(actual[i] - expected[i])).toBeLessThan(tol);
    }
}

// Apply a column-major mat4 to a column vec4: returns out.
function mat4ApplyToVec4(m, v) {
    return [
        m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12] * v[3],
        m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13] * v[3],
        m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14] * v[3],
        m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15] * v[3],
    ];
}

describe('mat4Multiply', () => {
    it('left-identity: I * M = M', () => {
        const m = translation(2, 3, 5);
        const out = new Array(16);
        mat4Multiply(out, IDENTITY, m);
        expectMat4Close(out, m);
    });

    it('right-identity: M * I = M', () => {
        const m = rotationZ(Math.PI / 4);
        const out = new Array(16);
        mat4Multiply(out, m, IDENTITY);
        expectMat4Close(out, m);
    });

    it('translation composition: T(a) * T(b) = T(a + b)', () => {
        const a = translation(1, 2, 3);
        const b = translation(4, 5, 6);
        const out = new Array(16);
        mat4Multiply(out, a, b);
        expectMat4Close(out, translation(5, 7, 9));
    });

    it('translation applied to a point in column-vector convention', () => {
        // (T * S) applied to vec4 should first scale, then translate.
        const t = translation(10, 20, 30);
        const s = scale(2, 2, 2);
        const out = new Array(16);
        mat4Multiply(out, t, s);
        const result = mat4ApplyToVec4(out, [1, 1, 1, 1]);
        expect(result[0]).toBeCloseTo(12, 5); // 2*1 + 10
        expect(result[1]).toBeCloseTo(22, 5);
        expect(result[2]).toBeCloseTo(32, 5);
        expect(result[3]).toBeCloseTo(1, 5);
    });

    it('returns the out array for chaining', () => {
        const out = new Array(16);
        const ret = mat4Multiply(out, IDENTITY, IDENTITY);
        expect(ret).toBe(out);
    });

    it('writes into a Float32Array', () => {
        const out = new Float32Array(16);
        mat4Multiply(out, IDENTITY, translation(1, 2, 3));
        expect(out[12]).toBeCloseTo(1, 5);
        expect(out[13]).toBeCloseTo(2, 5);
        expect(out[14]).toBeCloseTo(3, 5);
    });
});

describe('mat4Invert', () => {
    it('identity inverts to identity', () => {
        const out = new Array(16);
        const ret = mat4Invert(out, IDENTITY);
        expect(ret).toBe(out);
        expectMat4Close(out, IDENTITY);
    });

    it('translation inverts to negated translation', () => {
        const m = translation(2, -3, 5);
        const out = new Array(16);
        mat4Invert(out, m);
        expectMat4Close(out, translation(-2, 3, -5));
    });

    it('rotation inverts to opposite rotation', () => {
        const angle = Math.PI / 3;
        const m = rotationZ(angle);
        const out = new Array(16);
        mat4Invert(out, m);
        expectMat4Close(out, rotationZ(-angle));
    });

    it('scale inverts to reciprocal scale', () => {
        const m = scale(2, 4, 8);
        const out = new Array(16);
        mat4Invert(out, m);
        expectMat4Close(out, scale(0.5, 0.25, 0.125));
    });

    it('M * inverse(M) = I for a composed transform', () => {
        const composed = new Array(16);
        const tmp = new Array(16);
        mat4Multiply(tmp, translation(7, -2, 3), rotationZ(Math.PI / 5));
        mat4Multiply(composed, tmp, scale(1.5, 0.5, 2));

        const inv = new Array(16);
        mat4Invert(inv, composed);

        const product = new Array(16);
        mat4Multiply(product, composed, inv);
        expectMat4Close(product, IDENTITY, 1e-4);
    });

    it('returns null for a singular matrix', () => {
        // Last column all zeros except w=0 → det = 0.
        const singular = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0];
        const out = new Array(16);
        const ret = mat4Invert(out, singular);
        expect(ret).toBeNull();
    });

    it('inverse round-trip for a pseudo-perspective-like matrix', () => {
        // A non-trivial invertible 4x4 with a perspective-divide row.
        // (Mirrors the structure of a view-projection matrix.)
        const m = [1.5, 0, 0, 0, 0, 2.0, 0, 0, 0, 0, -1.001, -1, 10, 5, -2.002, 0];
        const inv = new Array(16);
        const ok = mat4Invert(inv, m);
        expect(ok).toBe(inv);

        const product = new Array(16);
        mat4Multiply(product, m, inv);
        expectMat4Close(product, IDENTITY, 1e-3);
    });
});
