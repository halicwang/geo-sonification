// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

const {
    encodeGridIndex,
    decodeGridIndex,
    MAGIC,
    HEADER_BYTES,
    ENTRY_BYTES,
} = require('../../scripts/build-grid-index');

describe('grid_index.bin format', () => {
    test('round-trip encode → decode preserves header fields', () => {
        const grids = [
            { fid: 1, lon: 0, lat: 0, border_dist_km: 10 },
            { fid: 2, lon: 1, lat: 1, border_dist_km: 20 },
            { fid: 3, lon: -1, lat: -1, border_dist_km: 30 },
        ];
        const buf = encodeGridIndex(grids, 0.5);
        expect(buf.length).toBe(HEADER_BYTES + 3 * ENTRY_BYTES);

        const meta = decodeGridIndex(buf);
        expect(meta.magic).toBe(MAGIC);
        expect(meta.count).toBe(3);
        expect(meta.gridSize).toBeCloseTo(0.5, 6);
        expect(meta.headerBytes).toBe(HEADER_BYTES);
        expect(meta.entryBytes).toBe(ENTRY_BYTES);
    });

    test('encoded body uses cell centroid (lon + half, lat + half)', () => {
        const grids = [{ fid: 1, lon: 10, lat: 20, border_dist_km: 50 }];
        const buf = encodeGridIndex(grids, 0.5);
        // Read back via DataView semantics:
        const fid = buf.readUInt32LE(HEADER_BYTES);
        const lon = buf.readFloatLE(HEADER_BYTES + 4);
        const lat = buf.readFloatLE(HEADER_BYTES + 8);
        const dist = buf.readFloatLE(HEADER_BYTES + 12);
        expect(fid).toBe(1);
        expect(lon).toBeCloseTo(10.25, 5); // origin + half of 0.5
        expect(lat).toBeCloseTo(20.25, 5);
        expect(dist).toBeCloseTo(50, 5);
    });

    test('decode rejects bad magic', () => {
        const buf = Buffer.alloc(HEADER_BYTES);
        buf.write('BADMAGIC', 0, 8, 'ascii');
        expect(() => decodeGridIndex(buf)).toThrow(/magic/i);
    });

    test('decode rejects mismatched length', () => {
        const buf = Buffer.alloc(HEADER_BYTES + 5);
        buf.write(MAGIC, 0, 8, 'ascii');
        buf.writeUInt32LE(2, 8); // claim 2 entries
        buf.writeFloatLE(0.5, 12);
        expect(() => decodeGridIndex(buf)).toThrow(/length/i);
    });

    test('Uint32Array + Float32Array dual-view layout works for the body', () => {
        // The frontend uses two typed-array views over the same buffer slice
        // — Uint32 for fid, Float32 for lon/lat/dist. Verify the layout.
        const grids = [
            { fid: 42, lon: 0, lat: 0, border_dist_km: 100 },
            { fid: 7, lon: 5, lat: 5, border_dist_km: 200 },
        ];
        const buf = encodeGridIndex(grids, 0.5);
        const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        const u32 = new Uint32Array(ab, HEADER_BYTES, 2 * 4); // 2 entries × 4 fields
        const f32 = new Float32Array(ab, HEADER_BYTES, 2 * 4);

        // Entry 0
        expect(u32[0]).toBe(42); // fid
        expect(f32[1]).toBeCloseTo(0.25, 5); // lon (0 + half)
        expect(f32[2]).toBeCloseTo(0.25, 5); // lat
        expect(f32[3]).toBeCloseTo(100, 5); // dist

        // Entry 1
        expect(u32[4]).toBe(7); // fid
        expect(f32[5]).toBeCloseTo(5.25, 5); // lon
        expect(f32[6]).toBeCloseTo(5.25, 5); // lat
        expect(f32[7]).toBeCloseTo(200, 5); // dist
    });
});
