/**
 * Recursive float-tolerant deep comparison for golden baseline tests.
 *
 * Numbers use Jest's toBeCloseTo (default precision=5, tolerance 0.5e-5).
 * Strings, booleans, and null use strict equality.
 * Arrays and objects are walked recursively with sorted-key comparison.
 */

/**
 * Recursively compare two values with float tolerance for numbers.
 * @param {*} actual
 * @param {*} expected
 * @param {number} [precision=5] - Decimal places for toBeCloseTo
 * @param {string} [path='$'] - Current path for error context
 */
function expectDeepCloseTo(actual, expected, precision = 5, path = '$') {
    if (expected === null || expected === undefined) {
        try {
            expect(actual).toBe(expected);
        } catch (cause) {
            throw new Error(`${path}: ${cause.message}`, { cause });
        }
        return;
    }
    if (typeof expected === 'number') {
        if (typeof actual !== 'number') {
            throw new Error(`${path}: expected number but got ${typeof actual} (${actual})`);
        }
        try {
            expect(actual).toBeCloseTo(expected, precision);
        } catch (cause) {
            throw new Error(`${path}: ${cause.message}`, { cause });
        }
        return;
    }
    if (typeof expected === 'string' || typeof expected === 'boolean') {
        try {
            expect(actual).toBe(expected);
        } catch (cause) {
            throw new Error(`${path}: ${cause.message}`, { cause });
        }
        return;
    }
    if (Array.isArray(expected)) {
        if (!Array.isArray(actual)) {
            throw new Error(`${path}: expected Array but got ${typeof actual}`);
        }
        if (actual.length !== expected.length) {
            throw new Error(`${path}.length: expected ${expected.length} but got ${actual.length}`);
        }
        for (let i = 0; i < expected.length; i++) {
            expectDeepCloseTo(actual[i], expected[i], precision, `${path}[${i}]`);
        }
        return;
    }
    if (typeof expected === 'object') {
        if (typeof actual !== 'object' || actual === null) {
            throw new Error(`${path}: expected object but got ${actual}`);
        }
        const expectedKeys = Object.keys(expected).sort();
        const actualKeys = Object.keys(actual).sort();
        try {
            expect(actualKeys).toEqual(expectedKeys);
        } catch (cause) {
            throw new Error(`${path} keys: ${cause.message}`, { cause });
        }
        for (const key of expectedKeys) {
            expectDeepCloseTo(actual[key], expected[key], precision, `${path}.${key}`);
        }
    }
}

module.exports = { expectDeepCloseTo };
