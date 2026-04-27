const js = require('@eslint/js');
const globals = require('globals');
const prettierConfig = require('eslint-config-prettier');

module.exports = [
    // Global ignores
    {
        ignores: ['node_modules/', 'server/node_modules/', 'data/', 'gee-scripts/'],
    },

    // server/**/*.js — Node.js ES2020
    {
        files: ['server/**/*.js'],
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

    // server/__tests__/**/*.js — Jest
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

    // frontend/**/*.js — Browser ES modules
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

    // frontend/__tests__/**/*.js — Vitest (P0-4 will collapse this back into ≤5 blocks)
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

    // frontend/config.local.js — classic script (sets window.MAPBOX_TOKEN)
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

    // scripts/ — Node.js
    {
        files: ['scripts/**/*.js'],
        languageOptions: {
            ecmaVersion: 2020,
            sourceType: 'commonjs',
            globals: { ...globals.node },
        },
        rules: {
            ...js.configs.recommended.rules,
        },
    },

    // Disable Prettier-conflicting rules (must be last)
    prettierConfig,
];
