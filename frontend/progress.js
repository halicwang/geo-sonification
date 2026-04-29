// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Loop-progress bar — pointer-driven seek + rAF-driven visual fill.
 *
 * Polling-based fill (rAF reading `engine.getLoopProgress()`) is
 * intentional — a subscription-based variant was considered and
 * deferred.
 *
 * Usage:
 *   const bar = attachProgressBar({ progressEl, fillEl, handleEl, engine });
 *   // when audio starts:
 *   bar.start();
 *   // when audio stops:
 *   bar.stop();
 *
 * Pointer handlers are attached once (at `attachProgressBar` time) and
 * gate themselves on `engine.isRunning()`. The rAF loop is gated by
 * `start()` / `stop()` so it only burns frames while audio is on.
 *
 * @module frontend/progress
 */

/**
 * @typedef {Object} ProgressBarHandle
 * @property {() => void} start - Begin the rAF loop that updates the fill.
 * @property {() => void} stop  - Cancel the rAF loop and hide the bar.
 */

/**
 * Wire pointer-drag + rAF-poll behavior to a 3-element progress bar
 * (container + fill + handle). Returns `{ start, stop }` for the audio
 * toggle to call.
 *
 * @param {Object} opts
 * @param {HTMLElement} opts.progressEl - Outer container (receives `.dragging` + `.hidden`).
 * @param {HTMLElement} opts.fillEl     - Inner fill bar (`width` styled by progress).
 * @param {HTMLElement} opts.handleEl   - Drag handle (`left` styled by progress).
 * @param {{ getLoopProgress: () => ({ progress: number }|null), isRunning: () => boolean, seekLoop: (p: number) => void }} opts.engine
 * @returns {ProgressBarHandle}
 */
export function attachProgressBar({ progressEl, fillEl, handleEl, engine }) {
    let progressRafId = null;
    let isDragging = false;

    function setVisualProgress(progress) {
        const pct = (progress * 100).toFixed(2) + '%';
        fillEl.style.width = pct;
        handleEl.style.left = pct;
    }

    function progressFromPointerEvent(e) {
        const rect = progressEl.getBoundingClientRect();
        const x = e.clientX - rect.left;
        return Math.max(0, Math.min(1, x / rect.width));
    }

    function updateProgressBar() {
        const info = engine.getLoopProgress();
        if (!info) {
            if (!progressEl.classList.contains('hidden')) {
                progressEl.classList.add('hidden');
            }
            // Keep polling — samples may still be loading; the loop will
            // yield a valid progress once startAllSources() has fired.
            progressRafId = requestAnimationFrame(updateProgressBar);
            return;
        }

        progressEl.classList.remove('hidden');

        if (!isDragging) {
            setVisualProgress(info.progress);
        }

        progressRafId = requestAnimationFrame(updateProgressBar);
    }

    progressEl.addEventListener('pointerdown', (e) => {
        if (!engine.isRunning()) return;
        isDragging = true;
        progressEl.classList.add('dragging');
        progressEl.setPointerCapture(e.pointerId);
        setVisualProgress(progressFromPointerEvent(e));
    });

    progressEl.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        setVisualProgress(progressFromPointerEvent(e));
    });

    progressEl.addEventListener('pointerup', (e) => {
        if (!isDragging) return;
        isDragging = false;
        progressEl.classList.remove('dragging');
        engine.seekLoop(progressFromPointerEvent(e));
    });

    progressEl.addEventListener('pointercancel', () => {
        if (!isDragging) return;
        isDragging = false;
        progressEl.classList.remove('dragging');
    });

    return {
        start() {
            if (progressRafId !== null) return;
            progressRafId = requestAnimationFrame(updateProgressBar);
        },
        stop() {
            if (progressRafId !== null) {
                cancelAnimationFrame(progressRafId);
                progressRafId = null;
            }
            progressEl.classList.add('hidden');
        },
    };
}
