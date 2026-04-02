// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Minimal .env loader used by server entry points and scripts.
 *
 * Avoids adding a runtime dependency while keeping CLI startup behavior
 * aligned with README/.env.example. Existing process.env values always win.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_ENV_PATH = path.join(__dirname, '..', '.env');

/**
 * Remove an inline comment from an unquoted env value.
 * Keeps `#` characters that are part of the value itself.
 *
 * @param {string} rawValue
 * @returns {string}
 */
function stripInlineComment(rawValue) {
    let escaped = false;
    for (let i = 0; i < rawValue.length; i++) {
        const ch = rawValue[i];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (ch === '\\') {
            escaped = true;
            continue;
        }
        if (ch === '#' && (i === 0 || /\s/.test(rawValue[i - 1]))) {
            return rawValue.slice(0, i).trimEnd();
        }
    }
    return rawValue.trim();
}

/**
 * Decode a quoted env value.
 *
 * @param {string} rawValue
 * @returns {string}
 */
function decodeQuotedValue(rawValue) {
    if (rawValue.length < 2) return rawValue;
    const quote = rawValue[0];
    if ((quote !== '"' && quote !== "'") || rawValue[rawValue.length - 1] !== quote) {
        return stripInlineComment(rawValue);
    }

    const inner = rawValue.slice(1, -1);
    if (quote === "'") {
        return inner;
    }

    return inner.replace(/\\([\\nrt"])/g, (_match, escaped) => {
        switch (escaped) {
            case 'n':
                return '\n';
            case 'r':
                return '\r';
            case 't':
                return '\t';
            case '"':
            case '\\':
            default:
                return escaped;
        }
    });
}

/**
 * Parse .env content into key/value pairs.
 *
 * @param {string} content
 * @returns {Record<string, string>}
 */
function parseEnvContent(content) {
    const parsed = {};

    for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (!match) continue;

        const [, key, rawValue] = match;
        parsed[key] = decodeQuotedValue(rawValue.trim());
    }

    return parsed;
}

/**
 * Load a .env file into process.env without overwriting existing variables.
 *
 * @param {string} [filePath=DEFAULT_ENV_PATH]
 * @param {NodeJS.ProcessEnv} [targetEnv=process.env]
 * @returns {{ loaded: boolean, filePath: string, values: Record<string, string> }}
 */
function loadEnvFile(filePath = DEFAULT_ENV_PATH, targetEnv = process.env) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const values = parseEnvContent(content);

        for (const [key, value] of Object.entries(values)) {
            if (targetEnv[key] === undefined) {
                targetEnv[key] = value;
            }
        }

        return { loaded: true, filePath, values };
    } catch (err) {
        if (err && err.code === 'ENOENT') {
            return { loaded: false, filePath, values: {} };
        }
        throw err;
    }
}

module.exports = {
    DEFAULT_ENV_PATH,
    stripInlineComment,
    parseEnvContent,
    loadEnvFile,
};
