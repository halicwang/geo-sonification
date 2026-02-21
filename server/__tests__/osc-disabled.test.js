/**
 * Tests for ENABLE_OSC=false code path.
 *
 * Verifies that osc.js exports a complete null-object interface
 * when OSC is disabled, and that no UDP port is opened.
 */

let oscModule;

beforeAll(() => {
    process.env.ENABLE_OSC = 'false';
    jest.resetModules();

    // Mock the 'osc' npm package — if it gets required, this throws
    jest.mock('osc', () => {
        throw new Error('osc npm package should not be required when ENABLE_OSC=false');
    });

    oscModule = require('../osc');
});

afterAll(() => {
    delete process.env.ENABLE_OSC;
    jest.resetModules();
    jest.restoreAllMocks();
});

describe('ENABLE_OSC=false', () => {
    test('exports all expected function names', () => {
        const expectedKeys = [
            'isOscReady',
            'sendToMax',
            'sendGridsToMax',
            'sendModeToMax',
            'sendProximityToMax',
            'sendDeltaToMax',
            'sendCoverageToMax',
            'closeOsc',
        ];
        for (const key of expectedKeys) {
            expect(typeof oscModule[key]).toBe('function');
        }
    });

    test('isOscReady returns false', () => {
        expect(oscModule.isOscReady()).toBe(false);
    });

    test('send functions are callable no-ops', () => {
        expect(() => oscModule.sendToMax(10, 0.5, 0.3, 0.2, new Array(11).fill(0))).not.toThrow();
        expect(() => oscModule.sendGridsToMax([], [0, 0, 1, 1], {})).not.toThrow();
        expect(() => oscModule.sendModeToMax('aggregated')).not.toThrow();
        expect(() => oscModule.sendProximityToMax(0.5)).not.toThrow();
        expect(() => oscModule.sendDeltaToMax(new Array(11).fill(0))).not.toThrow();
        expect(() => oscModule.sendCoverageToMax(0.5)).not.toThrow();
    });

    test('closeOsc is callable without error', () => {
        expect(() => oscModule.closeOsc()).not.toThrow();
    });

    test('osc npm package was never required', () => {
        // The mock above would throw if the real OSC path ran.
        // Reaching here means the null-object path was taken.
        expect(oscModule.isOscReady()).toBe(false);
    });
});
