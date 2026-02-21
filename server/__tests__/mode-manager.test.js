const {
    createModeState,
    applyHysteresis,
    PER_GRID_THRESHOLD_ENTER,
    PER_GRID_THRESHOLD_EXIT,
} = require('../mode-manager');

describe('createModeState', () => {
    test('returns initial aggregated state', () => {
        const state = createModeState();
        expect(state).toEqual({ currentMode: 'aggregated' });
    });
});

describe('applyHysteresis', () => {
    test('stays aggregated when gridCount is 0', () => {
        const state = createModeState();
        applyHysteresis(state, 0);
        expect(state.currentMode).toBe('aggregated');
    });

    test('enters per-grid when gridCount > 0 and <= ENTER threshold', () => {
        const state = createModeState();
        applyHysteresis(state, 1);
        expect(state.currentMode).toBe('per-grid');
    });

    test('enters per-grid at exactly ENTER threshold', () => {
        const state = createModeState();
        applyHysteresis(state, PER_GRID_THRESHOLD_ENTER);
        expect(state.currentMode).toBe('per-grid');
    });

    test('stays aggregated when gridCount > ENTER threshold', () => {
        const state = createModeState();
        applyHysteresis(state, PER_GRID_THRESHOLD_ENTER + 1);
        expect(state.currentMode).toBe('aggregated');
    });

    test('stays per-grid when gridCount <= EXIT threshold', () => {
        const state = { currentMode: 'per-grid' };
        applyHysteresis(state, PER_GRID_THRESHOLD_EXIT);
        expect(state.currentMode).toBe('per-grid');
    });

    test('exits per-grid when gridCount > EXIT threshold', () => {
        const state = { currentMode: 'per-grid' };
        applyHysteresis(state, PER_GRID_THRESHOLD_EXIT + 1);
        expect(state.currentMode).toBe('aggregated');
    });

    test('exits per-grid when gridCount is 0', () => {
        const state = { currentMode: 'per-grid' };
        applyHysteresis(state, 0);
        expect(state.currentMode).toBe('aggregated');
    });

    test('hysteresis: enter then stay in per-grid within band', () => {
        const state = createModeState();
        // Enter per-grid
        applyHysteresis(state, 10);
        expect(state.currentMode).toBe('per-grid');
        // Stay per-grid at EXIT threshold (does not exceed)
        applyHysteresis(state, PER_GRID_THRESHOLD_EXIT);
        expect(state.currentMode).toBe('per-grid');
    });

    test('full cycle: aggregated -> per-grid -> aggregated', () => {
        const state = createModeState();
        expect(state.currentMode).toBe('aggregated');

        // Zoom in to per-grid
        applyHysteresis(state, 5);
        expect(state.currentMode).toBe('per-grid');

        // Still per-grid at moderate count
        applyHysteresis(state, PER_GRID_THRESHOLD_EXIT);
        expect(state.currentMode).toBe('per-grid');

        // Zoom out past exit threshold
        applyHysteresis(state, PER_GRID_THRESHOLD_EXIT + 100);
        expect(state.currentMode).toBe('aggregated');
    });
});
