#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Wire-format regression smoke (M4 P0-1).
 *
 * Reads scripts/wire-format-baseline.json and verifies that every
 * route path, HTTP response field, WS inbound type, WS outbound type,
 * and WS payload field name listed in the baseline still appears
 * literally in the active server source tree.
 *
 * Strategy: static grep across server/**\/*.js (excluding __tests__/
 * and node_modules/). Survives P4's planned route extraction
 * (server/routes.js, server/ws-handler.js) because the search is
 * directory-scoped, not file-scoped.
 *
 * Exit codes:
 *   0 — every baseline name is still present in code
 *   1 — drift detected (one or more names missing or renamed)
 *
 * Flags:
 *   --update    Rewrite the baseline by capturing the current source
 *               state. Use only when a wire-format change is intentional
 *               and reviewer-acknowledged.
 *
 * Additive changes (new fields not in the baseline) are tolerated.
 * The smoke flags removals and renames only.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const BASELINE_PATH = path.join(__dirname, 'wire-format-baseline.json');
const SERVER_DIR = path.join(REPO_ROOT, 'server');

const SHOULD_UPDATE = process.argv.includes('--update');

/**
 * Recursively collect *.js files under `dir`, skipping common dead ends.
 * @param {string} dir
 * @returns {string[]}
 */
function collectServerSources(dir) {
    const out = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...collectServerSources(full));
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            out.push(full);
        }
    }
    return out;
}

function readSources() {
    return collectServerSources(SERVER_DIR).map((file) => ({
        file: path.relative(REPO_ROOT, file),
        text: fs.readFileSync(file, 'utf8'),
    }));
}

/**
 * Match `app.get('/foo', ...)` / `app.post('/foo', ...)` calls and return
 * an array of { method, path }.
 * @param {{ file: string, text: string }[]} sources
 */
function extractRoutes(sources) {
    const routes = [];
    const re = /app\.(get|post|put|delete|patch)\(\s*['"]([^'"]+)['"]/g;
    for (const { text } of sources) {
        let match;
        while ((match = re.exec(text)) !== null) {
            routes.push({ method: match[1].toUpperCase(), path: match[2] });
        }
    }
    return routes;
}

/**
 * Match `JSON.stringify({ type: 'X' ...` to extract WS outbound types.
 * Inbound types are matched as `data.type === 'X'`.
 * @param {{ file: string, text: string }[]} sources
 */
function extractWsTypes(sources) {
    const outbound = new Set();
    const inbound = new Set();
    const outRe = /JSON\.stringify\(\s*\{\s*type:\s*['"]([^'"]+)['"]/g;
    const inRe = /data\.type\s*===?\s*['"]([^'"]+)['"]/g;
    for (const { text } of sources) {
        let m;
        while ((m = outRe.exec(text)) !== null) outbound.add(m[1]);
        while ((m = inRe.exec(text)) !== null) inbound.add(m[1]);
    }
    return { outbound, inbound };
}

/**
 * For each baseline-listed identifier, return whether it appears at least
 * once in any of the source files. Matches whole-word JS identifiers only
 * to avoid coincidental substring hits in comments or unrelated literals.
 * @param {string[]} names
 * @param {{ file: string, text: string }[]} sources
 * @returns {Map<string, boolean>}
 */
function checkIdentifiers(names, sources) {
    const result = new Map();
    for (const name of names) {
        const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
        const present = sources.some(({ text }) => re.test(text));
        result.set(name, present);
    }
    return result;
}

function fail(message, lines) {
    console.error(`\n[smoke:wire-format] FAIL — ${message}`);
    for (const line of lines) console.error(`  - ${line}`);
    console.error(
        '\nTo intentionally update the baseline, run: npm run smoke:wire-format -- --update'
    );
}

function pass(summary) {
    console.log(`[smoke:wire-format] OK — ${summary}`);
}

function main() {
    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
    const sources = readSources();

    const codeRoutes = extractRoutes(sources);
    const codeRouteKeys = new Set(codeRoutes.map((r) => `${r.method} ${r.path}`));

    const errors = [];

    // 1. Routes: every baseline route must exist in code.
    for (const route of baseline.httpRoutes) {
        const key = `${route.method} ${route.path}`;
        if (!codeRouteKeys.has(key)) {
            errors.push(`missing route: ${key}`);
        }
    }

    // 2. HTTP response fields: each baseline field name must appear in source.
    for (const route of baseline.httpRoutes) {
        const presence = checkIdentifiers(route.responseFields, sources);
        for (const [name, present] of presence) {
            if (!present) {
                errors.push(
                    `route ${route.method} ${route.path}: response field '${name}' no longer appears in server/**/*.js`
                );
            }
        }
    }

    // 3. WS types and payload fields.
    const { outbound: codeOutbound, inbound: codeInbound } = extractWsTypes(sources);
    for (const msg of baseline.wsInbound) {
        if (!codeInbound.has(msg.type)) {
            errors.push(
                `missing inbound WS type: '${msg.type}' (expected data.type === '${msg.type}')`
            );
        }
        const presence = checkIdentifiers(msg.fields, sources);
        for (const [name, present] of presence) {
            if (!present) {
                errors.push(
                    `WS inbound '${msg.type}': field '${name}' no longer appears in source`
                );
            }
        }
    }
    for (const msg of baseline.wsOutbound) {
        if (!codeOutbound.has(msg.type)) {
            errors.push(
                `missing outbound WS type: '${msg.type}' (expected JSON.stringify({ type: '${msg.type}', ... }))`
            );
        }
        const presence = checkIdentifiers(msg.fields, sources);
        for (const [name, present] of presence) {
            if (!present) {
                errors.push(
                    `WS outbound '${msg.type}': field '${name}' no longer appears in source`
                );
            }
        }
    }

    if (SHOULD_UPDATE) {
        // Rebuild baseline from the current source state. Routes refresh fully;
        // field lists are only widened (never narrowed) so an explicit
        // intentional removal still requires hand-editing the JSON.
        const updated = { ...baseline };
        updated.capturedAt = new Date().toISOString().slice(0, 10);
        updated.httpRoutes = updated.httpRoutes.map((route) => {
            const key = `${route.method} ${route.path}`;
            return codeRouteKeys.has(key) ? route : { ...route, _missing: true };
        });
        // Add any new routes seen in code but not in baseline.
        for (const route of codeRoutes) {
            const key = `${route.method} ${route.path}`;
            if (!updated.httpRoutes.some((r) => `${r.method} ${r.path}` === key)) {
                updated.httpRoutes.push({ ...route, responseFields: [] });
            }
        }
        // Add any new WS outbound types seen in code but not in baseline.
        for (const type of codeOutbound) {
            if (!updated.wsOutbound.some((m) => m.type === type)) {
                updated.wsOutbound.push({ type, fields: [] });
            }
        }
        for (const type of codeInbound) {
            if (!updated.wsInbound.some((m) => m.type === type)) {
                updated.wsInbound.push({ type, fields: [] });
            }
        }
        fs.writeFileSync(BASELINE_PATH, JSON.stringify(updated, null, 4) + '\n', 'utf8');
        console.log('[smoke:wire-format] baseline updated. Review the diff before committing.');
        process.exit(0);
    }

    if (errors.length > 0) {
        fail('wire-format drift detected', errors);
        process.exit(1);
    }

    const fieldCount =
        baseline.httpRoutes.reduce((sum, r) => sum + r.responseFields.length, 0) +
        baseline.wsInbound.reduce((sum, m) => sum + m.fields.length, 0) +
        baseline.wsOutbound.reduce((sum, m) => sum + m.fields.length, 0);
    pass(
        `${baseline.httpRoutes.length} routes, ${
            baseline.wsInbound.length + baseline.wsOutbound.length
        } WS types, ${fieldCount} field names verified`
    );
}

main();
