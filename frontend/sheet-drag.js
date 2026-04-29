// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Drag-to-dismiss for the mobile bottom-sheet info panel.
 *
 * On expanded state, pressing the drag handle and pulling down moves
 * the sheet with the finger; releasing past `dismissThreshold` snaps
 * it closed via the supplied `onDismiss` callback. Releasing before
 * the threshold lets it spring back to fully open.
 *
 * Drag-up is rubber-banded to zero (no further-expanded state in the
 * two-state design). Tap-without-drag still fires the handle's normal
 * click handler — the drag tracker only "consumes" the click when
 * movement exceeds `tapMovementThreshold`.
 *
 * Implementation notes:
 *  - Uses Pointer Events (covers touch / mouse / pen on every modern
 *    browser; no need to dual-bind touch + mouse).
 *  - `setPointerCapture` keeps tracking even when the finger leaves
 *    the handle's bounding box, so a long drag never "loses" the
 *    pointer mid-stroke.
 *  - Adds/removes a `dragging` class on the panel so CSS can suppress
 *    the snap transition during the live drag.
 *  - Inline `transform` on the panel is cleared on pointerup so the
 *    CSS-driven open/closed animation takes over for the snap.
 *
 * @module frontend/sheet-drag
 */

/**
 * @typedef {Object} SheetDragOptions
 * @property {HTMLElement} handle - The drag-handle element (pointer source).
 * @property {HTMLElement} panel - The sheet element to translate.
 * @property {() => void} onDismiss - Called on release past threshold.
 * @property {() => boolean} [isHidden] - Returns true when the sheet
 *     is in collapsed state (drag is then a no-op). Defaults to
 *     reading `panel.classList.contains('hidden')`.
 * @property {number} [dismissThreshold] - Pixels of downward drag at
 *     which release triggers dismiss. Default 80.
 * @property {number} [tapMovementThreshold] - Pixels of pointer
 *     movement above which the post-pointerup click is suppressed
 *     (so taps still fire normally for short movements). Default 6.
 */

/**
 * Attach drag-to-dismiss handlers to the supplied handle/panel pair.
 *
 * @param {SheetDragOptions} opts
 * @returns {() => void} Unsubscribe — removes every listener and any
 *     in-flight `dragging` class. Useful in tests / hot-reload.
 */
export function attachSheetDrag(opts) {
    const {
        handle,
        panel,
        onDismiss,
        isHidden = () => panel.classList.contains('hidden'),
        dismissThreshold = 80,
        tapMovementThreshold = 6,
    } = opts;

    let pointerId = null;
    let startY = 0;
    let lastDelta = 0;
    let didMove = false;

    function onPointerDown(event) {
        if (pointerId !== null) return; // already tracking another pointer
        if (isHidden()) return; // collapsed → ignore
        pointerId = event.pointerId;
        startY = event.clientY;
        lastDelta = 0;
        didMove = false;
        panel.classList.add('dragging');
        try {
            handle.setPointerCapture(event.pointerId);
        } catch {
            // setPointerCapture may throw on synthetic events in tests; safe to ignore
        }
    }

    function onPointerMove(event) {
        if (event.pointerId !== pointerId) return;
        const delta = event.clientY - startY;
        // Drag-up is rubber-banded to zero: nothing visible happens,
        // since the sheet is already fully open.
        const offset = Math.max(0, delta);
        lastDelta = offset;
        if (Math.abs(delta) > tapMovementThreshold) didMove = true;
        panel.style.transform = `translateY(${offset}px)`;
    }

    function reset() {
        panel.classList.remove('dragging');
        panel.style.transform = '';
        pointerId = null;
        lastDelta = 0;
    }

    function onPointerUp(event) {
        if (event.pointerId !== pointerId) return;
        const shouldDismiss = lastDelta > dismissThreshold;
        try {
            handle.releasePointerCapture(event.pointerId);
        } catch {
            // ignore release failures (already released, or synthetic event)
        }
        reset();
        if (shouldDismiss) onDismiss();
    }

    function onPointerCancel(event) {
        if (event.pointerId !== pointerId) return;
        // pointercancel = the OS / browser interrupted the gesture (e.g.
        // a system gesture took over). Do not treat as a deliberate
        // dismiss; reset state and let the snap animation spring back.
        reset();
    }

    function onClickCapture(event) {
        // Suppress the post-drag click so toggle handlers don't double-fire.
        if (didMove) {
            event.preventDefault();
            event.stopPropagation();
            didMove = false;
        }
    }

    handle.addEventListener('pointerdown', onPointerDown);
    handle.addEventListener('pointermove', onPointerMove);
    handle.addEventListener('pointerup', onPointerUp);
    handle.addEventListener('pointercancel', onPointerCancel);
    handle.addEventListener('click', onClickCapture, { capture: true });

    return function detach() {
        handle.removeEventListener('pointerdown', onPointerDown);
        handle.removeEventListener('pointermove', onPointerMove);
        handle.removeEventListener('pointerup', onPointerUp);
        handle.removeEventListener('pointercancel', onPointerCancel);
        handle.removeEventListener('click', onClickCapture, { capture: true });
        panel.classList.remove('dragging');
        panel.style.transform = '';
    };
}
