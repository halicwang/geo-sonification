// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Shared bounds-array shape validator. Used by the HTTP route in
 * `./routes.js` and the WebSocket message handler in `./ws-handler.js`.
 *
 * Splits out from `./index.js` (M4 P4-2) so neither consumer has to reach
 * across the boot file for a one-shape check.
 *
 * @module server/parse-bounds
 */

/**
 * Quick-check that bounds is a 4-element array before spatial validation.
 * @param {*} bounds
 * @param {string} [clientLabel='request'] - Label for error messages
 * @returns {{ bounds: number[] } | { error: string }}
 */
function parseViewportBounds(bounds, clientLabel = 'request') {
    if (!Array.isArray(bounds) || bounds.length !== 4) {
        return {
            error: `${clientLabel} bounds must be an array: [west, south, east, north]`,
        };
    }
    return { bounds };
}

module.exports = { parseViewportBounds };
