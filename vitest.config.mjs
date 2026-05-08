// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

import { defineConfig } from 'vitest/config';

// vitest is locked at 3.x: vitest 4 requires Node >= 20.19, which conflicts
// with the existing CI matrix (Node 18 + 22). The config file uses .mjs so
// it loads as ESM regardless of the root package.json type — Node 18 cannot
// require() vite (ESM-only). See M4 P0-1 devlog.
export default defineConfig({
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
                // WebGL-bound modules — happy-dom has no real GL context,
                // so coverage on these is meaningless. Plumbing is unit
                // tested via mocked gl in hover-glow.test.js; visual
                // correctness is integration tested in the dev preview.
                'frontend/hover-glow-layer.js',
                'frontend/hover-glow-shaders.js',
            ],
        },
    },
});
