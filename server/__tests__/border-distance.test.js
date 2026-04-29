// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

const {
    pointToSegmentDistKm,
    buildSegmentIndex,
    queryDistance,
    iterSegments,
    MAX_BORDER_DIST_KM,
} = require('../../scripts/compute-border-distance');

// 1° at the equator is roughly 111.32 km — used for sanity-bounding test
// expectations.
const ONE_DEG_KM = 111.32;

describe('pointToSegmentDistKm', () => {
    test('returns 0 when the point is on the segment endpoint', () => {
        const d = pointToSegmentDistKm(0, 0, 0, 0, 1, 0);
        expect(d).toBeCloseTo(0, 3);
    });

    test('returns the perpendicular distance to a horizontal segment', () => {
        // Point at (0, 1°N), segment from (-2°W, 0) → (2°E, 0)
        // Perpendicular distance is exactly 1° of latitude = ~111 km.
        const d = pointToSegmentDistKm(0, 1, -2, 0, 2, 0);
        expect(d).toBeCloseTo(ONE_DEG_KM, 0); // within ~0.5 km
    });

    test('clamps to nearest endpoint when the projection falls outside', () => {
        // Point at (10°E, 0), segment from (0,0) → (1°E, 0). Closest is the
        // (1°E, 0) endpoint: 9° of longitude at equator = ~1002 km.
        const d = pointToSegmentDistKm(10, 0, 0, 0, 1, 0);
        expect(d).toBeCloseTo(9 * ONE_DEG_KM, -1); // within ~10 km
    });

    test('handles antimeridian wrap (segment crosses lon=180)', () => {
        // Segment from (179, 0) → (-179, 0) — crosses the seam.
        // After normalization the segment spans 2° of longitude across lon=180.
        // A point at (180, 0) should be on the segment (distance ~0).
        const d = pointToSegmentDistKm(180, 0, 179, 0, -179, 0);
        // Point lng=180; relative to point, A.dLon = 179-180 = -1, B.dLon = -179-180 = -359 → +1 after normalization. Both within [-180,180] of point. So segment goes from (-1°,0) to (+1°,0) in local coords; point at origin is on segment.
        expect(d).toBeCloseTo(0, 1);
    });

    test('antipodal lng wrap on point side too', () => {
        // Point at (-180, 0) ≈ (180, 0); segment fully on the east side (170-175 E).
        // Closest endpoint to (180, 0) in local coords: (170,0) → dLon = 170 - (-180) = 350 → −10 after wrap. Distance ≈ 10° at equator = ~1113 km.
        const d = pointToSegmentDistKm(-180, 0, 170, 0, 175, 0);
        expect(d).toBeCloseTo(5 * ONE_DEG_KM, -1);
    });

    test('high latitude — equirectangular still acceptable for short distances', () => {
        // At lat 60°, 1° lng = ~55.66 km. Segment from (10, 60) to (12, 60).
        // Point at (11, 60.1) — perpendicular distance = 0.1° lat = 11.13 km.
        const d = pointToSegmentDistKm(11, 60.1, 10, 60, 12, 60);
        expect(d).toBeCloseTo(0.1 * ONE_DEG_KM, 0);
    });

    test('degenerate zero-length segment treated as a point', () => {
        const d = pointToSegmentDistKm(0, 1, 5, 5, 5, 5);
        // Distance from (0, 1) to (5, 5) — pure equirectangular.
        const exp = ONE_DEG_KM * Math.sqrt(5 * 5 * Math.cos((1 * Math.PI) / 180) ** 2 + 4 * 4);
        expect(d).toBeCloseTo(exp, -1);
    });
});

describe('iterSegments', () => {
    test('flattens LineString and MultiLineString features', () => {
        const fc = {
            type: 'FeatureCollection',
            features: [
                {
                    type: 'Feature',
                    geometry: {
                        type: 'LineString',
                        coordinates: [
                            [0, 0],
                            [1, 0],
                            [2, 0],
                        ],
                    },
                },
                {
                    type: 'Feature',
                    geometry: {
                        type: 'MultiLineString',
                        coordinates: [
                            [
                                [0, 0],
                                [1, 0],
                            ],
                            [
                                [5, 5],
                                [6, 5],
                                [7, 5],
                            ],
                        ],
                    },
                },
            ],
        };
        const segs = [...iterSegments(fc)];
        // LineString: 2 segments. MultiLineString: 1 + 2 = 3 segments. Total = 5.
        expect(segs.length).toBe(5);
        expect(segs[0]).toEqual([0, 0, 1, 0]);
        expect(segs[4]).toEqual([6, 5, 7, 5]);
    });

    test('skips features without geometry or with non-line types', () => {
        const fc = {
            type: 'FeatureCollection',
            features: [
                { type: 'Feature', geometry: null },
                { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] } },
                {
                    type: 'Feature',
                    geometry: {
                        type: 'LineString',
                        coordinates: [
                            [0, 0],
                            [1, 0],
                        ],
                    },
                },
            ],
        };
        const segs = [...iterSegments(fc)];
        expect(segs.length).toBe(1);
    });
});

describe('buildSegmentIndex + queryDistance', () => {
    /**
     * Build a tiny segArr from explicit segment coordinates.
     */
    function makeSegArr(segs) {
        const arr = new Float32Array(segs.length * 4);
        for (let i = 0; i < segs.length; i++) {
            arr[4 * i] = segs[i][0];
            arr[4 * i + 1] = segs[i][1];
            arr[4 * i + 2] = segs[i][2];
            arr[4 * i + 3] = segs[i][3];
        }
        return arr;
    }

    test('finds the closest of multiple segments within the query ring', () => {
        const segs = makeSegArr([
            [10, 10, 11, 10], // 1° away from query point
            [0, 0, 1, 0], // far away
            [100, 50, 100.5, 50], // far away
        ]);
        const idx = buildSegmentIndex(segs);
        const d = queryDistance(10.5, 11, segs, idx);
        // Point at (10.5°E, 11°N) — closest segment is the first (10,10)-(11,10).
        // Perpendicular distance ≈ 1° lat ≈ 111 km.
        expect(d).toBeCloseTo(ONE_DEG_KM, 0);
    });

    test('returns the cap when no segment is within the query ring', () => {
        const segs = makeSegArr([
            [100, 50, 100.5, 50], // > 4° away in both lng and lat → outside 3-cell ring at (0,0)
        ]);
        const idx = buildSegmentIndex(segs);
        const d = queryDistance(0, 0, segs, idx);
        expect(d).toBe(MAX_BORDER_DIST_KM);
    });

    test('antimeridian — segment crossing lon=180 is found from query at lng=179.5', () => {
        const segs = makeSegArr([
            [179.2, 5, -179.2, 5], // crosses the seam
        ]);
        const idx = buildSegmentIndex(segs);
        const d = queryDistance(179.7, 5, segs, idx);
        // Point lies on the segment after antimeridian normalization → ~0 km.
        expect(d).toBeLessThan(20);
    });

    test('antimeridian — same segment found from query at lng=-179.5', () => {
        const segs = makeSegArr([[179.2, 5, -179.2, 5]]);
        const idx = buildSegmentIndex(segs);
        const d = queryDistance(-179.7, 5, segs, idx);
        expect(d).toBeLessThan(20);
    });

    test('dedupes a segment that appears in multiple bbox cells', () => {
        // A segment spanning 5° of lng will be inserted into 5+ cells; the
        // queryDistance should not double-count.
        const segs = makeSegArr([[0, 0, 5, 0]]);
        const idx = buildSegmentIndex(segs);
        // Just verify it returns the perpendicular distance once (no error thrown).
        const d = queryDistance(2.5, 1, segs, idx);
        expect(d).toBeCloseTo(ONE_DEG_KM, 0);
    });
});
