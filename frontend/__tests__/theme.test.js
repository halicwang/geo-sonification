// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Theme module covers three concerns:
 *   1. Mode persistence in localStorage under GEO_SONIFICATION_THEME.
 *   2. Resolution: 'auto' folds onto matchMedia('(prefers-color-scheme: light)').
 *   3. applyTheme() writes dataset.theme + dataset.themeMode and notifies
 *      subscribers; the matchMedia listener fires subscribers only when the
 *      user is in 'auto' mode.
 *
 * Each test isolates module state via vi.resetModules() so the module-scope
 * matchMedia listener and lastResolved cache are rebuilt fresh. localStorage
 * is replaced by an in-memory stub because happy-dom's Storage shim uses a
 * Proxy that rejects per-method spies, and we want exact control over reads
 * and writes including throwing-storage scenarios.
 */

function createMemStorage() {
    let data = {};
    return {
        getItem: vi.fn((k) => (k in data ? data[k] : null)),
        setItem: vi.fn((k, v) => {
            data[k] = String(v);
        }),
        removeItem: vi.fn((k) => {
            delete data[k];
        }),
        clear: vi.fn(() => {
            data = {};
        }),
        key: vi.fn(() => null),
        get length() {
            return Object.keys(data).length;
        },
    };
}

describe('theme', () => {
    let getThemeMode;
    let setThemeMode;
    let getResolvedTheme;
    let applyTheme;
    let subscribeTheme;

    let mqlListeners;
    let matchMediaMock;
    let originalMatchMedia;
    let originalLocalStorage;
    let memStorage;

    beforeEach(async () => {
        vi.resetModules();

        const root = document.documentElement;
        delete root.dataset.theme;
        delete root.dataset.themeMode;
        root.removeAttribute('data-theme-switching');

        memStorage = createMemStorage();
        originalLocalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');
        Object.defineProperty(window, 'localStorage', {
            value: memStorage,
            writable: true,
            configurable: true,
        });

        mqlListeners = [];
        matchMediaMock = {
            matches: false, // OS = dark by default
            media: '(prefers-color-scheme: light)',
            addEventListener: vi.fn((event, cb) => {
                if (event === 'change') mqlListeners.push(cb);
            }),
            removeEventListener: vi.fn(),
        };
        originalMatchMedia = window.matchMedia;
        window.matchMedia = vi.fn(() => matchMediaMock);

        const mod = await import('../config.js');
        getThemeMode = mod.getThemeMode;
        setThemeMode = mod.setThemeMode;
        getResolvedTheme = mod.getResolvedTheme;
        applyTheme = mod.applyTheme;
        subscribeTheme = mod.subscribeTheme;
    });

    afterEach(() => {
        window.matchMedia = originalMatchMedia;
        if (originalLocalStorage) {
            Object.defineProperty(window, 'localStorage', originalLocalStorage);
        }
    });

    it("defaults to 'auto' on a clean storage", () => {
        expect(getThemeMode()).toBe('auto');
    });

    it('persists mode across reads', () => {
        setThemeMode('light');
        expect(getThemeMode()).toBe('light');
        setThemeMode('dark');
        expect(getThemeMode()).toBe('dark');
        setThemeMode('auto');
        expect(getThemeMode()).toBe('auto');
    });

    it("ignores unknown modes and falls back to 'auto'", () => {
        setThemeMode('rainbow');
        expect(getThemeMode()).toBe('auto');
    });

    it('resolves auto via matchMedia (OS dark)', () => {
        matchMediaMock.matches = false;
        expect(getResolvedTheme()).toBe('dark');
    });

    it('resolves auto via matchMedia (OS light)', () => {
        matchMediaMock.matches = true;
        expect(getResolvedTheme()).toBe('light');
    });

    it('explicit light overrides OS dark', () => {
        setThemeMode('light');
        matchMediaMock.matches = false;
        expect(getResolvedTheme()).toBe('light');
    });

    it('explicit dark overrides OS light', () => {
        setThemeMode('dark');
        matchMediaMock.matches = true;
        expect(getResolvedTheme()).toBe('dark');
    });

    it('applyTheme writes resolved value to dataset.theme and raw mode to dataset.themeMode', () => {
        setThemeMode('light');
        applyTheme();
        expect(document.documentElement.dataset.theme).toBe('light');
        expect(document.documentElement.dataset.themeMode).toBe('light');
    });

    it('applyTheme uses resolved (not raw) value for dataset.theme when in auto', () => {
        // mode stays 'auto' (default); flip OS to light
        matchMediaMock.matches = true;
        applyTheme();
        expect(document.documentElement.dataset.theme).toBe('light');
        expect(document.documentElement.dataset.themeMode).toBe('auto');
    });

    it('applyTheme notifies subscribers on resolved-theme change', () => {
        const cb = vi.fn();
        subscribeTheme(cb);

        // First apply: null -> dark, fires.
        applyTheme();
        expect(cb).toHaveBeenCalledTimes(1);
        expect(cb).toHaveBeenCalledWith('dark', 'auto');

        // Same resolved -> does not fire.
        cb.mockClear();
        applyTheme();
        expect(cb).not.toHaveBeenCalled();

        // Mode flip changes resolved -> fires.
        setThemeMode('light');
        applyTheme();
        expect(cb).toHaveBeenCalledTimes(1);
        expect(cb).toHaveBeenCalledWith('light', 'light');
    });

    it("matchMedia 'change' fires subscribers only while mode is 'auto'", () => {
        const cb = vi.fn();
        subscribeTheme(cb);
        applyTheme(); // prime lastResolved at 'dark'
        cb.mockClear();

        // Explicit light: simulating a system flip should NOT call back.
        setThemeMode('light');
        applyTheme(); // dark -> light, notifies
        cb.mockClear();
        matchMediaMock.matches = true;
        mqlListeners.forEach((l) => l());
        expect(cb).not.toHaveBeenCalled();

        // Switch to auto: applyTheme sees current resolved is light (matches=true),
        // matches the cached lastResolved, no notify.
        setThemeMode('auto');
        applyTheme();
        cb.mockClear();

        // Now flip the OS preference back to dark via the mql listener.
        matchMediaMock.matches = false;
        mqlListeners.forEach((l) => l());
        expect(cb).toHaveBeenCalledTimes(1);
        expect(cb).toHaveBeenCalledWith('dark', 'auto');
    });

    it('subscribeTheme returns an unsubscribe function', () => {
        const cb = vi.fn();
        const unsub = subscribeTheme(cb);
        unsub();
        applyTheme();
        expect(cb).not.toHaveBeenCalled();
    });

    it('getThemeMode returns auto when localStorage throws', () => {
        memStorage.getItem.mockImplementation(() => {
            throw new Error('storage disabled');
        });
        expect(getThemeMode()).toBe('auto');
    });

    it('setThemeMode silently no-ops when localStorage throws', () => {
        memStorage.setItem.mockImplementation(() => {
            throw new Error('storage disabled');
        });
        expect(() => setThemeMode('light')).not.toThrow();
    });
});
