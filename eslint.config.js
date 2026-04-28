const js = require('@eslint/js');
const globals = require('globals');
const prettierConfig = require('eslint-config-prettier');

// Five functional blocks (M4 P0-4 consolidation):
//   1. Node CJS source — server/**/*.js + scripts/**/*.js
//   2. server/__tests__/**/*.js — Node CJS + Jest globals
//   3. frontend/**/*.js — browser ES modules
//   4. frontend/__tests__/**/*.js — browser ES modules + Vitest globals
//   5. frontend/config.local.js — classic script (browser globals only)
//
// Plus the global ignores entry and the Prettier compatibility entry,
// neither of which counts as a functional block.

module.exports = [
    // Global ignores
    {
        ignores: [
            'node_modules/',
            'server/node_modules/',
            'data/',
            'gee-scripts/',
            'coverage/',
            'dist/',
        ],
    },

    // 1. Node CJS source: server src + scripts
    {
        files: ['server/**/*.js', 'scripts/**/*.js'],
        ignores: ['server/__tests__/**'],
        languageOptions: {
            ecmaVersion: 2020,
            sourceType: 'commonjs',
            globals: { ...globals.node },
        },
        rules: {
            ...js.configs.recommended.rules,
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        },
    },

    // 2. Server tests — Jest
    {
        files: ['server/__tests__/**/*.js'],
        languageOptions: {
            ecmaVersion: 2020,
            sourceType: 'commonjs',
            globals: { ...globals.node, ...globals.jest },
        },
        rules: {
            ...js.configs.recommended.rules,
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        },
    },

    // 3. Frontend source — browser ES modules
    {
        files: ['frontend/**/*.js'],
        ignores: ['frontend/config.local.js', 'frontend/__tests__/**'],
        languageOptions: {
            ecmaVersion: 2020,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                mapboxgl: 'readonly',
                mapboxPmTiles: 'readonly',
            },
        },
        rules: {
            ...js.configs.recommended.rules,
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        },
    },

    // 4. Frontend tests — Vitest
    {
        files: ['frontend/__tests__/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                describe: 'readonly',
                it: 'readonly',
                test: 'readonly',
                expect: 'readonly',
                vi: 'readonly',
                beforeEach: 'readonly',
                afterEach: 'readonly',
                beforeAll: 'readonly',
                afterAll: 'readonly',
            },
        },
        rules: {
            ...js.configs.recommended.rules,
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        },
    },

    // 5. frontend/config.local.js — classic script (sets window.MAPBOX_TOKEN)
    {
        files: ['frontend/config.local.js'],
        languageOptions: {
            ecmaVersion: 2020,
            sourceType: 'script',
            globals: { ...globals.browser },
        },
        rules: {
            ...js.configs.recommended.rules,
        },
    },

    // Disable Prettier-conflicting rules (must be last)
    prettierConfig,
];
