/**
 * OSC client: sends viewport stats to MaxMSP over UDP.
 *
 * Both modes:
 *   /mode        (string) — "aggregated" or "per-grid", sent before data on every update
 *
 * Aggregated mode: 15 OSC addresses per viewport update:
 *   /landcover  (int)    — dominant ESA class, 10-100
 *   /nightlight (float)  — 0-1 normalized brightness
 *   /population (float)  — 0-1 normalized density
 *   /forest     (float)  — 0-1 normalized forest cover
 *   /lc/10  … /lc/100   (float) — 0-1 area fraction per ESA class
 *
 * Per-grid mode (when gridCount is within hysteresis threshold):
 *   /grid/count  (int)   — number of grid cells
 *   /viewport    (4 floats) — west, south, east, north bounds
 *   /grid        (int+5 floats) × N — lon, lat, landcover, nl, pop, forest per cell
 *   /grid/pos    (2 floats) × N — xNorm (0=west,1=east), yNorm (0=south,1=north)
 *   /grid/lc     (11 floats) × N — per-cell lc fraction [10..100], matches /lc/* order
 *
 * UDP is fire-and-forget; there is no delivery guarantee.
 */

const osc = require('osc');
const { OSC_HOST, OSC_PORT, DEBUG_OSC, GRID_SIZE } = require('./config');
const { VALID_LANDCOVER_CLASSES, getCellLcDistribution } = require('./landcover');
const { normalizeOscValues } = require('./normalize');

// ESA WorldCover class range bounds, derived from the canonical class list
const LC_CLASS_MIN = Math.min(...VALID_LANDCOVER_CLASSES); // 10
const LC_CLASS_MAX = Math.max(...VALID_LANDCOVER_CLASSES); // 100

let oscReady = false;

const oscPort = new osc.UDPPort({
    localAddress: '0.0.0.0',
    localPort: 0,           // OS-assigned ephemeral port (receive not used)
    remoteAddress: OSC_HOST,
    remotePort: OSC_PORT
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

function isOscReady() {
    return oscReady;
}

/**
 * Send 15 OSC messages to MaxMSP: 4 aggregated stats + 11 landcover class fractions.
 * @param {number} landcoverClass        — dominant ESA class (clamped 10-100; defaults to 10)
 * @param {number} nightlightNorm        — 0-1 normalized
 * @param {number} populationNorm        — 0-1 normalized
 * @param {number} forestNorm            — 0-1 normalized
 * @param {Object} [landcoverDistribution={}] — { classCode: weightedArea } from spatial stats
 */
function sendToMax(landcoverClass, nightlightNorm, populationNorm, forestNorm, landcoverDistribution) {
    if (!oscReady) return;

    // ESA WorldCover classes range LC_CLASS_MIN–LC_CLASS_MAX; clamp to that range
    let lc = (landcoverClass != null && Number.isFinite(landcoverClass)) ? Math.round(landcoverClass) : LC_CLASS_MIN;
    lc = Math.max(LC_CLASS_MIN, Math.min(LC_CLASS_MAX, lc));

    const clamp01 = (v) => {
        if (v == null || !Number.isFinite(v)) return 0;
        return Math.max(0, Math.min(1, v));
    };
    const nl = clamp01(nightlightNorm);
    const pop = clamp01(populationNorm);
    const f = clamp01(forestNorm);

    // Convert weighted-area distribution to 0-1 fractions
    const dist = landcoverDistribution || {};
    const totalWeight = Object.values(dist).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);

    // Landcover distribution fractions — compute once, reuse for bundle and debug
    const lcFracs = VALID_LANDCOVER_CLASSES.map(cls => {
        const frac = totalWeight > 0 ? clamp01((dist[cls] || 0) / totalWeight) : 0;
        return { cls, frac };
    });

    try {
        // Bundle all 15 messages (4 stats + 11 lc fractions) into a single UDP packet
        const packets = [
            { address: '/landcover', args: [{ type: 'i', value: lc }] },
            { address: '/nightlight', args: [{ type: 'f', value: nl }] },
            { address: '/population', args: [{ type: 'f', value: pop }] },
            { address: '/forest', args: [{ type: 'f', value: f }] },
            ...lcFracs.map(({ cls, frac }) => ({
                address: `/lc/${cls}`, args: [{ type: 'f', value: frac }]
            }))
        ];

        oscPort.send({ timeTag: osc.timeTag(0), packets });

        if (DEBUG_OSC) {
            const top3 = lcFracs
                .filter(x => x.frac > 0)
                .sort((a, b) => b.frac - a.frac)
                .slice(0, 3)
                .map(x => `${x.cls}:${(x.frac * 100).toFixed(1)}%`)
                .join(' ');
            console.log(`OSC sent (bundle): landcover=${lc}, nl=${nl.toFixed(3)}, pop=${pop.toFixed(3)}, forest=${f.toFixed(3)}, lc_dist=[${top3}]`);
        }
    } catch (err) {
        console.error('OSC aggregated send error:', err);
    }
}

/**
 * Send per-grid OSC messages: /grid/count, /viewport, then N × /grid.
 * @param {Object[]} gridsInView — array of grid cell objects from spatial index
 * @param {number[]} bounds — [west, south, east, north] viewport bounds
 * @param {Object} normalizeParams — normalization params from loadOrCalcNormalize()
 */
function sendGridsToMax(gridsInView, bounds, normalizeParams) {
    if (!gridsInView || gridsInView.length === 0) return;
    if (!oscReady) return;

    const clamp01 = (v) => {
        if (v == null || !Number.isFinite(v)) return 0;
        return Math.max(0, Math.min(1, v));
    };

    const [west, south, east, north] = bounds;

    // Viewport x-range on a circular longitude domain (0..360).
    // For dateline-crossing bounds (west > east), this formula returns a positive span.
    const xSpan = ((east - west + 360) % 360) || (east !== west ? 360 : 0);
    const yRange = north - south;

    try {
        // Header messages sent individually (not per-cell)
        oscPort.send({ address: '/grid/count', args: [{ type: 'i', value: gridsInView.length }] });
        oscPort.send({ address: '/viewport', args: [
            { type: 'f', value: west },  { type: 'f', value: south },
            { type: 'f', value: east },  { type: 'f', value: north }
        ]});

        // Bundle each cell's 3 messages (/grid, /grid/pos, /grid/lc) into one UDP packet
        for (const [index, g] of gridsInView.entries()) {
            const lon = Number.isFinite(g.lon) ? g.lon : 0;
            const lat = Number.isFinite(g.lat) ? g.lat : 0;

            // Landcover class — clamp to valid ESA range, consistent with aggregated mode
            let lc = LC_CLASS_MIN;
            if (g.landcover_class != null && g.landcover_class !== '' && !isNaN(g.landcover_class)) {
                lc = Math.round(Number(g.landcover_class));
            }
            lc = Math.max(LC_CLASS_MIN, Math.min(LC_CLASS_MAX, lc));

            // Normalize per-cell values using same p1/p99 as aggregated mode
            // Explicitly handle nightlight sentinel (-1 = no VIIRS data) → treat as 0
            const nlP90ForNorm = (g.nightlight_p90 != null && g.nightlight_p90 >= 0) ? g.nightlight_p90 : 0;
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
            let cellPctSum = Object.values(cellDist).reduce((s, v) => s + v, 0);
            if (cellPctSum <= 0 && lc >= LC_CLASS_MIN) {
                cellDist = { [lc]: 100 };
                cellPctSum = 100;
            }
            const lcArgs = VALID_LANDCOVER_CLASSES.map(cls => ({
                type: 'f',
                value: cellPctSum > 0 ? clamp01((cellDist[cls] || 0) / cellPctSum) : 0
            }));

            oscPort.send({
                timeTag: osc.timeTag(0),
                packets: [
                    { address: '/grid', args: [
                        { type: 'f', value: lon },
                        { type: 'f', value: lat },
                        { type: 'i', value: lc },
                        { type: 'f', value: clamp01(nightlightNorm) },
                        { type: 'f', value: clamp01(populationNorm) },
                        { type: 'f', value: clamp01(forestNorm) }
                    ]},
                    { address: '/grid/pos', args: [
                        { type: 'f', value: xNorm },
                        { type: 'f', value: yNorm }
                    ]},
                    { address: '/grid/lc', args: lcArgs }
                ]
            });
        }

        if (DEBUG_OSC) {
            console.log(`OSC per-grid: ${gridsInView.length} bundles (3 msgs each), viewport=[${west.toFixed(2)},${south.toFixed(2)},${east.toFixed(2)},${north.toFixed(2)}]`);
        }
    } catch (err) {
        console.error('OSC per-grid send error:', err);
    }
}

/**
 * Send current mode to MaxMSP so it can handle transitions (e.g. crossfade).
 * Sent before any data messages on every viewport update.
 * @param {string} mode — "aggregated" or "per-grid"
 */
function sendModeToMax(mode) {
    try {
        oscPort.send({ address: '/mode', args: [{ type: 's', value: mode }] });
        if (DEBUG_OSC) console.log(`OSC mode: ${mode}`);
    } catch (err) {
        if (DEBUG_OSC) {
            console.error('OSC mode send failed:', err);
        } else {
            console.error('OSC mode send failed');
        }
    }
}

function closeOsc() {
    try {
        oscPort.close();
    } catch (err) {
        console.error('Error closing OSC port:', err);
    }
}

module.exports = { isOscReady, sendToMax, sendGridsToMax, sendModeToMax, closeOsc };
