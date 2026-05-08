# 2026-05-08 — Fix: Version-stamp Asset URLs to Bypass Stale Browser Cache

Append `?v=<buildHash>` to every fetch URL under `ASSET_BASE` (`grid_index.bin`, `grids.pmtiles`, all seven ambience opus files). When a sidecar's first-time fetch lands on the edge before R2 has the file uploaded, Cloudflare's default 4 h negative-cache TTL on the resulting 404 was being honored by browsers' disk cache, leaving hover-glow silently disabled long after the asset was actually live. Each deploy mints a new buildHash → new URLs that no disk cache can have seen, so stale 404s are bypassed automatically.

## Why

Concrete incident on 2026-05-08: `frontend/hover-glow.js` shipped with its `fetch('/tiles/grid_index.bin')` call before the sidecar finished uploading to R2. The browser:

1. Hit Cloudflare → got a 404 with `cache-control: public, max-age=14400` (CF default for missing R2 objects).
2. Wrote the 404 + headers to disk cache for 4 hours.
3. After R2 upload completed and the edge was purged, every subsequent page load from that browser served the disk-cached 404 directly — no network request was made. `fetchGridIndex()` saw `!res.ok`, fell into its `catch`, and quietly disabled hover-glow.

Hard reload sometimes bypasses disk cache for the navigation request but not always for sub-resources, and "Clear site data" only fixes one browser at a time. There is no remote mechanism to evict a cached 404 from a user's local disk — the only way to make every existing user recover automatically is to issue a different URL.

## What changed

`config.runtime.js` already carries `buildHash`, set by [scripts/build-pages.js](../../../scripts/build-pages.js) from `git rev-parse --short HEAD`. The fix exposes it as `ASSET_VERSION` from [frontend/config.js](../../../frontend/config.js) and threads it through every fetch that reads from `ASSET_BASE`.

Three call sites:

- **[frontend/hover-glow.js](../../../frontend/hover-glow.js)** — `fetchGridIndex()` builds `${ASSET_BASE}/tiles/grid_index.bin?v=${ASSET_VERSION}`.
- **[frontend/map.js](../../../frontend/map.js)** — `addGridLayer()` builds `${ASSET_BASE}/tiles/grids.pmtiles?v=${ASSET_VERSION}`. The mapbox-pmtiles library uses HTTP range requests internally; query strings do not interfere with `Range:` headers.
- **[frontend/audio/buffer-cache.js](../../../frontend/audio/buffer-cache.js)** — accepts a new optional `assetVersion` opt and appends it to the per-bus opus URL. [frontend/audio/engine.js](../../../frontend/audio/engine.js) passes `ASSET_VERSION` through. Backward-compatible: empty/omitted `assetVersion` skips the suffix entirely, so the existing `buffer-cache.test.js` cases pass unchanged (they match URLs via `url.includes('/${name}.opus')`, which still matches with a trailing `?v=` suffix).

When `ASSET_VERSION` is empty (local dev — `runtime.buildHash` is only injected at deploy time), every fetch URL is byte-identical to before, so local behavior is unchanged.

## Cache impact

- **Browser disk cache**: each new buildHash → new URL → guaranteed miss. The fresh response is fetched and re-cached under the new URL.
- **CDN edge cache**: same. R2 objects carry `cache-control: public, max-age=31536000, immutable`, so within a single buildHash all subsequent fetches still hit the edge as before.
- **Cost**: one cache-miss per asset per deploy per region. Negligible given asset sizes (~1 MB grid_index, PMTiles header range, ~1 MB × 7 ambience clips) and infrequent deploy cadence.

This is the client-side half of the fix. The server-side half — adding a Cloudflare Cache Rule that caps 404 TTL at 30 s — is documented in [docs/DEPLOYMENT.md](../../../docs/DEPLOYMENT.md) and is purely defensive: it limits the blast radius of any future first-time-miss window so disk-cache pollution lasts seconds, not hours. It cannot fix any user already affected today; only the client-side version stamp can.

## Verification

### Static gates

- `npm run test:frontend` — 167 / 167 passed.
- `npm run lint` clean.
- `npm run format:check` clean.

### Local equivalence

Confirmed `ASSET_VERSION === ''` in dev, so every fetch URL is byte-identical to pre-change. No new behavior to exercise locally — the version stamp only activates when `config.runtime.js` carries a non-empty `buildHash`, which only happens in deploy builds (Pages CI runs `node scripts/build-pages.js`).

### Production verification (post-deploy)

After this change deploys to Pages:

1. `curl https://placeecho.com/geo-sonification/main.js | grep grid_index` should show the literal `?v=<short-sha>` suffix in the bundled fetch call.
2. DevTools → Network on placeecho.com should show `assets.placeecho.com/tiles/grid_index.bin?v=<short-sha>` returning 200 and ~1 MB.
3. Existing users with a stale 404 in their disk cache will, on next visit, fetch fresh HTML (Pages serves HTML with `cache-control: max-age=0`) → load the new `main.js` → request the new versioned URL → bypass any disk-cache entry → see hover-glow active again.

## Files changed

- **Modified** `frontend/config.js` — exports new `ASSET_VERSION` constant (sourced from `runtime.buildHash`) with a comment explaining the 4 h negative-cache-TTL motivation.
- **Modified** `frontend/hover-glow.js` — imports `ASSET_VERSION`; `fetchGridIndex` appends `?v=` query.
- **Modified** `frontend/map.js` — imports `ASSET_VERSION`; `addGridLayer` appends `?v=` query to PMTiles URL.
- **Modified** `frontend/audio/buffer-cache.js` — accepts optional `assetVersion` opt (default `''`); appends `?v=` to ambience opus URLs when present.
- **Modified** `frontend/audio/engine.js` — imports `ASSET_VERSION`; passes it to `createBufferCache`.
- **Modified** `docs/DEPLOYMENT.md` — adds the manual `wrangler r2 object put` command for `tiles/grid_index.bin` and a note documenting the Cloudflare-only one-URL purge step (Wrangler's OAuth scope lacks `cache_purge`, so it cannot be scripted).
- **Added** `docs/devlog/M6/2026-05-08-M6-asset-version-cache-bust.md` — this entry.
- **Modified** `docs/DEVLOG.md` — index row at the top of `## Entries`.
