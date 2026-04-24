// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/*
 * Deployment-time configuration placeholder.
 *
 * During local development this file is a no-op and frontend modules fall
 * back to same-origin defaults (HTTP 3000 / WS 3001 / PMTiles + audio
 * served by the Node server).
 *
 * For production, the deploy pipeline (scripts/generate-runtime-config.js)
 * overwrites this file with real values derived from environment vars
 * such as MAPBOX_TOKEN, BASE_PATH, API_BASE, WS_URL, ASSET_BASE.
 *
 * Do NOT hand-edit in the repository; generated output should never be
 * committed back. See config.runtime.example.js for the full shape.
 */

window.GEO_SONIFICATION_CONFIG = window.GEO_SONIFICATION_CONFIG || {};
