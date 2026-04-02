#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Generate TTS audio files for city name announcements.
 *
 * Reads data/cities.json and uses the macOS `say` command (Samantha voice)
 * to generate M4A files in frontend/audio/cities/.
 *
 * Usage:
 *   node scripts/generate-city-audio.js            # generate all missing files
 *   node scripts/generate-city-audio.js --force     # regenerate all files
 *   node scripts/generate-city-audio.js --dry-run   # show what would be generated
 *
 * Requirements: macOS with `say` and `afconvert` commands.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CITIES_PATH = path.join(ROOT, 'data', 'cities.json');
const OUTPUT_DIR = path.join(ROOT, 'frontend', 'audio', 'cities');
const VOICE = 'Samantha';
const AAC_BITRATE = 32000;

// Concurrency for parallel generation
const BATCH_SIZE = 20;

function main() {
    const args = process.argv.slice(2);
    const force = args.includes('--force');
    const dryRun = args.includes('--dry-run');

    // Verify macOS tools
    try {
        execSync('which say', { stdio: 'ignore' });
        execSync('which afconvert', { stdio: 'ignore' });
    } catch {
        console.error('Error: This script requires macOS `say` and `afconvert` commands.');
        process.exit(1);
    }

    // Verify voice availability
    try {
        const voices = execSync('say -v "?"', { encoding: 'utf8' });
        if (!voices.includes(VOICE)) {
            console.warn(`Warning: Voice "${VOICE}" not found. Using system default.`);
        }
    } catch {
        // Non-fatal: proceed with default voice
    }

    const cities = JSON.parse(fs.readFileSync(CITIES_PATH, 'utf8'));
    console.log(`Loaded ${cities.length} cities from ${CITIES_PATH}`);

    // Ensure output directory exists
    if (!dryRun) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Determine which files need generation
    const toGenerate = [];
    let skipped = 0;
    for (const city of cities) {
        const outPath = path.join(OUTPUT_DIR, `${city.slug}.m4a`);
        if (!force && fs.existsSync(outPath)) {
            skipped++;
            continue;
        }
        toGenerate.push(city);
    }

    console.log(`To generate: ${toGenerate.length}, skipped (existing): ${skipped}`);

    if (dryRun) {
        for (const city of toGenerate.slice(0, 20)) {
            console.log(`  Would generate: ${city.slug}.m4a  (${city.name})`);
        }
        if (toGenerate.length > 20) {
            console.log(`  ... and ${toGenerate.length - 20} more`);
        }
        return;
    }

    if (toGenerate.length === 0) {
        console.log('Nothing to generate. Use --force to regenerate all.');
        return;
    }

    // Generate in batches
    let generated = 0;
    let errors = 0;
    const startTime = Date.now();

    for (let i = 0; i < toGenerate.length; i += BATCH_SIZE) {
        const batch = toGenerate.slice(i, i + BATCH_SIZE);

        for (const city of batch) {
            const outPath = path.join(OUTPUT_DIR, `${city.slug}.m4a`);
            const tmpAiff = path.join(OUTPUT_DIR, `${city.slug}.aiff`);

            try {
                // Step 1: Generate AIFF with `say`
                const safeName = city.name.replace(/"/g, '\\"');
                execSync(`say -v ${VOICE} -o "${tmpAiff}" "${safeName}"`, {
                    stdio: 'ignore',
                    timeout: 10000,
                });

                // Step 2: Convert to M4A (AAC)
                execSync(`afconvert -f m4af -d aac -b ${AAC_BITRATE} "${tmpAiff}" "${outPath}"`, {
                    stdio: 'ignore',
                    timeout: 10000,
                });

                // Cleanup temp AIFF
                fs.unlinkSync(tmpAiff);
                generated++;
            } catch (err) {
                errors++;
                console.error(`  Error generating ${city.slug} (${city.name}): ${err.message}`);
                // Cleanup partial files
                try {
                    fs.unlinkSync(tmpAiff);
                } catch {
                    /* ignore */
                }
                try {
                    fs.unlinkSync(outPath);
                } catch {
                    /* ignore */
                }
            }
        }

        const pct = Math.round(((i + batch.length) / toGenerate.length) * 100);
        process.stdout.write(`\r  Progress: ${pct}% (${generated} generated, ${errors} errors)`);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\nDone in ${elapsed}s. Generated: ${generated}, Errors: ${errors}`);

    // Report total size
    let totalBytes = 0;
    const files = fs.readdirSync(OUTPUT_DIR).filter((f) => f.endsWith('.m4a'));
    for (const f of files) {
        totalBytes += fs.statSync(path.join(OUTPUT_DIR, f)).size;
    }
    console.log(`Total: ${files.length} files, ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);
}

main();
