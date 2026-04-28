#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Measure per-bus and blended integrated loudness of the ambience
 * WAVs so the master makeup gain in audio/engine.js can be calibrated
 * against a fixed LUFS target (default -16).
 *
 * Uses ffmpeg's `loudnorm` filter (EBU R128 implementation) to read
 * integrated LUFS, true peak, and loudness range off every ambience
 * file, then repeats the measurement on the unity-sum `amix` of all
 * seven to give an upper-bound reference for the engine's summed
 * output.
 *
 * Usage:
 *   node scripts/measure-loudness.js [--target=-16] [--dir=frontend/audio/ambience]
 *
 * Reads only; no files are written. Requires ffmpeg with loudnorm.
 *
 * Output: per-file table + blend summary + suggested MAKEUP_GAIN_DB,
 * then a JSON block for scripting. All output goes to stdout; ffmpeg
 * stderr is suppressed unless a measurement fails.
 */

'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// ── CLI args ──

function parseArgs() {
    const args = {
        target: -16,
        dir: path.join('frontend', 'audio', 'ambience'),
    };
    for (const a of process.argv.slice(2)) {
        if (a.startsWith('--target=')) args.target = parseFloat(a.split('=')[1]);
        else if (a.startsWith('--dir=')) args.dir = a.split('=')[1];
        else if (a === '--help' || a === '-h') {
            process.stdout.write(
                'usage: node scripts/measure-loudness.js [--target=-16] [--dir=frontend/audio/ambience]\n'
            );
            process.exit(0);
        }
    }
    return args;
}

// Bus order must match the bus index in frontend/audio/engine.js.
const BUS_NAMES = ['forest', 'shrub', 'grass', 'crop', 'urban', 'bare', 'water'];

// ── ffmpeg wrapper ──

function runFfmpeg(ffmpegArgs) {
    const r = spawnSync('ffmpeg', ffmpegArgs, {
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
    });
    if (r.error) {
        process.stderr.write(`ffmpeg not runnable: ${r.error.message}\n`);
        process.exit(1);
    }
    if (r.status !== 0) {
        process.stderr.write(`ffmpeg exit ${r.status}:\n${r.stderr}\n`);
        process.exit(1);
    }
    // loudnorm emits its JSON block to stderr; stdout is the null-muxed stream.
    return r.stderr || '';
}

// Pull the loudnorm JSON block out of ffmpeg's stderr. The filter prints
// something like:
//   [Parsed_loudnorm_0 @ 0x...]
//   {
//       "input_i" : "-23.45",
//       "input_tp" : "-1.50",
//       ...
//   }
function parseLoudnormJson(stderr) {
    const block = stderr.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
    if (!block) return null;
    const fields = {};
    const kv = /"([a-z_]+)"\s*:\s*"(-?[^"]+)"/g;
    let pair;
    while ((pair = kv.exec(block[0]))) {
        const val = parseFloat(pair[2]);
        fields[pair[1]] = Number.isFinite(val) ? val : pair[2];
    }
    return fields;
}

function measureFile(filePath) {
    const stderr = runFfmpeg([
        '-nostats',
        '-hide_banner',
        '-i',
        filePath,
        '-af',
        'loudnorm=print_format=json',
        '-f',
        'null',
        '-',
    ]);
    const parsed = parseLoudnormJson(stderr);
    if (!parsed) {
        process.stderr.write(`Could not parse loudnorm JSON for ${filePath}\n`);
        process.stderr.write(stderr.slice(-2000) + '\n');
        process.exit(1);
    }
    return parsed;
}

function measureAmix(filePaths) {
    const args = ['-nostats', '-hide_banner'];
    for (const fp of filePaths) {
        args.push('-i', fp);
    }
    // normalize=0 keeps inputs at unity so the sum approximates the engine's
    // worst-case (every bus at 1.0 target before the soft-norm divide).
    const filter = `amix=inputs=${filePaths.length}:duration=shortest:normalize=0,loudnorm=print_format=json`;
    args.push('-filter_complex', filter, '-f', 'null', '-');
    const stderr = runFfmpeg(args);
    const parsed = parseLoudnormJson(stderr);
    if (!parsed) {
        process.stderr.write('Could not parse loudnorm JSON for amix\n');
        process.stderr.write(stderr.slice(-2000) + '\n');
        process.exit(1);
    }
    return parsed;
}

// ── Main ──

function main() {
    const args = parseArgs();
    const repoRoot = path.resolve(__dirname, '..');
    const absDir = path.isAbsolute(args.dir) ? args.dir : path.join(repoRoot, args.dir);

    const filePaths = BUS_NAMES.map((n) => path.join(absDir, `${n}.wav`));
    const missing = filePaths.filter((p) => !fs.existsSync(p));
    if (missing.length) {
        process.stderr.write('Missing ambience files:\n');
        for (const m of missing) process.stderr.write(`  ${m}\n`);
        process.exit(1);
    }

    process.stdout.write(`Loudness measurement — target ${args.target} LUFS\n`);
    process.stdout.write(`Source dir: ${absDir}\n`);
    process.stdout.write('='.repeat(64) + '\n\n');

    // ── Per-file ──
    process.stdout.write('Per-file (EBU R128 / BS.1770):\n');
    const perFile = [];
    for (let i = 0; i < BUS_NAMES.length; i++) {
        const name = BUS_NAMES[i];
        const parsed = measureFile(filePaths[i]);
        const entry = {
            name,
            i: parsed.input_i,
            tp: parsed.input_tp,
            lra: parsed.input_lra,
        };
        perFile.push(entry);
        process.stdout.write(
            `  ${name.padEnd(8)}  I=${entry.i.toFixed(2).padStart(7)} LUFS   ` +
                `TP=${entry.tp.toFixed(2).padStart(6)} dBTP   ` +
                `LRA=${entry.lra.toFixed(2).padStart(5)} LU\n`
        );
    }

    const loudest = perFile.reduce((a, b) => (a.i > b.i ? a : b));
    const quietest = perFile.reduce((a, b) => (a.i < b.i ? a : b));
    process.stdout.write('\n');
    process.stdout.write(`  loudest:  ${loudest.name} at ${loudest.i.toFixed(2)} LUFS\n`);
    process.stdout.write(`  quietest: ${quietest.name} at ${quietest.i.toFixed(2)} LUFS\n`);
    process.stdout.write(`  spread:   ${(loudest.i - quietest.i).toFixed(2)} LU\n\n`);

    // ── amix reference ──
    process.stdout.write('amix (normalize=0, all buses at unity — upper bound):\n');
    const amix = measureAmix(filePaths);
    process.stdout.write(
        `  I=${amix.input_i.toFixed(2)} LUFS   TP=${amix.input_tp.toFixed(2)} dBTP   LRA=${amix.input_lra.toFixed(2)} LU\n\n`
    );

    // ── Suggested makeup ──
    // Engine soft-norm caps summed output at ~loudest single bus when two+
    // buses coexist, so "single loudest bus" is the realistic reference for
    // peak-loudness moments. amix/normalize=0 is the theoretical ceiling.
    const suggestedVsLoudest = args.target - loudest.i;
    const suggestedVsAmix = args.target - amix.input_i;
    // Round to 0.5 dB — anything finer gets lost under normal listening.
    const roundHalf = (x) => Math.round(x * 2) / 2;
    const primary = roundHalf(suggestedVsLoudest);

    process.stdout.write('Suggested MAKEUP_GAIN_DB:\n');
    process.stdout.write(
        `  vs loudest single bus (recommended): ${suggestedVsLoudest.toFixed(2)} dB  → rounded ${primary.toFixed(1)} dB\n`
    );
    process.stdout.write(
        `  vs amix unity sum (aggressive):      ${suggestedVsAmix.toFixed(2)} dB\n\n`
    );

    // Headroom sanity check: after makeup, what's the peak on the loudest file?
    const projectedPeak = loudest.tp + primary;
    process.stdout.write(
        `  post-makeup peak on loudest bus:  ${projectedPeak.toFixed(2)} dBTP ` +
            `(limiter threshold -3, so engagement ${projectedPeak > -3 ? 'EXPECTED' : 'unlikely'})\n`
    );

    // Warnings
    const warnings = [];
    if (primary > 10 || primary < -10) {
        warnings.push(
            `makeup ${primary.toFixed(1)} dB is outside [-10, +10]; consider adjusting target or using offline source normalization`
        );
    }
    if (loudest.i > -6) {
        warnings.push(
            `loudest source (${loudest.name} at ${loudest.i.toFixed(1)} LUFS) is already very hot; limiter will work hard`
        );
    }
    if (loudest.tp > 0) {
        warnings.push(
            `loudest source has true peak ${loudest.tp.toFixed(1)} dBTP (already clipping); consider re-exporting that WAV`
        );
    }
    if (warnings.length) {
        process.stdout.write('\nWARNINGS:\n');
        for (const w of warnings) process.stdout.write(`  ⚠ ${w}\n`);
    }

    // ── JSON block for scripting ──
    process.stdout.write('\n---\n');
    process.stdout.write(
        JSON.stringify(
            {
                target_lufs: args.target,
                files: perFile,
                loudest_bus: loudest.name,
                loudest_lufs: loudest.i,
                amix_lufs: amix.input_i,
                amix_tp: amix.input_tp,
                suggested_makeup_gain_db: primary,
                projected_peak_on_loudest: Number(projectedPeak.toFixed(2)),
                warnings,
            },
            null,
            2
        ) + '\n'
    );
}

main();
