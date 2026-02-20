const {
    createDeltaState,
    getHttpDeltaState,
    saveHttpDeltaState,
    getHttpDeltaClientKey
} = require('../delta-state');

describe('getHttpDeltaClientKey', () => {
    test('uses clientId from request body when valid', () => {
        const req = {
            body: { clientId: 'abc-123' },
            headers: { 'x-forwarded-for': '8.8.8.8' },
            ip: '127.0.0.1',
            socket: { remoteAddress: '127.0.0.1' }
        };
        expect(getHttpDeltaClientKey(req)).toBe('client:abc-123');
    });

    test('falls back to x-forwarded-for first IP', () => {
        const req = {
            body: {},
            headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
            ip: '127.0.0.1',
            socket: { remoteAddress: '127.0.0.1' }
        };
        expect(getHttpDeltaClientKey(req)).toBe('ip:1.2.3.4');
    });

    test('falls back to req.ip when no clientId or x-forwarded-for', () => {
        const req = {
            body: {},
            headers: {},
            ip: '10.0.0.2',
            socket: { remoteAddress: '127.0.0.1' }
        };
        expect(getHttpDeltaClientKey(req)).toBe('ip:10.0.0.2');
    });
});

describe('HTTP delta state', () => {
    test('persists and restores previous snapshot by key', () => {
        const key = `client:test-${Date.now()}`;
        const state = createDeltaState();
        state.previousSnapshot = {
            lcFractions: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        };
        saveHttpDeltaState(key, state);

        const { deltaState } = getHttpDeltaState(key);
        expect(deltaState.previousSnapshot).toBeDefined();
        expect(deltaState.previousSnapshot.lcFractions[0]).toBe(1);
    });
});
