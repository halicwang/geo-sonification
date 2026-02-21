const js = require('@eslint/js');
const globals = require('globals');
const prettierConfig = require('eslint-config-prettier');

module.exports = [
    // 全局忽略
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

    // frontend/**/*.js — Browser ES2020
    {
        files: ['frontend/**/*.js'],
        languageOptions: {
            ecmaVersion: 2020,
            sourceType: 'script',
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

    // sonification/**/*.js — ES5 only
    {
        files: ['sonification/**/*.js'],
        languageOptions: {
            ecmaVersion: 5,
            sourceType: 'script',
            globals: {
                // Max/MSP 全局对象
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
            // Max/MSP 通过函数名调用消息处理器 (bang, msg_float, anything 等)，
            // 这些函数在文件内"未使用"但实际是外部入口点
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

    // Prettier 冲突规则关闭（放最后）
    prettierConfig,
];
