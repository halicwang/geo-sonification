#!/usr/bin/env node
/**
 * OSC simulator for Milestone A validation.
 *
 * Usage:
 *   node scripts/osc_simulator.js <scenario-name>
 *   node scripts/osc_simulator.js   # interactive selector when TTY
 */

const path = require('path');
const readline = require('readline');
const { createRequire } = require('module');

const requireFromServer = createRequire(path.resolve(__dirname, '../server/package.json'));
const osc = requireFromServer('osc');

const {
    LC_CLASS_ORDER,
    clamp01,
    buildModePacket,
    buildProximityPacket,
    buildDeltaPacket,
    buildCoveragePacket,
    buildAggregatedPackets
} = require('../server/osc_schema');
const { computeDeltaMetrics } = require('../server/osc-metrics');

const DEFAULT_OSC_HOST = '127.0.0.1';
const DEFAULT_OSC_PORT = 7400;
const DEFAULT_FRAME_MS = 250;

function parseOscPort(value, fallback) {
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : fallback;
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function lcState(values) {
    return LC_CLASS_ORDER.map(cls => clamp01(values[cls] || 0));
}

function normalizeLcFractions(fractions) {
    const safe = LC_CLASS_ORDER.map((_, index) => clamp01(Array.isArray(fractions) ? fractions[index] : 0));
    const sum = safe.reduce((acc, value) => acc + value, 0);
    if (sum <= 0) return safe;
    return safe.map(value => value / sum);
}

function interpolateFrame(a, b, t) {
    const lcFractions = a.lcFractions.map((value, index) => lerp(value, b.lcFractions[index], t));
    return {
        mode: b.mode || a.mode || 'aggregated',
        proximity: clamp01(lerp(a.proximity, b.proximity, t)),
        coverage: clamp01(lerp(a.coverage, b.coverage, t)),
        nightlight: clamp01(lerp(a.nightlight, b.nightlight, t)),
        population: clamp01(lerp(a.population, b.population, t)),
        forest: clamp01(lerp(a.forest, b.forest, t)),
        lcFractions: normalizeLcFractions(lcFractions)
    };
}

function dominantClassFromFractions(lcFractions) {
    let maxIndex = -1;
    let maxValue = 0;
    lcFractions.forEach((value, index) => {
        if (value > maxValue) {
            maxValue = value;
            maxIndex = index;
        }
    });
    return maxIndex === -1 ? 0 : LC_CLASS_ORDER[maxIndex];
}

function createKeyframeScenario({ description, durationMs, frameMs = DEFAULT_FRAME_MS, keyframes }) {
    return {
        description,
        durationMs,
        frameMs,
        frameAt(elapsedMs) {
            if (elapsedMs <= keyframes[0].t) {
                return keyframes[0].state;
            }
            if (elapsedMs >= keyframes[keyframes.length - 1].t) {
                return keyframes[keyframes.length - 1].state;
            }

            for (let i = 0; i < keyframes.length - 1; i++) {
                const current = keyframes[i];
                const next = keyframes[i + 1];
                if (elapsedMs >= current.t && elapsedMs <= next.t) {
                    const segmentDuration = Math.max(1, next.t - current.t);
                    const t = (elapsedMs - current.t) / segmentDuration;
                    return interpolateFrame(current.state, next.state, t);
                }
            }

            return keyframes[keyframes.length - 1].state;
        }
    };
}

function createScenarios() {
    return {
        'static-forest': createKeyframeScenario({
            description: 'Pure forest steady state for stable texture testing.',
            durationMs: 12000,
            keyframes: [
                {
                    t: 0,
                    state: {
                        mode: 'aggregated',
                        proximity: 0.95,
                        coverage: 0.92,
                        nightlight: 0.12,
                        population: 0.10,
                        forest: 0.96,
                        lcFractions: lcState({ 10: 1.0 })
                    }
                },
                {
                    t: 12000,
                    state: {
                        mode: 'aggregated',
                        proximity: 0.95,
                        coverage: 0.92,
                        nightlight: 0.12,
                        population: 0.10,
                        forest: 0.96,
                        lcFractions: lcState({ 10: 1.0 })
                    }
                }
            ]
        }),
        'static-mixed': createKeyframeScenario({
            description: 'Stable mixed viewport: 60% tree, 30% water, 10% crop.',
            durationMs: 12000,
            keyframes: [
                {
                    t: 0,
                    state: {
                        mode: 'aggregated',
                        proximity: 0.82,
                        coverage: 0.70,
                        nightlight: 0.25,
                        population: 0.20,
                        forest: 0.66,
                        lcFractions: lcState({ 10: 0.6, 40: 0.1, 80: 0.3 })
                    }
                },
                {
                    t: 12000,
                    state: {
                        mode: 'aggregated',
                        proximity: 0.82,
                        coverage: 0.70,
                        nightlight: 0.25,
                        population: 0.20,
                        forest: 0.66,
                        lcFractions: lcState({ 10: 0.6, 40: 0.1, 80: 0.3 })
                    }
                }
            ]
        }),
        'gradual-transition': createKeyframeScenario({
            description: '10s linear transition from tree-dominant to urban-dominant.',
            durationMs: 10000,
            keyframes: [
                {
                    t: 0,
                    state: {
                        mode: 'aggregated',
                        proximity: 0.88,
                        coverage: 0.90,
                        nightlight: 0.10,
                        population: 0.15,
                        forest: 0.90,
                        lcFractions: lcState({ 10: 1.0 })
                    }
                },
                {
                    t: 10000,
                    state: {
                        mode: 'aggregated',
                        proximity: 0.88,
                        coverage: 0.95,
                        nightlight: 0.85,
                        population: 0.88,
                        forest: 0.12,
                        lcFractions: lcState({ 50: 1.0 })
                    }
                }
            ]
        }),
        'abrupt-switch': createKeyframeScenario({
            description: 'Instant jump from tree to bare to stress /delta response.',
            durationMs: 8000,
            keyframes: [
                {
                    t: 0,
                    state: {
                        mode: 'aggregated',
                        proximity: 0.90,
                        coverage: 0.88,
                        nightlight: 0.12,
                        population: 0.14,
                        forest: 0.86,
                        lcFractions: lcState({ 10: 1.0 })
                    }
                },
                {
                    t: 3999,
                    state: {
                        mode: 'aggregated',
                        proximity: 0.90,
                        coverage: 0.88,
                        nightlight: 0.12,
                        population: 0.14,
                        forest: 0.86,
                        lcFractions: lcState({ 10: 1.0 })
                    }
                },
                {
                    t: 4000,
                    state: {
                        mode: 'aggregated',
                        proximity: 0.90,
                        coverage: 0.75,
                        nightlight: 0.35,
                        population: 0.26,
                        forest: 0.05,
                        lcFractions: lcState({ 60: 1.0 })
                    }
                },
                {
                    t: 8000,
                    state: {
                        mode: 'aggregated',
                        proximity: 0.90,
                        coverage: 0.75,
                        nightlight: 0.35,
                        population: 0.26,
                        forest: 0.05,
                        lcFractions: lcState({ 60: 1.0 })
                    }
                }
            ]
        }),
        'zoom-sweep': createKeyframeScenario({
            description: 'Proximity sweep from 1.0 to 0.0 while landcover remains stable.',
            durationMs: 15000,
            keyframes: [
                {
                    t: 0,
                    state: {
                        mode: 'aggregated',
                        proximity: 1.0,
                        coverage: 0.80,
                        nightlight: 0.40,
                        population: 0.38,
                        forest: 0.44,
                        lcFractions: lcState({ 10: 0.5, 50: 0.2, 80: 0.3 })
                    }
                },
                {
                    t: 15000,
                    state: {
                        mode: 'aggregated',
                        proximity: 0.0,
                        coverage: 0.80,
                        nightlight: 0.40,
                        population: 0.38,
                        forest: 0.44,
                        lcFractions: lcState({ 10: 0.5, 50: 0.2, 80: 0.3 })
                    }
                }
            ]
        }),
        'world-tour': createKeyframeScenario({
            description: 'Amazon -> Atlantic -> Sahara -> European city journey.',
            durationMs: 48000,
            keyframes: [
                {
                    t: 0,
                    state: {
                        mode: 'aggregated',
                        proximity: 0.88,
                        coverage: 0.92,
                        nightlight: 0.15,
                        population: 0.18,
                        forest: 0.88,
                        lcFractions: lcState({ 10: 0.78, 80: 0.08, 90: 0.10, 95: 0.04 })
                    }
                },
                {
                    t: 12000,
                    state: {
                        mode: 'aggregated',
                        proximity: 0.55,
                        coverage: 0.12,
                        nightlight: 0.08,
                        population: 0.06,
                        forest: 0.10,
                        lcFractions: lcState({ 80: 0.88, 20: 0.05, 10: 0.03, 90: 0.04 })
                    }
                },
                {
                    t: 24000,
                    state: {
                        mode: 'aggregated',
                        proximity: 0.78,
                        coverage: 0.82,
                        nightlight: 0.18,
                        population: 0.14,
                        forest: 0.04,
                        lcFractions: lcState({ 60: 0.72, 20: 0.16, 30: 0.08, 80: 0.04 })
                    }
                },
                {
                    t: 36000,
                    state: {
                        mode: 'aggregated',
                        proximity: 0.82,
                        coverage: 0.95,
                        nightlight: 0.84,
                        population: 0.86,
                        forest: 0.14,
                        lcFractions: lcState({ 50: 0.65, 40: 0.16, 10: 0.09, 80: 0.05, 20: 0.05 })
                    }
                },
                {
                    t: 48000,
                    state: {
                        mode: 'aggregated',
                        proximity: 0.82,
                        coverage: 0.95,
                        nightlight: 0.84,
                        population: 0.86,
                        forest: 0.14,
                        lcFractions: lcState({ 50: 0.65, 40: 0.16, 10: 0.09, 80: 0.05, 20: 0.05 })
                    }
                }
            ]
        })
    };
}

function printUsage(scenarios) {
    const names = Object.keys(scenarios);
    console.log('Usage: node scripts/osc_simulator.js <scenario-name>');
    console.log('');
    console.log('Available scenarios:');
    names.forEach((name, index) => {
        console.log(`  ${index + 1}. ${name}`);
    });
}

async function pickScenarioInteractively(scenarios) {
    const names = Object.keys(scenarios);
    printUsage(scenarios);
    console.log('');

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise(resolve => rl.question('Choose scenario number: ', resolve));
    rl.close();

    const index = Number.parseInt(answer, 10);
    if (!Number.isInteger(index) || index < 1 || index > names.length) {
        throw new Error(`Invalid selection "${answer}"`);
    }
    return names[index - 1];
}

async function resolveScenarioName(argvScenario, scenarios) {
    if (argvScenario) {
        if (!scenarios[argvScenario]) {
            throw new Error(`Unknown scenario "${argvScenario}"`);
        }
        return argvScenario;
    }

    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        printUsage(scenarios);
        process.exitCode = 1;
        return null;
    }

    return pickScenarioInteractively(scenarios);
}

function createOscPort(host, port) {
    return new osc.UDPPort({
        localAddress: '0.0.0.0',
        localPort: 0,
        remoteAddress: host,
        remotePort: port
    });
}

async function run() {
    const scenarios = createScenarios();
    const requestedScenario = process.argv[2];
    const scenarioName = await resolveScenarioName(requestedScenario, scenarios);
    if (!scenarioName) return;

    const scenario = scenarios[scenarioName];
    const host = process.env.OSC_HOST || DEFAULT_OSC_HOST;
    const port = parseOscPort(process.env.OSC_PORT, DEFAULT_OSC_PORT);
    const frameMs = scenario.frameMs || DEFAULT_FRAME_MS;
    const totalSteps = Math.ceil(scenario.durationMs / frameMs);

    console.log(`[Simulator] Scenario: ${scenarioName}`);
    console.log(`[Simulator] Description: ${scenario.description}`);
    console.log(`[Simulator] Target: ${host}:${port}`);
    console.log(`[Simulator] Frame interval: ${frameMs}ms, duration: ${(scenario.durationMs / 1000).toFixed(1)}s`);

    const oscPort = createOscPort(host, port);

    let timer = null;
    let stopped = false;
    let step = 0;
    let previousSnapshot = null;

    const stop = (reason, exitCode = 0) => {
        if (stopped) return;
        stopped = true;
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
        try {
            oscPort.close();
        } catch {
            // no-op
        }
        console.log(`[Simulator] Stopped (${reason})`);
        process.exitCode = exitCode;
    };

    process.on('SIGINT', () => stop('SIGINT'));
    process.on('SIGTERM', () => stop('SIGTERM'));

    oscPort.on('error', (err) => {
        console.error('[Simulator] OSC error:', err);
        stop('osc-error', 1);
    });

    const sendFrame = () => {
        const elapsedMs = Math.min(step * frameMs, scenario.durationMs);
        const state = scenario.frameAt(elapsedMs);
        const lcFractions = normalizeLcFractions(state.lcFractions);
        const dominantLandcover = dominantClassFromFractions(lcFractions);

        const delta = computeDeltaMetrics(lcFractions, previousSnapshot);
        previousSnapshot = delta.snapshot;

        oscPort.send(buildModePacket(state.mode));
        oscPort.send(buildProximityPacket(state.proximity));
        oscPort.send(buildDeltaPacket(delta.deltaLc));
        oscPort.send({
            timeTag: osc.timeTag(0),
            packets: buildAggregatedPackets({
                landcoverClass: dominantLandcover,
                nightlightNorm: state.nightlight,
                populationNorm: state.population,
                forestNorm: state.forest,
                lcFractions
            })
        });
        oscPort.send(buildCoveragePacket(state.coverage));

        if (step % Math.max(1, Math.round(1000 / frameMs)) === 0 || step === totalSteps) {
            console.log(
                `[Simulator] t=${(elapsedMs / 1000).toFixed(1)}s ` +
                `proximity=${clamp01(state.proximity).toFixed(2)}`
            );
        }

        step += 1;
        if (step > totalSteps) {
            stop('completed', 0);
        }
    };

    oscPort.on('ready', () => {
        console.log('[Simulator] OSC ready, streaming frames...');
        sendFrame();
        timer = setInterval(sendFrame, frameMs);
    });

    oscPort.open();
}

run().catch((err) => {
    console.error('[Simulator] Fatal error:', err.message || err);
    process.exit(1);
});
