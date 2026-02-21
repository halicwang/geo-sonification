const {
    LC_CLASS_ORDER,
    OSC_ADDRESSES,
    LC_ADDRESS_ORDER,
    AGGREGATED_OSC_ORDER,
    OSC_SEQUENCE_WITH_DELTA,
    buildAggregatedPackets,
    buildDeltaPacket,
} = require('../osc_schema');

describe('osc_schema constants', () => {
    test('canonical LC class order is stable', () => {
        expect(LC_CLASS_ORDER).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100]);
    });

    test('aggregated OSC order has 15 messages', () => {
        expect(AGGREGATED_OSC_ORDER).toHaveLength(15);
        expect(AGGREGATED_OSC_ORDER.slice(0, 4)).toEqual([
            OSC_ADDRESSES.LANDCOVER,
            OSC_ADDRESSES.NIGHTLIGHT,
            OSC_ADDRESSES.POPULATION,
            OSC_ADDRESSES.FOREST,
        ]);
        expect(AGGREGATED_OSC_ORDER.slice(4)).toEqual(LC_ADDRESS_ORDER);
    });

    test('sequence includes mode/proximity/delta before aggregated payload', () => {
        expect(OSC_SEQUENCE_WITH_DELTA.slice(0, 3)).toEqual([
            OSC_ADDRESSES.MODE,
            OSC_ADDRESSES.PROXIMITY,
            OSC_ADDRESSES.DELTA_LC,
        ]);
        expect(OSC_SEQUENCE_WITH_DELTA.slice(3, 3 + AGGREGATED_OSC_ORDER.length)).toEqual(
            AGGREGATED_OSC_ORDER
        );
        expect(OSC_SEQUENCE_WITH_DELTA[OSC_SEQUENCE_WITH_DELTA.length - 1]).toBe(
            OSC_ADDRESSES.COVERAGE
        );
    });
});

describe('osc_schema packet builders', () => {
    test('buildAggregatedPackets returns 15 canonical packets', () => {
        const packets = buildAggregatedPackets({
            landcoverClass: 50,
            nightlightNorm: 0.2,
            populationNorm: 0.4,
            forestNorm: 0.6,
            lcFractions: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0],
        });

        expect(packets).toHaveLength(15);
        expect(packets.map((p) => p.address)).toEqual(AGGREGATED_OSC_ORDER);
        expect(packets[0].args[0]).toEqual({ type: 'i', value: 50 });
        expect(packets[4 + 4].args[0].value).toBeCloseTo(1.0, 6); // /lc/50
    });

    test('buildDeltaPacket returns /delta/lc packet', () => {
        const packet = buildDeltaPacket([0.1, -0.1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

        expect(packet.address).toBe(OSC_ADDRESSES.DELTA_LC);
        expect(packet.args).toHaveLength(11);
    });
});
