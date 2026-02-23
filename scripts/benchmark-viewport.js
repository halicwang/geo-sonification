#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * P0-B Standalone HTTP benchmark for POST /api/viewport.
 *
 * Sends repeated viewport requests to a running server and reports
 * p50/p95/p99 latency percentiles with environment metadata.
 *
 * Usage:
 *   node scripts/benchmark-viewport.js [--requests=100] [--url=http://localhost:3000]
 *
 * Requires a running server (npm start).
 * Output: JSON report to stdout, human-readable summary to stderr.
 *
 * Trace: REQ-PERF-001 + P0 + Implementation Guide §10.1 P0-B, §17.3
 */

const http = require('node:http');
const os = require('node:os');
const { performance } = require('node:perf_hooks');

// ── CLI args ──

function parseArgs() {
    const args = { requests: 100, url: 'http://localhost:3000' };
    for (const arg of process.argv.slice(2)) {
        if (arg.startsWith('--requests=')) {
            args.requests = parseInt(arg.split('=')[1], 10);
        } else if (arg.startsWith('--url=')) {
            args.url = arg.split('=').slice(1).join('=');
        }
    }
    return args;
}

// ── Viewport scenarios ──

const SCENARIOS = [
    {
        label: 'land-dense',
        description: 'Dense forest area (mid-latitude)',
        body: { bounds: [-65, -5, -62, -4.5], zoom: 5 },
    },
    {
        label: 'ocean',
        description: 'Open ocean (no data)',
        body: { bounds: [100, -60, 110, -50], zoom: 3 },
    },
    {
        label: 'coastal',
        description: 'Coastal mixed region',
        body: { bounds: [-44, -24, -42, -22], zoom: 6 },
    },
    {
        label: 'wide-area',
        description: 'Wide viewport (low zoom)',
        body: { bounds: [-120, 30, -110, 40], zoom: 5 },
    },
];

// ── Percentile ──

function percentile(sorted, p) {
    if (sorted.length === 0) return 0;
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
}

// ── HTTP helper ──

function postJSON(baseUrl, path, body) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, baseUrl);
        const payload = JSON.stringify(body);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
            },
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                if (res.statusCode >= 400) {
                    reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                } else {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

// ── Benchmark runner ──

async function runScenario(baseUrl, scenario, iterations) {
    const latencies = [];
    // Warmup: 3 requests (discarded)
    for (let i = 0; i < 3; i++) {
        await postJSON(baseUrl, '/api/viewport', scenario.body);
    }
    // Measured requests
    for (let i = 0; i < iterations; i++) {
        const t0 = performance.now();
        await postJSON(baseUrl, '/api/viewport', scenario.body);
        const t1 = performance.now();
        latencies.push(t1 - t0);
    }
    const sorted = latencies.sort((a, b) => a - b);
    return {
        label: scenario.label,
        description: scenario.description,
        iterations,
        p50: percentile(sorted, 50),
        p95: percentile(sorted, 95),
        p99: percentile(sorted, 99),
        min: sorted[0],
        max: sorted[sorted.length - 1],
    };
}

// ── Environment metadata ──

function getEnvironment() {
    return {
        date: new Date().toISOString(),
        nodeVersion: process.version,
        platform: os.platform(),
        arch: os.arch(),
        cpuModel: os.cpus()[0]?.model || 'unknown',
        cpuCores: os.cpus().length,
        totalMemoryGB: (os.totalmem() / 1073741824).toFixed(1),
    };
}

// ── Main ──

async function main() {
    const args = parseArgs();
    const env = getEnvironment();

    process.stderr.write(`\nP0-B Viewport Benchmark\n`);
    process.stderr.write(`Server: ${args.url}\n`);
    process.stderr.write(`Requests per scenario: ${args.requests}\n`);
    process.stderr.write(`Date: ${env.date}\n`);
    process.stderr.write(`Node: ${env.nodeVersion}, ${env.cpuModel} (${env.cpuCores} cores)\n\n`);

    // Check server health
    try {
        await postJSON(args.url, '/api/viewport', SCENARIOS[0].body);
    } catch (err) {
        process.stderr.write(`ERROR: Cannot reach server at ${args.url}\n`);
        process.stderr.write(`       Start the server first: npm start\n`);
        process.stderr.write(`       ${err.message}\n`);
        process.exit(1);
    }

    const results = [];
    for (const scenario of SCENARIOS) {
        process.stderr.write(`  Running: ${scenario.label} ...`);
        const result = await runScenario(args.url, scenario, args.requests);
        results.push(result);
        process.stderr.write(
            ` p50=${result.p50.toFixed(3)}ms  p95=${result.p95.toFixed(3)}ms  p99=${result.p99.toFixed(3)}ms\n`
        );
    }

    // Summary table
    process.stderr.write(
        `\n  Provisional SLO targets (Spec §5.8, informational until P2 freeze):\n`
    );
    process.stderr.write(`    p95 <= 250ms, p99 <= 500ms\n\n`);

    const breaches = results.filter((r) => r.p95 > 250 || r.p99 > 500);
    if (breaches.length > 0) {
        process.stderr.write(
            `  WARNING: ${breaches.length} scenario(s) exceed provisional targets\n\n`
        );
    } else {
        process.stderr.write(`  All scenarios within provisional targets.\n\n`);
    }

    // JSON report to stdout
    const report = {
        benchmark: 'P0-B viewport latency',
        trace: 'REQ-PERF-001 + P0 + Implementation Guide §10.1',
        environment: env,
        config: { requestsPerScenario: args.requests, serverUrl: args.url },
        provisionalTargets: { p95Ms: 250, p99Ms: 500 },
        results,
    };

    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

main().catch((err) => {
    process.stderr.write(`Fatal: ${err.message}\n`);
    process.exit(1);
});
