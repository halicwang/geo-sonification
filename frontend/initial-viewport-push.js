// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Trigger the first viewport push to the server, gated on Mapbox style
 * having finished loading.
 *
 * The race this guards against: on a warm WebSocket reconnect (or fast
 * networks where the server accepts the WS upgrade before Mapbox has
 * finished parsing its style JSON), the WS `onOpen` callback fires
 * before the map's `style.load` event. At that moment `map.getBounds()`
 * still returns the initial-projection placeholder bounds, so the
 * server's first `audioParams` reply is computed from a viewport the
 * user never actually sees. The visible symptom is an empty grid +
 * stale audio for one viewport-debounce window until the user pans.
 *
 * Pre-existing bug, unmasked by M4 P5-1's idle suspend (the
 * always-running rAF used to paper over it on the next frame after
 * the map finally rendered). M5 stage 2 fix.
 *
 * @param {mapboxgl.Map|null} map - the Mapbox instance, or null if
 *     `initMap()` has not run yet.
 * @param {() => void} onViewportChange - callback that sends the
 *     viewport bounds to the server. Called exactly once, either
 *     synchronously (style already loaded) or via `style.load`.
 */
export function triggerInitialViewportPush(map, onViewportChange) {
    if (!map) return;
    if (map.isStyleLoaded()) {
        onViewportChange();
        return;
    }
    map.once('style.load', onViewportChange);
}
