const { normalizeLandcoverClass, getCellLcDistribution, VALID_LANDCOVER_CLASSES } = require('../landcover');

describe('normalizeLandcoverClass', () => {
    test('returns null for null/undefined/empty', () => {
        expect(normalizeLandcoverClass(null)).toBeNull();
        expect(normalizeLandcoverClass(undefined)).toBeNull();
        expect(normalizeLandcoverClass('')).toBeNull();
        expect(normalizeLandcoverClass('  ')).toBeNull();
    });

    test('returns null for NaN strings', () => {
        expect(normalizeLandcoverClass('abc')).toBeNull();
        expect(normalizeLandcoverClass('N/A')).toBeNull();
    });

    test('returns null for values < 10 (treated as missing)', () => {
        expect(normalizeLandcoverClass(0)).toBeNull();
        expect(normalizeLandcoverClass(5)).toBeNull();
        expect(normalizeLandcoverClass(9)).toBeNull();
        expect(normalizeLandcoverClass(-1)).toBeNull();
    });

    test('returns exact valid class for valid integers', () => {
        for (const cls of VALID_LANDCOVER_CLASSES) {
            expect(normalizeLandcoverClass(cls)).toBe(cls);
        }
    });

    test('handles string inputs', () => {
        expect(normalizeLandcoverClass('10')).toBe(10);
        expect(normalizeLandcoverClass('80')).toBe(80);
        expect(normalizeLandcoverClass('100')).toBe(100);
    });

    test('rounds float precision issues', () => {
        expect(normalizeLandcoverClass(79.999)).toBe(80);
        expect(normalizeLandcoverClass(10.001)).toBe(10);
        expect(normalizeLandcoverClass(99.5)).toBe(100);
    });

    test('maps invalid values to nearest valid class', () => {
        // 85 is between 80 (Water) and 90 (Wetland) — should map to 80 or 90
        const result = normalizeLandcoverClass(85);
        expect(VALID_LANDCOVER_CLASSES).toContain(result);
        expect(result).toBe(80); // 85 rounds to 85, nearest to 80 (diff=5) vs 90 (diff=5) — first found wins
    });

    test('maps value between classes to nearest', () => {
        // 15 → nearest valid is 10 (diff=5) vs 20 (diff=5) — first found (10) wins
        expect(normalizeLandcoverClass(15)).toBe(10);
        // 75 → nearest valid is 70 (diff=5) vs 80 (diff=5) — first found (70) wins
        expect(normalizeLandcoverClass(75)).toBe(70);
    });

    test('boundary: value just above max class maps to max', () => {
        // 105 → nearest valid is 100 (diff=5)
        expect(normalizeLandcoverClass(105)).toBe(100);
    });
});

describe('getCellLcDistribution', () => {
    test('returns empty object for cell without lc_pct_* fields', () => {
        const cell = { lon: 0, lat: 0, landcover_class: 10 };
        expect(getCellLcDistribution(cell)).toEqual({});
    });

    test('returns populated classes with pct > 0', () => {
        const cell = { lc_pct_10: 60, lc_pct_80: 30, lc_pct_20: 0 };
        const dist = getCellLcDistribution(cell);
        expect(dist[10]).toBe(60);
        expect(dist[80]).toBe(30);
        expect(dist[20]).toBeUndefined(); // 0 is excluded
    });

    test('excludes NaN and non-finite values', () => {
        const cell = { lc_pct_10: NaN, lc_pct_20: Infinity, lc_pct_30: 50 };
        const dist = getCellLcDistribution(cell);
        expect(dist[10]).toBeUndefined();
        expect(dist[20]).toBeUndefined();
        expect(dist[30]).toBe(50);
    });

    test('excludes negative values', () => {
        const cell = { lc_pct_10: -5, lc_pct_80: 100 };
        const dist = getCellLcDistribution(cell);
        expect(dist[10]).toBeUndefined();
        expect(dist[80]).toBe(100);
    });
});
