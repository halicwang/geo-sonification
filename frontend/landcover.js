// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Geo-Sonification — Landcover metadata utilities.
 *
 * Pure lookup functions for ESA WorldCover class codes.
 * All metadata comes from state.config.landcoverMeta (populated by server /api/config).
 *
 * @module frontend/landcover
 */

import { state } from './config.js';

// Throttle console warnings for unknown classes
const warnedUnknownLandcoverClasses = new Set();

/** Escape dynamic values before inserting into HTML (prevents XSS). */
export function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Coerce raw value to integer class; returns null if missing/invalid. */
export function parseLandcoverClass(landcoverClass) {
    if (landcoverClass == null || landcoverClass === '') return null;
    const num = Number(landcoverClass);
    if (!Number.isFinite(num)) return null;
    const cls = Math.round(num);
    return cls >= 0 ? cls : null;
}

/** Map numeric class to human-readable name; logs warning once per unknown class. */
export function getLandcoverName(landcoverClass) {
    const cls = parseLandcoverClass(landcoverClass);
    if (cls == null) return null;
    const meta = state.config.landcoverMeta[cls];
    if (meta) return meta.name;
    const rawKey = String(landcoverClass);
    if (!warnedUnknownLandcoverClasses.has(rawKey) && warnedUnknownLandcoverClasses.size < 50) {
        warnedUnknownLandcoverClasses.add(rawKey);
        if (warnedUnknownLandcoverClasses.size <= 20) {
            console.warn('Unknown landcover_class received:', landcoverClass);
        }
    }
    return 'Unknown';
}

/** Map numeric class to hex color from server metadata. */
export function getLandcoverColor(landcoverClass) {
    const cls = parseLandcoverClass(landcoverClass);
    if (cls == null) return null;
    return state.config.landcoverMeta[cls]?.color || null;
}
