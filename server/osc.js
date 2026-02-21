/**
 * OSC client: sends viewport stats to MaxMSP over UDP.
 *
 * Message ordering per viewport update:
 *   /mode -> /proximity -> /delta/lc -> existing messages (unchanged order)
 *
 * Aggregated mode payload (existing):
 *   /landcover, /nightlight, /population, /forest, /lc/10 ... /lc/100
 *
 * Per-grid mode payload (existing):
 *   /grid/count, /viewport, N x (/grid, /grid/pos, /grid/lc)
 *
 * UDP is fire-and-forget; there is no delivery guarantee.
 */

const osc = require('osc');
const { OSC_HOST, OSC_PORT, DEBUG_OSC, GRID_SIZE } = require('./config');
const { WATER_CLASS, getCellLcDistribution } = require('./landcover');
const { normalizeOscValues } = require('./normalize');
const {
    LC_CLASS_ORDER,
    OSC_ADDRESSES,
    clamp01,
    clampLandcoverClass,
    buildModePacket,
    buildProximityPacket,
    buildDeltaPacket,
    buildCoveragePacket,
    buildAggregatedPackets,
} = require('./osc_schema');

const LC_CLASS_MIN = LC_CLASS_ORDER[0];

let oscReady = false;

const oscPort = new osc.UDPPort({
    localAddress: '0.0.0.0',
    localPort: 0, // OS-assigned ephemeral port (receive not used)
    remoteAddress: OSC_HOST,
    remotePort: OSC_PORT,
});

oscPort.on('ready', () => {
    oscReady = true;
    console.log(`OSC client ready, sending to ${OSC_HOST}:${OSC_PORT}`);
});

oscPort.on('error', (err) => {
    oscReady = false;
    console.error('OSC error (oscReady set to false):', err);
});

oscPort.open();

/** @returns {boolean} Whether the OSC UDP port is ready to send. */
function isOscReady() {
    return oscReady;
}

/**
 * Send aggregated OSC bundle:
 * /landcover + /nightlight + /population + /forest + /lc/* x11
 * @param {number} landcoverClass — dominant ESA land class
 * @param {number} nightlightNorm — 0-1 normalized
 * @param {number} populationNorm — 0-1 normalized
 * @param {number} forestNorm — 0-1 normalized
 * @param {number[]} lcFractions — length-11 array of 0-1 fractions (LC_CLASS_ORDER)
 */
function sendToMax(landcoverClass, nightlightNorm, populationNorm, forestNorm, lcFractions) {
    if (!oscReady) return;

    try {
        const packets = buildAggregatedPackets({
            landcoverClass,
            nightlightNorm,
            populationNorm,
            forestNorm,
            lcFractions,
        });

        oscPort.send({ timeTag: osc.timeTag(0), packets });

        if (DEBUG_OSC) {
            const top3 = LC_CLASS_ORDER.map((cls, index) => ({ cls, frac: lcFractions[index] }))
                .filter((x) => x.frac > 0)
                .sort((a, b) => b.frac - a.frac)
                .slice(0, 3)
                .map((x) => `${x.cls}:${(x.frac * 100).toFixed(1)}%`)
                .join(' ');
            console.log(
                `OSC sent (bundle): landcover=${clampLandcoverClass(landcoverClass)}, ` +
                    `nl=${clamp01(nightlightNorm).toFixed(3)}, pop=${clamp01(populationNorm).toFixed(3)}, ` +
                    `forest=${clamp01(forestNorm).toFixed(3)}, lc_dist=[${top3}]`
            );
        }
    } catch (err) {
        console.error('OSC aggregated send error:', err);
    }
}

/**
 * Send per-grid OSC messages: /grid/count, /viewport, then N × /grid bundle.
 * Existing per-grid behavior is preserved.
 *
 * @param {import('./types').GridCell[]} gridsInView
 * @param {number[]} bounds - [west, south, east, north]
 * @param {import('./types').NormalizeParams} normalizeParams
 * @returns {void}
 */
function sendGridsToMax(gridsInView, bounds, normalizeParams) {
    if (!gridsInView || gridsInView.length === 0) return;
    if (!oscReady) return;

    const [west, south, east, north] = bounds;

    // Viewport x-range on a circular longitude domain (0..360).
    // For dateline-crossing bounds (west > east), this formula returns a positive span.
    const xSpan = (east - west + 360) % 360 || (east !== west ? 360 : 0);
    const yRange = north - south;

    try {
        // Header messages sent individually (not per-cell)
        oscPort.send({
            address: OSC_ADDRESSES.GRID_COUNT,
            args: [{ type: 'i', value: gridsInView.length }],
        });
        oscPort.send({
            address: OSC_ADDRESSES.VIEWPORT,
            args: [
                { type: 'f', value: west },
                { type: 'f', value: south },
                { type: 'f', value: east },
                { type: 'f', value: north },
            ],
        });

        // Bundle each cell's 3 messages (/grid, /grid/pos, /grid/lc) into one UDP packet
        for (const g of gridsInView) {
            const lon = Number.isFinite(g.lon) ? g.lon : 0;
            const lat = Number.isFinite(g.lat) ? g.lat : 0;

            // Landcover class — clamp to canonical ESA range, consistent with aggregated mode
            let lc = LC_CLASS_MIN;
            if (
                g.landcover_class != null &&
                g.landcover_class !== '' &&
                !isNaN(g.landcover_class)
            ) {
                const normalized = clampLandcoverClass(Number(g.landcover_class));
                lc = normalized > 0 ? normalized : LC_CLASS_MIN;
            }

            // Normalize per-cell values using same p1/p99 as aggregated mode
            // Explicitly handle nightlight sentinel (-1 = no VIIRS data) -> treat as 0
            const nlP90ForNorm =
                g.nightlight_p90 != null && g.nightlight_p90 >= 0 ? g.nightlight_p90 : 0;
            const { nightlightNorm, populationNorm, forestNorm } = normalizeOscValues(
                nlP90ForNorm,
                g.population_density ?? 0,
                g.forest_pct ?? 0,
                normalizeParams
            );

            // Viewport-relative normalized position (0-1) using cell CENTER
            const centerLon = lon + GRID_SIZE / 2;
            const centerLat = lat + GRID_SIZE / 2;
            const xNorm = xSpan > 0 ? clamp01(((centerLon - west + 360) % 360) / xSpan) : 0.5;
            const yNorm = yRange > 0 ? clamp01((centerLat - south) / yRange) : 0.5;

            // Per-cell continuous landcover distribution (11 floats, same class order as /lc/*)
            // Fallback: if no lc_pct_* data, synthesize 100% distribution from discrete landcover_class
            let cellDist = getCellLcDistribution(g);
            let cellPctSum = Object.values(cellDist).reduce((sum, value) => sum + value, 0);
            if (cellPctSum <= 0 && lc !== WATER_CLASS) {
                cellDist = { [lc]: 100 };
                cellPctSum = 100;
            }
            const lcArgs = LC_CLASS_ORDER.map((cls) => ({
                type: 'f',
                value: cellPctSum > 0 ? clamp01((cellDist[cls] || 0) / cellPctSum) : 0,
            }));

            oscPort.send({
                timeTag: osc.timeTag(0),
                packets: [
                    {
                        address: OSC_ADDRESSES.GRID,
                        args: [
                            { type: 'f', value: lon },
                            { type: 'f', value: lat },
                            { type: 'i', value: lc },
                            { type: 'f', value: clamp01(nightlightNorm) },
                            { type: 'f', value: clamp01(populationNorm) },
                            { type: 'f', value: clamp01(forestNorm) },
                        ],
                    },
                    {
                        address: OSC_ADDRESSES.GRID_POS,
                        args: [
                            { type: 'f', value: xNorm },
                            { type: 'f', value: yNorm },
                        ],
                    },
                    { address: OSC_ADDRESSES.GRID_LC, args: lcArgs },
                ],
            });
        }

        if (DEBUG_OSC) {
            console.log(
                `OSC per-grid: ${gridsInView.length} bundles (3 msgs each), ` +
                    `viewport=[${west.toFixed(2)},${south.toFixed(2)},${east.toFixed(2)},${north.toFixed(2)}]`
            );
        }
    } catch (err) {
        console.error('OSC per-grid send error:', err);
    }
}

/**
 * Send current mode to MaxMSP so it can handle transitions (e.g. crossfade).
 * Sent before any data messages on every viewport update.
 *
 * @param {string} mode - 'aggregated' or 'per-grid'
 * @returns {void}
 */
function sendModeToMax(mode) {
    if (!oscReady) return;
    try {
        oscPort.send(buildModePacket(mode));
        if (DEBUG_OSC) console.log(`OSC mode: ${mode}`);
    } catch (err) {
        if (DEBUG_OSC) {
            console.error('OSC mode send failed:', err);
        } else {
            console.error('OSC mode send failed');
        }
    }
}

/**
 * Send viewport zoom proximity (0-1).
 *
 * @param {number} proximity - 0-1 zoom proximity
 * @returns {void}
 */
function sendProximityToMax(proximity) {
    if (!oscReady) return;
    try {
        oscPort.send(buildProximityPacket(proximity));
        if (DEBUG_OSC) console.log(`OSC sent: /proximity ${clamp01(proximity).toFixed(3)}`);
    } catch (err) {
        console.error('OSC proximity send error:', err);
    }
}

/**
 * Send /delta/lc (11 floats: per-class land cover change).
 *
 * @param {number[]} deltaLc - length-11 per-class delta vector
 * @returns {void}
 */
function sendDeltaToMax(deltaLc) {
    if (!oscReady) return;
    try {
        oscPort.send(buildDeltaPacket(deltaLc));
        if (DEBUG_OSC) console.log('OSC sent: /delta/lc');
    } catch (err) {
        console.error('OSC delta send error:', err);
    }
}

/**
 * Send land coverage ratio to MaxMSP.
 * @param {number} ratio - 0-1 float (land grids / theoretical grids)
 * @returns {void}
 */
function sendCoverageToMax(ratio) {
    if (!oscReady) return;
    try {
        const packet = buildCoveragePacket(ratio);
        oscPort.send(packet);
        if (DEBUG_OSC) console.log(`OSC sent: /coverage ${packet.args[0].value.toFixed(3)}`);
    } catch (err) {
        console.error('OSC coverage send error:', err);
    }
}

/** Close the OSC UDP port. @returns {void} */
function closeOsc() {
    try {
        oscPort.close();
    } catch (err) {
        console.error('Error closing OSC port:', err);
    }
}

module.exports = {
    isOscReady,
    sendToMax,
    sendGridsToMax,
    sendModeToMax,
    sendProximityToMax,
    sendDeltaToMax,
    sendCoverageToMax,
    closeOsc,
};
