/**
 * data/cities.json shape validation against data/cities.schema.json.
 *
 * Closes M3 tech-debt audit E.2 (M5 stage 3). The schema is a JSON Schema
 * (draft-07 subset) document checked into the repo so external consumers
 * and future authors know exactly what shape city-announcer.js expects;
 * this test wires it up as a CI gate so a malformed merge can't slip in.
 *
 * Hand-rolled validator (no `ajv` dependency per the project's
 * "do not introduce new npm dependencies without approval" rule).
 * Supports the subset of JSON Schema that this one schema actually uses:
 * `type`, `required`, `properties`, `additionalProperties: false`,
 * `minLength`, `pattern`, `minimum`, `maximum`, `minItems`, `items`.
 */

const fs = require('fs');
const path = require('path');

const CITIES_PATH = path.join(__dirname, '..', '..', 'data', 'cities.json');
const SCHEMA_PATH = path.join(__dirname, '..', '..', 'data', 'cities.schema.json');

/**
 * Recursively validate `value` against `schema`. Returns an array of
 * error strings; empty array ⇔ valid.
 *
 * @param {*} value
 * @param {Object} schema
 * @param {string} [pointerPath] - JSON-pointer-ish breadcrumb for messages
 * @returns {string[]}
 */
function validate(value, schema, pointerPath = '') {
    const errors = [];
    const here = pointerPath || '<root>';

    // Type
    if (schema.type) {
        const okType = (() => {
            switch (schema.type) {
                case 'array':
                    return Array.isArray(value);
                case 'object':
                    return value !== null && typeof value === 'object' && !Array.isArray(value);
                case 'string':
                    return typeof value === 'string';
                case 'number':
                    return typeof value === 'number' && Number.isFinite(value);
                case 'integer':
                    return typeof value === 'number' && Number.isInteger(value);
                default:
                    return false;
            }
        })();
        if (!okType) {
            errors.push(`${here}: expected type ${schema.type}, got ${typeof value}`);
            return errors; // further checks meaningless once type is wrong
        }
    }

    // Array constraints
    if (schema.type === 'array') {
        if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
            errors.push(`${here}: minItems ${schema.minItems}, got ${value.length}`);
        }
        if (schema.items) {
            value.forEach((item, idx) => {
                errors.push(...validate(item, schema.items, `${here}[${idx}]`));
            });
        }
    }

    // Object constraints
    if (schema.type === 'object') {
        const presentKeys = Object.keys(value);
        if (Array.isArray(schema.required)) {
            for (const key of schema.required) {
                if (!presentKeys.includes(key)) {
                    errors.push(`${here}: missing required property "${key}"`);
                }
            }
        }
        if (schema.additionalProperties === false && schema.properties) {
            const allowed = new Set(Object.keys(schema.properties));
            for (const key of presentKeys) {
                if (!allowed.has(key)) {
                    errors.push(`${here}: unexpected property "${key}"`);
                }
            }
        }
        if (schema.properties) {
            for (const [key, subSchema] of Object.entries(schema.properties)) {
                if (presentKeys.includes(key)) {
                    errors.push(...validate(value[key], subSchema, `${here}.${key}`));
                }
            }
        }
    }

    // String constraints
    if (schema.type === 'string') {
        if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
            errors.push(`${here}: minLength ${schema.minLength}, got ${value.length}`);
        }
        if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern).test(value)) {
            errors.push(`${here}: does not match pattern /${schema.pattern}/`);
        }
    }

    // Number / integer constraints
    if (schema.type === 'number' || schema.type === 'integer') {
        if (typeof schema.minimum === 'number' && value < schema.minimum) {
            errors.push(`${here}: minimum ${schema.minimum}, got ${value}`);
        }
        if (typeof schema.maximum === 'number' && value > schema.maximum) {
            errors.push(`${here}: maximum ${schema.maximum}, got ${value}`);
        }
    }

    return errors;
}

describe('data/cities.json schema validation', () => {
    let cities;
    let schema;

    beforeAll(() => {
        cities = JSON.parse(fs.readFileSync(CITIES_PATH, 'utf-8'));
        schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf-8'));
    });

    it('cities.json validates against cities.schema.json (no errors)', () => {
        const errors = validate(cities, schema);
        // Print all errors on failure rather than just the count, so a
        // future malformation is debuggable from CI logs alone.
        if (errors.length > 0) {
            throw new Error(
                `${errors.length} schema violation(s):\n  ${errors.slice(0, 20).join('\n  ')}` +
                    (errors.length > 20 ? `\n  ...(${errors.length - 20} more)` : '')
            );
        }
    });

    it('contains the expected number of entries (sanity)', () => {
        expect(cities.length).toBeGreaterThanOrEqual(500);
        expect(cities.length).toBeLessThanOrEqual(1000);
    });

    // ─── Self-test the validator: known-bad inputs should fail ───
    // (Closes the obvious "validator passes everything" hole.)

    it('the validator rejects a city missing a required field', () => {
        const bad = [{ name: 'X', lat: 0, lng: 0, pop: 1 }]; // no slug
        const errors = validate(bad, schema);
        expect(errors.some((e) => /missing required property "slug"/.test(e))).toBe(true);
    });

    it('the validator rejects out-of-range coordinates', () => {
        const bad = [{ name: 'X', lat: 91, lng: 181, pop: 1, slug: 'x' }];
        const errors = validate(bad, schema);
        expect(errors.some((e) => /lat: maximum 90/.test(e))).toBe(true);
        expect(errors.some((e) => /lng: maximum 180/.test(e))).toBe(true);
    });

    it('the validator rejects a non-slug-pattern slug', () => {
        const bad = [{ name: 'X', lat: 0, lng: 0, pop: 1, slug: 'New York!' }];
        const errors = validate(bad, schema);
        expect(errors.some((e) => /does not match pattern/.test(e))).toBe(true);
    });

    it('the validator rejects an unexpected property (additionalProperties:false)', () => {
        const bad = [
            { name: 'X', lat: 0, lng: 0, pop: 1, slug: 'x', timezone: 'UTC' }, // timezone not in schema
        ];
        const errors = validate(bad, schema);
        expect(errors.some((e) => /unexpected property "timezone"/.test(e))).toBe(true);
    });
});
