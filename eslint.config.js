const js = require('@eslint/js');
const globals = require('globals');
const prettierConfig = require('eslint-config-prettier');

module.exports = [
    // Global ignores
    {
        ignores: [
            'node_modules/',
            'server/node_modules/',
            'data/',
            'gee/',
            'sonification/samples/',
            '*.maxpat',
        ],
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
        ignores: ['frontend/config.local.js'],
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

    // sonification/**/*.js — ES5 only
    {
        files: ['sonification/**/*.js'],
        languageOptions: {
            ecmaVersion: 5,
            sourceType: 'script',
            globals: {
                // Max/MSP global objects
                post: 'readonly',
                outlet: 'readonly',
                inlet: 'readonly',
                inlets: 'writable',
                outlets: 'writable',
                autowatch: 'writable',
                jsarguments: 'readonly',
                messagename: 'readonly',
                arrayfromargs: 'readonly',
                setinletassist: 'readonly',
                setoutletassist: 'readonly',
                Dict: 'readonly',
                Global: 'readonly',
                Task: 'readonly',
                MaxobjPtr: 'readonly',
                patcher: 'readonly',
                max: 'readonly',
                mgraphics: 'readonly',
            },
        },
        rules: {
            ...js.configs.recommended.rules,
            // Max/MSP invokes message handlers by name (bang, msg_float, anything, etc.);
            // these functions appear "unused" in-file but are external entry points
            'no-unused-vars': 'off',
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
