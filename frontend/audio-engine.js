// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Re-export shim. Audio engine implementation lives in `./audio/engine.js`
 * (M4 P3-4); this shim preserves the existing import path for callers
 * (main.js, city-announcer.js, map.js) until P5-4 retires it and updates
 * every caller in a single closing commit.
 *
 * @module frontend/audio-engine
 */

export { engine } from './audio/engine.js';
