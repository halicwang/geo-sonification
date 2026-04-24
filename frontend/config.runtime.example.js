// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/*
 * Template showing every field the deploy-time runtime config accepts.
 * Copy, fill in real values, and write the result to frontend/config.runtime.js
 * before uploading to Cloudflare Pages. All fields are optional — each
 * missing field falls back to same-origin defaults suitable for `npm start`.
 */

window.GEO_SONIFICATION_CONFIG = {
    // URL prefix the app is mounted under. Empty string = site root.
    // Example: '/geo-sonification' when hosted at placeecho.com/geo-sonification/
    basePath: '/geo-sonification',

    // Absolute URL of the Node backend (HTTP API). Empty = same origin.
    apiBase: 'https://api.placeecho.com',

    // Full WebSocket URL including scheme and host. Empty = derive from
    // window.location (local dev).
    wsUrl: 'wss://api.placeecho.com',

    // Absolute URL prefix for large static assets (PMTiles, ambience WAVs).
    // Defaults to basePath when omitted. Point at R2 / S3 / CDN in production.
    assetBase: 'https://assets.placeecho.com',

    // Production Mapbox public token. Overrides the window.MAPBOX_TOKEN
    // value loaded from config.local.js. Must be URL-restricted to the
    // production domain and localhost ports used for smoke testing.
    mapboxToken: 'pk.REPLACE_ME',
};
