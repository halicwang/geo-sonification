// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

const {
    createClientState,
    applyHysteresis,
    getHttpClientState,
    saveHttpClientState,
    getHttpClientKey,
    PER_GRID_THRESHOLD_ENTER,
    PER_GRID_THRESHOLD_EXIT,
    _runCleanupNow,
    _resetMap,
} = require('../client-state');

describe('createClientState', () => {
    test('returns initial aggregated state with no snapshot', () => {
        const state = createClientState();
        expect(state).toEqual({ currentMode: 'aggregated', previousSnapshot: null });
    });
});

describe('applyHysteresis', () => {
    test('stays aggregated when gridCount is 0', () => {
        const state = createClientState();
        applyHysteresis(state, 0);
        expect(state.currentMode).toBe('aggregated');
    });

    test('enters per-grid when gridCount > 0 and <= ENTER threshold', () => {
        const state = createClientState();
        applyHysteresis(state, 1);
        expect(state.currentMode).toBe('per-grid');
    });

    test('enters per-grid at exactly ENTER threshold', () => {
        const state = createClientState();
        applyHysteresis(state, PER_GRID_THRESHOLD_ENTER);
        expect(state.currentMode).toBe('per-grid');
    });

    test('stays aggregated when gridCount > ENTER threshold', () => {
        const state = createClientState();
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
        const state = createClientState();
        applyHysteresis(state, 10);
        expect(state.currentMode).toBe('per-grid');
        applyHysteresis(state, PER_GRID_THRESHOLD_EXIT);
        expect(state.currentMode).toBe('per-grid');
    });

    test('full cycle: aggregated -> per-grid -> aggregated', () => {
        const state = createClientState();
        expect(state.currentMode).toBe('aggregated');
        applyHysteresis(state, 5);
        expect(state.currentMode).toBe('per-grid');
        applyHysteresis(state, PER_GRID_THRESHOLD_EXIT);
        expect(state.currentMode).toBe('per-grid');
        applyHysteresis(state, PER_GRID_THRESHOLD_EXIT + 100);
        expect(state.currentMode).toBe('aggregated');
    });
});

describe('getHttpClientKey', () => {
    test('uses clientId from request body when valid', () => {
        const req = {
            body: { clientId: 'abc-123' },
            headers: { 'x-forwarded-for': '8.8.8.8' },
            ip: '127.0.0.1',
            socket: { remoteAddress: '127.0.0.1' },
        };
        expect(getHttpClientKey(req)).toBe('client:abc-123');
    });

    test('uses x-client-id header when body lacks clientId', () => {
        const req = {
            body: {},
            headers: { 'x-client-id': 'header-id-99' },
            get: (name) => (name === 'x-client-id' ? 'header-id-99' : undefined),
            ip: '10.0.0.1',
            socket: { remoteAddress: '10.0.0.1' },
        };
        expect(getHttpClientKey(req)).toBe('header-client:header-id-99');
    });

    test('falls back to x-forwarded-for first IP', () => {
        const req = {
            body: {},
            headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
            ip: '127.0.0.1',
            socket: { remoteAddress: '127.0.0.1' },
        };
        expect(getHttpClientKey(req)).toBe('ip:1.2.3.4');
    });

    test('falls back to req.ip when no clientId, header, or x-forwarded-for', () => {
        const req = {
            body: {},
            headers: {},
            ip: '10.0.0.2',
            socket: { remoteAddress: '127.0.0.1' },
        };
        expect(getHttpClientKey(req)).toBe('ip:10.0.0.2');
    });

    test('normalizeClientId handles array (repeated header) and picks first valid', () => {
        const req = {
            body: { clientId: ['', '   ', 'real-id'] },
            headers: {},
            ip: '127.0.0.1',
        };
        expect(getHttpClientKey(req)).toBe('client:real-id');
    });

    test('rejects clientId longer than 128 chars (falls back to IP)', () => {
        const req = {
            body: { clientId: 'a'.repeat(129) },
            headers: {},
            ip: '10.0.0.5',
        };
        expect(getHttpClientKey(req)).toBe('ip:10.0.0.5');
    });
});

describe('HTTP client state persist/restore', () => {
    beforeEach(() => {
        _resetMap();
    });

    test('persists and restores both currentMode and previousSnapshot in one entry', () => {
        const key = `client:test-${Date.now()}`;
        const state = createClientState();
        state.currentMode = 'per-grid';
        state.previousSnapshot = { lcFractions: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] };
        saveHttpClientState(key, state);

        const { state: restored, previousMode } = getHttpClientState(key);
        expect(previousMode).toBe('per-grid');
        expect(restored.currentMode).toBe('per-grid');
        expect(restored.previousSnapshot).toEqual({
            lcFractions: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        });
    });

    test('returns aggregated default + null snapshot when key is unseen', () => {
        const { state, previousMode } = getHttpClientState('client:never-seen');
        expect(previousMode).toBe('aggregated');
        expect(state).toEqual({ currentMode: 'aggregated', previousSnapshot: null });
    });

    test('mutating returned state does not bleed into stored entry (deep clone)', () => {
        const key = 'client:isolation-check';
        const state = createClientState();
        state.previousSnapshot = { lcFractions: [0.5, 0.25, 0.25, 0, 0, 0, 0, 0, 0, 0, 0] };
        saveHttpClientState(key, state);

        const { state: first } = getHttpClientState(key);
        first.previousSnapshot.lcFractions[0] = 999;

        const { state: second } = getHttpClientState(key);
        expect(second.previousSnapshot.lcFractions[0]).toBe(0.5);
    });
});

describe('TTL cleanup (M3 audit D.3 + D.5 fix)', () => {
    beforeEach(() => {
        _resetMap();
    });

    test('entries older than 5 minutes are evicted by the cleanup sweep', () => {
        const realDateNow = Date.now;
        const t0 = realDateNow();
        const key = 'client:ttl-test';

        try {
            // Save at t0.
            saveHttpClientState(key, createClientState());
            expect(getHttpClientState(key).previousMode).toBe('aggregated');

            // Stub Date.now to advance 6 minutes (> 5-min TTL).
            Date.now = () => t0 + 6 * 60 * 1000;
            _runCleanupNow();

            // The entry should be gone — getHttpClientState now returns the
            // default (aggregated, null) because the key was evicted.
            const { previousMode, state } = getHttpClientState(key);
            expect(previousMode).toBe('aggregated');
            expect(state.previousSnapshot).toBeNull();
        } finally {
            Date.now = realDateNow;
        }
    });

    test('entries within TTL survive a cleanup sweep', () => {
        const realDateNow = Date.now;
        const t0 = realDateNow();
        const key = 'client:fresh';

        try {
            saveHttpClientState(key, { currentMode: 'per-grid', previousSnapshot: null });

            Date.now = () => t0 + 4 * 60 * 1000; // 4 min — under TTL
            _runCleanupNow();

            expect(getHttpClientState(key).previousMode).toBe('per-grid');
        } finally {
            Date.now = realDateNow;
        }
    });
});
