// Mock osc module before requiring osc.js — captures 'ready' callback
let readyCb;
const mockSend = jest.fn();
jest.mock('osc', () => ({
    UDPPort: jest.fn().mockImplementation(() => ({
        on: jest.fn((event, cb) => { if (event === 'ready') readyCb = cb; }),
        open: jest.fn(),
        send: mockSend,
        close: jest.fn()
    })),
    timeTag: jest.fn(() => ({ raw: [0, 0] }))
}));

// Mock normalize to avoid file I/O (loadOrCalcNormalize reads CSV)
jest.mock('../normalize', () => ({
    normalizeOscValues: (nl, pop, forest) => ({
        nightlightNorm: nl, populationNorm: pop, forestNorm: forest
    })
}));

const { sendToMax, sendGridsToMax, sendCoverageToMax } = require('../osc');

beforeEach(() => {
    mockSend.mockClear();
    // Trigger oscReady = true so send branches execute
    if (readyCb) readyCb();
});

describe('sendToMax', () => {
    test('null dominantLandcover sends /landcover 0', () => {
        sendToMax(null, 0.5, 0.3, 0.2, {});
        expect(mockSend).toHaveBeenCalled();

        // First call is the OSC bundle with 15 messages
        const bundle = mockSend.mock.calls[0][0];
        const lcMsg = bundle.packets.find(p => p.address === '/landcover');
        expect(lcMsg.args[0].value).toBe(0);
    });

    test('valid dominantLandcover=30 sends /landcover 30', () => {
        sendToMax(30, 0.5, 0.3, 0.2, { 30: 100 });
        const bundle = mockSend.mock.calls[0][0];
        const lcMsg = bundle.packets.find(p => p.address === '/landcover');
        expect(lcMsg.args[0].value).toBe(30);
    });

    test('landcover distribution fractions sum to ~1', () => {
        sendToMax(10, 0.5, 0.3, 0.2, { 10: 60, 30: 40 });
        const bundle = mockSend.mock.calls[0][0];
        const lcMsgs = bundle.packets.filter(p => p.address.startsWith('/lc/'));
        expect(lcMsgs).toHaveLength(11);

        const fracSum = lcMsgs.reduce((s, m) => s + m.args[0].value, 0);
        expect(fracSum).toBeCloseTo(1.0, 5);
    });
});

describe('sendGridsToMax', () => {
    const bounds = [-1, -1, 2, 2];
    const normParams = {};

    test('water-only cell (lc=80, no lc_pct_*) sends all-zero /grid/lc', () => {
        const waterCell = {
            lon: 0, lat: 0,
            landcover_class: 80,
            nightlight_p90: 0, population_density: 0, forest_pct: 0
        };
        sendGridsToMax([waterCell], bounds, normParams);

        // Find the bundle containing /grid/lc
        const bundleCall = mockSend.mock.calls.find(call => {
            const msg = call[0];
            return msg.packets && msg.packets.some(p => p.address === '/grid/lc');
        });
        expect(bundleCall).toBeDefined();

        const gridLcMsg = bundleCall[0].packets.find(p => p.address === '/grid/lc');
        const allZero = gridLcMsg.args.every(a => a.value === 0);
        expect(allZero).toBe(true);
        expect(gridLcMsg.args).toHaveLength(11);
    });

    test('normal cell with lc_pct_* sends non-zero /grid/lc fractions', () => {
        const forestCell = {
            lon: 0, lat: 0,
            landcover_class: 10,
            lc_pct_10: 60, lc_pct_30: 40,
            nightlight_p90: 0, population_density: 0, forest_pct: 50
        };
        sendGridsToMax([forestCell], bounds, normParams);

        const bundleCall = mockSend.mock.calls.find(call => {
            const msg = call[0];
            return msg.packets && msg.packets.some(p => p.address === '/grid/lc');
        });
        const gridLcMsg = bundleCall[0].packets.find(p => p.address === '/grid/lc');
        const fracSum = gridLcMsg.args.reduce((s, a) => s + a.value, 0);
        expect(fracSum).toBeCloseTo(1.0, 5);

        // class 10 (index 0) should be 0.6, class 30 (index 2) should be 0.4
        expect(gridLcMsg.args[0].value).toBeCloseTo(0.6, 5);  // lc_pct_10
        expect(gridLcMsg.args[2].value).toBeCloseTo(0.4, 5);  // lc_pct_30
    });

    test('discrete fallback: lc=10 without lc_pct_* synthesizes 100% for class 10', () => {
        const discreteCell = {
            lon: 0, lat: 0,
            landcover_class: 10,
            nightlight_p90: 0, population_density: 0, forest_pct: 50
        };
        sendGridsToMax([discreteCell], bounds, normParams);

        const bundleCall = mockSend.mock.calls.find(call => {
            const msg = call[0];
            return msg.packets && msg.packets.some(p => p.address === '/grid/lc');
        });
        const gridLcMsg = bundleCall[0].packets.find(p => p.address === '/grid/lc');

        // class 10 should be 1.0 (100%), rest should be 0
        expect(gridLcMsg.args[0].value).toBeCloseTo(1.0, 5);
        const restSum = gridLcMsg.args.slice(1).reduce((s, a) => s + a.value, 0);
        expect(restSum).toBe(0);
    });
});

describe('sendCoverageToMax', () => {
    test('sends /coverage float', () => {
        sendCoverageToMax(0.5);
        const call = mockSend.mock.calls.find(c => c[0].address === '/coverage');
        expect(call).toBeDefined();
        expect(call[0].args[0]).toEqual({ type: 'f', value: 0.5 });
    });

    test('clamps ratio > 1 to 1', () => {
        sendCoverageToMax(1.5);
        const call = mockSend.mock.calls.find(c => c[0].address === '/coverage');
        expect(call[0].args[0].value).toBe(1);
    });

    test('null ratio sends 0', () => {
        sendCoverageToMax(null);
        const call = mockSend.mock.calls.find(c => c[0].address === '/coverage');
        expect(call[0].args[0].value).toBe(0);
    });

    test('NaN ratio sends 0', () => {
        sendCoverageToMax(NaN);
        const call = mockSend.mock.calls.find(c => c[0].address === '/coverage');
        expect(call[0].args[0].value).toBe(0);
    });
});
