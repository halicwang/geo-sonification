// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

import { describe, it, expect } from 'vitest';

describe('happy-dom rig', () => {
    it('exposes a working DOM', () => {
        const div = document.createElement('div');
        expect(div.tagName).toBe('DIV');
    });

    it('exposes window.requestAnimationFrame', () => {
        expect(typeof window.requestAnimationFrame).toBe('function');
    });
});
