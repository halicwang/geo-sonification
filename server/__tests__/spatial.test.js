const { validateBounds } = require('../spatial');

describe('validateBounds', () => {
    test('accepts valid bounds', () => {
        const result = validateBounds([-74, -34, -33, 5]);
        expect(result.valid).toBe(true);
        expect(result.bounds).toEqual([-74, -34, -33, 5]);
    });

    test('rejects non-array input', () => {
        expect(validateBounds(null).valid).toBe(false);
        expect(validateBounds(undefined).valid).toBe(false);
        expect(validateBounds('invalid').valid).toBe(false);
        expect(validateBounds({}).valid).toBe(false);
    });

    test('rejects wrong-length array', () => {
        expect(validateBounds([1, 2, 3]).valid).toBe(false);
        expect(validateBounds([1, 2, 3, 4, 5]).valid).toBe(false);
        expect(validateBounds([]).valid).toBe(false);
    });

    test('rejects non-numeric values', () => {
        expect(validateBounds(['a', 0, 10, 10]).valid).toBe(false);
        expect(validateBounds([0, 0, NaN, 10]).valid).toBe(false);
        expect(validateBounds([0, 0, Infinity, 10]).valid).toBe(false);
    });

    test('rejects latitude out of range', () => {
        expect(validateBounds([-180, -91, 180, 90]).valid).toBe(false);
        expect(validateBounds([-180, -90, 180, 91]).valid).toBe(false);
    });

    test('rejects south > north', () => {
        const result = validateBounds([0, 10, 10, 5]);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('south > north');
    });

    test('handles date line crossing (west > east)', () => {
        // e.g. viewport spanning from 170E to 170W
        const result = validateBounds([170, -10, -170, 10]);
        expect(result.valid).toBe(true);
        expect(result.bounds[0]).toBe(170);  // west
        expect(result.bounds[2]).toBe(-170); // east
    });

    test('wraps longitude beyond [-180, 180]', () => {
        // Mapbox can send unwrapped values like -210
        const result = validateBounds([-210, -10, 195, 10]);
        expect(result.valid).toBe(true);
        expect(result.bounds[0]).toBeGreaterThanOrEqual(-180);
        expect(result.bounds[0]).toBeLessThanOrEqual(180);
        expect(result.bounds[2]).toBeGreaterThanOrEqual(-180);
        expect(result.bounds[2]).toBeLessThanOrEqual(180);
    });

    test('global extent: east - west >= 360 clamps to full range', () => {
        const result = validateBounds([-350, -90, 350, 90]);
        expect(result.valid).toBe(true);
        expect(result.bounds[0]).toBe(-180);
        expect(result.bounds[2]).toBe(180);
    });

    test('accepts string numeric values (coerces to number)', () => {
        const result = validateBounds(['-74', '-34', '-33', '5']);
        expect(result.valid).toBe(true);
    });

    test('rejects empty string values', () => {
        const result = validateBounds(['', '0', '10', '10']);
        expect(result.valid).toBe(false);
    });
});
