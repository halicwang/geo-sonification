// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

import { describe, it, expect, vi } from 'vitest';
import { triggerInitialViewportPush } from '../initial-viewport-push.js';

describe('triggerInitialViewportPush', () => {
    it('calls onViewportChange immediately when the style is already loaded', () => {
        const cb = vi.fn();
        const map = { isStyleLoaded: () => true, once: vi.fn() };
        triggerInitialViewportPush(map, cb);
        expect(cb).toHaveBeenCalledOnce();
        expect(map.once).not.toHaveBeenCalled();
    });

    it('defers to the style.load event when the style is not yet loaded', () => {
        const cb = vi.fn();
        const map = { isStyleLoaded: () => false, once: vi.fn() };
        triggerInitialViewportPush(map, cb);
        // No synchronous call; one `once('style.load', cb)` registration.
        expect(cb).not.toHaveBeenCalled();
        expect(map.once).toHaveBeenCalledOnce();
        expect(map.once).toHaveBeenCalledWith('style.load', cb);
    });

    it('is a no-op when the map is null (pre-initMap call site)', () => {
        const cb = vi.fn();
        expect(() => triggerInitialViewportPush(null, cb)).not.toThrow();
        expect(cb).not.toHaveBeenCalled();
    });
});
