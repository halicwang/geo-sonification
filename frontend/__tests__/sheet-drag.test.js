// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { attachSheetDrag } from '../sheet-drag.js';

/**
 * Lightweight DOM-ish fixture: build a panel + handle pair using
 * happy-dom's actual elements so the production listener wiring runs
 * unchanged. Pointer events are dispatched as `new Event('pointerdown'
 * /move/up/cancel')` with the relevant fields patched on — happy-dom
 * doesn't ship a real PointerEvent constructor in every version, but a
 * plain Event with the right properties is enough for the handler.
 */
function buildFixture() {
    const panel = document.createElement('div');
    panel.id = 'info-panel';
    const handle = document.createElement('button');
    handle.id = 'sheet-handle';
    panel.appendChild(handle);
    document.body.appendChild(panel);
    // setPointerCapture / releasePointerCapture are not implemented on
    // happy-dom Buttons — stub them to no-op so the handler doesn't
    // throw when it tries to capture.
    handle.setPointerCapture = vi.fn();
    handle.releasePointerCapture = vi.fn();
    return { panel, handle };
}

function pointerEvent(type, { clientY = 0, pointerId = 1 } = {}) {
    const ev = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'pointerId', { value: pointerId });
    Object.defineProperty(ev, 'clientY', { value: clientY });
    return ev;
}

describe('attachSheetDrag', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('does nothing while the sheet is collapsed (hidden)', () => {
        const { panel, handle } = buildFixture();
        panel.classList.add('hidden');
        const onDismiss = vi.fn();
        attachSheetDrag({ handle, panel, onDismiss });

        handle.dispatchEvent(pointerEvent('pointerdown', { clientY: 100 }));
        handle.dispatchEvent(pointerEvent('pointermove', { clientY: 300 }));
        handle.dispatchEvent(pointerEvent('pointerup', { clientY: 300 }));

        expect(onDismiss).not.toHaveBeenCalled();
        expect(panel.style.transform).toBe('');
        expect(panel.classList.contains('dragging')).toBe(false);
    });

    it('translates the panel during drag and clears on release below threshold', () => {
        const { panel, handle } = buildFixture();
        const onDismiss = vi.fn();
        attachSheetDrag({ handle, panel, onDismiss, dismissThreshold: 80 });

        handle.dispatchEvent(pointerEvent('pointerdown', { clientY: 100 }));
        expect(panel.classList.contains('dragging')).toBe(true);

        handle.dispatchEvent(pointerEvent('pointermove', { clientY: 130 })); // 30 px down
        expect(panel.style.transform).toBe('translateY(30px)');

        handle.dispatchEvent(pointerEvent('pointerup', { clientY: 130 })); // 30 < 80
        expect(onDismiss).not.toHaveBeenCalled();
        expect(panel.style.transform).toBe('');
        expect(panel.classList.contains('dragging')).toBe(false);
    });

    it('calls onDismiss when release passes the threshold', () => {
        const { panel, handle } = buildFixture();
        const onDismiss = vi.fn();
        attachSheetDrag({ handle, panel, onDismiss, dismissThreshold: 80 });

        handle.dispatchEvent(pointerEvent('pointerdown', { clientY: 100 }));
        handle.dispatchEvent(pointerEvent('pointermove', { clientY: 200 })); // 100 px > 80
        handle.dispatchEvent(pointerEvent('pointerup', { clientY: 200 }));

        expect(onDismiss).toHaveBeenCalledOnce();
        expect(panel.style.transform).toBe('');
        expect(panel.classList.contains('dragging')).toBe(false);
    });

    it('rubber-bands drag-up to zero (no negative translate)', () => {
        const { panel, handle } = buildFixture();
        const onDismiss = vi.fn();
        attachSheetDrag({ handle, panel, onDismiss });

        handle.dispatchEvent(pointerEvent('pointerdown', { clientY: 200 }));
        handle.dispatchEvent(pointerEvent('pointermove', { clientY: 100 })); // -100 px

        expect(panel.style.transform).toBe('translateY(0px)');
    });

    it('pointercancel resets state without firing onDismiss', () => {
        const { panel, handle } = buildFixture();
        const onDismiss = vi.fn();
        attachSheetDrag({ handle, panel, onDismiss, dismissThreshold: 80 });

        handle.dispatchEvent(pointerEvent('pointerdown', { clientY: 100 }));
        handle.dispatchEvent(pointerEvent('pointermove', { clientY: 250 })); // would dismiss
        handle.dispatchEvent(pointerEvent('pointercancel', { clientY: 250 }));

        // pointercancel releases without snapping — caller can decide
        expect(onDismiss).not.toHaveBeenCalled();
        expect(panel.classList.contains('dragging')).toBe(false);
        expect(panel.style.transform).toBe('');
    });

    it('suppresses the post-drag click so the handle tap-handler does not double-fire', () => {
        const { panel, handle } = buildFixture();
        const tapHandler = vi.fn();
        handle.addEventListener('click', tapHandler);
        attachSheetDrag({ handle, panel, onDismiss: vi.fn() });

        // Simulate a real drag (movement > tapMovementThreshold)
        handle.dispatchEvent(pointerEvent('pointerdown', { clientY: 100 }));
        handle.dispatchEvent(pointerEvent('pointermove', { clientY: 130 }));
        handle.dispatchEvent(pointerEvent('pointerup', { clientY: 130 }));
        // Browser fires click after pointerup; our capture handler eats it.
        handle.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));

        expect(tapHandler).not.toHaveBeenCalled();
    });

    it('lets a clean tap (no movement) reach the click handler', () => {
        const { panel, handle } = buildFixture();
        const tapHandler = vi.fn();
        handle.addEventListener('click', tapHandler);
        attachSheetDrag({ handle, panel, onDismiss: vi.fn() });

        handle.dispatchEvent(pointerEvent('pointerdown', { clientY: 100 }));
        handle.dispatchEvent(pointerEvent('pointerup', { clientY: 100 })); // no move
        handle.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));

        expect(tapHandler).toHaveBeenCalledOnce();
    });

    it('detach() removes every listener and clears state', () => {
        const { panel, handle } = buildFixture();
        const onDismiss = vi.fn();
        const detach = attachSheetDrag({ handle, panel, onDismiss });

        // Get the panel into a mid-drag state, then detach.
        handle.dispatchEvent(pointerEvent('pointerdown', { clientY: 100 }));
        handle.dispatchEvent(pointerEvent('pointermove', { clientY: 150 }));
        detach();

        // After detach, dragging class and inline transform are cleared.
        expect(panel.classList.contains('dragging')).toBe(false);
        expect(panel.style.transform).toBe('');

        // Subsequent events do nothing — onDismiss never fires.
        handle.dispatchEvent(pointerEvent('pointerdown', { clientY: 100 }));
        handle.dispatchEvent(pointerEvent('pointermove', { clientY: 300 }));
        handle.dispatchEvent(pointerEvent('pointerup', { clientY: 300 }));
        expect(onDismiss).not.toHaveBeenCalled();
    });
});
