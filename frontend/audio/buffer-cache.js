// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Sample-buffer cache for the geo-sonification audio engine.
 *
 * Owns the seven decoded ambience AudioBuffers, the per-bus loading
 * state machine, the priority-phased Promise.all kickoff, and the
 * generation token system that lets stop() invalidate any in-flight
 * fetch / decode / progress callback so a later start() doesn't see
 * stale buses pop in.
 *
 * Exposed as a factory rather than a singleton so a test can stand up
 * an independent cache against a mocked AudioContext + fetch without
 * touching module-level state.
 *
 * @module frontend/audio/buffer-cache
 */

/**
 * @typedef {Object} BusLoadingState
 * @property {'pending'|'loading'|'ready'|'error'} status
 * @property {number} progress - 0.0 to 1.0
 * @property {string|null} error
 */

/**
 * @typedef {Object} BufferCacheOptions
 * @property {string[]} busNames - per-index display name; length defines bus count
 * @property {string} assetBase - prefix for ambience asset URLs
 * @property {number[]} priorityFirst - bus indices loaded in the first parallel phase
 * @property {number[]} prioritySecond - bus indices loaded in the second parallel phase
 * @property {() => void} [onAllLoaded] - fired after both priority phases complete on a non-stale generation
 */

/**
 * @typedef {Object} BufferCache
 * @property {(busIndex: number) => AudioBuffer | null} get
 * @property {(busIndex: number) => boolean} has
 * @property {() => BusLoadingState[]} getStates
 * @property {(callback: ((states: BusLoadingState[]) => void) | null) => void} setOnUpdate
 * @property {(audioCtx: AudioContext) => Promise<void>} loadAll
 * @property {() => void} cancelAndReset
 */

/**
 * @param {BufferCacheOptions} opts
 * @returns {BufferCache}
 */
export function createBufferCache(opts) {
    const { busNames, assetBase, priorityFirst, prioritySecond, onAllLoaded } = opts;
    const numBuses = busNames.length;

    /** @type {(AudioBuffer | null)[]} */
    const buffers = new Array(numBuses).fill(null);

    /** @type {BusLoadingState[]} */
    const loadingStates = busNames.map(() => ({ status: 'pending', progress: 0, error: null }));

    /** Tracks which generation owns each bus's current loading state. */
    const loadingGenerations = new Array(numBuses).fill(0);

    /** Re-entry guard for loadAll. */
    let loadingStarted = false;

    /**
     * Monotonically increasing generation counter. Bumped on every `loadAll`
     * and on `cancelAndReset`; in-flight `loadSample` calls compare against
     * this to abort gracefully when stop() has been called since their start.
     */
    let loadGeneration = 0;

    /** @type {((states: BusLoadingState[]) => void) | null} */
    let onUpdate = null;

    function notify() {
        if (typeof onUpdate === 'function') {
            onUpdate(loadingStates.map((s) => ({ ...s })));
        }
    }

    /**
     * Reset a loading bus back to pending only if this generation owns it.
     * Prevents stale async loads from clobbering a newer generation.
     */
    function resetLoadingIfOwned(busIndex, generation) {
        if (
            loadingStates[busIndex].status === 'loading' &&
            loadingGenerations[busIndex] === generation
        ) {
            loadingStates[busIndex] = { status: 'pending', progress: 0, error: null };
            loadingGenerations[busIndex] = 0;
            notify();
        }
    }

    function isStaleGeneration(busIndex, generation) {
        if (generation !== loadGeneration) {
            resetLoadingIfOwned(busIndex, generation);
            return true;
        }
        return false;
    }

    /**
     * Load and decode a single ambience asset with progress tracking.
     * On error, sets that bus's status to 'error' — other buses continue
     * normally. Checks the generation token at every async boundary so
     * stop() / cancelAndReset() takes effect within one tick.
     */
    async function loadSample(audioCtx, busIndex, generation) {
        if (loadingStates[busIndex].status === 'loading') {
            if (loadingGenerations[busIndex] === generation) return;
            loadingStates[busIndex] = { status: 'pending', progress: 0, error: null };
            loadingGenerations[busIndex] = 0;
            notify();
        }
        if (loadingStates[busIndex].status === 'ready' && buffers[busIndex]) return;

        const name = busNames[busIndex];
        loadingStates[busIndex] = { status: 'loading', progress: 0, error: null };
        loadingGenerations[busIndex] = generation;
        notify();

        try {
            const response = await fetch(`${assetBase}/audio/ambience/${name}.opus`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} for ${name}.opus`);
            }

            if (isStaleGeneration(busIndex, generation)) return;

            const contentLength = response.headers.get('Content-Length');
            const total = contentLength ? parseInt(contentLength, 10) : 0;
            const reader = response.body.getReader();
            const chunks = [];
            let loaded = 0;

            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
                loaded += value.length;
                if (total > 0) {
                    loadingStates[busIndex].progress = loaded / total;
                    notify();
                }
            }

            if (isStaleGeneration(busIndex, generation)) return;

            const combined = new Uint8Array(loaded);
            let offset = 0;
            for (const chunk of chunks) {
                combined.set(chunk, offset);
                offset += chunk.length;
            }

            if (isStaleGeneration(busIndex, generation)) return;
            if (!audioCtx || audioCtx.state === 'closed') return;

            buffers[busIndex] = await audioCtx.decodeAudioData(combined.buffer);

            if (isStaleGeneration(busIndex, generation)) return;

            loadingStates[busIndex] = { status: 'ready', progress: 1, error: null };
            loadingGenerations[busIndex] = 0;
            notify();
        } catch (err) {
            if (isStaleGeneration(busIndex, generation)) return;
            console.error(`[buffer-cache] Failed to load ${name}:`, err);
            loadingStates[busIndex] = {
                status: 'error',
                progress: 0,
                error: err.message || 'Load failed',
            };
            loadingGenerations[busIndex] = 0;
            notify();
        }
    }

    async function loadAll(audioCtx) {
        if (loadingStarted) return;
        loadingStarted = true;
        const generation = ++loadGeneration;

        try {
            await Promise.all(priorityFirst.map((i) => loadSample(audioCtx, i, generation)));
            if (generation !== loadGeneration) return;

            await Promise.all(prioritySecond.map((i) => loadSample(audioCtx, i, generation)));
            if (generation !== loadGeneration) return;

            if (typeof onAllLoaded === 'function') onAllLoaded();
        } finally {
            loadingStarted = false;
        }
    }

    function cancelAndReset() {
        loadingStarted = false;
        let changed = false;
        for (let i = 0; i < numBuses; i++) {
            if (loadingStates[i].status === 'loading' || loadingStates[i].status === 'error') {
                loadingStates[i] = { status: 'pending', progress: 0, error: null };
                loadingGenerations[i] = 0;
                changed = true;
            }
        }
        if (changed) notify();
        loadGeneration++;
    }

    return {
        get(busIndex) {
            return buffers[busIndex] ?? null;
        },
        has(busIndex) {
            return buffers[busIndex] != null;
        },
        getStates() {
            return loadingStates.map((s) => ({ ...s }));
        },
        setOnUpdate(callback) {
            onUpdate = callback;
        },
        loadAll,
        cancelAndReset,
    };
}
