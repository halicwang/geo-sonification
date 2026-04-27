// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

const { defineConfig } = require('vitest/config');

// vitest is locked at 3.x: vitest 4 requires Node >= 20.19, which conflicts
// with the existing CI matrix (Node 18 + 22). See M4 P0-1 devlog.
module.exports = defineConfig({
    test: {
        environment: 'happy-dom',
        globals: true,
        include: ['frontend/__tests__/**/*.test.js'],
        coverage: {
            provider: 'v8',
            include: ['frontend/**/*.js'],
            // Excluded: tests, generated runtime config, and Mapbox/WebGL/WS
            // modules that happy-dom cannot exercise (proposal §11).
            exclude: [
                'frontend/__tests__/**',
                'frontend/config.runtime.js',
                'frontend/config.runtime.example.js',
                'frontend/config.local.js',
                'frontend/map.js',
                'frontend/popup.js',
                'frontend/websocket.js',
            ],
        },
    },
});
