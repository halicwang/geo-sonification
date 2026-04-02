// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

const fs = require('fs');
const os = require('os');
const path = require('path');

const { parseEnvContent, loadEnvFile } = require('../load-env');

describe('parseEnvContent', () => {
    test('parses comments, quoted values, and inline hashes correctly', () => {
        const parsed = parseEnvContent(`
# comment
HTTP_PORT=3000
WS_PORT=3001 # inline comment
MAPBOX_STYLE="mapbox://styles/demo#fragment"
HASH_VALUE=abc#123
EMPTY=
`);

        expect(parsed).toEqual({
            HTTP_PORT: '3000',
            WS_PORT: '3001',
            MAPBOX_STYLE: 'mapbox://styles/demo#fragment',
            HASH_VALUE: 'abc#123',
            EMPTY: '',
        });
    });
});

describe('loadEnvFile', () => {
    test('loads values without overriding existing environment variables', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'geo-sonification-env-'));
        const envPath = path.join(tempDir, '.env');
        fs.writeFileSync(
            envPath,
            [
                'HTTP_PORT=3000',
                'WS_PORT=3001 # comment',
                'QUOTED="hello # world"',
                "SINGLE_QUOTED='keep # literal'",
            ].join('\n')
        );

        try {
            const targetEnv = { HTTP_PORT: '9999' };
            const result = loadEnvFile(envPath, targetEnv);

            expect(result.loaded).toBe(true);
            expect(targetEnv).toEqual({
                HTTP_PORT: '9999',
                WS_PORT: '3001',
                QUOTED: 'hello # world',
                SINGLE_QUOTED: 'keep # literal',
            });
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    test('returns loaded=false when the file is missing', () => {
        const missingPath = path.join(os.tmpdir(), `geo-sonification-missing-${Date.now()}.env`);
        const targetEnv = {};
        const result = loadEnvFile(missingPath, targetEnv);

        expect(result.loaded).toBe(false);
        expect(targetEnv).toEqual({});
    });
});
