// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Zixiao Wang

/**
 * Reverse-proxy Worker: placeecho.com/geo-sonification/* → Pages.
 *
 * Cloudflare Pages custom domains can only bind at the zone apex or a
 * subdomain, not at a path prefix. This Worker mounts the Pages app
 * (placeecho-geo-sonification.pages.dev) under placeecho.com/geo-sonification/*
 * by stripping the prefix and proxying every request verbatim — method,
 * headers, and body all preserved.
 *
 * It proxies *only* frontend assets. /api/* and WebSocket traffic go
 * straight to the Fly backend at api-aliased subdomains (configured in
 * frontend/config.runtime.js), and large static files (PMTiles, ambience
 * WAVs) go straight to R2 at assets.placeecho.com. This Worker never
 * sees those requests.
 */

const PREFIX = '/geo-sonification';
const PAGES_ORIGIN = 'https://placeecho-geo-sonification.pages.dev';

export default {
    async fetch(request) {
        const url = new URL(request.url);

        // Canonical redirect: /geo-sonification → /geo-sonification/ so
        // relative asset URLs in the served HTML resolve correctly.
        if (url.pathname === PREFIX) {
            return Response.redirect(url.origin + PREFIX + '/' + url.search, 308);
        }

        if (!url.pathname.startsWith(PREFIX + '/')) {
            return new Response('Not Found', { status: 404 });
        }

        const targetPath = url.pathname.slice(PREFIX.length); // leading '/'
        const targetUrl = PAGES_ORIGIN + targetPath + url.search;

        // Forward the request unchanged. `new Request(url, request)`
        // preserves method/body/headers but lets us retarget the URL.
        return fetch(new Request(targetUrl, request));
    },
};
