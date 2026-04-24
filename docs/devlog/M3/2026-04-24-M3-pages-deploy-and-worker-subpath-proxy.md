# 2026-04-24 — Feature: Pages Build + Cloudflare Worker Subpath Proxy

Ship the frontend at `https://placeecho.com/geo-sonification/` by
combining three pieces that Cloudflare Pages alone cannot deliver:

1. **`scripts/build-pages.js`** — produces a `dist/` tree suitable
   for `wrangler pages deploy`.
2. **`workers/geo-sonification-proxy/`** — a ~30-line reverse-proxy
   Worker that mounts the Pages app under `placeecho.com/geo-sonification/*`.
3. **Environment-driven runtime config** — `.env.deploy` (gitignored)
   feeds the build script, which rewrites `dist/config.runtime.js`
   with real URLs and the production Mapbox token.

## Why a Worker instead of a Pages custom domain

Cloudflare Pages custom domains bind only at the zone apex or a
subdomain — they don't support path prefixes. `placeecho.com` is
reserved for an eventual main site, so the geo-sonification app
needs to live at `/geo-sonification/*` as one of several eventual
tenants under that apex. A tiny Worker on that path prefix, reverse-
proxying to `placeecho-geo-sonification.pages.dev`, is the standard
workaround and costs one extra edge hop (< 5 ms p50).

The Worker also issues a 308 redirect from `/geo-sonification` →
`/geo-sonification/` so relative asset URLs in the served HTML
resolve correctly.

## Build pipeline

`scripts/build-pages.js` does four things:

1. Wipes and recreates `dist/`.
2. Copies `frontend/**` verbatim — except `frontend/audio/ambience/`
   (7 × 46 MB WAVs that exceed Pages' 25 MB per-file cap and are
   served from R2 in production anyway).
3. Copies `data/cities.json` → `dist/data/cities.json` so the
   announcer's `${BASE_PATH}/data/cities.json` fetch lands on a
   same-origin asset.
4. Writes `dist/config.runtime.js` with the five production values —
   `BASE_PATH`, `API_BASE`, `WS_URL`, `ASSET_BASE`, `MAPBOX_TOKEN` —
   read from `process.env` or `.env.deploy` (the former wins so CI
   env vars override local defaults).

Output: 572 files, ~5 MB. Uploaded in ~4 seconds to Pages.

## The Worker

```js
const PREFIX = '/geo-sonification';
const PAGES_ORIGIN = 'https://placeecho-geo-sonification.pages.dev';

export default {
    async fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === PREFIX) {
            return Response.redirect(url.origin + PREFIX + '/' + url.search, 308);
        }
        if (!url.pathname.startsWith(PREFIX + '/')) {
            return new Response('Not Found', { status: 404 });
        }
        const targetPath = url.pathname.slice(PREFIX.length);
        return fetch(new Request(PAGES_ORIGIN + targetPath + url.search, request));
    },
};
```

`wrangler.toml` declares two routes so both `/geo-sonification` (no
slash) and `/geo-sonification/*` hit the Worker. API and WebSocket
traffic (Fly.io) and large static assets (R2) go direct — the Worker
never touches them.

## Production verification

```
$ curl -sS -I https://placeecho.com/geo-sonification
HTTP/2 308          Location: /geo-sonification/

$ curl -sS -I -L https://placeecho.com/geo-sonification/
HTTP/2 200          content-type: text/html; charset=utf-8

$ for p in main.js config.runtime.js data/cities.json audio/cities/new-york.m4a; do
    curl -sS -o /dev/null -w "%{http_code}  $p\n" "https://placeecho.com/geo-sonification/$p"
  done
200  main.js
200  config.runtime.js
200  data/cities.json
200  audio/cities/new-york.m4a
```

Browser end-to-end:
- Map renders with grid-dot overlay (PMTiles from R2, Range requests
  serving 206 Partial Content).
- Info panel streams live viewport stats over the wss:// connection
  to Fly; lat/lng drag updates are visible within a frame or two.
- Audio toggle triggers fetches of the 7 ambience WAVs from R2; city
  announcer plays M4A clips served from Pages.

## Files changed

- `scripts/build-pages.js` — new, Pages build orchestrator.
- `workers/geo-sonification-proxy/worker.js` — new, reverse-proxy
  with 308-redirect + prefix-strip.
- `workers/geo-sonification-proxy/wrangler.toml` — new, declares the
  two Workers Routes on `placeecho.com`.
- `.env.deploy.example` — new, template for local `.env.deploy`.
- `.gitignore` — adds `.env.deploy` and `dist/`.
- `docs/DEVLOG.md` — index entry for this devlog.

## Not yet automated

`wrangler pages deploy` and `fly deploy` are still run by hand. The
next milestone (see follow-ups) is connecting Pages to the GitHub
repo with env-var injection and a GitHub Actions workflow for
`fly deploy`, so `git push` becomes the single deploy trigger.
