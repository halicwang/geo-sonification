// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createBufferCache } from '../../audio/buffer-cache.js';
import { createMockAudioContext } from '../_helpers/audio-context-mock.js';

const BUS_NAMES = ['forest', 'shrub', 'grass', 'crop', 'urban', 'bare', 'water'];
const ASSET_BASE = '/test-assets';
const PRIORITY_FIRST = [0, 6];
const PRIORITY_SECOND = [1, 2, 3, 4, 5];

/**
 * Build a Response-like object whose body.getReader() yields one chunk
 * and reports a Content-Length matching that chunk.
 */
function mockFetchOk(byteLen = 256) {
    return vi.fn(async () => {
        const data = new Uint8Array(byteLen);
        for (let i = 0; i < byteLen; i++) data[i] = i & 0xff;
        let yielded = false;
        return {
            ok: true,
            status: 200,
            headers: {
                get(name) {
                    return name.toLowerCase() === 'content-length' ? String(byteLen) : null;
                },
            },
            body: {
                getReader() {
                    return {
                        async read() {
                            if (yielded) return { done: true, value: undefined };
                            yielded = true;
                            return { done: false, value: data };
                        },
                    };
                },
            },
        };
    });
}

/** Build a fetch mock that fails for one named bus, succeeds for the rest. */
function mockFetchFailingBus(failName) {
    return vi.fn(async (url) => {
        if (url.includes(`/${failName}.opus`)) {
            return { ok: false, status: 503 };
        }
        const ok = await mockFetchOk()();
        return ok;
    });
}

function makeOpts(extra = {}) {
    return {
        busNames: BUS_NAMES,
        assetBase: ASSET_BASE,
        priorityFirst: PRIORITY_FIRST,
        prioritySecond: PRIORITY_SECOND,
        ...extra,
    };
}

describe('createBufferCache — empty state', () => {
    it('returns null and false for every bus before loadAll', () => {
        const cache = createBufferCache(makeOpts());
        for (let i = 0; i < BUS_NAMES.length; i++) {
            expect(cache.get(i)).toBeNull();
            expect(cache.has(i)).toBe(false);
        }
    });

    it('reports every bus as pending before loadAll', () => {
        const cache = createBufferCache(makeOpts());
        const states = cache.getStates();
        expect(states).toHaveLength(BUS_NAMES.length);
        for (const s of states) {
            expect(s).toEqual({ status: 'pending', progress: 0, error: null });
        }
    });
});

describe('createBufferCache — successful loadAll', () => {
    /** @type {ReturnType<typeof createMockAudioContext>} */
    let ctx;
    let onAllLoaded;

    beforeEach(() => {
        ctx = createMockAudioContext();
        onAllLoaded = vi.fn();
        vi.stubGlobal('fetch', mockFetchOk());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('populates every buffer and marks every state as ready', async () => {
        const cache = createBufferCache(makeOpts({ onAllLoaded }));
        await cache.loadAll(ctx);

        for (let i = 0; i < BUS_NAMES.length; i++) {
            expect(cache.has(i)).toBe(true);
            expect(cache.get(i)).not.toBeNull();
            expect(cache.getStates()[i].status).toBe('ready');
            expect(cache.getStates()[i].progress).toBe(1);
        }
        expect(ctx.decodeAudioData).toHaveBeenCalledTimes(BUS_NAMES.length);
    });

    it('fires onAllLoaded exactly once after both priority phases complete', async () => {
        const cache = createBufferCache(makeOpts({ onAllLoaded }));
        await cache.loadAll(ctx);
        expect(onAllLoaded).toHaveBeenCalledTimes(1);
    });

    it('fetches the priority-first phase before the priority-second phase', async () => {
        const fetchOrder = [];
        vi.stubGlobal(
            'fetch',
            vi.fn(async (url) => {
                fetchOrder.push(url);
                return await mockFetchOk()();
            })
        );

        const cache = createBufferCache(makeOpts({ onAllLoaded }));
        await cache.loadAll(ctx);

        const firstWaveUrls = PRIORITY_FIRST.map(
            (i) => `${ASSET_BASE}/audio/ambience/${BUS_NAMES[i]}.opus`
        );
        const secondWaveUrls = PRIORITY_SECOND.map(
            (i) => `${ASSET_BASE}/audio/ambience/${BUS_NAMES[i]}.opus`
        );
        // Every priorityFirst URL should appear before any prioritySecond URL.
        const lastFirstIdx = Math.max(...firstWaveUrls.map((u) => fetchOrder.indexOf(u)));
        const earliestSecondIdx = Math.min(...secondWaveUrls.map((u) => fetchOrder.indexOf(u)));
        expect(lastFirstIdx).toBeLessThan(earliestSecondIdx);
    });

    it('emits update callback through the pending → loading → ready transitions', async () => {
        const onUpdate = vi.fn();
        const cache = createBufferCache(makeOpts({ onAllLoaded }));
        cache.setOnUpdate(onUpdate);
        await cache.loadAll(ctx);

        // Across all calls, bus 0 (forest) must traverse loading then ready.
        const bus0Statuses = onUpdate.mock.calls.map((args) => args[0][0].status);
        expect(bus0Statuses).toContain('loading');
        expect(bus0Statuses).toContain('ready');
    });

    it('returns a deep-copied snapshot from getStates() (mutation-safe)', async () => {
        const cache = createBufferCache(makeOpts({ onAllLoaded }));
        await cache.loadAll(ctx);

        const snapshot = cache.getStates();
        snapshot[0].status = 'pending';
        snapshot[0].progress = 0;

        expect(cache.getStates()[0].status).toBe('ready');
        expect(cache.getStates()[0].progress).toBe(1);
    });

    it('the second loadAll call is a no-op while the first is in flight (re-entry guard)', async () => {
        const cache = createBufferCache(makeOpts({ onAllLoaded }));
        const first = cache.loadAll(ctx);
        const second = cache.loadAll(ctx);
        await Promise.all([first, second]);

        // Re-entry guard means the second call returns immediately without
        // re-fetching. Total fetch calls must stay at NUM_BUSES.
        expect(globalThis.fetch).toHaveBeenCalledTimes(BUS_NAMES.length);
        expect(onAllLoaded).toHaveBeenCalledTimes(1);
    });
});

describe('createBufferCache — generation guard', () => {
    /** @type {ReturnType<typeof createMockAudioContext>} */
    let ctx;
    let onAllLoaded;

    beforeEach(() => {
        ctx = createMockAudioContext();
        onAllLoaded = vi.fn();
        vi.stubGlobal('fetch', mockFetchOk());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('cancelAndReset before await aborts the kickoff: onAllLoaded never fires', async () => {
        const cache = createBufferCache(makeOpts({ onAllLoaded }));
        const promise = cache.loadAll(ctx);
        cache.cancelAndReset();
        await promise;

        expect(onAllLoaded).not.toHaveBeenCalled();
    });

    it('a fresh loadAll after cancelAndReset succeeds and fires onAllLoaded', async () => {
        const cache = createBufferCache(makeOpts({ onAllLoaded }));
        const promise = cache.loadAll(ctx);
        cache.cancelAndReset();
        await promise;

        await cache.loadAll(ctx);
        expect(onAllLoaded).toHaveBeenCalledTimes(1);
        for (let i = 0; i < BUS_NAMES.length; i++) {
            expect(cache.has(i)).toBe(true);
        }
    });
});

describe('createBufferCache — error path', () => {
    /** @type {ReturnType<typeof createMockAudioContext>} */
    let ctx;
    let onAllLoaded;

    beforeEach(() => {
        ctx = createMockAudioContext();
        onAllLoaded = vi.fn();
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('a single failing bus does not block the rest; onAllLoaded still fires', async () => {
        vi.stubGlobal('fetch', mockFetchFailingBus('urban'));

        const cache = createBufferCache(makeOpts({ onAllLoaded }));
        await cache.loadAll(ctx);

        const urbanIdx = BUS_NAMES.indexOf('urban');
        expect(cache.has(urbanIdx)).toBe(false);
        expect(cache.getStates()[urbanIdx].status).toBe('error');
        expect(cache.getStates()[urbanIdx].error).toContain('HTTP 503');

        for (let i = 0; i < BUS_NAMES.length; i++) {
            if (i === urbanIdx) continue;
            expect(cache.has(i)).toBe(true);
            expect(cache.getStates()[i].status).toBe('ready');
        }
        expect(onAllLoaded).toHaveBeenCalledTimes(1);
    });
});
